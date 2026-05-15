export interface ExecOptions {
  namespace: string;
  podName: string;
  containerName: string;
  command: string[];
}

export interface ExecResult {
  stdout: Uint8Array;
  stderr: string;
}

const CH_STDIN  = 0;
const CH_STDOUT = 1;
const CH_STDERR = 2;

function buildExecUrl(opts: ExecOptions, withStdin: boolean): string {
  const params = new URLSearchParams();
  opts.command.forEach(c => params.append('command', c));
  params.set('container', opts.containerName);
  params.set('stdin', withStdin ? 'true' : 'false');
  params.set('stdout', 'true');
  params.set('stderr', 'true');
  params.set('tty', 'false');
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/api/kubernetes/api/v1/namespaces/${opts.namespace}/pods/${opts.podName}/exec?${params}`;
}

function mergeChunks(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

function nextTick(): Promise<void> {
  return new Promise(resolve => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => resolve();
    ch.port2.postMessage(null);
  });
}

// ── POSIX ustar tar helpers ──────────────────────────────────────────────────
// Builds a single-file tar archive as a lazy Blob (no data loaded upfront).
// The End-of-Archive marker (1024 null bytes) lets `tar -xf -` exit cleanly
// without needing stdin EOF, so we never have to call ws.close() and the
// OpenShift console proxy never drops buffered data on a premature CLOSE frame.

function createTarHeader(filename: string, fileSize: number): Uint8Array {
  const block = new Uint8Array(512);
  const enc   = (s: string) => new TextEncoder().encode(s);
  const set   = (off: number, s: string) => block.set(enc(s), off);

  set(0,   filename.slice(0, 99));          // name
  set(100, '0000644\0');                    // mode
  set(108, '0000000\0');                    // uid
  set(116, '0000000\0');                    // gid
  set(124, fileSize.toString(8).padStart(11, '0') + '\0');   // size
  set(136, Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0'); // mtime
  block.fill(0x20, 148, 156);              // checksum placeholder (spaces)
  block[156] = 0x30;                       // type '0' = regular file
  set(257, 'ustar\0');                     // magic
  set(263, '00');                          // version

  let sum = 0;
  for (let i = 0; i < 512; i++) sum += block[i];
  set(148, sum.toString(8).padStart(6, '0') + '\0 ');  // checksum

  return block;
}

function buildTarBlob(filename: string, blob: Blob): Blob {
  const header  = createTarHeader(filename, blob.size);
  const padding = new Uint8Array((512 - (blob.size % 512)) % 512);
  const eoa     = new Uint8Array(1024); // end-of-archive: two 512-byte null blocks
  // Pass .buffer (ArrayBuffer) so the Blob constructor accepts the parts
  // regardless of the TypeScript lib's Uint8Array generic variance.
  return new Blob([
    header.buffer  as ArrayBuffer,
    blob,
    padding.buffer as ArrayBuffer,
    eoa.buffer     as ArrayBuffer,
  ]);
}
// ────────────────────────────────────────────────────────────────────────────

export function execCommand(opts: ExecOptions): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(buildExecUrl(opts, false), 'v4.channel.k8s.io');
    ws.binaryType = 'arraybuffer';
    const outParts: Uint8Array[] = [];
    const errParts: Uint8Array[] = [];
    ws.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      const msg = new Uint8Array(e.data);
      if (msg[0] === CH_STDOUT) outParts.push(msg.slice(1));
      else if (msg[0] === CH_STDERR) errParts.push(msg.slice(1));
    };
    ws.onclose = () => resolve({
      stdout: mergeChunks(outParts),
      stderr: new TextDecoder().decode(mergeChunks(errParts)),
    });
    ws.onerror = () => reject(new Error('WebSocket exec error'));
  });
}

export function execCommandWithStdin(
  opts: ExecOptions,
  data: Uint8Array,
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(buildExecUrl(opts, true), 'v4.channel.k8s.io');
    ws.binaryType = 'arraybuffer';
    const outParts: Uint8Array[] = [];
    const errParts: Uint8Array[] = [];
    let allSent = false;

    ws.onopen = async () => {
      const CHUNK = 32 * 1024;
      let offset  = 0;
      while (ws.readyState === WebSocket.OPEN) {
        if (offset >= data.length) {
          while (ws.bufferedAmount > 0 && ws.readyState === WebSocket.OPEN) {
            await new Promise<void>(r => setTimeout(r, 10));
          }
          if (ws.readyState === WebSocket.OPEN) { allSent = true; ws.close(); }
          return;
        }
        if (ws.bufferedAmount > 512 * 1024) { await new Promise<void>(r => setTimeout(r, 10)); continue; }
        const end   = Math.min(offset + CHUNK, data.length);
        const slice = data.slice(offset, end);
        const msg   = new Uint8Array(slice.length + 1);
        msg[0] = CH_STDIN; msg.set(slice, 1);
        try { ws.send(msg.buffer); } catch { ws.close(); return; }
        offset += slice.length;
        await nextTick();
      }
    };

    ws.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      const msg = new Uint8Array(e.data);
      if (msg[0] === CH_STDOUT) outParts.push(msg.slice(1));
      else if (msg[0] === CH_STDERR) errParts.push(msg.slice(1));
    };
    ws.onerror = () => { /* handled in onclose */ };
    ws.onclose = (e: CloseEvent) => {
      const stdout = mergeChunks(outParts);
      const stderr = new TextDecoder().decode(mergeChunks(errParts));
      if (!allSent && e.code === 1006) reject(new Error('Connection lost before all data was sent'));
      else resolve({ stdout, stderr });
    };
  });
}

// Streams a Blob through a single WebSocket exec stdin session.
//
// Key design decisions:
//  1. READ = 8 KB — small messages pass through every proxy/buffer layer.
//     Larger messages (256 KB) were being truncated to ~24 KB by the
//     OpenShift console proxy before reaching the pod.
//  2. We never call ws.close() from the browser. Instead the remote command
//     (`tar -xf -`) detects End-of-Archive in the stream and exits on its own,
//     after which the Kubernetes API server closes the WebSocket (code 1000).
//     Calling ws.close() from the browser causes the console proxy to
//     immediately tear down the upstream connection and drop buffered data.
//  3. A 10-minute safety timer calls ws.close() only if the server never
//     responds — guarding against hangs if the pod crashes mid-transfer.
function execStreamBlob(
  opts: ExecOptions,
  blob: Blob,
  onProgress: (bytesQueued: number) => void,
): Promise<{ stderr: string }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(buildExecUrl(opts, true), 'v4.channel.k8s.io');
    ws.binaryType = 'arraybuffer';
    const errParts: Uint8Array[] = [];
    let allSent    = false;
    let safetyTimer: ReturnType<typeof setTimeout> | undefined;

    ws.onopen = async () => {
      const READ = 8 * 1024;        // 8 KB — safe for all proxy configurations
      const HWM  = 2 * 1024 * 1024; // pause if browser buffer exceeds 2 MB
      let offset = 0;

      while (ws.readyState === WebSocket.OPEN) {
        if (offset >= blob.size) {
          while (ws.bufferedAmount > 0 && ws.readyState === WebSocket.OPEN) {
            await new Promise<void>(r => setTimeout(r, 10));
          }
          if (ws.readyState === WebSocket.OPEN) {
            allSent = true;
            // DO NOT call ws.close() — let the remote command exit naturally.
            safetyTimer = setTimeout(() => {
              if (ws.readyState !== WebSocket.CLOSED) ws.close();
            }, 10 * 60 * 1000);
          }
          return;
        }

        if (ws.bufferedAmount > HWM) {
          await new Promise<void>(r => setTimeout(r, 10));
          continue;
        }

        const end = Math.min(offset + READ, blob.size);
        const buf = await blob.slice(offset, end).arrayBuffer();
        const msg = new Uint8Array(buf.byteLength + 1);
        msg[0] = CH_STDIN;
        msg.set(new Uint8Array(buf), 1);

        try { ws.send(msg.buffer); } catch { ws.close(); return; }
        offset += buf.byteLength;
        onProgress(offset);
        await nextTick();
      }
    };

    ws.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      const msg = new Uint8Array(e.data);
      if (msg[0] === CH_STDERR) errParts.push(msg.slice(1));
    };
    ws.onerror = () => { /* handled in onclose */ };
    ws.onclose = (e: CloseEvent) => {
      clearTimeout(safetyTimer);
      const stderr = new TextDecoder().decode(mergeChunks(errParts));
      if (!allSent && e.code === 1006) reject(new Error('Connection lost during upload'));
      else resolve({ stderr });
    };
  });
}

async function getPodFileSize(
  opts: Omit<ExecOptions, 'command'>,
  escapedPath: string,
): Promise<number> {
  try {
    const r = await execCommand({
      ...opts,
      command: ['sh', '-c', `stat -c%s '${escapedPath}' 2>/dev/null || echo 0`],
    });
    return parseInt(new TextDecoder().decode(r.stdout).trim()) || 0;
  } catch { return 0; }
}

// Uploads a File to a pod by streaming a ustar tar archive via exec.
//
// Using tar instead of `head -c N > file` or `cat > file` solves two problems:
//  • `tar -xf -` exits when it reads the End-of-Archive marker embedded in
//    the stream — no stdin EOF needed, no race with ws.close().
//  • tar is universally available (busybox, alpine, debian, …).
//
// The tar archive is built as a lazy Blob so the file is never fully loaded
// into memory. After streaming, the file size is verified with `stat`.
export async function execUploadFile(
  opts: Omit<ExecOptions, 'command'>,
  file: File,
  destPath: string,
  onProgress: (pct: number) => void,
): Promise<{ stderr: string }> {
  const lastSlash  = destPath.lastIndexOf('/');
  const destDir    = lastSlash > 0 ? destPath.slice(0, lastSlash) : '/';
  const fileName   = lastSlash >= 0 ? destPath.slice(lastSlash + 1) : destPath;
  const escapedPath = destPath.replace(/'/g, "'\\''");
  const MAX_TRIES  = 3;

  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    if (attempt > 0) {
      await new Promise<void>(r => setTimeout(r, 800));
    }

    const tarBlob = buildTarBlob(fileName, file);

    let streamError: string | null = null;
    try {
      const result = await execStreamBlob(
        { ...opts, command: ['tar', '-xf', '-', '-C', destDir] },
        tarBlob,
        bytes => {
          // Subtract the 512-byte tar header to show file-data progress.
          const filePct = Math.min(100, Math.round(
            Math.max(0, bytes - 512) / file.size * 100,
          ));
          onProgress(filePct);
        },
      );
      if (result.stderr.trim()) streamError = result.stderr;
    } catch (err: any) {
      streamError = err.message;
    }

    const finalSize = await getPodFileSize(opts, escapedPath);
    if (finalSize === file.size) return { stderr: '' };

    if (!streamError) {
      streamError = `Upload incomplete: expected ${file.size} B, got ${finalSize} B`;
    }
    if (attempt === MAX_TRIES - 1) return { stderr: streamError };
  }

  return { stderr: 'Upload failed after multiple attempts' };
}

export function execStream(
  opts: ExecOptions,
  onData: (data: string, isErr: boolean) => void,
  onClose: () => void,
  onError: (err: Error) => void,
): () => void {
  const ws = new WebSocket(buildExecUrl(opts, false), 'v4.channel.k8s.io');
  ws.binaryType = 'arraybuffer';
  const decoder = new TextDecoder();
  ws.onmessage = (e: MessageEvent<ArrayBuffer>) => {
    const msg = new Uint8Array(e.data);
    const ch  = msg[0]; const d = msg.slice(1);
    if (ch === CH_STDOUT)      onData(decoder.decode(d, { stream: true }), false);
    else if (ch === CH_STDERR) onData(decoder.decode(d, { stream: true }), true);
  };
  ws.onclose = () => { const rest = decoder.decode(); if (rest) onData(rest, false); onClose(); };
  ws.onerror = () => onError(new Error('WebSocket exec stream error'));
  return () => {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
  };
}

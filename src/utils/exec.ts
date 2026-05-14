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

const CH_STDIN = 0;
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
  const result = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    result.set(p, offset);
    offset += p.length;
  }
  return result;
}

export function execCommand(opts: ExecOptions): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(buildExecUrl(opts, false), 'v4.channel.k8s.io');
    ws.binaryType = 'arraybuffer';

    const outParts: Uint8Array[] = [];
    const errParts: Uint8Array[] = [];

    ws.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      const msg = new Uint8Array(e.data);
      const ch = msg[0];
      const data = msg.slice(1);
      if (ch === CH_STDOUT) outParts.push(data);
      else if (ch === CH_STDERR) errParts.push(data);
    };

    ws.onclose = () => {
      resolve({
        stdout: mergeChunks(outParts),
        stderr: new TextDecoder().decode(mergeChunks(errParts)),
      });
    };

    ws.onerror = () => reject(new Error('WebSocket exec error'));
  });
}

// Used for file upload and text file save — sends data through pod stdin.
// Kubernetes exec WebSocket: client close signals EOF to the process stdin.
export function execCommandWithStdin(
  opts: ExecOptions,
  data: Uint8Array,
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(buildExecUrl(opts, true), 'v4.channel.k8s.io');
    ws.binaryType = 'arraybuffer';

    const outParts: Uint8Array[] = [];
    const errParts: Uint8Array[] = [];

    ws.onopen = () => {
      const CHUNK_SIZE = 32 * 1024;
      let offset = 0;

      const sendNext = () => {
        if (offset >= data.length) {
          ws.close();
          return;
        }
        const slice = data.slice(offset, Math.min(offset + CHUNK_SIZE, data.length));
        const msg = new Uint8Array(slice.length + 1);
        msg[0] = CH_STDIN;
        msg.set(slice, 1);
        ws.send(msg.buffer);
        offset += slice.length;
        setTimeout(sendNext, 0);
      };

      sendNext();
    };

    ws.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      const msg = new Uint8Array(e.data);
      const ch = msg[0];
      const chunk = msg.slice(1);
      if (ch === CH_STDOUT) outParts.push(chunk);
      else if (ch === CH_STDERR) errParts.push(chunk);
    };

    ws.onclose = () => {
      resolve({
        stdout: mergeChunks(outParts),
        stderr: new TextDecoder().decode(mergeChunks(errParts)),
      });
    };

    ws.onerror = () => reject(new Error('WebSocket exec error'));
  });
}

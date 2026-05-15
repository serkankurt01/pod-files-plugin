"use strict";
(self["webpackChunkpod_files_plugin"] = self["webpackChunkpod_files_plugin"] || []).push([["exposed-FilesTab"],{

/***/ 2405
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  FilesTab: () => (/* binding */ FilesTab),
  "default": () => (/* binding */ components_FilesTab)
});

// EXTERNAL MODULE: consume shared module (default) react@^17.0.1 (singleton)
var consume_shared_module_default_react_17_0_singleton_ = __webpack_require__(8893);
var consume_shared_module_default_react_17_0_singleton_default = /*#__PURE__*/__webpack_require__.n(consume_shared_module_default_react_17_0_singleton_);
;// ./utils/exec.ts
const CH_STDIN = 0;
const CH_STDOUT = 1;
const CH_STDERR = 2;
function buildExecUrl(opts, withStdin) {
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
function mergeChunks(parts) {
    const total = parts.reduce((n, p) => n + p.length, 0);
    const result = new Uint8Array(total);
    let off = 0;
    for (const p of parts) {
        result.set(p, off);
        off += p.length;
    }
    return result;
}
// Yield to the event loop via MessageChannel instead of setTimeout.
// setTimeout(fn, 0) is throttled to ≥1 000 ms in background tabs (Chrome/Firefox).
// MessageChannel port messages are not subject to that throttling.
function nextTick() {
    return new Promise(resolve => {
        const ch = new MessageChannel();
        ch.port1.onmessage = () => resolve();
        ch.port2.postMessage(null);
    });
}
function execCommand(opts) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(buildExecUrl(opts, false), 'v4.channel.k8s.io');
        ws.binaryType = 'arraybuffer';
        const outParts = [];
        const errParts = [];
        ws.onmessage = (e) => {
            const msg = new Uint8Array(e.data);
            if (msg[0] === CH_STDOUT)
                outParts.push(msg.slice(1));
            else if (msg[0] === CH_STDERR)
                errParts.push(msg.slice(1));
        };
        ws.onclose = () => resolve({
            stdout: mergeChunks(outParts),
            stderr: new TextDecoder().decode(mergeChunks(errParts)),
        });
        ws.onerror = () => reject(new Error('WebSocket exec error'));
    });
}
// Sends `data` to a pod's stdin and collects stdout + stderr.
//
// EOF signalling: ws.close() after bufferedAmount drains to 0.
//   ws.bufferedAmount === 0 means every byte has been handed to the OS TCP
//   stack.  TCP delivers data in order, so the Kubernetes API server receives
//   all stdin bytes before it sees the WebSocket CLOSE frame.  Only then does
//   it close the pod's stdin pipe, giving the remote process a clean EOF.
//
// allSent flag: Kubernetes API server often tears down the TCP connection
//   (close code 1006) immediately after the exec process exits, before the
//   browser completes the WebSocket close handshake.  If allSent is true we
//   treat code 1006 as success, not as a mid-transfer drop.
function execCommandWithStdin(opts, data) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(buildExecUrl(opts, true), 'v4.channel.k8s.io');
        ws.binaryType = 'arraybuffer';
        const outParts = [];
        const errParts = [];
        let allSent = false;
        ws.onopen = async () => {
            const CHUNK = 32 * 1024;
            let offset = 0;
            while (ws.readyState === WebSocket.OPEN) {
                if (offset >= data.length) {
                    while (ws.bufferedAmount > 0 && ws.readyState === WebSocket.OPEN) {
                        await new Promise(r => setTimeout(r, 10));
                    }
                    if (ws.readyState === WebSocket.OPEN) {
                        allSent = true;
                        ws.close();
                    }
                    return;
                }
                if (ws.bufferedAmount > 512 * 1024) {
                    await new Promise(r => setTimeout(r, 10));
                    continue;
                }
                const end = Math.min(offset + CHUNK, data.length);
                const slice = data.slice(offset, end);
                const msg = new Uint8Array(slice.length + 1);
                msg[0] = CH_STDIN;
                msg.set(slice, 1);
                try {
                    ws.send(msg.buffer);
                }
                catch {
                    ws.close();
                    return;
                }
                offset += slice.length;
                await nextTick();
            }
        };
        ws.onmessage = (e) => {
            const msg = new Uint8Array(e.data);
            if (msg[0] === CH_STDOUT)
                outParts.push(msg.slice(1));
            else if (msg[0] === CH_STDERR)
                errParts.push(msg.slice(1));
        };
        ws.onerror = () => { };
        ws.onclose = (e) => {
            const stdout = mergeChunks(outParts);
            const stderr = new TextDecoder().decode(mergeChunks(errParts));
            if (!allSent && e.code === 1006) {
                reject(new Error('Connection lost before all data was sent'));
            }
            else {
                resolve({ stdout, stderr });
            }
        };
    });
}
// Streams a Blob lazily through a single WebSocket exec stdin.
// Uses 256 KB reads so the entire file is never loaded into memory at once.
// Progress is reported as bytes queued to the WebSocket send buffer.
//
// Why we never call ws.close() from the browser:
//   The OpenShift console is a WebSocket proxy sitting between the browser and
//   the Kubernetes API server.  When the browser sends a WebSocket CLOSE frame
//   the proxy tears down the upstream connection to the API server immediately,
//   dropping any data it had buffered but not yet forwarded — even though
//   bufferedAmount === 0 on the browser side (bytes are in the OS TCP stack,
//   not yet ACK'd by the proxy).  The result is a silently truncated file.
//
//   Instead, we rely on `head -c N` exiting after reading exactly N bytes
//   (no EOF required).  Once the process exits, the Kubernetes API server
//   sends a WebSocket CLOSE to the browser on its own, and our onclose handler
//   resolves the promise.  The proxy never sees a client CLOSE and therefore
//   never drops buffered data.
//
//   A 10-minute safety timer calls ws.close() only if the server never
//   responds — guarding against hangs if the pod crashes or head stalls.
function execStreamBlob(opts, blob, onProgress) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(buildExecUrl(opts, true), 'v4.channel.k8s.io');
        ws.binaryType = 'arraybuffer';
        const errParts = [];
        let allSent = false;
        let safetyTimer;
        ws.onopen = async () => {
            const READ = 256 * 1024; // 256 KB reads from the Blob
            const HWM = 4 * 1024 * 1024; // pause sending above 4 MB browser buffer
            let offset = 0;
            while (ws.readyState === WebSocket.OPEN) {
                if (offset >= blob.size) {
                    // All data queued — drain the browser's TCP send buffer.
                    while (ws.bufferedAmount > 0 && ws.readyState === WebSocket.OPEN) {
                        await new Promise(r => setTimeout(r, 10));
                    }
                    if (ws.readyState === WebSocket.OPEN) {
                        allSent = true;
                        // Do NOT call ws.close(). The remote `head -c N` command exits on
                        // its own after reading N bytes; the API server then closes the
                        // WebSocket (code 1000).  Calling ws.close() here causes the
                        // console proxy to drop still-buffered data mid-forward.
                        safetyTimer = setTimeout(() => {
                            if (ws.readyState !== WebSocket.CLOSED)
                                ws.close();
                        }, 10 * 60 * 1000); // 10-minute safety timeout
                    }
                    return;
                }
                if (ws.bufferedAmount > HWM) {
                    await new Promise(r => setTimeout(r, 10));
                    continue;
                }
                const end = Math.min(offset + READ, blob.size);
                const buf = await blob.slice(offset, end).arrayBuffer();
                const msg = new Uint8Array(buf.byteLength + 1);
                msg[0] = CH_STDIN;
                msg.set(new Uint8Array(buf), 1);
                try {
                    ws.send(msg.buffer);
                }
                catch {
                    ws.close();
                    return;
                }
                offset += buf.byteLength;
                onProgress(offset);
                await nextTick(); // yield without background-tab setTimeout throttling
            }
        };
        ws.onmessage = (e) => {
            const msg = new Uint8Array(e.data);
            if (msg[0] === CH_STDERR)
                errParts.push(msg.slice(1));
        };
        ws.onerror = () => { };
        ws.onclose = (e) => {
            clearTimeout(safetyTimer);
            const stderr = new TextDecoder().decode(mergeChunks(errParts));
            // code 1006 = abnormal / no close frame = real connection drop.
            // Reject only when the drop happened before we finished queuing data.
            // After allSent=true the API server may reset the TCP connection after
            // the process exits (also code 1006 in some environments); treat that
            // as success — the stat verification below catches any partial writes.
            if (!allSent && e.code === 1006) {
                reject(new Error('Connection lost during upload'));
            }
            else {
                resolve({ stderr });
            }
        };
    });
}
async function getPodFileSize(opts, escapedPath) {
    try {
        const r = await execCommand({
            ...opts,
            command: ['sh', '-c', `stat -c%s '${escapedPath}' 2>/dev/null || echo 0`],
        });
        return parseInt(new TextDecoder().decode(r.stdout).trim()) || 0;
    }
    catch {
        return 0;
    }
}
// Uploads a browser File to a pod path using a single exec WebSocket session.
//
// Design rationale:
//   Previous chunked approaches (N sessions for an N-MB file) hit an
//   OpenShift console proxy session-count limit (~150 sessions), leaving large
//   files partially written.  A single session per upload attempt avoids this.
//
//   On connection drop the retry path checks the already-written byte count,
//   truncates to a 1 MB-aligned boundary, and resumes streaming from that
//   offset.  After streaming, the remote file size is verified with `stat`
//   so a silent partial write is always caught and retried.
async function execUploadFile(opts, file, destPath, onProgress) {
    const escaped = destPath.replace(/'/g, "'\\''");
    const ALIGN = 1 * 1024 * 1024;
    const MAX_TRIES = 3;
    let resumeFrom = 0;
    for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
        if (attempt > 0) {
            const existing = await getPodFileSize(opts, escaped);
            const aligned = Math.floor(existing / ALIGN) * ALIGN;
            if (aligned > 0 && aligned < file.size) {
                await execCommandWithStdin({ ...opts, command: ['sh', '-c', `truncate -s ${aligned} '${escaped}' 2>/dev/null; true`] }, new Uint8Array(0)).catch(() => { });
                resumeFrom = aligned;
            }
            else {
                await execCommandWithStdin({ ...opts, command: ['rm', '-f', destPath] }, new Uint8Array(0)).catch(() => { });
                resumeFrom = 0;
            }
            await new Promise(r => setTimeout(r, 600));
        }
        const remaining = file.size - resumeFrom;
        const blob = resumeFrom > 0 ? file.slice(resumeFrom) : file;
        const cmd = resumeFrom === 0
            ? ['sh', '-c', `head -c ${file.size} > '${escaped}'`]
            : ['sh', '-c', `head -c ${remaining} >> '${escaped}'`];
        let streamError = null;
        try {
            const result = await execStreamBlob({ ...opts, command: cmd }, blob, bytes => onProgress(Math.round((resumeFrom + bytes) / file.size * 100)));
            if (result.stderr.trim())
                streamError = result.stderr;
        }
        catch (err) {
            streamError = err.message;
        }
        const finalSize = await getPodFileSize(opts, escaped);
        if (finalSize === file.size)
            return { stderr: '' };
        if (!streamError) {
            streamError = `Upload incomplete: expected ${file.size} B, got ${finalSize} B`;
        }
        if (attempt === MAX_TRIES - 1)
            return { stderr: streamError };
    }
    return { stderr: 'Upload failed after multiple attempts' };
}
function execStream(opts, onData, onClose, onError) {
    const ws = new WebSocket(buildExecUrl(opts, false), 'v4.channel.k8s.io');
    ws.binaryType = 'arraybuffer';
    const decoder = new TextDecoder();
    ws.onmessage = (e) => {
        const msg = new Uint8Array(e.data);
        const ch = msg[0];
        const d = msg.slice(1);
        if (ch === CH_STDOUT)
            onData(decoder.decode(d, { stream: true }), false);
        else if (ch === CH_STDERR)
            onData(decoder.decode(d, { stream: true }), true);
    };
    ws.onclose = () => {
        const rest = decoder.decode();
        if (rest)
            onData(rest, false);
        onClose();
    };
    ws.onerror = () => onError(new Error('WebSocket exec stream error'));
    return () => {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close();
        }
    };
}

;// ./utils/fileUtils.ts
// Parses output of:
//   find <path> -maxdepth 1 -mindepth 1 -printf "%y\t%s\t%T@\t%f\t%l\n"
function parseFileList(output) {
    const entries = [];
    for (const line of output.trim().split('\n')) {
        if (!line)
            continue;
        const parts = line.split('\t');
        if (parts.length < 7)
            continue;
        const [typeChar, sizeStr, mtime, permissions, user, group, name, target] = parts;
        const type = typeChar === 'd' ? 'directory' :
            typeChar === 'l' ? 'symlink' :
                typeChar === 'f' ? 'file' : 'other';
        entries.push({
            name: name.trim(),
            type,
            size: parseInt(sizeStr, 10) || 0,
            modifiedAt: new Date(parseFloat(mtime) * 1000),
            permissions: permissions.trim() || undefined,
            user: user.trim() || undefined,
            group: group.trim() || undefined,
            target: target?.trim() || undefined,
        });
    }
    return entries.sort((a, b) => {
        if (a.type === 'directory' && b.type !== 'directory')
            return -1;
        if (a.type !== 'directory' && b.type === 'directory')
            return 1;
        return a.name.localeCompare(b.name);
    });
}
function formatFileSize(bytes) {
    if (bytes === 0)
        return '0 B';
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
function getExtension(name) {
    const dot = name.lastIndexOf('.');
    return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}
const TEXT_EXTENSIONS = new Set([
    'txt', 'log', 'md', 'rst', 'conf', 'cfg', 'ini', 'toml', 'env',
    'yaml', 'yml', 'json', 'xml', 'html', 'htm', 'css', 'scss', 'less',
    'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'vue',
    'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'cpp', 'h', 'hpp', 'cs',
    'sh', 'bash', 'zsh', 'fish', 'ps1',
    'sql', 'graphql', 'proto',
    'pem', 'crt', 'csr', 'key', 'pub',
    'csv', 'tsv', 'properties', 'gradle',
    'tf', 'hcl', 'makefile',
]);
function isTextFile(name) {
    const lower = name.toLowerCase();
    const ext = getExtension(name);
    if (TEXT_EXTENSIONS.has(ext))
        return true;
    // Extensionless known text files
    return ['dockerfile', 'makefile', 'jenkinsfile', 'procfile', '.env',
        '.gitignore', '.gitattributes', '.npmrc', '.editorconfig'].includes(lower);
}
// Returns the shell command array to list files in a directory using find.
// Falls back gracefully if find -printf is unavailable (e.g. BusyBox).
function buildListCommand(dirPath) {
    const escaped = dirPath.replace(/'/g, "'\\''");
    return [
        'sh', '-c',
        `find '${escaped}' -maxdepth 1 -mindepth 1 \\( -type f -o -type d -o -type l \\) -printf "%y\\t%s\\t%T@\\t%m\\t%u\\t%g\\t%f\\t%l\\n" 2>/dev/null; true`,
    ];
}
function joinPath(...parts) {
    return ('/' + parts.join('/')).replace(/\/+/g, '/').replace(/(.)\/$/, '$1') || '/';
}
function pathSegments(fullPath) {
    return fullPath.split('/').filter(Boolean);
}
function buildSearchCommand(dirPath, query) {
    const escapedDir = dirPath.replace(/'/g, "'\\''");
    const escapedQuery = query.replace(/'/g, "'\\''");
    return [
        'sh', '-c',
        `find '${escapedDir}' -type f -iname "*${escapedQuery}*" -printf "%y\\t%s\\t%T@\\t%m\\t%u\\t%g\\t%P\\t%l\\n" 2>/dev/null | head -n 100; true`,
    ];
}

// EXTERNAL MODULE: ../node_modules/@patternfly/react-icons/dist/esm/createIcon.js
var createIcon = __webpack_require__(2791);
;// ../node_modules/@patternfly/react-icons/dist/esm/icons/folder-icon.js


const FolderIconConfig = {
  name: 'FolderIcon',
  height: 512,
  width: 512,
  svgPath: 'M464 128H272l-64-64H48C21.49 64 0 85.49 0 112v288c0 26.51 21.49 48 48 48h416c26.51 0 48-21.49 48-48V176c0-26.51-21.49-48-48-48z',
  yOffset: 0,
  xOffset: 0,
};

const FolderIcon = (0,createIcon/* createIcon */.wt)(FolderIconConfig);

/* harmony default export */ const folder_icon = ((/* unused pure expression or super */ null && (FolderIcon)));
// EXTERNAL MODULE: ../node_modules/@patternfly/react-icons/dist/esm/icons/file-icon.js
var file_icon = __webpack_require__(8997);
;// ../node_modules/@patternfly/react-icons/dist/esm/icons/file-alt-icon.js


const FileAltIconConfig = {
  name: 'FileAltIcon',
  height: 512,
  width: 384,
  svgPath: 'M224 136V0H24C10.7 0 0 10.7 0 24v464c0 13.3 10.7 24 24 24h336c13.3 0 24-10.7 24-24V160H248c-13.2 0-24-10.8-24-24zm64 236c0 6.6-5.4 12-12 12H108c-6.6 0-12-5.4-12-12v-8c0-6.6 5.4-12 12-12h168c6.6 0 12 5.4 12 12v8zm0-64c0 6.6-5.4 12-12 12H108c-6.6 0-12-5.4-12-12v-8c0-6.6 5.4-12 12-12h168c6.6 0 12 5.4 12 12v8zm0-72v8c0 6.6-5.4 12-12 12H108c-6.6 0-12-5.4-12-12v-8c0-6.6 5.4-12 12-12h168c6.6 0 12 5.4 12 12zm96-114.1v6.1H256V0h6.1c6.4 0 12.5 2.5 17 7l97.9 98c4.5 4.5 7 10.6 7 16.9z',
  yOffset: 0,
  xOffset: 0,
};

const FileAltIcon = (0,createIcon/* createIcon */.wt)(FileAltIconConfig);

/* harmony default export */ const file_alt_icon = ((/* unused pure expression or super */ null && (FileAltIcon)));
;// ../node_modules/@patternfly/react-icons/dist/esm/icons/file-code-icon.js


const FileCodeIconConfig = {
  name: 'FileCodeIcon',
  height: 512,
  width: 384,
  svgPath: 'M384 121.941V128H256V0h6.059c6.365 0 12.47 2.529 16.971 7.029l97.941 97.941A24.005 24.005 0 0 1 384 121.941zM248 160c-13.2 0-24-10.8-24-24V0H24C10.745 0 0 10.745 0 24v464c0 13.255 10.745 24 24 24h336c13.255 0 24-10.745 24-24V160H248zM123.206 400.505a5.4 5.4 0 0 1-7.633.246l-64.866-60.812a5.4 5.4 0 0 1 0-7.879l64.866-60.812a5.4 5.4 0 0 1 7.633.246l19.579 20.885a5.4 5.4 0 0 1-.372 7.747L101.65 336l40.763 35.874a5.4 5.4 0 0 1 .372 7.747l-19.579 20.884zm51.295 50.479l-27.453-7.97a5.402 5.402 0 0 1-3.681-6.692l61.44-211.626a5.402 5.402 0 0 1 6.692-3.681l27.452 7.97a5.4 5.4 0 0 1 3.68 6.692l-61.44 211.626a5.397 5.397 0 0 1-6.69 3.681zm160.792-111.045l-64.866 60.812a5.4 5.4 0 0 1-7.633-.246l-19.58-20.885a5.4 5.4 0 0 1 .372-7.747L284.35 336l-40.763-35.874a5.4 5.4 0 0 1-.372-7.747l19.58-20.885a5.4 5.4 0 0 1 7.633-.246l64.866 60.812a5.4 5.4 0 0 1-.001 7.879z',
  yOffset: 0,
  xOffset: 0,
};

const FileCodeIcon = (0,createIcon/* createIcon */.wt)(FileCodeIconConfig);

/* harmony default export */ const file_code_icon = ((/* unused pure expression or super */ null && (FileCodeIcon)));
;// ../node_modules/@patternfly/react-icons/dist/esm/icons/file-image-icon.js


const FileImageIconConfig = {
  name: 'FileImageIcon',
  height: 512,
  width: 384,
  svgPath: 'M384 121.941V128H256V0h6.059a24 24 0 0 1 16.97 7.029l97.941 97.941a24.002 24.002 0 0 1 7.03 16.971zM248 160c-13.2 0-24-10.8-24-24V0H24C10.745 0 0 10.745 0 24v464c0 13.255 10.745 24 24 24h336c13.255 0 24-10.745 24-24V160H248zm-135.455 16c26.51 0 48 21.49 48 48s-21.49 48-48 48-48-21.49-48-48 21.491-48 48-48zm208 240h-256l.485-48.485L104.545 328c4.686-4.686 11.799-4.201 16.485.485L160.545 368 264.06 264.485c4.686-4.686 12.284-4.686 16.971 0L320.545 304v112z',
  yOffset: 0,
  xOffset: 0,
};

const FileImageIcon = (0,createIcon/* createIcon */.wt)(FileImageIconConfig);

/* harmony default export */ const file_image_icon = ((/* unused pure expression or super */ null && (FileImageIcon)));
;// ../node_modules/@patternfly/react-icons/dist/esm/icons/file-archive-icon.js


const FileArchiveIconConfig = {
  name: 'FileArchiveIcon',
  height: 512,
  width: 384,
  svgPath: 'M377 105L279.1 7c-4.5-4.5-10.6-7-17-7H256v128h128v-6.1c0-6.3-2.5-12.4-7-16.9zM128.4 336c-17.9 0-32.4 12.1-32.4 27 0 15 14.6 27 32.5 27s32.4-12.1 32.4-27-14.6-27-32.5-27zM224 136V0h-63.6v32h-32V0H24C10.7 0 0 10.7 0 24v464c0 13.3 10.7 24 24 24h336c13.3 0 24-10.7 24-24V160H248c-13.2 0-24-10.8-24-24zM95.9 32h32v32h-32zm32.3 384c-33.2 0-58-30.4-51.4-62.9L96.4 256v-32h32v-32h-32v-32h32v-32h-32V96h32V64h32v32h-32v32h32v32h-32v32h32v32h-32v32h22.1c5.7 0 10.7 4.1 11.8 9.7l17.3 87.7c6.4 32.4-18.4 62.6-51.4 62.6z',
  yOffset: 0,
  xOffset: 0,
};

const FileArchiveIcon = (0,createIcon/* createIcon */.wt)(FileArchiveIconConfig);

/* harmony default export */ const file_archive_icon = ((/* unused pure expression or super */ null && (FileArchiveIcon)));
;// ../node_modules/@patternfly/react-icons/dist/esm/icons/file-pdf-icon.js


const FilePdfIconConfig = {
  name: 'FilePdfIcon',
  height: 512,
  width: 384,
  svgPath: 'M181.9 256.1c-5-16-4.9-46.9-2-46.9 8.4 0 7.6 36.9 2 46.9zm-1.7 47.2c-7.7 20.2-17.3 43.3-28.4 62.7 18.3-7 39-17.2 62.9-21.9-12.7-9.6-24.9-23.4-34.5-40.8zM86.1 428.1c0 .8 13.2-5.4 34.9-40.2-6.7 6.3-29.1 24.5-34.9 40.2zM248 160h136v328c0 13.3-10.7 24-24 24H24c-13.3 0-24-10.7-24-24V24C0 10.7 10.7 0 24 0h200v136c0 13.2 10.8 24 24 24zm-8 171.8c-20-12.2-33.3-29-42.7-53.8 4.5-18.5 11.6-46.6 6.2-64.2-4.7-29.4-42.4-26.5-47.8-6.8-5 18.3-.4 44.1 8.1 77-11.6 27.6-28.7 64.6-40.8 85.8-.1 0-.1.1-.2.1-27.1 13.9-73.6 44.5-54.5 68 5.6 6.9 16 10 21.5 10 17.9 0 35.7-18 61.1-61.8 25.8-8.5 54.1-19.1 79-23.2 21.7 11.8 47.1 19.5 64 19.5 29.2 0 31.2-32 19.7-43.4-13.9-13.6-54.3-9.7-73.6-7.2zM377 105L279 7c-4.5-4.5-10.6-7-17-7h-6v128h128v-6.1c0-6.3-2.5-12.4-7-16.9zm-74.1 255.3c4.1-2.7-2.5-11.9-42.8-9 37.1 15.8 42.8 9 42.8 9z',
  yOffset: 0,
  xOffset: 0,
};

const FilePdfIcon = (0,createIcon/* createIcon */.wt)(FilePdfIconConfig);

/* harmony default export */ const file_pdf_icon = ((/* unused pure expression or super */ null && (FilePdfIcon)));
;// ../node_modules/@patternfly/react-icons/dist/esm/icons/link-icon.js


const LinkIconConfig = {
  name: 'LinkIcon',
  height: 512,
  width: 512,
  svgPath: 'M326.612 185.391c59.747 59.809 58.927 155.698.36 214.59-.11.12-.24.25-.36.37l-67.2 67.2c-59.27 59.27-155.699 59.262-214.96 0-59.27-59.26-59.27-155.7 0-214.96l37.106-37.106c9.84-9.84 26.786-3.3 27.294 10.606.648 17.722 3.826 35.527 9.69 52.721 1.986 5.822.567 12.262-3.783 16.612l-13.087 13.087c-28.026 28.026-28.905 73.66-1.155 101.96 28.024 28.579 74.086 28.749 102.325.51l67.2-67.19c28.191-28.191 28.073-73.757 0-101.83-3.701-3.694-7.429-6.564-10.341-8.569a16.037 16.037 0 0 1-6.947-12.606c-.396-10.567 3.348-21.456 11.698-29.806l21.054-21.055c5.521-5.521 14.182-6.199 20.584-1.731a152.482 152.482 0 0 1 20.522 17.197zM467.547 44.449c-59.261-59.262-155.69-59.27-214.96 0l-67.2 67.2c-.12.12-.25.25-.36.37-58.566 58.892-59.387 154.781.36 214.59a152.454 152.454 0 0 0 20.521 17.196c6.402 4.468 15.064 3.789 20.584-1.731l21.054-21.055c8.35-8.35 12.094-19.239 11.698-29.806a16.037 16.037 0 0 0-6.947-12.606c-2.912-2.005-6.64-4.875-10.341-8.569-28.073-28.073-28.191-73.639 0-101.83l67.2-67.19c28.239-28.239 74.3-28.069 102.325.51 27.75 28.3 26.872 73.934-1.155 101.96l-13.087 13.087c-4.35 4.35-5.769 10.79-3.783 16.612 5.864 17.194 9.042 34.999 9.69 52.721.509 13.906 17.454 20.446 27.294 10.606l37.106-37.106c59.271-59.259 59.271-155.699.001-214.959z',
  yOffset: 0,
  xOffset: 0,
};

const LinkIcon = (0,createIcon/* createIcon */.wt)(LinkIconConfig);

/* harmony default export */ const link_icon = ((/* unused pure expression or super */ null && (LinkIcon)));
;// ./components/FileIcon.tsx









const CODE_EXT = new Set([
    'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'vue',
    'py', 'rb', 'go', 'rs', 'java', 'kt', 'c', 'cpp', 'h', 'hpp', 'cs',
    'sh', 'bash', 'ps1', 'sql', 'graphql', 'proto', 'tf', 'hcl',
    'yaml', 'yml', 'json', 'xml', 'toml', 'html', 'htm', 'css', 'scss',
]);
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'bmp', 'webp', 'tiff']);
const ARCHIVE_EXT = new Set(['zip', 'tar', 'gz', 'bz2', 'xz', 'tgz', '7z', 'rar', 'jar', 'war', 'ear']);
const PDF_EXT = new Set(['pdf']);
const TEXT_EXT = new Set(['txt', 'log', 'md', 'rst', 'conf', 'cfg', 'ini', 'env', 'csv', 'tsv', 'properties']);
function resolveIcon(entry) {
    if (entry.type === 'directory')
        return { Component: FolderIcon, color: '#f0ad4e' };
    if (entry.type === 'symlink')
        return { Component: LinkIcon, color: '#5bc0de' };
    const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
    if (CODE_EXT.has(ext))
        return { Component: FileCodeIcon, color: '#5bc0de' };
    if (IMAGE_EXT.has(ext))
        return { Component: FileImageIcon, color: '#9b59b6' };
    if (ARCHIVE_EXT.has(ext))
        return { Component: FileArchiveIcon, color: '#e67e22' };
    if (PDF_EXT.has(ext))
        return { Component: FilePdfIcon, color: '#e74c3c' };
    if (TEXT_EXT.has(ext))
        return { Component: FileAltIcon, color: '#2ecc71' };
    return { Component: file_icon/* FileIcon */.oS, color: '#adb5bd' };
}
const FileIconComponent = ({ entry, style }) => {
    const { Component, color } = resolveIcon(entry);
    return consume_shared_module_default_react_17_0_singleton_default().createElement(Component, { style: { color, ...style } });
};
/* harmony default export */ const FileIcon = (FileIconComponent);

// EXTERNAL MODULE: ../node_modules/react-dom/index.js
var react_dom = __webpack_require__(8325);
;// ./components/PortalModal.tsx


const PortalModal = ({ title, size = 'lg', onClose, actions, children }) => {
    // Lock body scroll while open
    (0,consume_shared_module_default_react_17_0_singleton_.useEffect)(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, []);
    // Close on Escape
    (0,consume_shared_module_default_react_17_0_singleton_.useEffect)(() => {
        const onKey = (e) => { if (e.key === 'Escape')
            onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);
    const maxW = size === 'sm' ? 500 : 920;
    return react_dom.createPortal(consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: {
            position: 'fixed', inset: 0, zIndex: 10000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        } },
        consume_shared_module_default_react_17_0_singleton_default().createElement("div", { onClick: onClose, style: {
                position: 'absolute', inset: 0,
                backgroundColor: 'rgba(3,3,3,0.62)',
            } }),
        consume_shared_module_default_react_17_0_singleton_default().createElement("div", { role: "dialog", "aria-modal": "true", style: {
                position: 'relative',
                width: `min(${maxW}px, 96vw)`,
                maxHeight: '92vh',
                display: 'flex',
                flexDirection: 'column',
                background: '#fff',
                borderRadius: 6,
                boxShadow: '0 8px 32px rgba(0,0,0,0.38)',
                overflow: 'hidden',
            } },
            consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: {
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 24px',
                    borderBottom: '1px solid #d2d2d2',
                    flexShrink: 0,
                    background: '#f5f5f5',
                } },
                consume_shared_module_default_react_17_0_singleton_default().createElement("span", { style: { fontSize: 17, fontWeight: 600, color: '#151515' } }, title),
                consume_shared_module_default_react_17_0_singleton_default().createElement("button", { "aria-label": "Close", onClick: onClose, style: {
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: 22, lineHeight: 1, color: '#151515', padding: '2px 6px',
                        borderRadius: 3,
                    } }, "\u00D7")),
            consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: { padding: '20px 24px', overflowY: 'auto', flex: 1 } }, children),
            consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: {
                    display: 'flex', gap: 8, padding: '14px 24px',
                    borderTop: '1px solid #d2d2d2', flexShrink: 0,
                    background: '#fafafa',
                } }, actions))), document.body);
};
/* harmony default export */ const components_PortalModal = (PortalModal);

;// ./components/FileEditor.tsx



const btn = (primary, disabled = false) => ({
    padding: '6px 18px',
    border: 'none',
    borderRadius: 3,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 500,
    fontSize: 14,
    background: disabled ? '#c8c8c8' : primary ? '#06c' : 'transparent',
    color: disabled ? '#888' : primary ? '#fff' : '#06c',
    opacity: disabled ? 0.7 : 1,
});
const FileEditor = ({ namespace, podName, containerName, filePath, onClose, onSaved, }) => {
    const [content, setContent] = (0,consume_shared_module_default_react_17_0_singleton_.useState)('');
    const [status, setStatus] = (0,consume_shared_module_default_react_17_0_singleton_.useState)('loading');
    const [error, setError] = (0,consume_shared_module_default_react_17_0_singleton_.useState)('');
    (0,consume_shared_module_default_react_17_0_singleton_.useEffect)(() => {
        setStatus('loading');
        setError('');
        execCommand({ namespace, podName, containerName, command: ['cat', filePath] })
            .then(result => { setContent(new TextDecoder().decode(result.stdout)); setStatus('ready'); })
            .catch(err => { setError(err.message); setStatus('error'); });
    }, [filePath]);
    const handleSave = async () => {
        setStatus('saving');
        setError('');
        try {
            const escaped = filePath.replace(/'/g, "'\\''");
            const result = await execCommandWithStdin({ namespace, podName, containerName, command: ['sh', '-c', `cat > '${escaped}'`] }, new TextEncoder().encode(content));
            if (result.stderr.trim()) {
                setError(result.stderr);
                setStatus('error');
            }
            else {
                onSaved();
                onClose();
            }
        }
        catch (err) {
            setError(err.message);
            setStatus('error');
        }
    };
    const fileName = filePath.split('/').filter(Boolean).pop() ?? filePath;
    const busy = status === 'loading' || status === 'saving';
    return (consume_shared_module_default_react_17_0_singleton_default().createElement(components_PortalModal, { title: `Edit — ${fileName}`, size: "lg", onClose: onClose, actions: consume_shared_module_default_react_17_0_singleton_default().createElement((consume_shared_module_default_react_17_0_singleton_default()).Fragment, null,
            consume_shared_module_default_react_17_0_singleton_default().createElement("button", { style: btn(true, busy || status === 'error'), disabled: busy || status === 'error', onClick: handleSave }, status === 'saving' ? 'Saving…' : 'Save'),
            consume_shared_module_default_react_17_0_singleton_default().createElement("button", { style: btn(false, status === 'saving'), disabled: status === 'saving', onClick: onClose }, "Cancel")) },
        status === 'loading' && (consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: { padding: 40, textAlign: 'center', color: '#6a6e73' } }, "Loading file\u2026")),
        error && (consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: {
                padding: '10px 14px', marginBottom: 12, borderRadius: 4,
                background: '#fce8e8', border: '1px solid #f5c6cb', color: '#6b1117', fontSize: 13,
            } }, error)),
        (status === 'ready' || status === 'saving' || status === 'error') && (consume_shared_module_default_react_17_0_singleton_default().createElement("textarea", { value: content, onChange: e => setContent(e.target.value), disabled: status === 'saving', rows: 28, spellCheck: false, style: {
                width: '100%',
                boxSizing: 'border-box',
                fontFamily: "'Courier New', Consolas, 'Liberation Mono', monospace",
                fontSize: 13,
                lineHeight: 1.55,
                padding: '10px 12px',
                border: '1px solid #c7c7c7',
                borderRadius: 3,
                resize: 'vertical',
                background: status === 'saving' ? '#fafafa' : '#fff',
                color: '#151515',
                outline: 'none',
                whiteSpace: 'pre',
                overflowX: 'auto',
            } }))));
};
/* harmony default export */ const components_FileEditor = (FileEditor);

;// ./components/UploadModal.tsx




const UploadModal_btn = (primary, disabled = false) => ({
    padding: '6px 18px',
    border: primary ? 'none' : '1px solid #06c',
    borderRadius: 3,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 500,
    fontSize: 14,
    background: disabled ? '#c8c8c8' : primary ? '#06c' : '#fff',
    color: disabled ? '#888' : primary ? '#fff' : '#06c',
    opacity: disabled ? 0.7 : 1,
});
const UploadModal = ({ namespace, podName, containerName, currentPath, onClose, onSuccess, }) => {
    const [file, setFile] = (0,consume_shared_module_default_react_17_0_singleton_.useState)(null);
    const [uploading, setUploading] = (0,consume_shared_module_default_react_17_0_singleton_.useState)(false);
    const [progress, setProgress] = (0,consume_shared_module_default_react_17_0_singleton_.useState)(0);
    const [error, setError] = (0,consume_shared_module_default_react_17_0_singleton_.useState)('');
    const inputRef = (0,consume_shared_module_default_react_17_0_singleton_.useRef)(null);
    const handleFileChange = (e) => {
        setFile(e.target.files?.[0] ?? null);
        setError('');
    };
    const handleUpload = async () => {
        if (!file)
            return;
        setUploading(true);
        setProgress(0);
        setError('');
        try {
            const destPath = joinPath(currentPath, file.name);
            const result = await execUploadFile({ namespace, podName, containerName }, file, destPath, (pct) => setProgress(pct));
            if (result.stderr.trim()) {
                setError(result.stderr);
            }
            else {
                onSuccess();
                onClose();
            }
        }
        catch (err) {
            setError(err.message);
        }
        finally {
            setUploading(false);
            setProgress(0);
        }
    };
    return (consume_shared_module_default_react_17_0_singleton_default().createElement(components_PortalModal, { title: "Upload File to Pod", size: "sm", onClose: onClose, actions: consume_shared_module_default_react_17_0_singleton_default().createElement((consume_shared_module_default_react_17_0_singleton_default()).Fragment, null,
            consume_shared_module_default_react_17_0_singleton_default().createElement("button", { style: UploadModal_btn(true, !file || uploading), disabled: !file || uploading, onClick: handleUpload }, uploading ? 'Uploading…' : 'Upload'),
            consume_shared_module_default_react_17_0_singleton_default().createElement("button", { style: UploadModal_btn(false, uploading), disabled: uploading, onClick: onClose }, "Cancel")) },
        consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: { marginBottom: 18, fontSize: 14 } },
            consume_shared_module_default_react_17_0_singleton_default().createElement("span", { style: { color: '#6a6e73' } }, "Destination: "),
            consume_shared_module_default_react_17_0_singleton_default().createElement("code", { style: {
                    background: '#f0f0f0', padding: '2px 8px',
                    borderRadius: 3, fontSize: 13, color: '#151515',
                } }, currentPath)),
        consume_shared_module_default_react_17_0_singleton_default().createElement("input", { ref: inputRef, type: "file", onChange: handleFileChange, style: { display: 'none' } }),
        consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' } },
            consume_shared_module_default_react_17_0_singleton_default().createElement("button", { onClick: () => inputRef.current?.click(), disabled: uploading, style: {
                    padding: '7px 16px', borderRadius: 3, cursor: uploading ? 'not-allowed' : 'pointer',
                    border: '1px solid #c7c7c7', background: '#fff', fontSize: 14,
                } }, "Choose file\u2026"),
            file && (consume_shared_module_default_react_17_0_singleton_default().createElement("span", { style: { fontSize: 14 } },
                consume_shared_module_default_react_17_0_singleton_default().createElement("strong", null, file.name),
                consume_shared_module_default_react_17_0_singleton_default().createElement("span", { style: { color: '#6a6e73', marginLeft: 6 } },
                    "(",
                    formatFileSize(file.size),
                    ")")))),
        uploading && (consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: { marginTop: 16 } },
            consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: { fontSize: 13, marginBottom: 4, color: '#6a6e73' } }, "Uploading\u2026"),
            consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: { height: 6, background: '#e0e0e0', borderRadius: 3, overflow: 'hidden' } },
                consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: {
                        height: '100%', width: `${progress}%`,
                        background: '#06c', borderRadius: 3,
                        transition: 'width 0.3s ease',
                    } })))),
        error && (consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: {
                marginTop: 14, padding: '10px 14px', borderRadius: 4,
                background: '#fce8e8', border: '1px solid #f5c6cb', color: '#6b1117', fontSize: 13,
            } }, error))));
};
/* harmony default export */ const components_UploadModal = (UploadModal);

;// ./components/CreateModal.tsx




const CreateModal_btn = (primary, disabled = false) => ({
    padding: '6px 18px',
    border: primary ? 'none' : '1px solid #06c',
    borderRadius: 3,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 500,
    fontSize: 14,
    background: disabled ? '#c8c8c8' : primary ? '#06c' : '#fff',
    color: disabled ? '#888' : primary ? '#fff' : '#06c',
    opacity: disabled ? 0.7 : 1,
});
const CreateModal = ({ namespace, podName, containerName, currentPath, type, onClose, onSuccess, }) => {
    const [name, setName] = (0,consume_shared_module_default_react_17_0_singleton_.useState)('');
    const [loading, setLoading] = (0,consume_shared_module_default_react_17_0_singleton_.useState)(false);
    const [error, setError] = (0,consume_shared_module_default_react_17_0_singleton_.useState)('');
    const handleCreate = async () => {
        if (!name.trim())
            return;
        setLoading(true);
        setError('');
        try {
            const fullPath = joinPath(currentPath, name.trim());
            const escaped = fullPath.replace(/'/g, "'\\''");
            const cmd = type === 'file' ? `touch '${escaped}'` : `mkdir -p '${escaped}'`;
            const result = await execCommand({
                namespace, podName, containerName,
                command: ['sh', '-c', cmd]
            });
            if (result.stderr.trim()) {
                setError(result.stderr);
            }
            else {
                onSuccess();
                onClose();
            }
        }
        catch (err) {
            setError(err.message);
        }
        finally {
            setLoading(false);
        }
    };
    return (consume_shared_module_default_react_17_0_singleton_default().createElement(components_PortalModal, { title: `Create New ${type === 'file' ? 'File' : 'Folder'}`, size: "sm", onClose: onClose, actions: consume_shared_module_default_react_17_0_singleton_default().createElement((consume_shared_module_default_react_17_0_singleton_default()).Fragment, null,
            consume_shared_module_default_react_17_0_singleton_default().createElement("button", { style: CreateModal_btn(true, !name.trim() || loading), disabled: !name.trim() || loading, onClick: handleCreate }, loading ? 'Creating…' : 'Create'),
            consume_shared_module_default_react_17_0_singleton_default().createElement("button", { style: CreateModal_btn(false, loading), disabled: loading, onClick: onClose }, "Cancel")) },
        consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: { marginBottom: 12 } },
            consume_shared_module_default_react_17_0_singleton_default().createElement("label", { style: { display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 500 } }, "Name"),
            consume_shared_module_default_react_17_0_singleton_default().createElement("input", { type: "text", value: name, onChange: e => setName(e.target.value), placeholder: `Enter ${type} name`, autoFocus: true, style: {
                    width: '100%', padding: '6px 10px', fontSize: 14,
                    border: '1px solid #c7c7c7', borderRadius: 3,
                    boxSizing: 'border-box'
                }, onKeyDown: e => e.key === 'Enter' && handleCreate() })),
        consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: { fontSize: 13, color: '#6a6e73' } },
            "Will be created in: ",
            consume_shared_module_default_react_17_0_singleton_default().createElement("code", null, currentPath)),
        error && (consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: {
                marginTop: 14, padding: '10px 14px', borderRadius: 4,
                background: '#fce8e8', border: '1px solid #f5c6cb', color: '#6b1117', fontSize: 13,
            } }, error))));
};
/* harmony default export */ const components_CreateModal = (CreateModal);

;// ./components/DeleteModal.tsx




const DeleteModal_btn = (primary, danger = false, disabled = false) => {
    let bg = '#fff';
    let color = '#06c';
    let border = '1px solid #06c';
    if (primary) {
        if (danger) {
            bg = '#c9190b';
            border = 'none';
            color = '#fff';
        }
        else {
            bg = '#06c';
            border = 'none';
            color = '#fff';
        }
    }
    if (disabled) {
        bg = '#c8c8c8';
        border = 'none';
        color = '#888';
    }
    return {
        padding: '6px 18px', border, borderRadius: 3,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontWeight: 500, fontSize: 14, background: bg, color,
        opacity: disabled ? 0.7 : 1,
    };
};
const DeleteModal = ({ namespace, podName, containerName, currentPath, targetNames, onClose, onSuccess, }) => {
    const [loading, setLoading] = (0,consume_shared_module_default_react_17_0_singleton_.useState)(false);
    const [error, setError] = (0,consume_shared_module_default_react_17_0_singleton_.useState)('');
    const handleDelete = async () => {
        setLoading(true);
        setError('');
        try {
            const escapedPaths = targetNames.map(name => {
                const fullPath = joinPath(currentPath, name);
                return `'${fullPath.replace(/'/g, "'\\''")}'`;
            }).join(' ');
            const result = await execCommand({
                namespace, podName, containerName,
                command: ['sh', '-c', `rm -rf ${escapedPaths}`]
            });
            if (result.stderr.trim()) {
                setError(result.stderr);
            }
            else {
                onSuccess();
                onClose();
            }
        }
        catch (err) {
            setError(err.message);
        }
        finally {
            setLoading(false);
        }
    };
    const titleStr = targetNames.length === 1 ? `Delete File: ${targetNames[0]}` : `Delete ${targetNames.length} Items`;
    return (consume_shared_module_default_react_17_0_singleton_default().createElement(components_PortalModal, { title: titleStr, size: "sm", onClose: onClose, actions: consume_shared_module_default_react_17_0_singleton_default().createElement((consume_shared_module_default_react_17_0_singleton_default()).Fragment, null,
            consume_shared_module_default_react_17_0_singleton_default().createElement("button", { style: DeleteModal_btn(true, true, loading), disabled: loading, onClick: handleDelete }, loading ? 'Deleting…' : 'Delete'),
            consume_shared_module_default_react_17_0_singleton_default().createElement("button", { style: DeleteModal_btn(false, false, loading), disabled: loading, onClick: onClose }, "Cancel")) },
        consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: { marginBottom: 16, fontSize: 14 } },
            "Are you sure you want to delete ",
            consume_shared_module_default_react_17_0_singleton_default().createElement("strong", null, targetNames.length === 1 ? targetNames[0] : `${targetNames.length} selected items`),
            "?",
            consume_shared_module_default_react_17_0_singleton_default().createElement("br", null),
            "This action cannot be undone."),
        error && (consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: {
                marginTop: 14, padding: '10px 14px', borderRadius: 4,
                background: '#fce8e8', border: '1px solid #f5c6cb', color: '#6b1117', fontSize: 13,
            } }, error))));
};
/* harmony default export */ const components_DeleteModal = (DeleteModal);

;// ./components/RenameModal.tsx




const RenameModal_btn = (primary, disabled = false) => ({
    padding: '6px 18px',
    border: primary ? 'none' : '1px solid #06c',
    borderRadius: 3,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 500,
    fontSize: 14,
    background: disabled ? '#c8c8c8' : primary ? '#06c' : '#fff',
    color: disabled ? '#888' : primary ? '#fff' : '#06c',
    opacity: disabled ? 0.7 : 1,
});
const RenameModal = ({ namespace, podName, containerName, currentPath, targetName, onClose, onSuccess, }) => {
    const [name, setName] = (0,consume_shared_module_default_react_17_0_singleton_.useState)(targetName);
    const [loading, setLoading] = (0,consume_shared_module_default_react_17_0_singleton_.useState)(false);
    const [error, setError] = (0,consume_shared_module_default_react_17_0_singleton_.useState)('');
    const inputRef = (0,consume_shared_module_default_react_17_0_singleton_.useRef)(null);
    (0,consume_shared_module_default_react_17_0_singleton_.useEffect)(() => {
        // Select the filename without extension if possible
        if (inputRef.current) {
            const dot = targetName.lastIndexOf('.');
            if (dot > 0) {
                inputRef.current.setSelectionRange(0, dot);
            }
            else {
                inputRef.current.select();
            }
        }
    }, [targetName]);
    const handleRename = async () => {
        if (!name.trim() || name.trim() === targetName) {
            onClose();
            return;
        }
        setLoading(true);
        setError('');
        try {
            const oldPath = joinPath(currentPath, targetName);
            const newPath = joinPath(currentPath, name.trim());
            const escapedOld = oldPath.replace(/'/g, "'\\''");
            const escapedNew = newPath.replace(/'/g, "'\\''");
            const result = await execCommand({
                namespace, podName, containerName,
                command: ['sh', '-c', `mv '${escapedOld}' '${escapedNew}'`]
            });
            if (result.stderr.trim()) {
                setError(result.stderr);
            }
            else {
                onSuccess();
                onClose();
            }
        }
        catch (err) {
            setError(err.message);
        }
        finally {
            setLoading(false);
        }
    };
    return (consume_shared_module_default_react_17_0_singleton_default().createElement(components_PortalModal, { title: "Rename File / Folder", size: "sm", onClose: onClose, actions: consume_shared_module_default_react_17_0_singleton_default().createElement((consume_shared_module_default_react_17_0_singleton_default()).Fragment, null,
            consume_shared_module_default_react_17_0_singleton_default().createElement("button", { style: RenameModal_btn(true, !name.trim() || loading), disabled: !name.trim() || loading, onClick: handleRename }, loading ? 'Renaming…' : 'Rename'),
            consume_shared_module_default_react_17_0_singleton_default().createElement("button", { style: RenameModal_btn(false, loading), disabled: loading, onClick: onClose }, "Cancel")) },
        consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: { marginBottom: 12 } },
            consume_shared_module_default_react_17_0_singleton_default().createElement("label", { style: { display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 500 } }, "New Name"),
            consume_shared_module_default_react_17_0_singleton_default().createElement("input", { ref: inputRef, type: "text", value: name, onChange: e => setName(e.target.value), autoFocus: true, style: {
                    width: '100%', padding: '6px 10px', fontSize: 14,
                    border: '1px solid #c7c7c7', borderRadius: 3,
                    boxSizing: 'border-box'
                }, onKeyDown: e => e.key === 'Enter' && handleRename() })),
        error && (consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: {
                marginTop: 14, padding: '10px 14px', borderRadius: 4,
                background: '#fce8e8', border: '1px solid #f5c6cb', color: '#6b1117', fontSize: 13,
            } }, error))));
};
/* harmony default export */ const components_RenameModal = (RenameModal);

;// ./components/PermissionsModal.tsx




const PermissionsModal_btn = (primary, disabled = false) => ({
    padding: '6px 18px',
    border: primary ? 'none' : '1px solid #06c',
    borderRadius: 3,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 500,
    fontSize: 14,
    background: disabled ? '#c8c8c8' : primary ? '#06c' : '#fff',
    color: disabled ? '#888' : primary ? '#fff' : '#06c',
    opacity: disabled ? 0.7 : 1,
});
const PermissionsModal = ({ namespace, podName, containerName, currentPath, entry, onClose, onSuccess, }) => {
    const [permissions, setPermissions] = (0,consume_shared_module_default_react_17_0_singleton_.useState)(entry.permissions || '');
    const [user, setUser] = (0,consume_shared_module_default_react_17_0_singleton_.useState)(entry.user || '');
    const [group, setGroup] = (0,consume_shared_module_default_react_17_0_singleton_.useState)(entry.group || '');
    const [loading, setLoading] = (0,consume_shared_module_default_react_17_0_singleton_.useState)(false);
    const [error, setError] = (0,consume_shared_module_default_react_17_0_singleton_.useState)('');
    const handleApply = async () => {
        setLoading(true);
        setError('');
        try {
            const fullPath = joinPath(currentPath, entry.name);
            const escaped = fullPath.replace(/'/g, "'\\''");
            let cmds = [];
            if (permissions && permissions !== entry.permissions) {
                cmds.push(`chmod '${permissions.replace(/'/g, "")}' '${escaped}'`);
            }
            if ((user && user !== entry.user) || (group && group !== entry.group)) {
                const u = user.replace(/'/g, "");
                const g = group.replace(/'/g, "");
                const chownTarget = g ? `${u}:${g}` : u;
                if (chownTarget) {
                    cmds.push(`chown '${chownTarget}' '${escaped}'`);
                }
            }
            if (cmds.length === 0) {
                onClose();
                return;
            }
            const result = await execCommand({
                namespace, podName, containerName,
                command: ['sh', '-c', cmds.join(' && ')]
            });
            if (result.stderr.trim()) {
                setError(result.stderr);
            }
            else {
                onSuccess();
                onClose();
            }
        }
        catch (err) {
            setError(err.message);
        }
        finally {
            setLoading(false);
        }
    };
    return (consume_shared_module_default_react_17_0_singleton_default().createElement(components_PortalModal, { title: `Edit Permissions: ${entry.name}`, size: "sm", onClose: onClose, actions: consume_shared_module_default_react_17_0_singleton_default().createElement((consume_shared_module_default_react_17_0_singleton_default()).Fragment, null,
            consume_shared_module_default_react_17_0_singleton_default().createElement("button", { style: PermissionsModal_btn(true, loading), disabled: loading, onClick: handleApply }, loading ? 'Applying…' : 'Apply'),
            consume_shared_module_default_react_17_0_singleton_default().createElement("button", { style: PermissionsModal_btn(false, loading), disabled: loading, onClick: onClose }, "Cancel")) },
        consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: { display: 'grid', gap: 16 } },
            consume_shared_module_default_react_17_0_singleton_default().createElement("div", null,
                consume_shared_module_default_react_17_0_singleton_default().createElement("label", { style: { display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 500 } }, "Permissions (Octal)"),
                consume_shared_module_default_react_17_0_singleton_default().createElement("input", { type: "text", value: permissions, onChange: e => setPermissions(e.target.value), placeholder: "e.g. 644 or 755", style: {
                        width: '100%', padding: '6px 10px', fontSize: 14,
                        border: '1px solid #c7c7c7', borderRadius: 3,
                        boxSizing: 'border-box'
                    } })),
            consume_shared_module_default_react_17_0_singleton_default().createElement("div", null,
                consume_shared_module_default_react_17_0_singleton_default().createElement("label", { style: { display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 500 } }, "Owner"),
                consume_shared_module_default_react_17_0_singleton_default().createElement("input", { type: "text", value: user, onChange: e => setUser(e.target.value), placeholder: "User name or ID", style: {
                        width: '100%', padding: '6px 10px', fontSize: 14,
                        border: '1px solid #c7c7c7', borderRadius: 3,
                        boxSizing: 'border-box'
                    } })),
            consume_shared_module_default_react_17_0_singleton_default().createElement("div", null,
                consume_shared_module_default_react_17_0_singleton_default().createElement("label", { style: { display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 500 } }, "Group"),
                consume_shared_module_default_react_17_0_singleton_default().createElement("input", { type: "text", value: group, onChange: e => setGroup(e.target.value), placeholder: "Group name or ID", style: {
                        width: '100%', padding: '6px 10px', fontSize: 14,
                        border: '1px solid #c7c7c7', borderRadius: 3,
                        boxSizing: 'border-box'
                    } }))),
        error && (consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: {
                marginTop: 14, padding: '10px 14px', borderRadius: 4,
                background: '#fce8e8', border: '1px solid #f5c6cb', color: '#6b1117', fontSize: 13,
            } }, error))));
};
/* harmony default export */ const components_PermissionsModal = (PermissionsModal);

;// ./components/FileTailViewer.tsx




const FileTailViewer = ({ namespace, podName, containerName, currentPath, targetName, onClose, }) => {
    const [logs, setLogs] = (0,consume_shared_module_default_react_17_0_singleton_.useState)('');
    const [error, setError] = (0,consume_shared_module_default_react_17_0_singleton_.useState)('');
    const [isFollowing, setIsFollowing] = (0,consume_shared_module_default_react_17_0_singleton_.useState)(true);
    const logContainerRef = (0,consume_shared_module_default_react_17_0_singleton_.useRef)(null);
    (0,consume_shared_module_default_react_17_0_singleton_.useEffect)(() => {
        const fullPath = joinPath(currentPath, targetName);
        const escaped = fullPath.replace(/'/g, "'\\''");
        // Use tail -f -n 100 to get last 100 lines and follow
        const command = ['sh', '-c', `tail -f -n 100 '${escaped}'`];
        const cancelStream = execStream({ namespace, podName, containerName, command }, (data, isErr) => {
            if (isErr) {
                setError(prev => prev + data);
            }
            else {
                setLogs(prev => prev + data);
            }
        }, () => {
            setLogs(prev => prev + '\n[Stream Closed]\n');
        }, (err) => {
            setError(`Connection error: ${err.message}`);
        });
        return () => {
            cancelStream();
        };
    }, [namespace, podName, containerName, currentPath, targetName]);
    (0,consume_shared_module_default_react_17_0_singleton_.useEffect)(() => {
        if (isFollowing && logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs, isFollowing]);
    const handleScroll = () => {
        if (!logContainerRef.current)
            return;
        const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current;
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 10;
        if (isFollowing !== isAtBottom) {
            setIsFollowing(isAtBottom);
        }
    };
    return (consume_shared_module_default_react_17_0_singleton_default().createElement(components_PortalModal, { title: `Live Log: ${targetName}`, size: "lg", onClose: onClose, actions: consume_shared_module_default_react_17_0_singleton_default().createElement("button", { style: {
                padding: '6px 18px', border: '1px solid #06c', borderRadius: 3,
                cursor: 'pointer', fontWeight: 500, fontSize: 14,
                background: '#fff', color: '#06c'
            }, onClick: onClose }, "Close") },
        consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 } },
            consume_shared_module_default_react_17_0_singleton_default().createElement("span", { style: { color: '#6a6e73' } },
                "Path: ",
                consume_shared_module_default_react_17_0_singleton_default().createElement("code", null, joinPath(currentPath, targetName))),
            consume_shared_module_default_react_17_0_singleton_default().createElement("label", { style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' } },
                consume_shared_module_default_react_17_0_singleton_default().createElement("input", { type: "checkbox", checked: isFollowing, onChange: e => setIsFollowing(e.target.checked) }),
                "Follow")),
        consume_shared_module_default_react_17_0_singleton_default().createElement("div", { ref: logContainerRef, onScroll: handleScroll, style: {
                background: '#151515',
                color: '#f0f0f0',
                padding: 12,
                borderRadius: 4,
                fontFamily: 'monospace',
                fontSize: 13,
                height: '60vh',
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
            } }, logs || consume_shared_module_default_react_17_0_singleton_default().createElement("span", { style: { color: '#888' } }, "Waiting for logs...")),
        error && (consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: {
                marginTop: 14, padding: '10px 14px', borderRadius: 4,
                background: '#fce8e8', border: '1px solid #f5c6cb', color: '#6b1117', fontSize: 13,
                maxHeight: 100, overflowY: 'auto'
            } },
            consume_shared_module_default_react_17_0_singleton_default().createElement("strong", null, "Error:"),
            " ",
            error))));
};
/* harmony default export */ const components_FileTailViewer = (FileTailViewer);

// EXTERNAL MODULE: consume shared module (default) @patternfly/react-core@^4.0.0 (strict) (fallback: ../node_modules/@patternfly/react-core/dist/esm/index.js)
var index_js_ = __webpack_require__(9598);
;// ./components/ImagePreviewModal.tsx





const ImagePreviewModal = ({ namespace, podName, containerName, currentPath, entry, onClose, }) => {
    const [loading, setLoading] = (0,consume_shared_module_default_react_17_0_singleton_.useState)(true);
    const [error, setError] = (0,consume_shared_module_default_react_17_0_singleton_.useState)('');
    const [imgSrc, setImgSrc] = (0,consume_shared_module_default_react_17_0_singleton_.useState)('');
    (0,consume_shared_module_default_react_17_0_singleton_.useEffect)(() => {
        let active = true;
        const fetchImage = async () => {
            setLoading(true);
            setError('');
            try {
                const filePath = joinPath(currentPath, entry.name);
                const result = await execCommand({ namespace, podName, containerName, command: ['base64', filePath] });
                if (!active)
                    return;
                if (result.stderr.trim()) {
                    setError(result.stderr);
                }
                else {
                    const b64 = new TextDecoder().decode(result.stdout).replace(/\s+/g, '');
                    let mime = 'image/png';
                    if (entry.name.endsWith('.jpg') || entry.name.endsWith('.jpeg'))
                        mime = 'image/jpeg';
                    else if (entry.name.endsWith('.gif'))
                        mime = 'image/gif';
                    else if (entry.name.endsWith('.svg'))
                        mime = 'image/svg+xml';
                    else if (entry.name.endsWith('.webp'))
                        mime = 'image/webp';
                    setImgSrc(`data:${mime};base64,${b64}`);
                }
            }
            catch (err) {
                if (active)
                    setError(err.message);
            }
            finally {
                if (active)
                    setLoading(false);
            }
        };
        fetchImage();
        return () => { active = false; };
    }, [namespace, podName, containerName, currentPath, entry.name]);
    return (consume_shared_module_default_react_17_0_singleton_default().createElement(components_PortalModal, { title: `Preview: ${entry.name}`, size: "lg", onClose: onClose, actions: consume_shared_module_default_react_17_0_singleton_default().createElement("button", { style: {
                padding: '6px 18px', border: '1px solid #06c', borderRadius: 3,
                cursor: 'pointer', fontWeight: 500, fontSize: 14,
                background: '#fff', color: '#06c'
            }, onClick: onClose }, "Close") },
        consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200 } },
            loading && consume_shared_module_default_react_17_0_singleton_default().createElement(index_js_.Spinner, { size: "lg" }),
            !loading && error && (consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: {
                    padding: '10px 14px', borderRadius: 4, width: '100%',
                    background: '#fce8e8', border: '1px solid #f5c6cb', color: '#6b1117', fontSize: 13,
                } }, error)),
            !loading && !error && imgSrc && (consume_shared_module_default_react_17_0_singleton_default().createElement("img", { src: imgSrc, alt: entry.name, style: {
                    maxWidth: '100%',
                    maxHeight: '60vh',
                    objectFit: 'contain',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    borderRadius: 4,
                    background: 'repeating-conic-gradient(#f0f0f0 0% 25%, transparent 0% 50%) 50% / 20px 20px' // checkerboard for transparent images
                } })))));
};
/* harmony default export */ const components_ImagePreviewModal = (ImagePreviewModal);

;// ./components/FileExplorer.tsx












const Btn = ({ variant = 'secondary', style, children, ...rest }) => {
    const base = {
        border: 'none', borderRadius: 3, cursor: rest.disabled ? 'not-allowed' : 'pointer',
        fontWeight: 500, fontSize: 14, lineHeight: 1, display: 'inline-flex',
        alignItems: 'center', gap: 6, padding: '6px 14px', opacity: rest.disabled ? 0.55 : 1,
        transition: 'all 0.2s',
    };
    const variants = {
        primary: { background: '#06c', color: '#fff' },
        secondary: { background: '#fff', color: '#151515', border: '1px solid #c7c7c7' },
        danger: { background: '#c9190b', color: '#fff' },
        plain: { background: 'none', color: '#151515', padding: '5px 8px' },
        link: { background: 'none', color: '#06c', padding: 0, fontWeight: 400, textDecoration: 'underline' },
    };
    return consume_shared_module_default_react_17_0_singleton_default().createElement("button", { ...rest, style: { ...base, ...variants[variant], ...style } }, children);
};
const DropItem = ({ onClick, danger, disabled, children }) => (consume_shared_module_default_react_17_0_singleton_default().createElement("button", { onClick: disabled ? undefined : onClick, disabled: disabled, style: {
        display: 'block', width: '100%', textAlign: 'left',
        padding: '8px 16px', background: 'none', border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 13,
        color: disabled ? '#aaa' : danger ? '#c9190b' : '#151515',
        opacity: disabled ? 0.5 : 1,
        whiteSpace: 'nowrap',
    } }, children));
const CssSpinner = ({ size = 28 }) => (consume_shared_module_default_react_17_0_singleton_default().createElement((consume_shared_module_default_react_17_0_singleton_default()).Fragment, null,
    consume_shared_module_default_react_17_0_singleton_default().createElement("style", null, `@keyframes _pf_spin{to{transform:rotate(360deg)}}`),
    consume_shared_module_default_react_17_0_singleton_default().createElement("span", { style: {
            display: 'inline-block', width: size, height: size,
            borderRadius: '50%', border: '3px solid #d2d2d2',
            borderTopColor: '#06c', animation: '_pf_spin .7s linear infinite',
            verticalAlign: 'middle', flexShrink: 0,
        } })));
const ARCHIVE_EXTS = ['.tar.gz', '.tgz', '.tar', '.zip'];
const isArchive = (name) => ARCHIVE_EXTS.some(ext => name.endsWith(ext));
const isImageFile = (name) => ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].some(ext => name.toLowerCase().endsWith(ext));
const FileExplorer = ({ namespace, podName, containerName, containers }) => {
    const [activeContainer, setActiveContainer] = (0,consume_shared_module_default_react_17_0_singleton_.useState)(containerName);
    const [currentPath, setCurrentPath] = (0,consume_shared_module_default_react_17_0_singleton_.useState)('/');
    const [files, setFiles] = (0,consume_shared_module_default_react_17_0_singleton_.useState)([]);
    const [loading, setLoading] = (0,consume_shared_module_default_react_17_0_singleton_.useState)(false);
    const [error, setError] = (0,consume_shared_module_default_react_17_0_singleton_.useState)('');
    const [searchQuery, setSearchQuery] = (0,consume_shared_module_default_react_17_0_singleton_.useState)('');
    const [isSearching, setIsSearching] = (0,consume_shared_module_default_react_17_0_singleton_.useState)(false);
    const [downloading, setDownloading] = (0,consume_shared_module_default_react_17_0_singleton_.useState)(null);
    // Modals state
    const [showUpload, setShowUpload] = (0,consume_shared_module_default_react_17_0_singleton_.useState)(false);
    const [editingFile, setEditingFile] = (0,consume_shared_module_default_react_17_0_singleton_.useState)(null);
    const [showCreateModal, setShowCreateModal] = (0,consume_shared_module_default_react_17_0_singleton_.useState)(null);
    const [itemsToDelete, setItemsToDelete] = (0,consume_shared_module_default_react_17_0_singleton_.useState)([]);
    const [itemToRename, setItemToRename] = (0,consume_shared_module_default_react_17_0_singleton_.useState)(null);
    const [itemToPerms, setItemToPerms] = (0,consume_shared_module_default_react_17_0_singleton_.useState)(null);
    const [itemToTail, setItemToTail] = (0,consume_shared_module_default_react_17_0_singleton_.useState)(null);
    const [itemToPreview, setItemToPreview] = (0,consume_shared_module_default_react_17_0_singleton_.useState)(null);
    // Multi-select state
    const [selectedItems, setSelectedItems] = (0,consume_shared_module_default_react_17_0_singleton_.useState)(new Set());
    // Drag & Drop state
    const [isDragging, setIsDragging] = (0,consume_shared_module_default_react_17_0_singleton_.useState)(false);
    const [uploadingFiles, setUploadingFiles] = (0,consume_shared_module_default_react_17_0_singleton_.useState)([]);
    // Three-dot dropdown
    const [openMenu, setOpenMenu] = (0,consume_shared_module_default_react_17_0_singleton_.useState)(null);
    // Close dropdown on scroll or resize
    (0,consume_shared_module_default_react_17_0_singleton_.useEffect)(() => {
        if (!openMenu)
            return;
        const close = () => setOpenMenu(null);
        window.addEventListener('scroll', close, true);
        window.addEventListener('resize', close);
        return () => {
            window.removeEventListener('scroll', close, true);
            window.removeEventListener('resize', close);
        };
    }, [openMenu]);
    const loadDirectory = (0,consume_shared_module_default_react_17_0_singleton_.useCallback)(async (path, query = '') => {
        setLoading(true);
        setError('');
        setSelectedItems(new Set());
        try {
            const command = query ? buildSearchCommand(path, query) : buildListCommand(path);
            const result = await execCommand({ namespace, podName, containerName: activeContainer, command });
            if (result.stderr.trim()) {
                setError(result.stderr.trim());
                setFiles([]);
            }
            else {
                setFiles(parseFileList(new TextDecoder().decode(result.stdout)));
            }
            setIsSearching(!!query);
        }
        catch (e) {
            setError(e.message || 'Failed to list directory');
            setFiles([]);
        }
        finally {
            setLoading(false);
        }
    }, [namespace, podName, activeContainer]);
    (0,consume_shared_module_default_react_17_0_singleton_.useEffect)(() => { loadDirectory(currentPath); setSearchQuery(''); }, [currentPath, loadDirectory]);
    // Reset to root when container changes
    (0,consume_shared_module_default_react_17_0_singleton_.useEffect)(() => { setCurrentPath('/'); setSearchQuery(''); }, [activeContainer]);
    const handleSearchSubmit = (e) => {
        e.preventDefault();
        loadDirectory(currentPath, searchQuery);
    };
    const navigateInto = (dir) => setCurrentPath(joinPath(currentPath, dir));
    const navigateTo = (path) => setCurrentPath(path || '/');
    const downloadFile = async (entry) => {
        const filePath = joinPath(currentPath, entry.name);
        setDownloading(entry.name);
        try {
            const result = await execCommand({ namespace, podName, containerName: activeContainer, command: ['base64', filePath] });
            const b64 = new TextDecoder().decode(result.stdout).replace(/\s+/g, '');
            const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
            const url = URL.createObjectURL(new Blob([bytes]));
            Object.assign(document.createElement('a'), { href: url, download: entry.name }).click();
            URL.revokeObjectURL(url);
        }
        catch (e) {
            setError(`Download failed: ${e.message}`);
        }
        finally {
            setDownloading(null);
        }
    };
    const downloadArchive = async (names, zipName = 'archive.tar.gz') => {
        setDownloading(zipName);
        try {
            const escapedPath = currentPath.replace(/'/g, "'\\''");
            const escapedNames = names.map(n => `'${n.replace(/'/g, "'\\''")}'`).join(' ');
            const command = ['sh', '-c', `tar -czf - -C '${escapedPath}' ${escapedNames} | base64`];
            const result = await execCommand({ namespace, podName, containerName: activeContainer, command });
            if (result.stderr.trim())
                throw new Error(result.stderr);
            const b64 = new TextDecoder().decode(result.stdout).replace(/\s+/g, '');
            const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
            const url = URL.createObjectURL(new Blob([bytes]));
            Object.assign(document.createElement('a'), { href: url, download: zipName }).click();
            URL.revokeObjectURL(url);
        }
        catch (e) {
            setError(`Archive download failed: ${e.message}`);
        }
        finally {
            setDownloading(null);
        }
    };
    const extractArchive = async (entry) => {
        setLoading(true);
        setError('');
        try {
            const filePath = joinPath(currentPath, entry.name);
            const escaped = filePath.replace(/'/g, "'\\''");
            const escapedDir = currentPath.replace(/'/g, "'\\''");
            const command = entry.name.endsWith('.zip')
                ? ['sh', '-c', `unzip -o '${escaped}' -d '${escapedDir}'`]
                : ['sh', '-c', `tar -xf '${escaped}' -C '${escapedDir}'`];
            const result = await execCommand({ namespace, podName, containerName: activeContainer, command });
            if (result.stderr.trim())
                throw new Error(result.stderr);
            loadDirectory(currentPath);
        }
        catch (e) {
            setError(`Extraction failed: ${e.message}`);
            setLoading(false);
        }
    };
    // Drag & Drop
    const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
    const handleDrop = async (e) => {
        e.preventDefault();
        setIsDragging(false);
        const filesToUpload = Array.from(e.dataTransfer.files);
        if (filesToUpload.length === 0)
            return;
        for (const file of filesToUpload) {
            try {
                setUploadingFiles(prev => [...prev, { name: file.name }]);
                const destPath = joinPath(currentPath, file.name);
                const result = await execUploadFile({ namespace, podName, containerName: activeContainer }, file, destPath, () => { });
                if (result.stderr.trim())
                    setError(`Failed to upload ${file.name}: ${result.stderr}`);
            }
            catch (err) {
                setError(`Failed to upload ${file.name}: ${err.message}`);
            }
            finally {
                setUploadingFiles(prev => prev.filter(p => p.name !== file.name));
            }
        }
        loadDirectory(currentPath);
    };
    const handleMenuOpen = (e, entry) => {
        e.stopPropagation();
        if (openMenu?.entry.name === entry.name) {
            setOpenMenu(null);
            return;
        }
        const rect = e.currentTarget.getBoundingClientRect();
        const menuW = 200;
        const menuH = 260;
        const left = rect.right - menuW < 8 ? 8 : rect.right - menuW;
        const top = rect.bottom + menuH > window.innerHeight
            ? Math.max(8, rect.top - menuH)
            : rect.bottom + 4;
        setOpenMenu({ entry, top, left });
    };
    const closeMenu = () => setOpenMenu(null);
    const segments = pathSegments(currentPath);
    return (consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: { padding: '16px 24px', fontFamily: 'RedHatText, Overpass, sans-serif', position: 'relative' }, onDragOver: handleDragOver, onDragLeave: handleDragLeave, onDrop: handleDrop },
        isDragging && (consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: {
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(6, 102, 204, 0.1)', border: '2px dashed #06c',
                zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none', borderRadius: 8,
            } },
            consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: { color: '#06c', background: '#fff', padding: '12px 24px', borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 18, fontWeight: 600 } },
                "Drop files to upload into ",
                currentPath))),
        uploadingFiles.length > 0 && (consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: {
                position: 'fixed', bottom: 24, right: 24, zIndex: 101,
                background: '#fff', padding: '16px 24px', borderRadius: 8,
                boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                border: '1px solid #d2d2d2', width: 300,
            } },
            consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: { fontWeight: 600, marginBottom: 8 } },
                "Uploading ",
                uploadingFiles.length,
                " file(s)..."),
            uploadingFiles.map(f => (consume_shared_module_default_react_17_0_singleton_default().createElement("div", { key: f.name, style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#6a6e73', marginBottom: 4, overflow: 'hidden' } },
                consume_shared_module_default_react_17_0_singleton_default().createElement(CssSpinner, { size: 16 }),
                consume_shared_module_default_react_17_0_singleton_default().createElement("span", { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, f.name)))))),
        consume_shared_module_default_react_17_0_singleton_default().createElement("nav", { "aria-label": "Directory path", style: {
                display: 'flex', alignItems: 'center', flexWrap: 'wrap',
                gap: 2, padding: '8px 0 12px',
                borderBottom: '1px solid #d2d2d2', marginBottom: 12, fontSize: 14,
            } },
            consume_shared_module_default_react_17_0_singleton_default().createElement("button", { onClick: () => navigateTo('/'), style: { background: 'none', border: 'none', cursor: 'pointer', color: '#06c', padding: '0 4px', fontSize: 14 } }, "/"),
            segments.map((seg, idx) => {
                const isLast = idx === segments.length - 1;
                const segPath = '/' + segments.slice(0, idx + 1).join('/');
                return (consume_shared_module_default_react_17_0_singleton_default().createElement((consume_shared_module_default_react_17_0_singleton_default()).Fragment, { key: segPath },
                    consume_shared_module_default_react_17_0_singleton_default().createElement("span", { style: { color: '#8a8d90', fontSize: 13, userSelect: 'none' } }, "\u203A"),
                    isLast ? (consume_shared_module_default_react_17_0_singleton_default().createElement("span", { style: { fontWeight: 600, color: '#151515', padding: '0 4px' } }, seg)) : (consume_shared_module_default_react_17_0_singleton_default().createElement("button", { onClick: () => navigateTo(segPath), style: { background: 'none', border: 'none', cursor: 'pointer', color: '#06c', padding: '0 4px', fontSize: 14 } }, seg))));
            })),
        consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' } },
            consume_shared_module_default_react_17_0_singleton_default().createElement(Btn, { variant: "secondary", onClick: () => setShowCreateModal('directory') }, "+ Folder"),
            consume_shared_module_default_react_17_0_singleton_default().createElement(Btn, { variant: "secondary", onClick: () => setShowCreateModal('file') }, "+ File"),
            consume_shared_module_default_react_17_0_singleton_default().createElement(Btn, { variant: "secondary", onClick: () => setShowUpload(true) }, "\u2191 Upload"),
            consume_shared_module_default_react_17_0_singleton_default().createElement(Btn, { variant: "plain", "aria-label": "Refresh", disabled: loading, onClick: () => loadDirectory(currentPath, searchQuery), style: { fontSize: 18, padding: '4px 8px' } }, "\u21BB"),
            selectedItems.size > 0 && (consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: { marginLeft: 16, display: 'flex', alignItems: 'center', gap: 8, background: '#e7f1fa', padding: '4px 12px', borderRadius: 4, border: '1px solid #06c' } },
                consume_shared_module_default_react_17_0_singleton_default().createElement("span", { style: { fontSize: 13, fontWeight: 600, color: '#06c' } },
                    selectedItems.size,
                    " selected"),
                consume_shared_module_default_react_17_0_singleton_default().createElement(Btn, { variant: "primary", style: { padding: '4px 12px', fontSize: 13 }, onClick: () => downloadArchive(Array.from(selectedItems), 'selected_files.tar.gz') }, "Tar Selected"),
                consume_shared_module_default_react_17_0_singleton_default().createElement(Btn, { variant: "danger", style: { padding: '4px 12px', fontSize: 13 }, onClick: () => setItemsToDelete(Array.from(selectedItems)) }, "Delete Selected"))),
            consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
                containers && containers.length > 1 && (consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 6 } },
                    consume_shared_module_default_react_17_0_singleton_default().createElement("label", { htmlFor: "fe-container-select", style: { fontSize: 13, fontWeight: 500, color: '#151515', whiteSpace: 'nowrap' } }, "Container"),
                    consume_shared_module_default_react_17_0_singleton_default().createElement("select", { id: "fe-container-select", value: activeContainer, onChange: e => setActiveContainer(e.target.value), style: {
                            padding: '5px 10px', fontSize: 13,
                            border: '1px solid #c7c7c7', borderRadius: 3,
                            background: '#fff', color: '#151515', cursor: 'pointer',
                        } }, containers.map(c => consume_shared_module_default_react_17_0_singleton_default().createElement("option", { key: c, value: c }, c))))),
                consume_shared_module_default_react_17_0_singleton_default().createElement("form", { onSubmit: handleSearchSubmit, style: { display: 'flex', gap: 4 } },
                    consume_shared_module_default_react_17_0_singleton_default().createElement("input", { type: "text", placeholder: "Search in folder...", value: searchQuery, onChange: e => setSearchQuery(e.target.value), style: { padding: '6px 10px', fontSize: 13, border: '1px solid #c7c7c7', borderRadius: 3, width: 200 } }),
                    consume_shared_module_default_react_17_0_singleton_default().createElement(Btn, { variant: "secondary", type: "submit", disabled: loading }, "Search")))),
        error && (consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: {
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                padding: '10px 16px', marginBottom: 12, borderRadius: 4,
                background: '#fce8e8', border: '1px solid #f5c6cb', color: '#6b1117', fontSize: 13,
            } },
            consume_shared_module_default_react_17_0_singleton_default().createElement("span", null, error),
            consume_shared_module_default_react_17_0_singleton_default().createElement("button", { onClick: () => setError(''), style: { background: 'none', border: 'none', cursor: 'pointer', color: '#6b1117', fontSize: 16 } }, "\u00D7"))),
        loading && (consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: { padding: 56, display: 'flex', justifyContent: 'center' } },
            consume_shared_module_default_react_17_0_singleton_default().createElement(CssSpinner, { size: 40 }))),
        !loading && files.length === 0 && !error && (consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: { padding: '48px 24px', textAlign: 'center', color: '#6a6e73' } },
            consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: { fontSize: 48, lineHeight: 1, marginBottom: 12 } }, "\uD83D\uDCC2"),
            consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: { fontSize: 16, fontWeight: 600, color: '#151515', marginBottom: 6 } }, "Empty results"),
            consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: { fontSize: 14 } }, isSearching ? 'No files match your search.' : 'No files or subdirectories found.'))),
        !loading && files.length > 0 && (consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: { overflowX: 'auto', border: '1px solid #d2d2d2', borderRadius: 4, width: '100%' } },
            consume_shared_module_default_react_17_0_singleton_default().createElement("table", { className: "pf-c-table pf-m-compact pf-m-grid-md", "aria-label": "Pod filesystem", style: { width: '100%', tableLayout: 'fixed', background: '#fff', margin: 0 } },
                consume_shared_module_default_react_17_0_singleton_default().createElement("thead", { className: "pf-c-table__thead" },
                    consume_shared_module_default_react_17_0_singleton_default().createElement("tr", { className: "pf-c-table__tr", style: { borderBottom: '2px solid #d2d2d2' } },
                        consume_shared_module_default_react_17_0_singleton_default().createElement("th", { className: "pf-c-table__th", style: { padding: '12px 16px', width: 40 } },
                            consume_shared_module_default_react_17_0_singleton_default().createElement("input", { type: "checkbox", checked: selectedItems.size === files.length && files.length > 0, onChange: e => {
                                    if (e.target.checked)
                                        setSelectedItems(new Set(files.map(f => f.name)));
                                    else
                                        setSelectedItems(new Set());
                                } })),
                        consume_shared_module_default_react_17_0_singleton_default().createElement("th", { className: "pf-c-table__th", style: { padding: '12px 16px', fontWeight: 600 } }, "Name"),
                        consume_shared_module_default_react_17_0_singleton_default().createElement("th", { className: "pf-c-table__th", style: { padding: '12px 16px', fontWeight: 600, width: '9%' } }, "Size"),
                        consume_shared_module_default_react_17_0_singleton_default().createElement("th", { className: "pf-c-table__th", style: { padding: '12px 16px', fontWeight: 600, width: '14%' } }, "Modified"),
                        consume_shared_module_default_react_17_0_singleton_default().createElement("th", { className: "pf-c-table__th", style: { padding: '12px 16px', fontWeight: 600, width: '8%' } }, "Perms"),
                        consume_shared_module_default_react_17_0_singleton_default().createElement("th", { className: "pf-c-table__th", style: { padding: '12px 16px', fontWeight: 600, width: '11%' } }, "Owner"),
                        consume_shared_module_default_react_17_0_singleton_default().createElement("th", { className: "pf-c-table__th", style: { padding: '12px 16px', width: '4%' } }))),
                consume_shared_module_default_react_17_0_singleton_default().createElement("tbody", { className: "pf-c-table__tbody" }, files.map(entry => (consume_shared_module_default_react_17_0_singleton_default().createElement("tr", { className: "pf-c-table__tr", key: entry.name, style: { borderBottom: '1px solid #f0f0f0' } },
                    consume_shared_module_default_react_17_0_singleton_default().createElement("td", { className: "pf-c-table__td", style: { padding: '10px 16px' } },
                        consume_shared_module_default_react_17_0_singleton_default().createElement("input", { type: "checkbox", checked: selectedItems.has(entry.name), onChange: e => {
                                const next = new Set(selectedItems);
                                if (e.target.checked)
                                    next.add(entry.name);
                                else
                                    next.delete(entry.name);
                                setSelectedItems(next);
                            } })),
                    consume_shared_module_default_react_17_0_singleton_default().createElement("td", { className: "pf-c-table__td", "data-label": "Name", style: { padding: '10px 16px', maxWidth: 0 } },
                        consume_shared_module_default_react_17_0_singleton_default().createElement("span", { style: { display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' } },
                            consume_shared_module_default_react_17_0_singleton_default().createElement(FileIcon, { entry: entry, style: { flexShrink: 0, fontSize: '1.2em' } }),
                            entry.type === 'directory' ? (consume_shared_module_default_react_17_0_singleton_default().createElement("button", { onClick: () => navigateInto(entry.name), style: { background: 'none', border: 'none', cursor: 'pointer', color: '#06c', fontSize: 14, padding: 0, fontWeight: 500, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 } }, entry.name)) : isImageFile(entry.name) ? (consume_shared_module_default_react_17_0_singleton_default().createElement("button", { onClick: () => setItemToPreview(entry), style: { background: 'none', border: 'none', cursor: 'pointer', color: '#06c', fontSize: 14, padding: 0, fontWeight: 500, textAlign: 'left', textDecoration: 'underline', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 } }, entry.name)) : (consume_shared_module_default_react_17_0_singleton_default().createElement("span", { style: { fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 } }, entry.name)),
                            entry.type === 'symlink' && entry.target && (consume_shared_module_default_react_17_0_singleton_default().createElement("span", { style: { color: '#8a8d90', fontSize: '0.8em', fontStyle: 'italic' } },
                                "\u2192 ",
                                entry.target)))),
                    consume_shared_module_default_react_17_0_singleton_default().createElement("td", { className: "pf-c-table__td", "data-label": "Size", style: { padding: '10px 16px', color: '#6a6e73', fontSize: 13 } }, entry.type === 'file' ? formatFileSize(entry.size) : '—'),
                    consume_shared_module_default_react_17_0_singleton_default().createElement("td", { className: "pf-c-table__td", "data-label": "Modified", style: { padding: '10px 16px', color: '#6a6e73', fontSize: 13, whiteSpace: 'nowrap' } }, entry.modifiedAt.toLocaleString()),
                    consume_shared_module_default_react_17_0_singleton_default().createElement("td", { className: "pf-c-table__td", "data-label": "Permissions", style: { padding: '10px 16px' } },
                        consume_shared_module_default_react_17_0_singleton_default().createElement("button", { onClick: () => setItemToPerms(entry), style: { background: 'none', border: 'none', cursor: 'pointer', color: '#06c', fontSize: 13, padding: 0, textDecoration: 'underline' } }, entry.permissions || '—')),
                    consume_shared_module_default_react_17_0_singleton_default().createElement("td", { className: "pf-c-table__td", "data-label": "Owner", style: { padding: '10px 16px', color: '#6a6e73', fontSize: 13, whiteSpace: 'nowrap' } },
                        entry.user || '—',
                        ":",
                        entry.group || '—'),
                    consume_shared_module_default_react_17_0_singleton_default().createElement("td", { className: "pf-c-table__td", style: { padding: '10px 8px', textAlign: 'center' } },
                        consume_shared_module_default_react_17_0_singleton_default().createElement("button", { onClick: e => handleMenuOpen(e, entry), title: "More actions", style: {
                                background: openMenu?.entry.name === entry.name ? '#f0f0f0' : 'none',
                                border: '1px solid transparent',
                                borderRadius: 4, cursor: 'pointer',
                                padding: '3px 8px', fontSize: 20,
                                color: '#6a6e73', lineHeight: 1,
                                letterSpacing: 1,
                            } }, "\u22EE"))))))))),
        openMenu && (consume_shared_module_default_react_17_0_singleton_default().createElement((consume_shared_module_default_react_17_0_singleton_default()).Fragment, null,
            consume_shared_module_default_react_17_0_singleton_default().createElement("div", { onClick: closeMenu, style: { position: 'fixed', inset: 0, zIndex: 1999 } }),
            consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: {
                    position: 'fixed',
                    top: openMenu.top,
                    left: openMenu.left,
                    zIndex: 2000,
                    background: '#fff',
                    border: '1px solid #d2d2d2',
                    borderRadius: 6,
                    boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
                    minWidth: 200,
                    padding: '4px 0',
                } },
                consume_shared_module_default_react_17_0_singleton_default().createElement(DropItem, { onClick: () => { closeMenu(); setItemToRename(openMenu.entry.name); } }, "Rename"),
                openMenu.entry.type === 'directory' && (consume_shared_module_default_react_17_0_singleton_default().createElement(DropItem, { disabled: !!downloading, onClick: () => { closeMenu(); downloadArchive([openMenu.entry.name], `${openMenu.entry.name}.tar.gz`); } }, "Download as tar.gz")),
                openMenu.entry.type === 'file' && (consume_shared_module_default_react_17_0_singleton_default().createElement(DropItem, { disabled: downloading === openMenu.entry.name, onClick: () => { closeMenu(); downloadFile(openMenu.entry); } }, "Download")),
                openMenu.entry.type === 'file' && isArchive(openMenu.entry.name) && (consume_shared_module_default_react_17_0_singleton_default().createElement(DropItem, { onClick: () => { closeMenu(); extractArchive(openMenu.entry); } }, "Extract here")),
                openMenu.entry.type === 'file' && isTextFile(openMenu.entry.name) && (consume_shared_module_default_react_17_0_singleton_default().createElement(DropItem, { onClick: () => { closeMenu(); setEditingFile(joinPath(currentPath, openMenu.entry.name)); } }, "Edit")),
                openMenu.entry.type === 'file' && (isTextFile(openMenu.entry.name) || openMenu.entry.name.endsWith('.log')) && (consume_shared_module_default_react_17_0_singleton_default().createElement(DropItem, { onClick: () => { closeMenu(); setItemToTail(openMenu.entry.name); } }, "Tail")),
                consume_shared_module_default_react_17_0_singleton_default().createElement(DropItem, { onClick: () => { closeMenu(); setItemToPerms(openMenu.entry); } }, "Permissions"),
                consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: { height: 1, background: '#e8e8e8', margin: '4px 0' } }),
                consume_shared_module_default_react_17_0_singleton_default().createElement(DropItem, { danger: true, onClick: () => { closeMenu(); setItemsToDelete([openMenu.entry.name]); } }, "Delete")))),
        showCreateModal && (consume_shared_module_default_react_17_0_singleton_default().createElement(components_CreateModal, { namespace: namespace, podName: podName, containerName: activeContainer, currentPath: currentPath, type: showCreateModal, onClose: () => setShowCreateModal(null), onSuccess: () => loadDirectory(currentPath) })),
        itemsToDelete.length > 0 && (consume_shared_module_default_react_17_0_singleton_default().createElement(components_DeleteModal, { namespace: namespace, podName: podName, containerName: activeContainer, currentPath: currentPath, targetNames: itemsToDelete, onClose: () => setItemsToDelete([]), onSuccess: () => { setSelectedItems(new Set()); loadDirectory(currentPath); } })),
        itemToRename && (consume_shared_module_default_react_17_0_singleton_default().createElement(components_RenameModal, { namespace: namespace, podName: podName, containerName: activeContainer, currentPath: currentPath, targetName: itemToRename, onClose: () => setItemToRename(null), onSuccess: () => loadDirectory(currentPath) })),
        itemToPerms && (consume_shared_module_default_react_17_0_singleton_default().createElement(components_PermissionsModal, { namespace: namespace, podName: podName, containerName: activeContainer, currentPath: currentPath, entry: itemToPerms, onClose: () => setItemToPerms(null), onSuccess: () => loadDirectory(currentPath) })),
        itemToTail && (consume_shared_module_default_react_17_0_singleton_default().createElement(components_FileTailViewer, { namespace: namespace, podName: podName, containerName: activeContainer, currentPath: currentPath, targetName: itemToTail, onClose: () => setItemToTail(null) })),
        itemToPreview && (consume_shared_module_default_react_17_0_singleton_default().createElement(components_ImagePreviewModal, { namespace: namespace, podName: podName, containerName: activeContainer, currentPath: currentPath, entry: itemToPreview, onClose: () => setItemToPreview(null) })),
        editingFile && (consume_shared_module_default_react_17_0_singleton_default().createElement(components_FileEditor, { namespace: namespace, podName: podName, containerName: activeContainer, filePath: editingFile, onClose: () => setEditingFile(null), onSaved: () => loadDirectory(currentPath) })),
        showUpload && (consume_shared_module_default_react_17_0_singleton_default().createElement(components_UploadModal, { namespace: namespace, podName: podName, containerName: activeContainer, currentPath: currentPath, onClose: () => setShowUpload(false), onSuccess: () => loadDirectory(currentPath) }))));
};
/* harmony default export */ const components_FileExplorer = (FileExplorer);

;// ./components/FilesTab.tsx


function getPodSpec(obj) {
    const spec = obj.spec;
    return spec ?? { containers: [] };
}
function getPodPhase(obj) {
    return obj.status?.phase;
}
const FilesTab = ({ obj }) => {
    const spec = getPodSpec(obj);
    const allContainers = [
        ...(spec.containers ?? []),
        ...(spec.initContainers ?? []),
    ];
    const phase = getPodPhase(obj);
    const namespace = obj.metadata?.namespace ?? '';
    const podName = obj.metadata?.name ?? '';
    const firstContainer = allContainers[0]?.name ?? '';
    if (phase && phase !== 'Running') {
        return (consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: {
                margin: '16px 24px', padding: '12px 16px', borderRadius: 4, fontSize: 14,
                background: '#fdf2da', border: '1px solid #f0ab00', color: '#795600',
                display: 'flex', gap: 10, alignItems: 'flex-start',
            } },
            consume_shared_module_default_react_17_0_singleton_default().createElement("span", { style: { fontSize: 16 } }, "\u26A0"),
            consume_shared_module_default_react_17_0_singleton_default().createElement("div", null,
                consume_shared_module_default_react_17_0_singleton_default().createElement("strong", null,
                    "Pod is ",
                    phase),
                consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: { marginTop: 4 } },
                    "File browsing is only available while the pod is in ",
                    consume_shared_module_default_react_17_0_singleton_default().createElement("strong", null, "Running"),
                    " state."))));
    }
    if (!firstContainer) {
        return (consume_shared_module_default_react_17_0_singleton_default().createElement("div", { style: {
                margin: '16px 24px', padding: '12px 16px', borderRadius: 4, fontSize: 14,
                background: '#fce8e8', border: '1px solid #f5c6cb', color: '#6b1117',
                display: 'flex', gap: 10, alignItems: 'center',
            } },
            consume_shared_module_default_react_17_0_singleton_default().createElement("span", { style: { fontSize: 16 } }, "\u2715"),
            consume_shared_module_default_react_17_0_singleton_default().createElement("strong", null, "No containers found in this pod")));
    }
    return (consume_shared_module_default_react_17_0_singleton_default().createElement(components_FileExplorer, { key: `${namespace}/${podName}`, namespace: namespace, podName: podName, containerName: firstContainer, containers: allContainers.map(c => c.name) }));
};
/* harmony default export */ const components_FilesTab = (FilesTab);


/***/ }

}]);
//# sourceMappingURL=exposed-FilesTab-chunk.js.map
export interface FileEntry {
  name: string;
  type: 'file' | 'directory' | 'symlink' | 'other';
  size: number;
  modifiedAt: Date;
  permissions?: string;
  user?: string;
  group?: string;
  target?: string;
}

// Parses output of:
//   find <path> -maxdepth 1 -mindepth 1 -printf "%y\t%s\t%T@\t%f\t%l\n"
export function parseFileList(output: string): FileEntry[] {
  const entries: FileEntry[] = [];

  for (const line of output.trim().split('\n')) {
    if (!line) continue;
    const parts = line.split('\t');
    if (parts.length < 7) continue;

    const [typeChar, sizeStr, mtime, permissions, user, group, name, target] = parts;
    const type: FileEntry['type'] =
      typeChar === 'd' ? 'directory' :
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
    if (a.type === 'directory' && b.type !== 'directory') return -1;
    if (a.type !== 'directory' && b.type === 'directory') return 1;
    return a.name.localeCompare(b.name);
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export function getExtension(name: string): string {
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

export function isTextFile(name: string): boolean {
  const lower = name.toLowerCase();
  const ext = getExtension(name);
  if (TEXT_EXTENSIONS.has(ext)) return true;
  // Extensionless known text files
  return ['dockerfile', 'makefile', 'jenkinsfile', 'procfile', '.env',
    '.gitignore', '.gitattributes', '.npmrc', '.editorconfig'].includes(lower);
}

// Returns the shell command array to list files in a directory using find.
// Falls back gracefully if find -printf is unavailable (e.g. BusyBox).
export function buildListCommand(dirPath: string): string[] {
  const escaped = dirPath.replace(/'/g, "'\\''");
  return [
    'sh', '-c',
    `find '${escaped}' -maxdepth 1 -mindepth 1 \\( -type f -o -type d -o -type l \\) -printf "%y\\t%s\\t%T@\\t%m\\t%u\\t%g\\t%f\\t%l\\n" 2>/dev/null; true`,
  ];
}

export function joinPath(...parts: string[]): string {
  return ('/' + parts.join('/')).replace(/\/+/g, '/').replace(/(.)\/$/, '$1') || '/';
}

export function pathSegments(fullPath: string): string[] {
  return fullPath.split('/').filter(Boolean);
}

export function buildSearchCommand(dirPath: string, query: string): string[] {
  const escapedDir = dirPath.replace(/'/g, "'\\''");
  const escapedQuery = query.replace(/'/g, "'\\''");
  return [
    'sh', '-c',
    `find '${escapedDir}' -type f -iname "*${escapedQuery}*" -printf "%y\\t%s\\t%T@\\t%m\\t%u\\t%g\\t%P\\t%l\\n" 2>/dev/null | head -n 100; true`,
  ];
}

import React from 'react';
import {
  FolderIcon,
  FileIcon,
  FileAltIcon,
  FileCodeIcon,
  FileImageIcon,
  FileArchiveIcon,
  FilePdfIcon,
  LinkIcon,
} from '@patternfly/react-icons';
import { FileEntry } from '../utils/fileUtils';

interface FileIconProps {
  entry: FileEntry;
  style?: React.CSSProperties;
}

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

type IconSpec = { Component: React.ComponentType<{ style?: React.CSSProperties }>; color: string };

function resolveIcon(entry: FileEntry): IconSpec {
  if (entry.type === 'directory') return { Component: FolderIcon, color: '#f0ad4e' };
  if (entry.type === 'symlink') return { Component: LinkIcon, color: '#5bc0de' };

  const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
  if (CODE_EXT.has(ext)) return { Component: FileCodeIcon, color: '#5bc0de' };
  if (IMAGE_EXT.has(ext)) return { Component: FileImageIcon, color: '#9b59b6' };
  if (ARCHIVE_EXT.has(ext)) return { Component: FileArchiveIcon, color: '#e67e22' };
  if (PDF_EXT.has(ext)) return { Component: FilePdfIcon, color: '#e74c3c' };
  if (TEXT_EXT.has(ext)) return { Component: FileAltIcon, color: '#2ecc71' };

  return { Component: FileIcon, color: '#adb5bd' };
}

const FileIconComponent: React.FC<FileIconProps> = ({ entry, style }) => {
  const { Component, color } = resolveIcon(entry);
  return <Component style={{ color, ...style }} />;
};

export default FileIconComponent;

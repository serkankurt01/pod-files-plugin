import React, { useState, useEffect, useCallback } from 'react';
import {
  Spinner,
  EmptyState,
  EmptyStateIcon,
  EmptyStateBody,
  Title,
} from '@patternfly/react-core';
import {
  TableComposable,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
} from '@patternfly/react-table';
import {
  DownloadIcon,
  PencilAltIcon,
  FolderOpenIcon,
} from '@patternfly/react-icons';
import { execCommand } from '../utils/exec';
import {
  FileEntry,
  parseFileList,
  formatFileSize,
  buildListCommand,
  isTextFile,
  pathSegments,
  joinPath,
} from '../utils/fileUtils';
import FileIconComponent from './FileIcon';
import FileEditor from './FileEditor';
import UploadModal from './UploadModal';

interface FileExplorerProps {
  namespace: string;
  podName: string;
  containerName: string;
}

/* ── Reusable inline-styled button ────────────────────────────── */
const Btn: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'plain' | 'link' }
> = ({ variant = 'secondary', style, children, ...rest }) => {
  const base: React.CSSProperties = {
    border: 'none', borderRadius: 3, cursor: rest.disabled ? 'not-allowed' : 'pointer',
    fontWeight: 500, fontSize: 14, lineHeight: 1, display: 'inline-flex',
    alignItems: 'center', gap: 6, padding: '6px 14px', opacity: rest.disabled ? 0.55 : 1,
  };
  const variants: Record<string, React.CSSProperties> = {
    primary:   { background: '#06c', color: '#fff' },
    secondary: { background: '#fff', color: '#151515', border: '1px solid #c7c7c7' },
    plain:     { background: 'none', color: '#151515', padding: '5px 8px' },
    link:      { background: 'none', color: '#06c', padding: 0, fontWeight: 400, textDecoration: 'underline' },
  };
  return <button {...rest} style={{ ...base, ...variants[variant], ...style }}>{children}</button>;
};

const FileExplorer: React.FC<FileExplorerProps> = ({ namespace, podName, containerName }) => {
  const [currentPath, setCurrentPath] = useState('/');
  const [files, setFiles]     = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [editingFile, setEditingFile]   = useState<string | null>(null);
  const [showUpload, setShowUpload]     = useState(false);
  const [downloading, setDownloading]   = useState<string | null>(null);

  const loadDirectory = useCallback(async (path: string) => {
    setLoading(true);
    setError('');
    try {
      const result = await execCommand({ namespace, podName, containerName, command: buildListCommand(path) });
      if (result.stderr.trim()) { setError(result.stderr.trim()); setFiles([]); }
      else { setFiles(parseFileList(new TextDecoder().decode(result.stdout))); }
    } catch (e: any) {
      setError(e.message || 'Failed to list directory');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [namespace, podName, containerName]);

  useEffect(() => { loadDirectory(currentPath); }, [currentPath, loadDirectory]);

  const navigateInto = (dir: string) => setCurrentPath(joinPath(currentPath, dir));
  const navigateTo   = (path: string) => setCurrentPath(path || '/');

  const downloadFile = async (entry: FileEntry) => {
    const filePath = joinPath(currentPath, entry.name);
    setDownloading(entry.name);
    try {
      const result = await execCommand({ namespace, podName, containerName, command: ['base64', filePath] });
      const b64 = new TextDecoder().decode(result.stdout).replace(/\s+/g, '');
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes]));
      Object.assign(document.createElement('a'), { href: url, download: entry.name }).click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(`Download failed: ${e.message}`);
    } finally {
      setDownloading(null);
    }
  };

  const segments = pathSegments(currentPath);

  return (
    <div style={{ padding: '16px 24px', fontFamily: 'RedHatText, Overpass, sans-serif' }}>

      {/* ── Breadcrumb ── */}
      <nav
        aria-label="Directory path"
        style={{
          display: 'flex', alignItems: 'center', flexWrap: 'wrap',
          gap: 2, padding: '8px 0 12px',
          borderBottom: '1px solid #d2d2d2', marginBottom: 12,
          fontSize: 14,
        }}
      >
        <button
          onClick={() => navigateTo('/')}
          style={{ background:'none', border:'none', cursor:'pointer', color:'#06c', padding:'0 4px', fontSize:14 }}
        >
          /
        </button>
        {segments.map((seg, idx) => {
          const isLast  = idx === segments.length - 1;
          const segPath = '/' + segments.slice(0, idx + 1).join('/');
          return (
            <React.Fragment key={segPath}>
              {/* plain Unicode separator — no PF icon dependency */}
              <span style={{ color: '#8a8d90', fontSize: 13, userSelect: 'none' }}>›</span>
              {isLast ? (
                <span style={{ fontWeight: 600, color: '#151515', padding: '0 4px' }}>{seg}</span>
              ) : (
                <button
                  onClick={() => navigateTo(segPath)}
                  style={{ background:'none', border:'none', cursor:'pointer', color:'#06c', padding:'0 4px', fontSize:14 }}
                >
                  {seg}
                </button>
              )}
            </React.Fragment>
          );
        })}
      </nav>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Btn variant="secondary" onClick={() => setShowUpload(true)}>
          ↑ Upload
        </Btn>
        <Btn
          variant="plain"
          aria-label="Refresh"
          title="Refresh"
          disabled={loading}
          onClick={() => loadDirectory(currentPath)}
          style={{ fontSize: 18, padding: '4px 8px' }}
        >
          ↻
        </Btn>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          padding: '10px 16px', marginBottom: 12, borderRadius: 4,
          background: '#fce8e8', border: '1px solid #f5c6cb', color: '#6b1117', fontSize: 13,
        }}>
          <span>{error}</span>
          <button onClick={() => setError('')} style={{ background:'none', border:'none', cursor:'pointer', color:'#6b1117', fontSize:16 }}>×</button>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div style={{ padding: 48, textAlign: 'center' }}>
          <Spinner size="lg" />
        </div>
      )}

      {/* ── Empty ── */}
      {!loading && files.length === 0 && !error && (
        <EmptyState>
          <EmptyStateIcon icon={FolderOpenIcon} />
          <Title headingLevel="h4" size="lg">Empty directory</Title>
          <EmptyStateBody>No files or subdirectories found.</EmptyStateBody>
        </EmptyState>
      )}

      {/* ── File table ── */}
      {!loading && files.length > 0 && (
        <TableComposable aria-label="Pod filesystem" variant="compact">
          <Thead>
            <Tr>
              <Th>Name</Th>
              <Th modifier="nowrap">Size</Th>
              <Th modifier="nowrap">Modified</Th>
              <Th modifier="fitContent">Actions</Th>
            </Tr>
          </Thead>
          <Tbody>
            {files.map(entry => (
              <Tr key={entry.name}>
                <Td dataLabel="Name">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <FileIconComponent entry={entry} style={{ flexShrink: 0, fontSize: '1.1em' }} />
                    {entry.type === 'directory' ? (
                      <button
                        onClick={() => navigateInto(entry.name)}
                        style={{ background:'none', border:'none', cursor:'pointer', color:'#06c', fontSize:14, padding:0 }}
                      >
                        {entry.name}
                      </button>
                    ) : (
                      <span style={{ wordBreak: 'break-all', fontSize: 14 }}>{entry.name}</span>
                    )}
                    {entry.type === 'symlink' && entry.target && (
                      <span style={{ color: '#8a8d90', fontSize: '0.8em', fontStyle: 'italic' }}>
                        → {entry.target}
                      </span>
                    )}
                  </span>
                </Td>

                <Td dataLabel="Size" modifier="nowrap">
                  <span style={{ color: '#6a6e73', fontSize: 13 }}>
                    {entry.type === 'file' ? formatFileSize(entry.size) : '—'}
                  </span>
                </Td>

                <Td dataLabel="Modified" modifier="nowrap">
                  <span style={{ color: '#6a6e73', fontSize: 13, whiteSpace: 'nowrap' }}>
                    {entry.modifiedAt.toLocaleString()}
                  </span>
                </Td>

                <Td dataLabel="Actions" modifier="fitContent">
                  <span style={{ display: 'inline-flex', gap: 2 }}>
                    {entry.type === 'file' && (
                      <button
                        title="Download"
                        aria-label="Download"
                        disabled={downloading === entry.name}
                        onClick={() => downloadFile(entry)}
                        style={{
                          background: 'none', border: 'none', cursor: downloading === entry.name ? 'wait' : 'pointer',
                          padding: '4px 6px', borderRadius: 3, color: '#151515',
                          opacity: downloading === entry.name ? 0.5 : 1,
                        }}
                      >
                        <DownloadIcon />
                      </button>
                    )}
                    {entry.type === 'file' && isTextFile(entry.name) && (
                      <button
                        title="Edit"
                        aria-label="Edit"
                        onClick={() => setEditingFile(joinPath(currentPath, entry.name))}
                        style={{ background:'none', border:'none', cursor:'pointer', padding:'4px 6px', borderRadius:3, color:'#151515' }}
                      >
                        <PencilAltIcon />
                      </button>
                    )}
                  </span>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </TableComposable>
      )}

      {/* ── Modals via custom portal ── */}
      {editingFile && (
        <FileEditor
          namespace={namespace} podName={podName} containerName={containerName}
          filePath={editingFile}
          onClose={() => setEditingFile(null)}
          onSaved={() => loadDirectory(currentPath)}
        />
      )}
      {showUpload && (
        <UploadModal
          namespace={namespace} podName={podName} containerName={containerName}
          currentPath={currentPath}
          onClose={() => setShowUpload(false)}
          onSuccess={() => loadDirectory(currentPath)}
        />
      )}
    </div>
  );
};

export default FileExplorer;

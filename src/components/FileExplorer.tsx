import React, { useState, useEffect, useCallback } from 'react';
import {
  Spinner,
  EmptyState,
  EmptyStateIcon,
  EmptyStateBody,
  Title,
} from '@patternfly/react-core';
import {
  DownloadIcon,
  PencilAltIcon,
  FolderOpenIcon,
  TrashIcon,
} from '@patternfly/react-icons';
import { execCommand, execCommandWithStdin } from '../utils/exec';
import {
  FileEntry,
  parseFileList,
  formatFileSize,
  buildListCommand,
  buildSearchCommand,
  isTextFile,
  pathSegments,
  joinPath,
} from '../utils/fileUtils';
import FileIconComponent from './FileIcon';
import FileEditor from './FileEditor';
import UploadModal from './UploadModal';
import CreateModal from './CreateModal';
import DeleteModal from './DeleteModal';
import RenameModal from './RenameModal';
import PermissionsModal from './PermissionsModal';
import FileTailViewer from './FileTailViewer';
import ImagePreviewModal from './ImagePreviewModal';

interface FileExplorerProps {
  namespace: string;
  podName: string;
  containerName: string;
}

const Btn: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'plain' | 'link' | 'danger' }
> = ({ variant = 'secondary', style, children, ...rest }) => {
  const base: React.CSSProperties = {
    border: 'none', borderRadius: 3, cursor: rest.disabled ? 'not-allowed' : 'pointer',
    fontWeight: 500, fontSize: 14, lineHeight: 1, display: 'inline-flex',
    alignItems: 'center', gap: 6, padding: '6px 14px', opacity: rest.disabled ? 0.55 : 1,
    transition: 'all 0.2s',
  };
  const variants: Record<string, React.CSSProperties> = {
    primary:   { background: '#06c', color: '#fff' },
    secondary: { background: '#fff', color: '#151515', border: '1px solid #c7c7c7' },
    danger:    { background: '#c9190b', color: '#fff' },
    plain:     { background: 'none', color: '#151515', padding: '5px 8px' },
    link:      { background: 'none', color: '#06c', padding: 0, fontWeight: 400, textDecoration: 'underline' },
  };
  return <button {...rest} style={{ ...base, ...variants[variant], ...style }}>{children}</button>;
};

const ActionBtn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }> = ({ danger, style, children, ...rest }) => (
  <button
    {...rest}
    style={{
      background: danger ? '#fce8e8' : '#f0f0f0',
      border: 'none',
      cursor: rest.disabled ? 'wait' : 'pointer',
      padding: '4px 8px',
      borderRadius: 4,
      color: danger ? '#c9190b' : '#151515',
      fontSize: 12,
      fontWeight: 600,
      opacity: rest.disabled ? 0.5 : 1,
      display: 'inline-flex',
      alignItems: 'center',
      ...style
    }}
  >
    {children}
  </button>
);

const FileExplorer: React.FC<FileExplorerProps> = ({ namespace, podName, containerName }) => {
  const [currentPath, setCurrentPath] = useState('/');
  const [files, setFiles]     = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const [downloading, setDownloading]   = useState<string | null>(null);
  
  // Modals state
  const [showUpload, setShowUpload]     = useState(false);
  const [editingFile, setEditingFile]   = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState<'file' | 'directory' | null>(null);
  const [itemsToDelete, setItemsToDelete] = useState<string[]>([]);
  const [itemToRename, setItemToRename] = useState<string | null>(null);
  const [itemToPerms, setItemToPerms] = useState<FileEntry | null>(null);
  const [itemToTail, setItemToTail] = useState<string | null>(null);
  const [itemToPreview, setItemToPreview] = useState<FileEntry | null>(null);

  // Multi-select state
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  // Drag & Drop state
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<{name: string}[]>([]);

  const loadDirectory = useCallback(async (path: string, query: string = '') => {
    setLoading(true);
    setError('');
    setSelectedItems(new Set()); // Reset selections on load
    try {
      const command = query ? buildSearchCommand(path, query) : buildListCommand(path);
      const result = await execCommand({ namespace, podName, containerName, command });
      if (result.stderr.trim()) { setError(result.stderr.trim()); setFiles([]); }
      else { setFiles(parseFileList(new TextDecoder().decode(result.stdout))); }
      setIsSearching(!!query);
    } catch (e: any) {
      setError(e.message || 'Failed to list directory');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [namespace, podName, containerName]);

  useEffect(() => { loadDirectory(currentPath); setSearchQuery(''); }, [currentPath, loadDirectory]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadDirectory(currentPath, searchQuery);
  };

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

  const downloadArchive = async (names: string[], zipName: string = 'archive.tar.gz') => {
    setDownloading(zipName);
    try {
      const escapedPath = currentPath.replace(/'/g, "'\\''");
      const escapedNames = names.map(n => `'${n.replace(/'/g, "'\\''")}'`).join(' ');
      const command = ['sh', '-c', `tar -czf - -C '${escapedPath}' ${escapedNames} | base64`];
      const result = await execCommand({ namespace, podName, containerName, command });
      if (result.stderr.trim()) throw new Error(result.stderr);
      const b64 = new TextDecoder().decode(result.stdout).replace(/\s+/g, '');
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes]));
      Object.assign(document.createElement('a'), { href: url, download: zipName }).click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(`Archive download failed: ${e.message}`);
    } finally {
      setDownloading(null);
    }
  };

  const extractArchive = async (entry: FileEntry) => {
    setLoading(true);
    setError('');
    try {
      const filePath = joinPath(currentPath, entry.name);
      const escaped = filePath.replace(/'/g, "'\\''");
      const escapedDir = currentPath.replace(/'/g, "'\\''");
      const command = entry.name.endsWith('.zip')
        ? ['sh', '-c', `unzip -o '${escaped}' -d '${escapedDir}'`]
        : ['sh', '-c', `tar -xf '${escaped}' -C '${escapedDir}'`];
      const result = await execCommand({ namespace, podName, containerName, command });
      if (result.stderr.trim()) throw new Error(result.stderr);
      loadDirectory(currentPath);
    } catch (e: any) {
      setError(`Extraction failed: ${e.message}`);
      setLoading(false);
    }
  };

  // Drag & Drop
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const filesToUpload = Array.from(e.dataTransfer.files);
    if (filesToUpload.length === 0) return;

    for (const file of filesToUpload) {
      try {
        setUploadingFiles(prev => [...prev, { name: file.name }]);
        const data = new Uint8Array(await file.arrayBuffer());
        const escaped = joinPath(currentPath, file.name).replace(/'/g, "'\\''");
        const result = await execCommandWithStdin(
          { namespace, podName, containerName, command: ['sh', '-c', `cat > '${escaped}'`] },
          data
        );
        if (result.stderr.trim()) setError(`Failed to upload ${file.name}: ${result.stderr}`);
      } catch (err: any) {
        setError(`Failed to upload ${file.name}: ${err.message}`);
      } finally {
        setUploadingFiles(prev => prev.filter(p => p.name !== file.name));
      }
    }
    loadDirectory(currentPath);
  };

  const isImageFile = (name: string) => {
    const ext = name.toLowerCase();
    return ext.endsWith('.png') || ext.endsWith('.jpg') || ext.endsWith('.jpeg') || ext.endsWith('.gif') || ext.endsWith('.svg') || ext.endsWith('.webp');
  };

  const segments = pathSegments(currentPath);

  return (
    <div 
      style={{ padding: '16px 24px', fontFamily: 'RedHatText, Overpass, sans-serif', position: 'relative' }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(6, 102, 204, 0.1)', border: '2px dashed #06c',
          zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none', borderRadius: 8
        }}>
          <Title headingLevel="h2" size="xl" style={{ color: '#06c', background: '#fff', padding: '12px 24px', borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
            Drop files to upload into {currentPath}
          </Title>
        </div>
      )}

      {/* Uploading overlay */}
      {uploadingFiles.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 101,
          background: '#fff', padding: '16px 24px', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          border: '1px solid #d2d2d2', width: 300
        }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Uploading {uploadingFiles.length} file(s)...</div>
          {uploadingFiles.map(f => (
            <div key={f.name} style={{ fontSize: 13, color: '#6a6e73', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <Spinner size="md" style={{ marginRight: 8 }} /> {f.name}
            </div>
          ))}
        </div>
      )}

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
        <button onClick={() => navigateTo('/')} style={{ background:'none', border:'none', cursor:'pointer', color:'#06c', padding:'0 4px', fontSize:14 }}>/</button>
        {segments.map((seg, idx) => {
          const isLast  = idx === segments.length - 1;
          const segPath = '/' + segments.slice(0, idx + 1).join('/');
          return (
            <React.Fragment key={segPath}>
              <span style={{ color: '#8a8d90', fontSize: 13, userSelect: 'none' }}>›</span>
              {isLast ? (
                <span style={{ fontWeight: 600, color: '#151515', padding: '0 4px' }}>{seg}</span>
              ) : (
                <button onClick={() => navigateTo(segPath)} style={{ background:'none', border:'none', cursor:'pointer', color:'#06c', padding:'0 4px', fontSize:14 }}>{seg}</button>
              )}
            </React.Fragment>
          );
        })}
      </nav>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <Btn variant="secondary" onClick={() => setShowCreateModal('directory')}>+ Folder</Btn>
        <Btn variant="secondary" onClick={() => setShowCreateModal('file')}>+ File</Btn>
        <Btn variant="secondary" onClick={() => setShowUpload(true)}>↑ Upload</Btn>
        <Btn variant="plain" aria-label="Refresh" disabled={loading} onClick={() => loadDirectory(currentPath, searchQuery)} style={{ fontSize: 18, padding: '4px 8px' }}>↻</Btn>
        
        {selectedItems.size > 0 && (
          <div style={{ marginLeft: 16, display: 'flex', alignItems: 'center', gap: 8, background: '#e7f1fa', padding: '4px 12px', borderRadius: 4, border: '1px solid #06c' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#06c' }}>{selectedItems.size} selected</span>
            <Btn variant="primary" style={{ padding: '4px 12px', fontSize: 13 }} onClick={() => downloadArchive(Array.from(selectedItems), 'selected_files.tar.gz')}>Tar Selected</Btn>
            <Btn variant="danger" style={{ padding: '4px 12px', fontSize: 13 }} onClick={() => setItemsToDelete(Array.from(selectedItems))}>Delete Selected</Btn>
          </div>
        )}

        <div style={{ marginLeft: 'auto' }}>
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: 4 }}>
            <input
              type="text"
              placeholder="Search in folder..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ padding: '6px 10px', fontSize: 13, border: '1px solid #c7c7c7', borderRadius: 3, width: 200 }}
            />
            <Btn variant="secondary" type="submit" disabled={loading}>Search</Btn>
          </form>
        </div>
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
          <Title headingLevel="h4" size="lg">Empty results</Title>
          <EmptyStateBody>{isSearching ? 'No files match your search.' : 'No files or subdirectories found.'}</EmptyStateBody>
        </EmptyState>
      )}

      {/* ── File table (Native HTML for perfect spacing) ── */}
      {!loading && files.length > 0 && (
        <div style={{ overflowX: 'auto', border: '1px solid #d2d2d2', borderRadius: 4 }}>
          <table className="pf-c-table pf-m-compact pf-m-grid-md" aria-label="Pod filesystem" style={{ minWidth: 800, background: '#fff', margin: 0 }}>
            <thead className="pf-c-table__thead">
              <tr className="pf-c-table__tr" style={{ borderBottom: '2px solid #d2d2d2' }}>
                <th className="pf-c-table__th" style={{ padding: '12px 16px', width: '40px' }}>
                  <input
                    type="checkbox"
                    checked={selectedItems.size === files.length && files.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedItems(new Set(files.map(f => f.name)));
                      else setSelectedItems(new Set());
                    }}
                  />
                </th>
                <th className="pf-c-table__th" style={{ padding: '12px 16px', fontWeight: 600 }}>Name</th>
                <th className="pf-c-table__th" style={{ padding: '12px 16px', fontWeight: 600, width: '100px' }}>Size</th>
                <th className="pf-c-table__th" style={{ padding: '12px 16px', fontWeight: 600, width: '180px' }}>Modified</th>
                <th className="pf-c-table__th" style={{ padding: '12px 16px', fontWeight: 600, width: '100px' }}>Perms</th>
                <th className="pf-c-table__th" style={{ padding: '12px 16px', fontWeight: 600, width: '140px' }}>Owner</th>
                <th className="pf-c-table__th" style={{ padding: '12px 16px', fontWeight: 600, width: '220px' }}>Actions</th>
              </tr>
            </thead>
            <tbody className="pf-c-table__tbody">
              {files.map(entry => (
                <tr className="pf-c-table__tr" key={entry.name} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td className="pf-c-table__td" style={{ padding: '10px 16px' }}>
                    <input
                      type="checkbox"
                      checked={selectedItems.has(entry.name)}
                      onChange={(e) => {
                        const next = new Set(selectedItems);
                        if (e.target.checked) next.add(entry.name);
                        else next.delete(entry.name);
                        setSelectedItems(next);
                      }}
                    />
                  </td>
                  <td className="pf-c-table__td" data-label="Name" style={{ padding: '10px 16px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <FileIconComponent entry={entry} style={{ flexShrink: 0, fontSize: '1.2em' }} />
                      {entry.type === 'directory' ? (
                        <button onClick={() => navigateInto(entry.name)} style={{ background:'none', border:'none', cursor:'pointer', color:'#06c', fontSize:14, padding:0, fontWeight: 500, textAlign: 'left' }}>
                          {entry.name}
                        </button>
                      ) : isImageFile(entry.name) ? (
                        <button onClick={() => setItemToPreview(entry)} style={{ background:'none', border:'none', cursor:'pointer', color:'#06c', fontSize:14, padding:0, fontWeight: 500, textAlign: 'left', textDecoration: 'underline' }}>
                          {entry.name}
                        </button>
                      ) : (
                        <span style={{ wordBreak: 'break-all', fontSize: 14 }}>{entry.name}</span>
                      )}
                      {entry.type === 'symlink' && entry.target && (
                        <span style={{ color: '#8a8d90', fontSize: '0.8em', fontStyle: 'italic' }}>→ {entry.target}</span>
                      )}
                    </span>
                  </td>
                  <td className="pf-c-table__td" data-label="Size" style={{ padding: '10px 16px', color: '#6a6e73', fontSize: 13 }}>
                    {entry.type === 'file' ? formatFileSize(entry.size) : '—'}
                  </td>
                  <td className="pf-c-table__td" data-label="Modified" style={{ padding: '10px 16px', color: '#6a6e73', fontSize: 13, whiteSpace: 'nowrap' }}>
                    {entry.modifiedAt.toLocaleString()}
                  </td>
                  <td className="pf-c-table__td" data-label="Permissions" style={{ padding: '10px 16px' }}>
                    <button onClick={() => setItemToPerms(entry)} style={{ background:'none', border:'none', cursor:'pointer', color:'#06c', fontSize:13, padding:0, textDecoration: 'underline' }}>
                      {entry.permissions || '—'}
                    </button>
                  </td>
                  <td className="pf-c-table__td" data-label="Owner" style={{ padding: '10px 16px', color: '#6a6e73', fontSize: 13, whiteSpace: 'nowrap' }}>
                    {entry.user || '—'}:{entry.group || '—'}
                  </td>
                  <td className="pf-c-table__td" data-label="Actions" style={{ padding: '10px 16px' }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <ActionBtn title="Rename" onClick={() => setItemToRename(entry.name)}>Ren</ActionBtn>
                      
                      {entry.type === 'directory' && (
                        <ActionBtn title="Download as Tar" disabled={downloading === entry.name} onClick={() => downloadArchive([entry.name], `${entry.name}.tar.gz`)}>Tar</ActionBtn>
                      )}
                      
                      {entry.type === 'file' && (
                        <ActionBtn title="Download" disabled={downloading === entry.name} onClick={() => downloadFile(entry)}>
                          <DownloadIcon />
                        </ActionBtn>
                      )}

                      {entry.type === 'file' && (entry.name.endsWith('.tar.gz') || entry.name.endsWith('.tgz') || entry.name.endsWith('.tar') || entry.name.endsWith('.zip')) && (
                        <ActionBtn title="Extract Archive" onClick={() => extractArchive(entry)}>Ext</ActionBtn>
                      )}
                      
                      {entry.type === 'file' && isTextFile(entry.name) && (
                        <ActionBtn title="Edit" onClick={() => setEditingFile(joinPath(currentPath, entry.name))}>
                          <PencilAltIcon />
                        </ActionBtn>
                      )}
                      
                      {entry.type === 'file' && (isTextFile(entry.name) || entry.name.endsWith('.log')) && (
                        <ActionBtn title="Tail Log" onClick={() => setItemToTail(entry.name)}>Tail</ActionBtn>
                      )}
                      
                      <ActionBtn danger title="Delete" onClick={() => setItemsToDelete([entry.name])}>
                        <TrashIcon />
                      </ActionBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modals ── */}
      {showCreateModal && (
        <CreateModal
          namespace={namespace} podName={podName} containerName={containerName}
          currentPath={currentPath} type={showCreateModal}
          onClose={() => setShowCreateModal(null)}
          onSuccess={() => loadDirectory(currentPath)}
        />
      )}
      {itemsToDelete.length > 0 && (
        <DeleteModal
          namespace={namespace} podName={podName} containerName={containerName}
          currentPath={currentPath} targetNames={itemsToDelete}
          onClose={() => setItemsToDelete([])}
          onSuccess={() => { setSelectedItems(new Set()); loadDirectory(currentPath); }}
        />
      )}
      {itemToRename && (
        <RenameModal
          namespace={namespace} podName={podName} containerName={containerName}
          currentPath={currentPath} targetName={itemToRename}
          onClose={() => setItemToRename(null)}
          onSuccess={() => loadDirectory(currentPath)}
        />
      )}
      {itemToPerms && (
        <PermissionsModal
          namespace={namespace} podName={podName} containerName={containerName}
          currentPath={currentPath} entry={itemToPerms}
          onClose={() => setItemToPerms(null)}
          onSuccess={() => loadDirectory(currentPath)}
        />
      )}
      {itemToTail && (
        <FileTailViewer
          namespace={namespace} podName={podName} containerName={containerName}
          currentPath={currentPath} targetName={itemToTail}
          onClose={() => setItemToTail(null)}
        />
      )}
      {itemToPreview && (
        <ImagePreviewModal
          namespace={namespace} podName={podName} containerName={containerName}
          currentPath={currentPath} entry={itemToPreview}
          onClose={() => setItemToPreview(null)}
        />
      )}
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

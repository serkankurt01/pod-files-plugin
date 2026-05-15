import React, { useState, useEffect, useCallback } from 'react';
import {
  PencilAltIcon,
  DownloadIcon,
  TrashIcon,
  CompressArrowsAltIcon,
  TerminalIcon,
  LockIcon,
  FolderIcon,
} from '@patternfly/react-icons';
import { execCommand, execUploadFile } from '../utils/exec';
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
  containers?: string[]; // full list; selector shown only when length > 1
}

interface OpenMenu {
  entry: FileEntry;
  top: number;
  left: number;
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

const DropItem: React.FC<{
  onClick: () => void;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ onClick, icon, danger, disabled, children }) => (
  <button
    onClick={disabled ? undefined : onClick}
    disabled={disabled}
    style={{
      display: 'flex', alignItems: 'center', gap: 8,
      width: '100%', textAlign: 'left',
      padding: '8px 16px', background: 'none', border: 'none',
      cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 13,
      color: disabled ? '#aaa' : danger ? '#c9190b' : '#151515',
      opacity: disabled ? 0.5 : 1,
      whiteSpace: 'nowrap',
    }}
  >
    {icon && (
      <span style={{ display: 'inline-flex', width: 14, flexShrink: 0, opacity: 0.72 }}>
        {icon}
      </span>
    )}
    {children}
  </button>
);

const CssSpinner: React.FC<{ size?: number }> = ({ size = 28 }) => (
  <>
    <style>{`@keyframes _pf_spin{to{transform:rotate(360deg)}}`}</style>
    <span style={{
      display: 'inline-block', width: size, height: size,
      borderRadius: '50%', border: '3px solid #d2d2d2',
      borderTopColor: '#06c', animation: '_pf_spin .7s linear infinite',
      verticalAlign: 'middle', flexShrink: 0,
    }} />
  </>
);

const ARCHIVE_EXTS = ['.tar.gz', '.tgz', '.tar', '.zip'];
const isArchive = (name: string) => ARCHIVE_EXTS.some(ext => name.endsWith(ext));
const isImageFile = (name: string) => ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].some(ext => name.toLowerCase().endsWith(ext));

const FileExplorer: React.FC<FileExplorerProps> = ({ namespace, podName, containerName, containers }) => {
  const [activeContainer, setActiveContainer] = useState(containerName);
  const [currentPath, setCurrentPath] = useState('/');
  const [files, setFiles]     = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const [downloading, setDownloading] = useState<string | null>(null);

  // Modals state
  const [showUpload, setShowUpload]           = useState(false);
  const [editingFile, setEditingFile]         = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState<'file' | 'directory' | null>(null);
  const [itemsToDelete, setItemsToDelete]     = useState<string[]>([]);
  const [itemToRename, setItemToRename]       = useState<string | null>(null);
  const [itemToPerms, setItemToPerms]         = useState<FileEntry | null>(null);
  const [itemToTail, setItemToTail]           = useState<string | null>(null);
  const [itemToPreview, setItemToPreview]     = useState<FileEntry | null>(null);

  // Multi-select state
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  // Drag & Drop state
  const [isDragging, setIsDragging]           = useState(false);
  const [uploadingFiles, setUploadingFiles]   = useState<{ name: string }[]>([]);

  // Three-dot dropdown
  const [openMenu, setOpenMenu] = useState<OpenMenu | null>(null);

  // Close dropdown on scroll or resize
  useEffect(() => {
    if (!openMenu) return;
    const close = () => setOpenMenu(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [openMenu]);

  const loadDirectory = useCallback(async (path: string, query: string = '') => {
    setLoading(true);
    setError('');
    setSelectedItems(new Set());
    try {
      const command = query ? buildSearchCommand(path, query) : buildListCommand(path);
      const result = await execCommand({ namespace, podName, containerName: activeContainer, command });
      if (result.stderr.trim()) { setError(result.stderr.trim()); setFiles([]); }
      else { setFiles(parseFileList(new TextDecoder().decode(result.stdout))); }
      setIsSearching(!!query);
    } catch (e: any) {
      setError(e.message || 'Failed to list directory');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [namespace, podName, activeContainer]);

  useEffect(() => { loadDirectory(currentPath); setSearchQuery(''); }, [currentPath, loadDirectory]);

  // Reset to root when container changes
  useEffect(() => { setCurrentPath('/'); setSearchQuery(''); }, [activeContainer]);

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
      const result = await execCommand({ namespace, podName, containerName: activeContainer, command: ['base64', filePath] });
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
      const escapedPath  = currentPath.replace(/'/g, "'\\''");
      const escapedNames = names.map(n => `'${n.replace(/'/g, "'\\''")}'`).join(' ');
      const command = ['sh', '-c', `tar -czf - -C '${escapedPath}' ${escapedNames} | base64`];
      const result = await execCommand({ namespace, podName, containerName: activeContainer, command });
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
      const filePath    = joinPath(currentPath, entry.name);
      const escaped     = filePath.replace(/'/g, "'\\''");
      const escapedDir  = currentPath.replace(/'/g, "'\\''");
      const command = entry.name.endsWith('.zip')
        ? ['sh', '-c', `unzip -o '${escaped}' -d '${escapedDir}'`]
        : ['sh', '-c', `tar -xf '${escaped}' -C '${escapedDir}'`];
      const result = await execCommand({ namespace, podName, containerName: activeContainer, command });
      if (result.stderr.trim()) throw new Error(result.stderr);
      loadDirectory(currentPath);
    } catch (e: any) {
      setError(`Extraction failed: ${e.message}`);
      setLoading(false);
    }
  };

  // Drag & Drop
  const handleDragOver  = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const filesToUpload = Array.from(e.dataTransfer.files);
    if (filesToUpload.length === 0) return;

    for (const file of filesToUpload) {
      try {
        setUploadingFiles(prev => [...prev, { name: file.name }]);
        const destPath = joinPath(currentPath, file.name);
        const result = await execUploadFile(
          { namespace, podName, containerName: activeContainer },
          file,
          destPath,
          () => {},
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

  const handleMenuOpen = (e: React.MouseEvent, entry: FileEntry) => {
    e.stopPropagation();
    if (openMenu?.entry.name === entry.name) {
      setOpenMenu(null);
      return;
    }
    const rect      = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const menuW     = 200;
    const menuH     = 260;
    const left      = rect.right - menuW < 8 ? 8 : rect.right - menuW;
    const top       = rect.bottom + menuH > window.innerHeight
      ? Math.max(8, rect.top - menuH)
      : rect.bottom + 4;
    setOpenMenu({ entry, top, left });
  };

  const closeMenu = () => setOpenMenu(null);

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
          pointerEvents: 'none', borderRadius: 8,
        }}>
          <div style={{ color: '#06c', background: '#fff', padding: '12px 24px', borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 18, fontWeight: 600 }}>
            Drop files to upload into {currentPath}
          </div>
        </div>
      )}

      {/* Uploading toast */}
      {uploadingFiles.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 101,
          background: '#fff', padding: '16px 24px', borderRadius: 8,
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          border: '1px solid #d2d2d2', width: 300,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Uploading {uploadingFiles.length} file(s)...</div>
          {uploadingFiles.map(f => (
            <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#6a6e73', marginBottom: 4, overflow: 'hidden' }}>
              <CssSpinner size={16} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
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
          borderBottom: '1px solid #d2d2d2', marginBottom: 12, fontSize: 14,
        }}
      >
        <button onClick={() => navigateTo('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#06c', padding: '0 4px', fontSize: 14 }}>/</button>
        {segments.map((seg, idx) => {
          const isLast  = idx === segments.length - 1;
          const segPath = '/' + segments.slice(0, idx + 1).join('/');
          return (
            <React.Fragment key={segPath}>
              <span style={{ color: '#8a8d90', fontSize: 13, userSelect: 'none' }}>›</span>
              {isLast ? (
                <span style={{ fontWeight: 600, color: '#151515', padding: '0 4px' }}>{seg}</span>
              ) : (
                <button onClick={() => navigateTo(segPath)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#06c', padding: '0 4px', fontSize: 14 }}>{seg}</button>
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

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Container selector — only when there are multiple containers */}
          {containers && containers.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label
                htmlFor="fe-container-select"
                style={{ fontSize: 13, fontWeight: 500, color: '#151515', whiteSpace: 'nowrap' }}
              >
                Container
              </label>
              <select
                id="fe-container-select"
                value={activeContainer}
                onChange={e => setActiveContainer(e.target.value)}
                style={{
                  padding: '5px 10px', fontSize: 13,
                  border: '1px solid #c7c7c7', borderRadius: 3,
                  background: '#fff', color: '#151515', cursor: 'pointer',
                }}
              >
                {containers.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

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
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b1117', fontSize: 16 }}>×</button>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div style={{ padding: 56, display: 'flex', justifyContent: 'center' }}>
          <CssSpinner size={40} />
        </div>
      )}

      {/* ── Empty ── */}
      {!loading && files.length === 0 && !error && (
        <div style={{ padding: '48px 24px', textAlign: 'center', color: '#6a6e73' }}>
          <div style={{ fontSize: 48, lineHeight: 1, marginBottom: 12 }}>📂</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#151515', marginBottom: 6 }}>Empty results</div>
          <div style={{ fontSize: 14 }}>
            {isSearching ? 'No files match your search.' : 'No files or subdirectories found.'}
          </div>
        </div>
      )}

      {/* ── File table ── */}
      {!loading && files.length > 0 && (
        <div style={{ overflowX: 'auto', border: '1px solid #d2d2d2', borderRadius: 4, width: '100%' }}>
          <table className="pf-c-table pf-m-compact pf-m-grid-md" aria-label="Pod filesystem" style={{ width: '100%', tableLayout: 'fixed', background: '#fff', margin: 0 }}>
            <thead className="pf-c-table__thead">
              <tr className="pf-c-table__tr" style={{ borderBottom: '2px solid #d2d2d2' }}>
                <th className="pf-c-table__th" style={{ padding: '12px 16px', width: 40 }}>
                  <input
                    type="checkbox"
                    checked={selectedItems.size === files.length && files.length > 0}
                    onChange={e => {
                      if (e.target.checked) setSelectedItems(new Set(files.map(f => f.name)));
                      else setSelectedItems(new Set());
                    }}
                  />
                </th>
                <th className="pf-c-table__th" style={{ padding: '12px 16px', fontWeight: 600 }}>Name</th>
                <th className="pf-c-table__th" style={{ padding: '12px 16px', fontWeight: 600, width: '9%' }}>Size</th>
                <th className="pf-c-table__th" style={{ padding: '12px 16px', fontWeight: 600, width: '14%' }}>Modified</th>
                <th className="pf-c-table__th" style={{ padding: '12px 16px', fontWeight: 600, width: '8%' }}>Perms</th>
                <th className="pf-c-table__th" style={{ padding: '12px 16px', fontWeight: 600, width: '11%' }}>Owner</th>
                <th className="pf-c-table__th" style={{ padding: '12px 16px', width: '4%' }}></th>
              </tr>
            </thead>
            <tbody className="pf-c-table__tbody">
              {files.map(entry => (
                <tr className="pf-c-table__tr" key={entry.name} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td className="pf-c-table__td" style={{ padding: '10px 16px' }}>
                    <input
                      type="checkbox"
                      checked={selectedItems.has(entry.name)}
                      onChange={e => {
                        const next = new Set(selectedItems);
                        if (e.target.checked) next.add(entry.name);
                        else next.delete(entry.name);
                        setSelectedItems(next);
                      }}
                    />
                  </td>
                  <td className="pf-c-table__td" data-label="Name" style={{ padding: '10px 16px', maxWidth: 0 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                      <FileIconComponent entry={entry} style={{ flexShrink: 0, fontSize: '1.2em' }} />
                      {entry.type === 'directory' ? (
                        <button onClick={() => navigateInto(entry.name)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#06c', fontSize: 14, padding: 0, fontWeight: 500, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                          {entry.name}
                        </button>
                      ) : isImageFile(entry.name) ? (
                        <button onClick={() => setItemToPreview(entry)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#06c', fontSize: 14, padding: 0, fontWeight: 500, textAlign: 'left', textDecoration: 'underline', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                          {entry.name}
                        </button>
                      ) : (
                        <span style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{entry.name}</span>
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
                    <button onClick={() => setItemToPerms(entry)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#06c', fontSize: 13, padding: 0, textDecoration: 'underline' }}>
                      {entry.permissions || '—'}
                    </button>
                  </td>
                  <td className="pf-c-table__td" data-label="Owner" style={{ padding: '10px 16px', color: '#6a6e73', fontSize: 13, whiteSpace: 'nowrap' }}>
                    {entry.user || '—'}:{entry.group || '—'}
                  </td>
                  {/* Three-dot menu button */}
                  <td className="pf-c-table__td" style={{ padding: '10px 8px', textAlign: 'center' }}>
                    <button
                      onClick={e => handleMenuOpen(e, entry)}
                      title="More actions"
                      style={{
                        background: openMenu?.entry.name === entry.name ? '#f0f0f0' : 'none',
                        border: '1px solid transparent',
                        borderRadius: 4, cursor: 'pointer',
                        padding: '3px 8px', fontSize: 20,
                        color: '#6a6e73', lineHeight: 1,
                        letterSpacing: 1,
                      }}
                    >
                      ⋮
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Three-dot dropdown ── */}
      {openMenu && (
        <>
          {/* Invisible backdrop — click to close */}
          <div onClick={closeMenu} style={{ position: 'fixed', inset: 0, zIndex: 1999 }} />
          <div style={{
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
          }}>
            <DropItem icon={<PencilAltIcon />} onClick={() => { closeMenu(); setItemToRename(openMenu.entry.name); }}>
              Rename
            </DropItem>

            {openMenu.entry.type === 'directory' && (
              <DropItem
                icon={<FolderIcon />}
                disabled={!!downloading}
                onClick={() => { closeMenu(); downloadArchive([openMenu.entry.name], `${openMenu.entry.name}.tar.gz`); }}
              >
                Download as tar.gz
              </DropItem>
            )}

            {openMenu.entry.type === 'file' && (
              <DropItem
                icon={<DownloadIcon />}
                disabled={downloading === openMenu.entry.name}
                onClick={() => { closeMenu(); downloadFile(openMenu.entry); }}
              >
                Download
              </DropItem>
            )}

            {openMenu.entry.type === 'file' && isArchive(openMenu.entry.name) && (
              <DropItem icon={<CompressArrowsAltIcon />} onClick={() => { closeMenu(); extractArchive(openMenu.entry); }}>
                Extract here
              </DropItem>
            )}

            {openMenu.entry.type === 'file' && isTextFile(openMenu.entry.name) && (
              <DropItem icon={<PencilAltIcon />} onClick={() => { closeMenu(); setEditingFile(joinPath(currentPath, openMenu.entry.name)); }}>
                Edit
              </DropItem>
            )}

            {openMenu.entry.type === 'file' && (isTextFile(openMenu.entry.name) || openMenu.entry.name.endsWith('.log')) && (
              <DropItem icon={<TerminalIcon />} onClick={() => { closeMenu(); setItemToTail(openMenu.entry.name); }}>
                Tail
              </DropItem>
            )}

            <DropItem icon={<LockIcon />} onClick={() => { closeMenu(); setItemToPerms(openMenu.entry); }}>
              Permissions
            </DropItem>

            <div style={{ height: 1, background: '#e8e8e8', margin: '4px 0' }} />

            <DropItem danger icon={<TrashIcon />} onClick={() => { closeMenu(); setItemsToDelete([openMenu.entry.name]); }}>
              Delete
            </DropItem>
          </div>
        </>
      )}

      {/* ── Modals ── */}
      {showCreateModal && (
        <CreateModal
          namespace={namespace} podName={podName} containerName={activeContainer}
          currentPath={currentPath} type={showCreateModal}
          onClose={() => setShowCreateModal(null)}
          onSuccess={() => loadDirectory(currentPath)}
        />
      )}
      {itemsToDelete.length > 0 && (
        <DeleteModal
          namespace={namespace} podName={podName} containerName={activeContainer}
          currentPath={currentPath} targetNames={itemsToDelete}
          onClose={() => setItemsToDelete([])}
          onSuccess={() => { setSelectedItems(new Set()); loadDirectory(currentPath); }}
        />
      )}
      {itemToRename && (
        <RenameModal
          namespace={namespace} podName={podName} containerName={activeContainer}
          currentPath={currentPath} targetName={itemToRename}
          onClose={() => setItemToRename(null)}
          onSuccess={() => loadDirectory(currentPath)}
        />
      )}
      {itemToPerms && (
        <PermissionsModal
          namespace={namespace} podName={podName} containerName={activeContainer}
          currentPath={currentPath} entry={itemToPerms}
          onClose={() => setItemToPerms(null)}
          onSuccess={() => loadDirectory(currentPath)}
        />
      )}
      {itemToTail && (
        <FileTailViewer
          namespace={namespace} podName={podName} containerName={activeContainer}
          currentPath={currentPath} targetName={itemToTail}
          onClose={() => setItemToTail(null)}
        />
      )}
      {itemToPreview && (
        <ImagePreviewModal
          namespace={namespace} podName={podName} containerName={activeContainer}
          currentPath={currentPath} entry={itemToPreview}
          onClose={() => setItemToPreview(null)}
        />
      )}
      {editingFile && (
        <FileEditor
          namespace={namespace} podName={podName} containerName={activeContainer}
          filePath={editingFile}
          onClose={() => setEditingFile(null)}
          onSaved={() => loadDirectory(currentPath)}
        />
      )}
      {showUpload && (
        <UploadModal
          namespace={namespace} podName={podName} containerName={activeContainer}
          currentPath={currentPath}
          onClose={() => setShowUpload(false)}
          onSuccess={() => loadDirectory(currentPath)}
        />
      )}
    </div>
  );
};

export default FileExplorer;

import React, { useState } from 'react';
import PortalModal from './PortalModal';
import { execCommand } from '../utils/exec';
import { joinPath } from '../utils/fileUtils';

interface CreateModalProps {
  namespace: string;
  podName: string;
  containerName: string;
  currentPath: string;
  type: 'file' | 'directory';
  onClose: () => void;
  onSuccess: () => void;
}

const btn = (primary: boolean, disabled = false): React.CSSProperties => ({
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

const CreateModal: React.FC<CreateModalProps> = ({
  namespace, podName, containerName, currentPath, type, onClose, onSuccess,
}) => {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) return;
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
      } else {
        onSuccess();
        onClose();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PortalModal
      title={`Create New ${type === 'file' ? 'File' : 'Folder'}`}
      size="sm"
      onClose={onClose}
      actions={
        <>
          <button style={btn(true, !name.trim() || loading)} disabled={!name.trim() || loading} onClick={handleCreate}>
            {loading ? 'Creating…' : 'Create'}
          </button>
          <button style={btn(false, loading)} disabled={loading} onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 500 }}>Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={`Enter ${type} name`}
          autoFocus
          style={{
            width: '100%', padding: '6px 10px', fontSize: 14,
            border: '1px solid #c7c7c7', borderRadius: 3,
            boxSizing: 'border-box'
          }}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
        />
      </div>

      <div style={{ fontSize: 13, color: '#6a6e73' }}>
        Will be created in: <code>{currentPath}</code>
      </div>

      {error && (
        <div style={{
          marginTop: 14, padding: '10px 14px', borderRadius: 4,
          background: '#fce8e8', border: '1px solid #f5c6cb', color: '#6b1117', fontSize: 13,
        }}>
          {error}
        </div>
      )}
    </PortalModal>
  );
};

export default CreateModal;

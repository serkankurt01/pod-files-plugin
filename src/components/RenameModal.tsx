import React, { useState, useEffect, useRef } from 'react';
import PortalModal from './PortalModal';
import { execCommand } from '../utils/exec';
import { joinPath } from '../utils/fileUtils';

interface RenameModalProps {
  namespace: string;
  podName: string;
  containerName: string;
  currentPath: string;
  targetName: string;
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

const RenameModal: React.FC<RenameModalProps> = ({
  namespace, podName, containerName, currentPath, targetName, onClose, onSuccess,
}) => {
  const [name, setName] = useState(targetName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Select the filename without extension if possible
    if (inputRef.current) {
      const dot = targetName.lastIndexOf('.');
      if (dot > 0) {
        inputRef.current.setSelectionRange(0, dot);
      } else {
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
      title="Rename File / Folder"
      size="sm"
      onClose={onClose}
      actions={
        <>
          <button style={btn(true, !name.trim() || loading)} disabled={!name.trim() || loading} onClick={handleRename}>
            {loading ? 'Renaming…' : 'Rename'}
          </button>
          <button style={btn(false, loading)} disabled={loading} onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 500 }}>New Name</label>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
          style={{
            width: '100%', padding: '6px 10px', fontSize: 14,
            border: '1px solid #c7c7c7', borderRadius: 3,
            boxSizing: 'border-box'
          }}
          onKeyDown={e => e.key === 'Enter' && handleRename()}
        />
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

export default RenameModal;

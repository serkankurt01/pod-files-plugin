import React, { useState } from 'react';
import PortalModal from './PortalModal';
import { execCommand } from '../utils/exec';
import { joinPath } from '../utils/fileUtils';

interface DeleteModalProps {
  namespace: string;
  podName: string;
  containerName: string;
  currentPath: string;
  targetNames: string[];
  onClose: () => void;
  onSuccess: () => void;
}

const btn = (primary: boolean, danger = false, disabled = false): React.CSSProperties => {
  let bg = '#fff';
  let color = '#06c';
  let border = '1px solid #06c';
  
  if (primary) {
    if (danger) {
      bg = '#c9190b'; border = 'none'; color = '#fff';
    } else {
      bg = '#06c'; border = 'none'; color = '#fff';
    }
  }

  if (disabled) {
    bg = '#c8c8c8'; border = 'none'; color = '#888';
  }

  return {
    padding: '6px 18px', border, borderRadius: 3,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 500, fontSize: 14, background: bg, color,
    opacity: disabled ? 0.7 : 1,
  };
};

const DeleteModal: React.FC<DeleteModalProps> = ({
  namespace, podName, containerName, currentPath, targetNames, onClose, onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  const titleStr = targetNames.length === 1 ? `Delete File: ${targetNames[0]}` : `Delete ${targetNames.length} Items`;

  return (
    <PortalModal
      title={titleStr}
      size="sm"
      onClose={onClose}
      actions={
        <>
          <button style={btn(true, true, loading)} disabled={loading} onClick={handleDelete}>
            {loading ? 'Deleting…' : 'Delete'}
          </button>
          <button style={btn(false, false, loading)} disabled={loading} onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      <div style={{ marginBottom: 16, fontSize: 14 }}>
        Are you sure you want to delete <strong>{targetNames.length === 1 ? targetNames[0] : `${targetNames.length} selected items`}</strong>?
        <br/>
        This action cannot be undone.
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

export default DeleteModal;

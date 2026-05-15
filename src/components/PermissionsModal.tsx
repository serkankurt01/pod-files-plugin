import React, { useState } from 'react';
import PortalModal from './PortalModal';
import { execCommand } from '../utils/exec';
import { joinPath, FileEntry } from '../utils/fileUtils';

interface PermissionsModalProps {
  namespace: string;
  podName: string;
  containerName: string;
  currentPath: string;
  entry: FileEntry;
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

const PermissionsModal: React.FC<PermissionsModalProps> = ({
  namespace, podName, containerName, currentPath, entry, onClose, onSuccess,
}) => {
  const [permissions, setPermissions] = useState(entry.permissions || '');
  const [user, setUser] = useState(entry.user || '');
  const [group, setGroup] = useState(entry.group || '');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleApply = async () => {
    setLoading(true);
    setError('');
    try {
      const fullPath = joinPath(currentPath, entry.name);
      const escaped = fullPath.replace(/'/g, "'\\''");
      
      let cmds: string[] = [];
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
      title={`Edit Permissions: ${entry.name}`}
      size="sm"
      onClose={onClose}
      actions={
        <>
          <button style={btn(true, loading)} disabled={loading} onClick={handleApply}>
            {loading ? 'Applying…' : 'Apply'}
          </button>
          <button style={btn(false, loading)} disabled={loading} onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 16 }}>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 500 }}>Permissions (Octal)</label>
          <input
            type="text"
            value={permissions}
            onChange={e => setPermissions(e.target.value)}
            placeholder="e.g. 644 or 755"
            style={{
              width: '100%', padding: '6px 10px', fontSize: 14,
              border: '1px solid #c7c7c7', borderRadius: 3,
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 500 }}>Owner</label>
          <input
            type="text"
            value={user}
            onChange={e => setUser(e.target.value)}
            placeholder="User name or ID"
            style={{
              width: '100%', padding: '6px 10px', fontSize: 14,
              border: '1px solid #c7c7c7', borderRadius: 3,
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 500 }}>Group</label>
          <input
            type="text"
            value={group}
            onChange={e => setGroup(e.target.value)}
            placeholder="Group name or ID"
            style={{
              width: '100%', padding: '6px 10px', fontSize: 14,
              border: '1px solid #c7c7c7', borderRadius: 3,
              boxSizing: 'border-box'
            }}
          />
        </div>
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

export default PermissionsModal;

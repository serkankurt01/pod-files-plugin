import React, { useState, useEffect } from 'react';
import PortalModal from './PortalModal';
import { execCommand, execCommandWithStdin } from '../utils/exec';

interface FileEditorProps {
  namespace: string;
  podName: string;
  containerName: string;
  filePath: string;
  onClose: () => void;
  onSaved: () => void;
}

type Status = 'loading' | 'ready' | 'saving' | 'error';

const btn = (primary: boolean, disabled = false): React.CSSProperties => ({
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

const FileEditor: React.FC<FileEditorProps> = ({
  namespace, podName, containerName, filePath, onClose, onSaved,
}) => {
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
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
      const result = await execCommandWithStdin(
        { namespace, podName, containerName, command: ['sh', '-c', `cat > '${escaped}'`] },
        new TextEncoder().encode(content),
      );
      if (result.stderr.trim()) { setError(result.stderr); setStatus('error'); }
      else { onSaved(); onClose(); }
    } catch (err: any) { setError(err.message); setStatus('error'); }
  };

  const fileName = filePath.split('/').filter(Boolean).pop() ?? filePath;
  const busy = status === 'loading' || status === 'saving';

  return (
    <PortalModal
      title={`Edit — ${fileName}`}
      size="lg"
      onClose={onClose}
      actions={
        <>
          <button style={btn(true, busy || status === 'error')} disabled={busy || status === 'error'} onClick={handleSave}>
            {status === 'saving' ? 'Saving…' : 'Save'}
          </button>
          <button style={btn(false, status === 'saving')} disabled={status === 'saving'} onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      {status === 'loading' && (
        <div style={{ padding: 40, textAlign: 'center', color: '#6a6e73' }}>Loading file…</div>
      )}

      {error && (
        <div style={{
          padding: '10px 14px', marginBottom: 12, borderRadius: 4,
          background: '#fce8e8', border: '1px solid #f5c6cb', color: '#6b1117', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {(status === 'ready' || status === 'saving' || status === 'error') && (
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          disabled={status === 'saving'}
          rows={28}
          spellCheck={false}
          style={{
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
          }}
        />
      )}
    </PortalModal>
  );
};

export default FileEditor;

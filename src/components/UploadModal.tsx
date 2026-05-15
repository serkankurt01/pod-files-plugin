import React, { useState, useRef } from 'react';
import PortalModal from './PortalModal';
import { execUploadFile } from '../utils/exec';
import { joinPath, formatFileSize } from '../utils/fileUtils';

interface UploadModalProps {
  namespace: string;
  podName: string;
  containerName: string;
  currentPath: string;
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

const UploadModal: React.FC<UploadModalProps> = ({
  namespace, podName, containerName, currentPath, onClose, onSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null);
    setError('');
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setProgress(0);
    setError('');
    try {
      const destPath = joinPath(currentPath, file.name);
      const result = await execUploadFile(
        { namespace, podName, containerName },
        file,
        destPath,
        (pct) => setProgress(pct),
      );
      if (result.stderr.trim()) { setError(result.stderr); }
      else { onSuccess(); onClose(); }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <PortalModal
      title="Upload File to Pod"
      size="sm"
      onClose={onClose}
      actions={
        <>
          <button style={btn(true, !file || uploading)} disabled={!file || uploading} onClick={handleUpload}>
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
          <button style={btn(false, uploading)} disabled={uploading} onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      {/* Destination info */}
      <div style={{ marginBottom: 18, fontSize: 14 }}>
        <span style={{ color: '#6a6e73' }}>Destination: </span>
        <code style={{
          background: '#f0f0f0', padding: '2px 8px',
          borderRadius: 3, fontSize: 13, color: '#151515',
        }}>
          {currentPath}
        </code>
      </div>

      {/* File picker */}
      <input ref={inputRef} type="file" onChange={handleFileChange} style={{ display: 'none' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          style={{
            padding: '7px 16px', borderRadius: 3, cursor: uploading ? 'not-allowed' : 'pointer',
            border: '1px solid #c7c7c7', background: '#fff', fontSize: 14,
          }}
        >
          Choose file…
        </button>
        {file && (
          <span style={{ fontSize: 14 }}>
            <strong>{file.name}</strong>
            <span style={{ color: '#6a6e73', marginLeft: 6 }}>({formatFileSize(file.size)})</span>
          </span>
        )}
      </div>

      {/* Progress bar */}
      {uploading && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, marginBottom: 4, color: '#6a6e73' }}>Uploading…</div>
          <div style={{ height: 6, background: '#e0e0e0', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${progress}%`,
              background: '#06c', borderRadius: 3,
              transition: 'width 0.3s ease',
            }} />
          </div>
        </div>
      )}

      {/* Error */}
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

export default UploadModal;

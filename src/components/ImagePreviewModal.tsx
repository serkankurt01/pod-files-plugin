import React, { useState, useEffect } from 'react';
import { Spinner } from '@patternfly/react-core';
import PortalModal from './PortalModal';
import { execCommand } from '../utils/exec';
import { joinPath, FileEntry } from '../utils/fileUtils';

interface ImagePreviewModalProps {
  namespace: string;
  podName: string;
  containerName: string;
  currentPath: string;
  entry: FileEntry;
  onClose: () => void;
}

const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  namespace, podName, containerName, currentPath, entry, onClose,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [imgSrc, setImgSrc] = useState('');

  useEffect(() => {
    let active = true;
    const fetchImage = async () => {
      setLoading(true);
      setError('');
      try {
        const filePath = joinPath(currentPath, entry.name);
        const result = await execCommand({ namespace, podName, containerName, command: ['base64', filePath] });
        if (!active) return;
        
        if (result.stderr.trim()) {
          setError(result.stderr);
        } else {
          const b64 = new TextDecoder().decode(result.stdout).replace(/\s+/g, '');
          
          let mime = 'image/png';
          if (entry.name.endsWith('.jpg') || entry.name.endsWith('.jpeg')) mime = 'image/jpeg';
          else if (entry.name.endsWith('.gif')) mime = 'image/gif';
          else if (entry.name.endsWith('.svg')) mime = 'image/svg+xml';
          else if (entry.name.endsWith('.webp')) mime = 'image/webp';

          setImgSrc(`data:${mime};base64,${b64}`);
        }
      } catch (err: any) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchImage();
    return () => { active = false; };
  }, [namespace, podName, containerName, currentPath, entry.name]);

  return (
    <PortalModal
      title={`Preview: ${entry.name}`}
      size="lg"
      onClose={onClose}
      actions={
        <button
          style={{
            padding: '6px 18px', border: '1px solid #06c', borderRadius: 3,
            cursor: 'pointer', fontWeight: 500, fontSize: 14,
            background: '#fff', color: '#06c'
          }}
          onClick={onClose}
        >
          Close
        </button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
        {loading && <Spinner size="lg" />}
        {!loading && error && (
          <div style={{
            padding: '10px 14px', borderRadius: 4, width: '100%',
            background: '#fce8e8', border: '1px solid #f5c6cb', color: '#6b1117', fontSize: 13,
          }}>
            {error}
          </div>
        )}
        {!loading && !error && imgSrc && (
          <img
            src={imgSrc}
            alt={entry.name}
            style={{
              maxWidth: '100%',
              maxHeight: '60vh',
              objectFit: 'contain',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              borderRadius: 4,
              background: 'repeating-conic-gradient(#f0f0f0 0% 25%, transparent 0% 50%) 50% / 20px 20px' // checkerboard for transparent images
            }}
          />
        )}
      </div>
    </PortalModal>
  );
};

export default ImagePreviewModal;

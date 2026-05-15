import React, { useState, useEffect, useRef } from 'react';
import PortalModal from './PortalModal';
import { execStream } from '../utils/exec';
import { joinPath } from '../utils/fileUtils';

interface FileTailViewerProps {
  namespace: string;
  podName: string;
  containerName: string;
  currentPath: string;
  targetName: string;
  onClose: () => void;
}

const FileTailViewer: React.FC<FileTailViewerProps> = ({
  namespace, podName, containerName, currentPath, targetName, onClose,
}) => {
  const [logs, setLogs] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isFollowing, setIsFollowing] = useState(true);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fullPath = joinPath(currentPath, targetName);
    const escaped = fullPath.replace(/'/g, "'\\''");
    
    // Use tail -f -n 100 to get last 100 lines and follow
    const command = ['sh', '-c', `tail -f -n 100 '${escaped}'`];
    
    const cancelStream = execStream(
      { namespace, podName, containerName, command },
      (data, isErr) => {
        if (isErr) {
          setError(prev => prev + data);
        } else {
          setLogs(prev => prev + data);
        }
      },
      () => {
        setLogs(prev => prev + '\n[Stream Closed]\n');
      },
      (err) => {
        setError(`Connection error: ${err.message}`);
      }
    );

    return () => {
      cancelStream();
    };
  }, [namespace, podName, containerName, currentPath, targetName]);

  useEffect(() => {
    if (isFollowing && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, isFollowing]);

  const handleScroll = () => {
    if (!logContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 10;
    if (isFollowing !== isAtBottom) {
      setIsFollowing(isAtBottom);
    }
  };

  return (
    <PortalModal
      title={`Live Log: ${targetName}`}
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
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
        <span style={{ color: '#6a6e73' }}>
          Path: <code>{joinPath(currentPath, targetName)}</code>
        </span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={isFollowing}
            onChange={e => setIsFollowing(e.target.checked)}
          />
          Follow
        </label>
      </div>

      <div
        ref={logContainerRef}
        onScroll={handleScroll}
        style={{
          background: '#151515',
          color: '#f0f0f0',
          padding: 12,
          borderRadius: 4,
          fontFamily: 'monospace',
          fontSize: 13,
          height: '60vh',
          overflowY: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {logs || <span style={{ color: '#888' }}>Waiting for logs...</span>}
      </div>

      {error && (
        <div style={{
          marginTop: 14, padding: '10px 14px', borderRadius: 4,
          background: '#fce8e8', border: '1px solid #f5c6cb', color: '#6b1117', fontSize: 13,
          maxHeight: 100, overflowY: 'auto'
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}
    </PortalModal>
  );
};

export default FileTailViewer;

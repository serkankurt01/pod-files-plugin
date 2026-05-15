import React from 'react';
import { K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';
import FileExplorer from './FileExplorer';

interface FilesTabProps {
  obj: K8sResourceCommon;
}

interface PodSpec {
  containers: { name: string }[];
  initContainers?: { name: string }[];
}

function getPodSpec(obj: K8sResourceCommon): PodSpec {
  const spec = (obj as any).spec as PodSpec | undefined;
  return spec ?? { containers: [] };
}

function getPodPhase(obj: K8sResourceCommon): string | undefined {
  return (obj as any).status?.phase as string | undefined;
}

export const FilesTab: React.FC<FilesTabProps> = ({ obj }) => {
  const spec = getPodSpec(obj);
  const allContainers = [
    ...(spec.containers ?? []),
    ...(spec.initContainers ?? []),
  ];

  const phase     = getPodPhase(obj);
  const namespace = obj.metadata?.namespace ?? '';
  const podName   = obj.metadata?.name ?? '';
  const firstContainer = allContainers[0]?.name ?? '';

  if (phase && phase !== 'Running') {
    return (
      <div style={{
        margin: '16px 24px', padding: '12px 16px', borderRadius: 4, fontSize: 14,
        background: '#fdf2da', border: '1px solid #f0ab00', color: '#795600',
        display: 'flex', gap: 10, alignItems: 'flex-start',
      }}>
        <span style={{ fontSize: 16 }}>⚠</span>
        <div>
          <strong>Pod is {phase}</strong>
          <div style={{ marginTop: 4 }}>
            File browsing is only available while the pod is in <strong>Running</strong> state.
          </div>
        </div>
      </div>
    );
  }

  if (!firstContainer) {
    return (
      <div style={{
        margin: '16px 24px', padding: '12px 16px', borderRadius: 4, fontSize: 14,
        background: '#fce8e8', border: '1px solid #f5c6cb', color: '#6b1117',
        display: 'flex', gap: 10, alignItems: 'center',
      }}>
        <span style={{ fontSize: 16 }}>✕</span>
        <strong>No containers found in this pod</strong>
      </div>
    );
  }

  return (
    <FileExplorer
      key={`${namespace}/${podName}`}
      namespace={namespace}
      podName={podName}
      containerName={firstContainer}
      containers={allContainers.map(c => c.name)}
    />
  );
};

export default FilesTab;

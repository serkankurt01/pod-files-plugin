import React, { useState } from 'react';
import { K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';
import {
  Alert,
  FormGroup,
  Form,
  FormSelect,
  FormSelectOption,
} from '@patternfly/react-core';
import FileExplorer from './FileExplorer';

// SDK's required props shape for console.tab/horizontalNav components
interface FilesTabProps {
  obj: K8sResourceCommon;
}

// Type helpers — the console passes the full Pod resource but the SDK surface only exposes K8sResourceCommon
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

  const [selectedContainer, setSelectedContainer] = useState<string>(
    allContainers[0]?.name ?? '',
  );

  const phase = getPodPhase(obj);
  const namespace = obj.metadata?.namespace ?? '';
  const podName = obj.metadata?.name ?? '';

  if (phase && phase !== 'Running') {
    return (
      <Alert
        variant="warning"
        title={`Pod is ${phase}`}
        isInline
        style={{ margin: '16px 24px' }}
      >
        File browsing is only available while the pod is in <strong>Running</strong> state.
      </Alert>
    );
  }

  if (!selectedContainer) {
    return (
      <Alert
        variant="danger"
        title="No containers found in this pod"
        isInline
        style={{ margin: '16px 24px' }}
      />
    );
  }

  return (
    <div>
      {/* Container selector — shown only when there are multiple containers */}
      {allContainers.length > 1 && (
        <div style={{ padding: '12px 24px 0', maxWidth: 380 }}>
          <Form isHorizontal>
            <FormGroup label="Container" fieldId="files-container-select">
              <FormSelect
                id="files-container-select"
                value={selectedContainer}
                onChange={(val) => setSelectedContainer(val)}
                aria-label="Select container"
              >
                {allContainers.map(c => (
                  <FormSelectOption key={c.name} value={c.name} label={c.name} />
                ))}
              </FormSelect>
            </FormGroup>
          </Form>
        </div>
      )}

      <FileExplorer
        key={`${namespace}/${podName}/${selectedContainer}`}
        namespace={namespace}
        podName={podName}
        containerName={selectedContainer}
      />
    </div>
  );
};

export default FilesTab;

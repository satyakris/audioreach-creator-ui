/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ReactElement} from 'react';

import {ProgressRing} from '@qualcomm-ui/react/progress-ring';

import {useGraphDesignerStoreShallow} from '~features/graph-designer';
import {GenericTreeView} from '~widgets/generic-tree-view';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CalDataViewProps {
  spfModuleSystemId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CalDataView({
  spfModuleSystemId,
}: CalDataViewProps): ReactElement {
  // Read the cal-data entry for this module from the slice
  const entry = useGraphDesignerStoreShallow(
    (s) => s.calDataByModuleId[spfModuleSystemId],
  );

  // Pull actions as stable references from the store
  const {fetchCalData, updateCalData} = useGraphDesignerStoreShallow((s) => ({
    fetchCalData: s.fetchCalData,
    updateCalData: s.updateCalData,
  }));

  // Loading state: entry absent, uninitialized, or loading
  if (
    !entry ||
    entry.status === 'uninitialized' ||
    entry.status === 'loading'
  ) {
    return (
      <div className="flex h-full items-center justify-center">
        <ProgressRing size="xl" />
      </div>
    );
  }

  // Error state
  if (entry.status === 'error') {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div
            className="mb-2 text-lg font-semibold"
            style={{color: 'var(--color-border-support-danger)'}}
          >
            Error loading calibration data
          </div>
          <div
            className="mt-1 text-sm"
            style={{color: 'var(--color-text-neutral-secondary)'}}
          >
            {entry.error ?? 'Failed to load calibration data'}
          </div>
        </div>
      </div>
    );
  }

  // Ready state — gate on dto presence so TypeScript is satisfied
  if (entry.status === 'ready' && entry.dto) {
    return (
      <GenericTreeView
        data={entry.dto}
        moduleName={entry.moduleName}
        onGet={() => {
          void fetchCalData(spfModuleSystemId, entry.moduleName);
        }}
        onSet={(payload) => updateCalData(spfModuleSystemId, payload)}
      />
    );
  }

  // Ready but dto not yet populated — treat as loading
  return (
    <div className="flex h-full items-center justify-center">
      <ProgressRing size="xl" />
    </div>
  );
}

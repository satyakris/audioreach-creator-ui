/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {useEffect, useRef} from 'react';

import {Accordion} from '@qualcomm-ui/react/accordion';
import {Badge, StatusBadge} from '@qualcomm-ui/react/badge';

import type {ParameterDetailDto} from '~entities/spf-module-cal-data';

import {ElementTree} from './ElementTree';

interface ParameterDetailPaneProps {
  arrayCounts: Map<string, number>;
  committedValues: Map<string, string>;
  dirtyPaths: Set<string>;
  elementValues: Map<string, string>;
  expandAll?: boolean;
  expandedIds: string[];
  invalidPaths: Set<string>;
  matchSets: {elementIds: Set<string>; paramIds: Set<string>} | null;
  onExpandedChange: (ids: string[]) => void;
  onValueChange: (key: string, value: string) => void;
  policyFilter: Set<'BASIC' | 'ADVANCED'>;
  readOnly: boolean;
  resetKey: number;
  searchActive?: boolean;
  selectedParams: ParameterDetailDto[];
  setPaths: Set<string>;
  showBadges: boolean;
  showRanges: boolean;
}

const POLICY_EMPHASIS: Record<
  string,
  'danger' | 'neutral' | 'info' | 'warning' | 'success' | 'brand'
> = {
  CALIBRATION: 'neutral',
  RTC: 'danger',
  RTC_READONLY: 'warning',
  RTM: 'info',
};

const POLICY_LABEL: Record<string, string> = {
  CALIBRATION: 'Calibration',
  RTC_READONLY: 'RTC Readonly',
};

function ParamTriggerContent({
  isDirty,
  isSet,
  param,
  showBadges,
}: {
  isDirty: boolean;
  isSet: boolean;
  param: ParameterDetailDto;
  showBadges: boolean;
}) {
  const hasBadges =
    showBadges &&
    ((param.toolPolicy?.length ?? 0) > 0 ||
      param.isNeuralNet ||
      param.isOffloaded ||
      param.isReadOnly ||
      param.deprecated);

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 py-0.5">
      <span className="flex shrink-0 items-center" style={{width: 12}}>
        {isDirty && (
          <StatusBadge className="dirty-pulse" emphasis="warning" size="sm" />
        )}
        {!isDirty && isSet && <StatusBadge emphasis="success" size="sm" />}
      </span>

      <span className="min-w-0 truncate text-sm font-medium">{param.name}</span>

      {hasBadges && (
        <span className="flex shrink-0 flex-wrap items-center gap-1.5">
          {param.toolPolicy?.map((p) => (
            <Badge
              key={p}
              emphasis={POLICY_EMPHASIS[p] ?? 'neutral'}
              size="sm"
              variant="subtle"
            >
              {POLICY_LABEL[p] ?? p}
            </Badge>
          ))}
          {param.isNeuralNet && (
            <Badge emphasis="brand" size="sm" variant="subtle">
              Neural Net
            </Badge>
          )}
          {param.isOffloaded && (
            <Badge emphasis="neutral" size="sm" variant="subtle">
              Offloaded
            </Badge>
          )}
          {param.isReadOnly && (
            <Badge emphasis="neutral" size="sm" variant="subtle">
              Read Only
            </Badge>
          )}
          {param.deprecated && (
            <Badge emphasis="warning" size="sm" variant="subtle">
              Deprecated
            </Badge>
          )}
        </span>
      )}
    </div>
  );
}

export function ParameterDetailPane({
  arrayCounts,
  committedValues,
  dirtyPaths,
  elementValues,
  expandAll,
  expandedIds,
  invalidPaths,
  matchSets,
  onExpandedChange,
  onValueChange,
  policyFilter,
  readOnly,
  resetKey,
  searchActive,
  selectedParams,
  setPaths,
  showBadges,
  showRanges,
}: ParameterDetailPaneProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevParamIdsRef = useRef<string[]>([]);

  useEffect(() => {
    const prevIds = prevParamIdsRef.current;
    const currentIds = selectedParams.map((p) => p.parameterId);
    const newId = currentIds.find((id) => !prevIds.includes(id));
    prevParamIdsRef.current = currentIds;

    if (!newId || !scrollRef.current) {
      return;
    }
    const el = scrollRef.current.querySelector(`[data-param-id="${newId}"]`);
    el?.scrollIntoView({behavior: 'smooth', block: 'nearest'});
  }, [selectedParams]);

  if (selectedParams.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">
          {searchActive
            ? 'No parameters match the search.'
            : 'Select a parameter from the left panel.'}
        </p>
      </div>
    );
  }

  // Compute dirty/set status per parameter from the path-based sets.
  function isParamDirty(param: ParameterDetailDto): boolean {
    for (const key of dirtyPaths) {
      if (key.startsWith(`${param.parameterId}/`)) {
        return true;
      }
    }
    return false;
  }

  function isParamSet(param: ParameterDetailDto): boolean {
    if (isParamDirty(param)) {
      return false;
    }
    for (const key of setPaths) {
      if (key.startsWith(`${param.parameterId}/`)) {
        return true;
      }
    }
    return false;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {selectedParams.length > 1 && (
        <div
          className="flex shrink-0 items-center gap-2 border-b px-4 py-2.5 text-xs text-muted-foreground"
          style={{backgroundColor: 'var(--color-background-neutral-01)'}}
        >
          <span>{selectedParams.length} parameters selected</span>
          <span className="opacity-30">·</span>
          <span>Ctrl+click to add/remove</span>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto py-1">
        <Accordion.Root
          className="flex flex-col gap-1"
          collapsible
          multiple
          onValueChange={onExpandedChange}
          value={expandedIds}
        >
          {selectedParams.map((param) => {
            const isDirty = isParamDirty(param);
            const isSet = isParamSet(param);
            return (
              <div
                key={param.parameterId}
                className="overflow-hidden rounded-md border shadow-sm"
                data-param-id={param.parameterId}
                style={{backgroundColor: 'var(--color-surface-primary)'}}
              >
                <Accordion.ItemRoot value={param.parameterId}>
                  <Accordion.ItemTrigger>
                    <ParamTriggerContent
                      isDirty={isDirty}
                      isSet={isSet}
                      param={param}
                      showBadges={showBadges}
                    />
                    <Accordion.ItemIndicator />
                  </Accordion.ItemTrigger>
                  <Accordion.ItemContent>
                    {expandedIds.includes(param.parameterId) && (
                      <ElementTree
                        arrayCounts={arrayCounts}
                        committedValues={committedValues}
                        dirtyPaths={dirtyPaths}
                        elementValues={elementValues}
                        expandAll={expandAll}
                        invalidPaths={invalidPaths}
                        matchSets={matchSets}
                        onValueChange={onValueChange}
                        param={param}
                        paramReadOnly={readOnly || (param.isReadOnly ?? false)}
                        policyFilter={policyFilter}
                        resetKey={resetKey}
                        setPaths={setPaths}
                        showRanges={showRanges}
                      />
                    )}
                  </Accordion.ItemContent>
                </Accordion.ItemRoot>
              </div>
            );
          })}
        </Accordion.Root>
      </div>
    </div>
  );
}

/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {useMemo} from 'react';

import {createTreeCollection} from '@qualcomm-ui/core/tree';
import {StatusBadge} from '@qualcomm-ui/react/badge';
import {Tooltip} from '@qualcomm-ui/react/tooltip';
import {Tree} from '@qualcomm-ui/react/tree';

import type {ParameterDetailDto} from '~entities/spf-module-cal-data';
import {
  ConvertNumberToHexString,
  ConvertStringToNumber,
} from '~shared/utils/converter-utils';

import {StatusStrip} from './StatusStrip';

/**
 * Format a parameter id for display as a hex PID with a 0x prefix.
 * parameterId arrives as a numeric string from the backend; convert it to the
 * conventional 0x-prefixed hex form. Falls back to the raw value if it is not
 * a parseable number (so nothing is ever hidden from the user).
 */
function formatPid(parameterId: string): string {
  const asNumber = ConvertStringToNumber(parameterId);
  if (asNumber === null) {
    return parameterId;
  }
  return ConvertNumberToHexString(asNumber) ?? parameterId;
}

interface ParameterListPanelProps {
  dirtyParameterIds: Set<string>;
  matchSets: {elementIds: Set<string>; paramIds: Set<string>} | null;
  moduleName: string;
  onSelectionChange: (ids: string[], expandNew?: boolean) => void;
  parameters: ParameterDetailDto[];
  selectedIds: string[];
  setParameterIds: Set<string>;
  showPids: boolean;
}

interface ParamListNode {
  children: ParamListNode[];
  id: string;
  name: string;
}

export function ParameterListPanel({
  dirtyParameterIds,
  matchSets,
  moduleName,
  onSelectionChange,
  parameters,
  selectedIds,
  setParameterIds,
  showPids,
}: ParameterListPanelProps) {
  const visibleParams = parameters.filter((p) => !p.isHidden);
  const filteredParams = matchSets
    ? visibleParams.filter((p) => matchSets.paramIds.has(p.parameterId))
    : visibleParams;

  const dirtyCount = dirtyParameterIds.size;
  const setCount = setParameterIds.size;

  const rootNode: ParamListNode = useMemo(
    () => ({
      children: filteredParams.map((p) => ({
        children: [],
        id: p.parameterId,
        name: p.name,
      })),
      id: '__module__',
      name: moduleName,
    }),
    [filteredParams, moduleName],
  );

  const collection = useMemo(
    () =>
      createTreeCollection<ParamListNode>({
        nodeChildren: 'children',
        nodeText: 'name',
        nodeValue: 'id',
        rootNode,
      }),
    [rootNode],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden border-r">
      <div className="flex-1 overflow-y-auto">
        <Tree.Root
          key={moduleName}
          collection={collection}
          onSelectedValueChange={(details) => {
            const expandNew =
              details.selectedValue.length < visibleParams.length;
            onSelectionChange(details.selectedValue, expandNew);
          }}
          selectedValue={selectedIds}
          selectionMode="multiple"
          style={{'--indent-spacing': '0px'} as React.CSSProperties}
        >
          {/* Module header row */}
          <Tree.Label
            className="flex cursor-pointer items-center gap-2 truncate border-b px-4 py-2.5 text-sm font-semibold"
            onClick={(e) => {
              e.stopPropagation();
              if (e.ctrlKey || e.metaKey) {
                const allSelected = visibleParams.every((p) =>
                  selectedIds.includes(p.parameterId),
                );
                onSelectionChange(
                  allSelected ? [] : visibleParams.map((p) => p.parameterId),
                  false,
                );
              } else {
                onSelectionChange(
                  visibleParams.map((p) => p.parameterId),
                  false,
                );
              }
            }}
          >
            {moduleName}
          </Tree.Label>

          {filteredParams.map((param, index) => {
            const isDirty = dirtyParameterIds.has(param.parameterId);
            const isSet = setParameterIds.has(param.parameterId);

            const tooltipLines: string[] = [];
            tooltipLines.push(`PID: ${formatPid(param.parameterId)}`);
            if (param.description) {
              tooltipLines.push(param.description);
            }

            return (
              <Tree.NodeProvider
                key={param.parameterId}
                indexPath={[index]}
                node={rootNode.children[index]}
              >
                <Tooltip.Root positioning={{placement: 'right'}}>
                  <Tooltip.Trigger>
                    <Tree.LeafNode>
                      <Tree.NodeIndicator />
                      <ParamRowContent
                        isDirty={isDirty}
                        isSet={isSet}
                        param={param}
                        showPids={showPids}
                      />
                    </Tree.LeafNode>
                  </Tooltip.Trigger>
                  <Tooltip.Positioner style={{zIndex: 50}}>
                    <Tooltip.Content>
                      <Tooltip.Arrow>
                        <Tooltip.ArrowTip />
                      </Tooltip.Arrow>
                      <div className="max-w-[260px] whitespace-pre-line text-xs">
                        {tooltipLines.join('\n')}
                      </div>
                    </Tooltip.Content>
                  </Tooltip.Positioner>
                </Tooltip.Root>
              </Tree.NodeProvider>
            );
          })}
        </Tree.Root>
      </div>

      <StatusStrip
        dirtyCount={dirtyCount}
        paramCount={matchSets ? matchSets.paramIds.size : visibleParams.length}
        setCount={setCount}
        totalParamCount={matchSets ? visibleParams.length : undefined}
      />
    </div>
  );
}

function ParamRowContent({
  isDirty,
  isSet,
  param,
  showPids,
}: {
  isDirty: boolean;
  isSet: boolean;
  param: ParameterDetailDto;
  showPids: boolean;
}) {
  return (
    <>
      <div
        className="flex shrink-0 items-center justify-center"
        style={{width: 12}}
      >
        {isDirty ? (
          <StatusBadge className="dirty-pulse" emphasis="warning" size="xs" />
        ) : isSet ? (
          <StatusBadge emphasis="success" size="xs" />
        ) : null}
      </div>
      <Tree.NodeText className="flex-1 text-sm">{param.name}</Tree.NodeText>
      {showPids && (
        <span
          className="shrink-0 font-mono text-xs"
          style={{marginLeft: 'auto', opacity: 0.45, paddingLeft: '8px'}}
        >
          {formatPid(param.parameterId)}
        </span>
      )}
    </>
  );
}

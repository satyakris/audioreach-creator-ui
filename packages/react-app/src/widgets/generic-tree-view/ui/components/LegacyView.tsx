/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {useMemo} from 'react';

import {createTreeCollection} from '@qualcomm-ui/core/tree';
import {Tree} from '@qualcomm-ui/react/tree';

import type {ParameterDetailDto} from '~entities/spf-module-cal-data';

import {ElementTree} from './ElementTree';
import {StatusStrip} from './StatusStrip';

interface LegacyViewProps {
  arrayCounts: Map<string, number>;
  committedValues: Map<string, string>;
  dirtyPaths: Set<string>;
  elementValues: Map<string, string>;
  expandAll?: boolean;
  expandedKeys: string[];
  invalidPaths: Set<string>;
  matchSets: {elementIds: Set<string>; paramIds: Set<string>} | null;
  moduleName: string;
  onExpandedChange: (keys: string[]) => void;
  onValueChange: (key: string, value: string) => void;
  parameters: ParameterDetailDto[];
  policyFilter: Set<'BASIC' | 'ADVANCED'>;
  readOnly: boolean;
  resetKey: number;
  setPaths: Set<string>;
  showRanges: boolean;
}

interface LegacyNode {
  children: LegacyNode[];
  id: string;
  name: string;
}

export function LegacyView({
  arrayCounts,
  committedValues,
  dirtyPaths,
  elementValues,
  expandAll,
  expandedKeys,
  invalidPaths,
  matchSets,
  moduleName,
  onExpandedChange,
  onValueChange,
  parameters,
  policyFilter,
  readOnly,
  resetKey,
  setPaths,
  showRanges,
}: LegacyViewProps) {
  const visibleParams = parameters.filter((p) => !p.isHidden);
  const filteredParams = matchSets
    ? visibleParams.filter((p) => matchSets.paramIds.has(p.parameterId))
    : visibleParams;

  // Build a synthetic root for QUI Tree — one child per parameter.
  // We don't recurse elements into this collection; element rendering is
  // delegated to ElementTree, same as the modern right panel.
  const rootNode: LegacyNode = useMemo(
    () => ({
      children: [
        {
          children: filteredParams.map((p) => ({
            children: [],
            id: p.parameterId,
            name: p.name,
          })),
          id: '__module__',
          name: moduleName,
        },
      ],
      id: '__legacy_root__',
      name: '',
    }),
    [filteredParams, moduleName],
  );

  const collection = useMemo(
    () =>
      createTreeCollection<LegacyNode>({
        nodeChildren: 'children',
        nodeText: 'name',
        nodeValue: 'id',
        rootNode,
      }),
    [rootNode],
  );

  const moduleDefaultExpanded = useMemo(
    () =>
      expandedKeys.length > 0
        ? expandedKeys
        : ['__module__', ...filteredParams.map((p) => p.parameterId)],
    // Only recompute on filteredParams change — not on expandedKeys, because
    // defaultExpandedValue is only used on initial mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredParams, moduleName],
  );

  const dirtyCount = dirtyPaths.size;
  const setCount = setPaths.size;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4">
        {matchSets && filteredParams.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No parameters match the search.
          </p>
        ) : (
          <Tree.Root
            key={moduleName}
            collection={collection}
            defaultExpandedValue={moduleDefaultExpanded}
            expandedValue={expandedKeys}
            onExpandedValueChange={(details) =>
              onExpandedChange(details.expandedValue)
            }
          >
            {/* Module branch */}
            <Tree.NodeProvider indexPath={[0]} node={rootNode.children[0]}>
              <Tree.Branch>
                <Tree.BranchNode>
                  <Tree.NodeIndicator />
                  <Tree.BranchTrigger />
                  <Tree.NodeText>{moduleName}</Tree.NodeText>
                </Tree.BranchNode>
                <Tree.BranchContent>
                  <Tree.BranchIndentGuide />
                  {filteredParams.map((param, i) => (
                    <Tree.NodeProvider
                      key={param.parameterId}
                      indexPath={[0, i]}
                      node={rootNode.children[0].children[i]}
                    >
                      <Tree.Branch>
                        <Tree.BranchNode>
                          <Tree.NodeIndicator />
                          <Tree.BranchTrigger />
                          <Tree.NodeText>{param.name}</Tree.NodeText>
                        </Tree.BranchNode>
                        <Tree.BranchContent>
                          <div className="py-2 pl-4">
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
                              paramReadOnly={
                                readOnly || (param.isReadOnly ?? false)
                              }
                              policyFilter={policyFilter}
                              resetKey={resetKey}
                              setPaths={setPaths}
                              showRanges={showRanges}
                            />
                          </div>
                        </Tree.BranchContent>
                      </Tree.Branch>
                    </Tree.NodeProvider>
                  ))}
                </Tree.BranchContent>
              </Tree.Branch>
            </Tree.NodeProvider>
          </Tree.Root>
        )}
      </div>

      <StatusStrip
        dirtyCount={dirtyCount}
        paramCount={filteredParams.length}
        setCount={setCount}
        totalParamCount={visibleParams.length}
      />
    </div>
  );
}

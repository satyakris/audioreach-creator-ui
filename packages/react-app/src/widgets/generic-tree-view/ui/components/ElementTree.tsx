/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {useMemo} from 'react';

import {createTreeCollection} from '@qualcomm-ui/core/tree';
import {Tree} from '@qualcomm-ui/react/tree';

import type {
  AnyElementDto,
  ParameterDetailDto,
} from '~entities/spf-module-cal-data';

import {elementKey} from '../../lib/elementKey';
import {
  renderElement,
  type RenderElementContext,
} from '../../lib/renderElement';

interface ElementTreeProps {
  arrayCounts: Map<string, number>;
  committedValues: Map<string, string>;
  dirtyPaths: Set<string>;
  elementValues: Map<string, string>;
  expandAll?: boolean;
  invalidPaths: Set<string>;
  matchSets?: {elementIds: Set<string>; paramIds: Set<string>} | null;
  onValueChange: (key: string, value: string) => void;
  param: ParameterDetailDto;
  paramReadOnly: boolean;
  policyFilter: Set<'BASIC' | 'ADVANCED'>;
  resetKey: number;
  setPaths: Set<string>;
  showRanges: boolean;
}

/**
 * Collect all branch path keys for expansion — must match the node IDs produced by
 * renderElement.
 */
function collectBranchKeys(
  elems: AnyElementDto[],
  parameterId: string,
  prefix: string[],
  arrayCounts: Map<string, number>,
): string[] {
  const keys: string[] = [];
  for (const elem of elems) {
    if (elem.type === 'CONFIG_ELEMENT') {
      // Bitfield elements render as a branch — include their key.
      if (elem.displayType === 'BIT_FIELD' && elem.allowedValues?.length) {
        keys.push(elementKey(parameterId, ...prefix, elem.name));
      }
    } else if (elem.type === 'STRUCT') {
      const k = elementKey(parameterId, ...prefix, elem.name);
      keys.push(k);
      keys.push(
        ...collectBranchKeys(
          elem.value,
          parameterId,
          [...prefix, elem.name],
          arrayCounts,
        ),
      );
    } else if (elem.type === 'ELEMENT_TEMPLATE_ARRAY') {
      const arrayPath = elementKey(parameterId, ...prefix, elem.name);
      // Fixed-length tables are not collapsible branches — skip.
      if (elem.length !== undefined && !elem.lengthFormula) {
        continue;
      }
      keys.push(arrayPath);
      const count = arrayCounts.get(arrayPath) ?? elem.value.length;
      for (let i = 0; i < count; i++) {
        const inst = i < elem.value.length ? elem.value[i] : elem.template[0];
        if (!inst) {
          continue;
        }
        const instName =
          inst.type === 'STRUCT' ? inst.name : `${elem.name}[${i}]`;
        if (inst.type === 'STRUCT') {
          const instKey = elementKey(parameterId, ...prefix, instName);
          keys.push(instKey);
          keys.push(
            ...collectBranchKeys(
              inst.value,
              parameterId,
              [...prefix, instName],
              arrayCounts,
            ),
          );
        }
      }
    }
  }
  return keys;
}

/**
 * Renders the element tree for a single ParameterDetailDto using QUI Tree.
 * Uses the shared renderElement utility so Legacy and Modern modes stay in sync.
 */
export function ElementTree({
  arrayCounts,
  committedValues,
  dirtyPaths,
  elementValues,
  expandAll,
  invalidPaths,
  matchSets,
  onValueChange,
  param,
  paramReadOnly,
  policyFilter,
  resetKey,
  setPaths,
  showRanges,
}: ElementTreeProps) {
  // Build a flat synthetic collection for QUI Tree — required for the Tree.Root
  // context. We use a minimal node shape that satisfies the collection API but
  // rendering is fully delegated to renderElement.
  interface FlatNode {
    children: FlatNode[];
    id: string;
    name: string;
  }

  const rootNode: FlatNode = useMemo(
    () => ({
      children: [],
      id: param.parameterId,
      name: param.name,
    }),
    [param.parameterId, param.name],
  );

  const collection = useMemo(
    () =>
      createTreeCollection<FlatNode>({
        nodeChildren: 'children',
        nodeText: 'name',
        nodeValue: 'id',
        rootNode,
      }),
    [rootNode],
  );

  const allBranchKeys = useMemo(
    () => collectBranchKeys(param.elements, param.parameterId, [], arrayCounts),

    [param.elements, param.parameterId, arrayCounts],
  );

  const ctx: RenderElementContext = {
    arrayCounts,
    committedValues,
    dirtyPaths,
    elementValues,
    invalidPaths,
    matchElementKeys: matchSets?.elementIds,
    onValueChange,
    parameterId: param.parameterId,
    paramReadOnly,
    pathPrefix: [],
    policyFilter,
    setPaths,
    showRanges,
  };

  return (
    <div className="h-full overflow-y-auto">
      <Tree.Root
        key={`${param.parameterId}-${resetKey}-${expandAll ? 'expand' : 'default'}`}
        collection={collection}
        defaultExpandedValue={expandAll ? allBranchKeys : undefined}
      >
        {param.elements.map((elem, i) => renderElement(elem, ctx, [i]))}
      </Tree.Root>
    </div>
  );
}

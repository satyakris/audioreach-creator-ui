/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';

import type {
  AnyElementDto,
  CalDataDto,
  ClipboardPayload,
  ParameterDetailDto,
  TreeViewNotification,
  UpdateSpfModuleCalDataRequest,
} from '~entities/spf-module-cal-data';

import {elementKey} from '../lib/elementKey';

import {LegacyView} from './components/LegacyView';
import {ParameterDetailPane} from './components/ParameterDetailPane';
import {ParameterListPanel} from './components/ParameterListPanel';
import {Toolbar} from './components/Toolbar';
import {ViewSwitchOverlay} from './components/ViewSwitchOverlay';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface GenericTreeViewProps {
  boldOnDirty?: boolean;
  className?: string;
  data: CalDataDto;
  defaultViewMode?: 'modern' | 'legacy';
  enableElementSelection?: boolean;
  moduleName?: string;
  onBatchCopy?: (moduleData: CalDataDto) => void;
  onCopy?: (payload: ClipboardPayload) => void;
  onExport?: (payload: ClipboardPayload) => void;
  onGet: () => void;
  onImport?: () => Promise<ClipboardPayload>;
  onNotify?: (notification: TreeViewNotification) => void;
  onPaste?: () => Promise<ClipboardPayload>;
  onSet: (payload: UpdateSpfModuleCalDataRequest) => Promise<CalDataDto | void>;
  readOnly?: boolean;
}

export interface GenericTreeViewHandle {
  getPayload: () => UpdateSpfModuleCalDataRequest | null;
  reset: () => void;
}

// ── Utilities ──────────────────────────────────────────────────────────────────

function parseHexOrDec(value: string): number {
  const v = value.trim();
  if (v.startsWith('0x') || v.startsWith('0X')) {
    return parseInt(v, 16);
  }
  return parseInt(v, 10);
}

/** Recursively walk elements and seed elementValues / arrayCounts maps. */
function seedFromElements(
  elems: AnyElementDto[],
  parameterId: string,
  pathPrefix: string[],
  elementValues: Map<string, string>,
  arrayCounts: Map<string, number>,
): void {
  for (const elem of elems) {
    if (elem.type === 'CONFIG_ELEMENT') {
      const key = elementKey(parameterId, ...pathPrefix, elem.name);
      elementValues.set(key, elem.value);
    } else if (elem.type === 'STRUCT') {
      seedFromElements(
        elem.value,
        parameterId,
        [...pathPrefix, elem.name],
        elementValues,
        arrayCounts,
      );
    } else if (elem.type === 'ELEMENT_TEMPLATE_ARRAY') {
      const arrayPath = elementKey(parameterId, ...pathPrefix, elem.name);
      arrayCounts.set(arrayPath, elem.value.length);
      for (const inst of elem.value) {
        const instPrefix =
          inst.type === 'STRUCT' ? [...pathPrefix, inst.name] : [...pathPrefix];
        if (inst.type === 'STRUCT') {
          seedFromElements(
            inst.value,
            parameterId,
            instPrefix,
            elementValues,
            arrayCounts,
          );
        } else if (inst.type === 'CONFIG_ELEMENT') {
          const key = elementKey(parameterId, ...pathPrefix, inst.name);
          elementValues.set(key, inst.value);
        }
      }
    }
  }
}

function seedFromData(data: CalDataDto): {
  arrayCounts: Map<string, number>;
  elementValues: Map<string, string>;
} {
  const elementValues = new Map<string, string>();
  const arrayCounts = new Map<string, number>();
  for (const param of data.parameters) {
    seedFromElements(
      param.elements,
      param.parameterId,
      [],
      elementValues,
      arrayCounts,
    );
  }
  return {arrayCounts, elementValues};
}

/**
 * Override arrayCounts with counts derived from controller element values.
 * Called after Set (void) and Get so dynamic arrays reflect the committed
 * controller value rather than the static parsed DTO instance count.
 */
function applyLengthFormulas(
  arrayCounts: Map<string, number>,
  lengthFormulaMap: Map<string, {arrayPath: string}[]>,
  values: Map<string, string>,
): Map<string, number> {
  const result = new Map(arrayCounts);
  for (const [controllerPath, arrays] of lengthFormulaMap) {
    const rawValue = values.get(controllerPath);
    if (rawValue === undefined) {
      continue;
    }
    const count = parseHexOrDec(rawValue);
    if (!isNaN(count) && count >= 0) {
      for (const {arrayPath} of arrays) {
        result.set(arrayPath, count);
      }
    }
  }
  return result;
}

/**
 * Build a map from controller element path → array paths it controls.
 * Used for dynamic array expansion.
 */
function buildLengthFormulaMap(
  params: ParameterDetailDto[],
): Map<
  string,
  {arrayName: string; arrayPath: string; template: AnyElementDto[]}[]
> {
  const map = new Map<
    string,
    {arrayName: string; arrayPath: string; template: AnyElementDto[]}[]
  >();

  function walk(elems: AnyElementDto[], parameterId: string, prefix: string[]) {
    for (const elem of elems) {
      if (elem.type === 'ELEMENT_TEMPLATE_ARRAY' && elem.lengthFormula) {
        // Find the sibling controller by name
        const controllerName = elem.lengthFormula;
        const controllerPath = elementKey(
          parameterId,
          ...prefix,
          controllerName,
        );
        const arrayPath = elementKey(parameterId, ...prefix, elem.name);
        const existing = map.get(controllerPath) ?? [];
        map.set(controllerPath, [
          ...existing,
          {arrayName: elem.name, arrayPath, template: elem.template},
        ]);
      }
      if (elem.type === 'STRUCT') {
        walk(elem.value, parameterId, [...prefix, elem.name]);
      }
      if (elem.type === 'ELEMENT_TEMPLATE_ARRAY') {
        for (const inst of elem.value) {
          if (inst.type === 'STRUCT') {
            walk(inst.value, parameterId, [...prefix, inst.name]);
          }
        }
      }
    }
  }

  for (const param of params) {
    walk(param.elements, param.parameterId, []);
  }
  return map;
}

interface MatchSets {
  elementIds: Set<string>;
  paramIds: Set<string>;
}

function buildMatchSets(data: CalDataDto, search: string): MatchSets {
  const paramIds = new Set<string>();
  const elementIds = new Set<string>();
  const lower = search.toLowerCase();

  function walkElems(
    elems: AnyElementDto[],
    parameterId: string,
    prefix: string[],
  ): boolean {
    let anyMatch = false;
    for (const elem of elems) {
      const name =
        elem.type === 'CONFIG_ELEMENT' ||
        elem.type === 'STRUCT' ||
        elem.type === 'ELEMENT_TEMPLATE_ARRAY'
          ? elem.name
          : '';
      const selfMatch = name.toLowerCase().includes(lower);
      let childMatch = false;
      if (elem.type === 'STRUCT') {
        childMatch = walkElems(elem.value, parameterId, [...prefix, elem.name]);
      } else if (elem.type === 'ELEMENT_TEMPLATE_ARRAY') {
        for (const inst of elem.value) {
          if (inst.type === 'STRUCT') {
            if (walkElems(inst.value, parameterId, [...prefix, inst.name])) {
              childMatch = true;
            }
          }
        }
      }
      if (selfMatch || childMatch) {
        const key = elementKey(parameterId, ...prefix, name);
        elementIds.add(key);
        anyMatch = true;
      }
    }
    return anyMatch;
  }

  for (const param of data.parameters) {
    if (param.isHidden) {
      continue;
    }
    const nameMatch = param.name.toLowerCase().includes(lower);
    const pidMatch = param.parameterId.toLowerCase().includes(lower);
    const elemMatch = walkElems(param.elements, param.parameterId, []);
    if (nameMatch || pidMatch || elemMatch) {
      paramIds.add(param.parameterId);
    }
  }

  return {elementIds, paramIds};
}

/** Reconstruct ParameterDetailDto with updated values for Set payload. */
function reconstructParam(
  param: ParameterDetailDto,
  elementValues: Map<string, string>,
  arrayCounts: Map<string, number>,
  dirtyPaths: Set<string>,
): ParameterDetailDto {
  const hasDirty = [...dirtyPaths].some((k) =>
    k.startsWith(`${param.parameterId}/`),
  );
  if (!hasDirty) {
    return param;
  }

  function patchElems(
    elems: AnyElementDto[],
    prefix: string[],
  ): AnyElementDto[] {
    return elems.map((elem) => {
      if (elem.type === 'CONFIG_ELEMENT') {
        const key = elementKey(param.parameterId, ...prefix, elem.name);
        const newValue = elementValues.get(key) ?? elem.value;
        return newValue !== elem.value ? {...elem, value: newValue} : elem;
      }
      if (elem.type === 'STRUCT') {
        const patched = patchElems(elem.value, [...prefix, elem.name]);
        return patched === elem.value ? elem : {...elem, value: patched};
      }
      if (elem.type === 'ELEMENT_TEMPLATE_ARRAY') {
        const arrayPath = elementKey(param.parameterId, ...prefix, elem.name);
        const count = arrayCounts.get(arrayPath) ?? elem.value.length;
        const instances = elem.value.slice(0, count).map((inst) => {
          if (inst.type === 'STRUCT') {
            const patched = patchElems(inst.value, [...prefix, inst.name]);
            return patched === inst.value ? inst : {...inst, value: patched};
          }
          if (inst.type === 'CONFIG_ELEMENT') {
            const key = elementKey(param.parameterId, ...prefix, inst.name);
            const newValue = elementValues.get(key) ?? inst.value;
            return newValue !== inst.value ? {...inst, value: newValue} : inst;
          }
          return inst;
        });
        return {...elem, value: instances};
      }
      return elem;
    });
  }

  return {
    ...param,
    changeInfo: {...param.changeInfo, changeType: 'UPDATE'},
    elements: patchElems(param.elements, []),
  };
}

// ── Component ──────────────────────────────────────────────────────────────────

function GenericTreeViewInner(
  props: GenericTreeViewProps,
  ref: React.Ref<GenericTreeViewHandle>,
) {
  const {
    data: dataProp,
    defaultViewMode = 'modern',
    moduleName: moduleNameProp,
    onBatchCopy,
    onGet,
    onSet,
    readOnly = false,
  } = props;

  const [, startTransition] = useTransition();
  const [isExpanding, startExpandTransition] = useTransition();
  const [isSwitchingView, startViewTransition] = useTransition();
  const [pendingSwitch, setPendingSwitch] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<'modern' | 'legacy' | null>(
    null,
  );

  const activeData: CalDataDto = dataProp;
  const activeName: string = moduleNameProp ?? '';

  // ── View mode ────────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<'modern' | 'legacy'>(
    defaultViewMode,
  );

  // ── Element values (path-keyed) ───────────────────────────────────────────────
  const [elementValues, setElementValues] = useState<Map<string, string>>(
    () => seedFromData(activeData).elementValues,
  );
  const [committedValues, setCommittedValues] = useState<Map<string, string>>(
    () => new Map(elementValues),
  );
  const [arrayCounts, setArrayCounts] = useState<Map<string, number>>(
    () => seedFromData(activeData).arrayCounts,
  );

  // ── Dirty / set path sets ─────────────────────────────────────────────────────
  const [dirtyPaths, setDirtyPaths] = useState<Set<string>>(new Set());
  const [setPaths, setSetPaths] = useState<Set<string>>(new Set());
  const [invalidPaths] = useState<Set<string>>(new Set());
  // Incremented on Get — forces all uncontrolled inputs to remount with fresh
  // values.
  const [resetKey, setResetKey] = useState(0);

  // ── Length formula map ────────────────────────────────────────────────────────
  const lengthFormulaMap = useMemo(
    () => buildLengthFormulaMap(activeData.parameters),
    [activeData],
  );

  // ── Re-seed when data prop changes (e.g. after Get) ──────────────────────────
  const prevDataRef = useRef<CalDataDto | null>(null);
  useEffect(() => {
    if (prevDataRef.current === activeData) {
      return;
    }
    prevDataRef.current = activeData;
    const {arrayCounts: ac, elementValues: ev} = seedFromData(activeData);
    setElementValues(ev);
    setCommittedValues(new Map(ev));
    setArrayCounts(ac);
    setDirtyPaths(new Set());
    setSetPaths(new Set());
    setResetKey((k) => k + 1);
  }, [activeData]);

  // ── Selection ────────────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    const first = activeData.parameters.find((p) => !p.isHidden);
    return first ? [first.parameterId] : [];
  });

  // ── Accordion / tree expansion ───────────────────────────────────────────────
  const [expandedIds, setExpandedIds] = useState<string[]>(() => {
    const first = activeData.parameters.find((p) => !p.isHidden);
    return first ? [first.parameterId] : [];
  });
  const [legacyExpandedKeys, setLegacyExpandedKeys] = useState<string[]>([
    '__module__',
  ]);
  const [legacyExpandAll, setLegacyExpandAll] = useState(false);
  const [modernExpandAll, setModernExpandAll] = useState(false);

  // ── Search ───────────────────────────────────────────────────────────────────
  const [searchInput, setSearchInput] = useState('');
  const [searchText, setSearchText] = useState('');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchInput(value);
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
      searchDebounceRef.current = setTimeout(
        () => startTransition(() => setSearchText(value)),
        150,
      );
    },
    [startTransition],
  );

  // ── Policy filter ─────────────────────────────────────────────────────────────
  const [policyFilter, setPolicyFilter] = useState<Set<'BASIC' | 'ADVANCED'>>(
    new Set(['BASIC']),
  );

  // ── Toolbar toggles ───────────────────────────────────────────────────────────
  const [showPids, setShowPids] = useState(false);
  const [showRanges, setShowRanges] = useState(false);
  const [showBadges, setShowBadges] = useState(false);

  // ── Resizable divider ─────────────────────────────────────────────────────────
  const [panelSplitPct, setPanelSplitPct] = useState(30);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleDragStart = useCallback(() => {
    isDragging.current = true;
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) {
        return;
      }
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setPanelSplitPct(Math.min(60, Math.max(20, pct)));
    };
    const onUp = () => {
      isDragging.current = false;
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);

  // ── Default selection on data change ─────────────────────────────────────────
  const prevDataIdRef = useRef<string>('');
  useEffect(() => {
    const dataId = activeData.systemId;
    if (dataId === prevDataIdRef.current) {
      return;
    }
    prevDataIdRef.current = dataId;
    const first = activeData.parameters.find((p) => !p.isHidden);
    if (first) {
      setSelectedIds([first.parameterId]);
      setExpandedIds([first.parameterId]);
    } else {
      setSelectedIds([]);
      setExpandedIds([]);
    }
    setLegacyExpandedKeys(['__module__']);
    setLegacyExpandAll(false);
    preSearchRef.current = null;
    setSearchInput('');
    startTransition(() => setSearchText(''));
  }, [activeData, startTransition]);

  // ── Value change handler ──────────────────────────────────────────────────────
  const handleValueChange = useCallback(
    (key: string, value: string) => {
      setElementValues((prev) => {
        const next = new Map(prev);
        next.set(key, value);
        return next;
      });

      // Mark dirty by comparing to committed
      setDirtyPaths((prev) => {
        const committedVal = committedValues.get(key);
        const isDirty = value !== committedVal;
        const next = new Set(prev);
        if (isDirty) {
          next.add(key);
        } else {
          next.delete(key);
        }
        return next;
      });

      // Remove from setPaths when re-dirtied
      setSetPaths((prev) => {
        if (!prev.has(key)) {
          return prev;
        }
        const next = new Set(prev);
        next.delete(key);
        return next;
      });

      // Dynamic array expansion
      const controlled = lengthFormulaMap.get(key);
      if (controlled) {
        const newCount = parseHexOrDec(value);
        if (!isNaN(newCount) && newCount >= 0) {
          setArrayCounts((prev) => {
            const next = new Map(prev);
            let changed = false;
            for (const {arrayPath} of controlled) {
              if (prev.get(arrayPath) !== newCount) {
                next.set(arrayPath, newCount);
                changed = true;
              }
            }
            return changed ? next : prev;
          });
        }
      }
    },
    [committedValues, lengthFormulaMap],
  );

  // ── Derived: dirty/set parameter IDs ─────────────────────────────────────────
  const dirtyParameterIds = useMemo(() => {
    const s = new Set<string>();
    for (const key of dirtyPaths) {
      const pid = key.split('/')[0];
      if (pid) {
        s.add(pid);
      }
    }
    return s;
  }, [dirtyPaths]);

  const setParameterIds = useMemo(() => {
    const s = new Set<string>();
    for (const key of setPaths) {
      const pid = key.split('/')[0];
      if (pid) {
        s.add(pid);
      }
    }
    return s;
  }, [setPaths]);

  // ── Get / Set ─────────────────────────────────────────────────────────────────
  const handleSet = useCallback(async () => {
    if (dirtyPaths.size === 0) {
      return;
    }
    const dirtyParams = activeData.parameters
      .map((p) => reconstructParam(p, elementValues, arrayCounts, dirtyPaths))
      .filter((p) => p.changeInfo.changeType === 'UPDATE');
    if (dirtyParams.length === 0) {
      return;
    }

    try {
      const result = await onSet({data: dirtyParams});
      if (result) {
        // Re-seed from server response
        const {arrayCounts: ac, elementValues: ev} = seedFromData(result);
        setElementValues(ev);
        setCommittedValues(new Map(ev));
        setArrayCounts(ac);
        setDirtyPaths(new Set());
        setSetPaths(new Set());
      } else {
        // Promote dirty → committed locally, then recompute array counts
        // from the new committed values so dynamic arrays stay expanded.
        const newCommitted = new Map(committedValues);
        for (const key of dirtyPaths) {
          const val = elementValues.get(key);
          if (val !== undefined) {
            newCommitted.set(key, val);
          }
        }
        setCommittedValues(newCommitted);
        setArrayCounts(
          applyLengthFormulas(arrayCounts, lengthFormulaMap, newCommitted),
        );
        setSetPaths((prev) => {
          const next = new Set(prev);
          for (const key of dirtyPaths) {
            next.add(key);
          }
          return next;
        });
        setDirtyPaths(new Set());
      }
    } catch {
      // Rollback — no state change
    }
  }, [
    dirtyPaths,
    activeData.parameters,
    elementValues,
    arrayCounts,
    onSet,
    committedValues,
    lengthFormulaMap,
  ]);

  const handleGet = useCallback(() => {
    onGet();
    // State reset happens when the new data prop arrives via the useEffect above.
  }, [onGet]);

  // ── Match sets for search ─────────────────────────────────────────────────────
  const matchSets = useMemo(
    () => (searchText ? buildMatchSets(activeData, searchText) : null),
    [activeData, searchText],
  );

  const preSearchRef = useRef<{
    expandedIds: string[];
    selectedIds: string[];
  } | null>(null);

  useEffect(() => {
    if (!searchText) {
      if (preSearchRef.current) {
        setSelectedIds(preSearchRef.current.selectedIds);
        setExpandedIds(preSearchRef.current.expandedIds);
        preSearchRef.current = null;
      }
      return;
    }
    if (!preSearchRef.current) {
      preSearchRef.current = {
        expandedIds: [...expandedIds],
        selectedIds: [...selectedIds],
      };
    }
    if (!matchSets) {
      return;
    }
    const matchedIds = activeData.parameters
      .filter((p) => !p.isHidden && matchSets.paramIds.has(p.parameterId))
      .map((p) => p.parameterId);
    setSelectedIds(matchedIds);
    setExpandedIds(matchedIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText, matchSets]);

  // ── Toolbar callbacks ─────────────────────────────────────────────────────────
  const handleCollapseAll = useCallback(() => {
    if (viewMode === 'modern') {
      setExpandedIds([]);
      setModernExpandAll(false);
    } else {
      setLegacyExpandAll(false);
      // Keep the module node open; collapse all parameter branches.
      setLegacyExpandedKeys(['__module__']);
    }
  }, [viewMode]);

  const handleExpandAll = useCallback(() => {
    if (viewMode === 'modern') {
      startExpandTransition(() => {
        setExpandedIds(selectedIds);
        setModernExpandAll(true);
      });
    } else {
      startExpandTransition(() => {
        setLegacyExpandAll(true);
        setLegacyExpandedKeys([
          '__module__',
          ...activeData.parameters.map((p) => p.parameterId),
        ]);
      });
    }
  }, [viewMode, selectedIds, activeData, startExpandTransition]);

  // ── View mode switch ──────────────────────────────────────────────────────────
  const handleViewModeChange = useCallback(
    (mode: 'modern' | 'legacy') => {
      setSwitchingTo(mode);
      setPendingSwitch(true);
      startViewTransition(() => {
        if (mode === 'legacy') {
          setLegacyExpandAll(false);
          // Default: module open, parameter branches collapsed.
          setLegacyExpandedKeys(['__module__']);
        }
        setViewMode(mode);
        setPendingSwitch(false);
      });
    },
    [startViewTransition],
  );

  // ── Selection change ──────────────────────────────────────────────────────────
  const handleSelectionChange = useCallback(
    (newIds: string[], expandNew = true) => {
      setModernExpandAll(false);
      startTransition(() => {
        setExpandedIds((prev) => {
          const stillSelected = prev.filter((id) => newIds.includes(id));
          if (!expandNew) {
            return stillSelected;
          }
          const brandNew = newIds.filter((id) => !selectedIds.includes(id));
          return [...stillSelected, ...brandNew];
        });
        setSelectedIds(newIds);
      });
    },
    [selectedIds, startTransition],
  );

  // ── Resolved selected params ──────────────────────────────────────────────────
  const selectedParams = useMemo(
    () =>
      selectedIds.flatMap((id) =>
        activeData.parameters.filter((p) => p.parameterId === id),
      ),
    [selectedIds, activeData],
  );

  const hasDirty = dirtyPaths.size > 0;
  const hasSet = setPaths.size > 0;

  // ── Imperative handle ─────────────────────────────────────────────────────────
  useImperativeHandle(
    ref,
    () => ({
      getPayload: () => {
        if (dirtyPaths.size === 0) {
          return null;
        }
        const dirty = activeData.parameters
          .map((p) =>
            reconstructParam(p, elementValues, arrayCounts, dirtyPaths),
          )
          .filter((p) => p.changeInfo.changeType === 'UPDATE');
        return dirty.length > 0 ? {data: dirty} : null;
      },
      reset: () => {
        const {arrayCounts: ac, elementValues: ev} = seedFromData(activeData);
        setElementValues(ev);
        setArrayCounts(ac);
        setDirtyPaths(new Set());
        setSetPaths(new Set());
      },
    }),
    [dirtyPaths, activeData, elementValues, arrayCounts],
  );

  return (
    <div
      className="relative flex h-full w-full flex-col"
      style={{backgroundColor: 'var(--color-surface-primary)'}}
    >
      <ViewSwitchOverlay active={isSwitchingView} switchingTo={switchingTo} />

      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden transition-[filter] duration-150"
        style={
          pendingSwitch || isSwitchingView
            ? {filter: 'blur(3px) brightness(0.85)', pointerEvents: 'none'}
            : undefined
        }
      >
        {/* Toolbar */}
        <Toolbar
          canGet={hasSet || hasDirty}
          canSet={hasDirty && !readOnly}
          isExpanding={isExpanding}
          onBatchCopy={onBatchCopy ? () => onBatchCopy(activeData) : () => {}}
          onCollapseAll={handleCollapseAll}
          onExpandAll={handleExpandAll}
          onGet={handleGet}
          onPolicyFilterChange={setPolicyFilter}
          onSearchChange={handleSearchChange}
          onSet={() => {
            void handleSet();
          }}
          onShowBadgesChange={setShowBadges}
          onShowPidsChange={setShowPids}
          onShowRangesChange={setShowRanges}
          onViewModeChange={handleViewModeChange}
          policyFilter={policyFilter}
          searchText={searchInput}
          showBadges={showBadges}
          showPids={showPids}
          showRanges={showRanges}
          viewMode={viewMode}
        />

        {/* Main content */}
        <div
          ref={containerRef}
          className="relative flex flex-1 overflow-hidden"
        >
          {viewMode === 'modern' ? (
            <>
              <div className="h-full" style={{width: `${panelSplitPct}%`}}>
                <ParameterListPanel
                  dirtyParameterIds={dirtyParameterIds}
                  matchSets={matchSets}
                  moduleName={activeName}
                  onSelectionChange={handleSelectionChange}
                  parameters={activeData.parameters}
                  selectedIds={selectedIds}
                  setParameterIds={setParameterIds}
                  showPids={showPids}
                />
              </div>
              <div
                className="relative w-[3px] shrink-0 cursor-col-resize"
                onMouseDown={handleDragStart}
                style={{backgroundColor: 'var(--color-border-brand-primary)'}}
              />
              <div
                className="h-full overflow-hidden"
                style={{width: `${100 - panelSplitPct}%`}}
              >
                <ParameterDetailPane
                  arrayCounts={arrayCounts}
                  committedValues={committedValues}
                  dirtyPaths={dirtyPaths}
                  elementValues={elementValues}
                  expandAll={modernExpandAll}
                  expandedIds={expandedIds}
                  invalidPaths={invalidPaths}
                  matchSets={matchSets}
                  onExpandedChange={setExpandedIds}
                  onValueChange={handleValueChange}
                  policyFilter={policyFilter}
                  readOnly={readOnly}
                  resetKey={resetKey}
                  searchActive={!!searchText}
                  selectedParams={selectedParams}
                  setPaths={setPaths}
                  showBadges={showBadges}
                  showRanges={showRanges}
                />
              </div>
            </>
          ) : (
            <div className="h-full flex-1 overflow-hidden">
              <LegacyView
                arrayCounts={arrayCounts}
                committedValues={committedValues}
                dirtyPaths={dirtyPaths}
                elementValues={elementValues}
                expandAll={legacyExpandAll}
                expandedKeys={legacyExpandedKeys}
                invalidPaths={invalidPaths}
                matchSets={matchSets}
                moduleName={activeName}
                onExpandedChange={setLegacyExpandedKeys}
                onValueChange={handleValueChange}
                parameters={activeData.parameters}
                policyFilter={policyFilter}
                readOnly={readOnly}
                resetKey={resetKey}
                setPaths={setPaths}
                showRanges={showRanges}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const GenericTreeView = forwardRef<
  GenericTreeViewHandle,
  GenericTreeViewProps
>(GenericTreeViewInner);

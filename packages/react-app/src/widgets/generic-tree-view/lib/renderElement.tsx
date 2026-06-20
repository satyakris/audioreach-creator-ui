/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {useEffect, useRef, useState} from 'react';

import {selectCollection} from '@qualcomm-ui/core/select';
import {Select} from '@qualcomm-ui/react/select';
import {Switch} from '@qualcomm-ui/react/switch';
import {TextArea} from '@qualcomm-ui/react/text-area';
import {TextInput} from '@qualcomm-ui/react/text-input';
import {Tooltip} from '@qualcomm-ui/react/tooltip';
import {Tree} from '@qualcomm-ui/react/tree';

import type {
  AnyElementDto,
  BitFieldDto,
  ConfigElementDto,
  ElementTemplateArrayDto,
  NameValuePairDto,
  StructDto,
} from '~entities/spf-module-cal-data';

import {TableComponent} from '../ui/components/ElementTable';

import {elementKey} from './elementKey';

export interface RenderElementContext {
  arrayCounts: Map<string, number>;
  committedValues: Map<string, string>;
  dirtyPaths: Set<string>;
  elementValues: Map<string, string>;
  invalidPaths: Set<string>;
  matchElementKeys?: Set<string>;
  onValueChange: (key: string, value: string) => void;
  parameterId: string;
  paramReadOnly: boolean;
  pathPrefix: string[];
  policyFilter: Set<'BASIC' | 'ADVANCED'>;
  setPaths: Set<string>;
  showRanges: boolean;
}

function parseHexOrDec(value: string): number {
  const v = value.trim();
  if (v.startsWith('0x') || v.startsWith('0X')) {
    return parseInt(v, 16);
  }
  return parseInt(v, 10);
}

function toHexString(n: number): string {
  const unsigned = n >>> 0; // treat as unsigned 32-bit for negative values
  return `0x${unsigned.toString(16).toUpperCase().padStart(8, '0')}`;
}

function parseQFormatN(qFormat: string): number {
  const m = qFormat.match(/^[Qq](\d+)$/);
  return m ? parseInt(m[1], 10) : 15;
}

/** The option whose value hex matches the current stored hex. */
function findOptionName(
  allowedValues: NameValuePairDto[],
  currentHex: string,
): string {
  return (
    allowedValues.find((av) => av.value === currentHex)?.name ??
    allowedValues[0]?.name ??
    ''
  );
}

// Boolean synonym pairs — same list as the old ParamNode implementation.
const BOOL_SYNONYMS = [
  ['enable', 'disable'],
  ['enabled', 'disabled'],
  ['on', 'off'],
  ['true', 'false'],
  ['yes', 'no'],
];

/**
 * Two-option NameValuePair → Switch only when the names look like a boolean.
 * Arbitrary 2-option dropdowns (e.g. log_code with "0x0"/"0x1" names) stay as
 * Select.
 */
function isBooleanSwitch(
  allowedValues: (NameValuePairDto | BitFieldDto)[],
): allowedValues is [NameValuePairDto, NameValuePairDto] {
  if (
    allowedValues.length !== 2 ||
    !allowedValues.every((av) => av.type === 'NAME_VALUE_PAIR')
  ) {
    return false;
  }
  const names = allowedValues.map((av) => av.name.toLowerCase());
  return BOOL_SYNONYMS.some(([a, b]) => names.includes(a) && names.includes(b));
}

function isBitField(
  allowedValues: (NameValuePairDto | BitFieldDto)[],
): allowedValues is BitFieldDto[] {
  return allowedValues.length > 0 && allowedValues[0].type === 'BIT_FIELD';
}

/** Recompute combined parent hex from all bitfield child selections. */
function computeBitfieldParentValue(
  _bitFields: BitFieldDto[],
  changedBitMask: string,
  newOptionValue: string,
  currentHex: string,
): string {
  let combined = parseHexOrDec(currentHex);
  const changedMaskNum = parseHexOrDec(changedBitMask);
  const newNum = parseHexOrDec(newOptionValue);

  // Shift value into position by the index of the mask's lowest set bit.
  const shift =
    changedMaskNum === 0 ? 0 : Math.log2(changedMaskNum & -changedMaskNum);
  combined =
    (combined & ~changedMaskNum) | ((newNum << shift) & changedMaskNum);
  return `0x${combined.toString(16).toUpperCase().padStart(8, '0')}`;
}

// ---------------------------------------------------------------------------
// Top-level dispatcher
// ---------------------------------------------------------------------------

export function renderElement(
  elem: AnyElementDto,
  ctx: RenderElementContext,
  indexPath: number[],
): React.ReactNode {
  if (elem.type === 'STRUCT') {
    return renderStruct(elem, ctx, indexPath);
  }
  if (elem.type === 'ELEMENT_TEMPLATE_ARRAY') {
    return renderArray(elem, ctx, indexPath);
  }
  return renderLeaf(elem, ctx, indexPath);
}

// ---------------------------------------------------------------------------
// Struct branch
// ---------------------------------------------------------------------------

function renderStruct(
  elem: StructDto,
  ctx: RenderElementContext,
  indexPath: number[],
): React.ReactNode {
  const nodeId = elementKey(ctx.parameterId, ...ctx.pathPrefix, elem.name);
  const childCtx: RenderElementContext = {
    ...ctx,
    pathPrefix: [...ctx.pathPrefix, elem.name],
  };
  const childNodes = (elem.value ?? []).map((child, i) =>
    renderElement(child, childCtx, [...indexPath, i]),
  );

  return (
    <Tree.NodeProvider
      key={nodeId}
      indexPath={indexPath}
      node={{id: nodeId, name: elem.name} as never}
    >
      <Tree.Branch>
        <Tree.BranchNode>
          <Tree.NodeIndicator />
          <Tree.BranchTrigger />
          <Tree.NodeText>{elem.name}</Tree.NodeText>
        </Tree.BranchNode>
        <Tree.BranchContent>
          <Tree.BranchIndentGuide />
          {childNodes}
        </Tree.BranchContent>
      </Tree.Branch>
    </Tree.NodeProvider>
  );
}

// ---------------------------------------------------------------------------
// Array branch (variable-length or fixed-length table)
// ---------------------------------------------------------------------------

function renderArray(
  elem: ElementTemplateArrayDto,
  ctx: RenderElementContext,
  indexPath: number[],
): React.ReactNode {
  const arrayPath = elementKey(ctx.parameterId, ...ctx.pathPrefix, elem.name);

  // Fixed-length table — render via TableComponent
  if (elem.length !== undefined && !elem.lengthFormula) {
    const tableKey = arrayPath;
    const rows = (elem.value as ConfigElementDto[]).map((inst, i) => ({
      index: i,
      value:
        ctx.elementValues.get(
          elementKey(ctx.parameterId, ...ctx.pathPrefix, inst.name),
        ) ?? inst.value,
    }));
    const originalRows = (elem.value as ConfigElementDto[]).map((inst, i) => ({
      index: i,
      value:
        ctx.committedValues.get(
          elementKey(ctx.parameterId, ...ctx.pathPrefix, inst.name),
        ) ?? inst.value,
    }));
    const isTableDirty = rows.some((r, i) => r.value !== originalRows[i].value);
    const barColor = isTableDirty
      ? 'var(--color-background-support-warning)'
      : 'transparent';

    return (
      <Tree.NodeProvider
        key={elem.name}
        indexPath={indexPath}
        node={{id: tableKey, name: elem.name} as never}
      >
        <Tree.LeafNode className="h-auto min-h-0 items-start">
          <Tree.NodeIndicator />
          <span
            style={{
              alignSelf: 'stretch',
              backgroundColor: barColor,
              borderRadius: '2px',
              flexShrink: 0,
              width: '4px',
            }}
          />
          <div className="flex items-center gap-4 py-2">
            <Tree.NodeText className="wrap-break-word w-60 shrink-0">
              {elem.name}
            </Tree.NodeText>
            <div className="shrink-0">
              <TableComponent
                data={rows}
                disabled={ctx.paramReadOnly}
                nodeId={tableKey}
                onCellChange={(rowIndex, value) => {
                  const inst = (elem.value as ConfigElementDto[])[rowIndex];
                  const instKey = elementKey(
                    ctx.parameterId,
                    ...ctx.pathPrefix,
                    inst.name,
                  );
                  ctx.onValueChange(instKey, value);
                }}
                onDirty={(_id, _dirty) => {}}
                originalData={originalRows}
              />
            </div>
          </div>
        </Tree.LeafNode>
      </Tree.NodeProvider>
    );
  }

  // Variable-length array — collapsible branch, one child per instance
  const count = ctx.arrayCounts.get(arrayPath) ?? elem.value.length;

  // Build instance list: use existing parsed instances up to elem.value.length,
  // then clone from template for any additional instances beyond that.
  const instances: AnyElementDto[] = [];
  for (let i = 0; i < count; i++) {
    if (i < elem.value.length) {
      instances.push(elem.value[i]);
    } else {
      // Synthesise a new instance by cloning template and naming it ${name}[i]
      const templateClone = elem.template[0];
      if (templateClone) {
        const cloned: AnyElementDto =
          templateClone.type === 'STRUCT'
            ? {...templateClone, name: `${elem.name}[${i}]`}
            : templateClone.type === 'CONFIG_ELEMENT'
              ? {...templateClone, name: `${elem.name}[${i}]`}
              : {...templateClone, name: `${elem.name}[${i}]`};
        instances.push(cloned);
      }
    }
  }

  const instanceNodes = instances.map((inst, i) => {
    // Each instance name is already "${arrayName}[i]" for structs.
    // Pass the full path including the instance name as prefix for nested elements.
    const instName = inst.type === 'STRUCT' ? inst.name : `${elem.name}[${i}]`;
    const childCtx: RenderElementContext = {
      ...ctx,
      pathPrefix: [...ctx.pathPrefix, instName],
    };
    return renderElement(inst, childCtx, [...indexPath, i]);
  });

  const instanceCountLabel = `${elem.name} (${count} ${count === 1 ? 'instance' : 'instances'})`;

  return (
    <Tree.NodeProvider
      key={elem.name}
      indexPath={indexPath}
      node={{id: arrayPath, name: elem.name} as never}
    >
      <Tree.Branch>
        <Tree.BranchNode>
          <Tree.NodeIndicator />
          <Tree.BranchTrigger />
          <Tree.NodeText>{instanceCountLabel}</Tree.NodeText>
        </Tree.BranchNode>
        <Tree.BranchContent>
          <Tree.BranchIndentGuide />
          {instanceNodes}
        </Tree.BranchContent>
      </Tree.Branch>
    </Tree.NodeProvider>
  );
}

// ---------------------------------------------------------------------------
// Leaf node (ConfigElementDto)
// ---------------------------------------------------------------------------

function renderLeaf(
  elem: ConfigElementDto,
  ctx: RenderElementContext,
  indexPath: number[],
): React.ReactNode {
  // Policy filtering
  if (elem.policy === 'HIDDEN') {
    return null;
  }
  if (elem.policy === 'BASIC' && !ctx.policyFilter.has('BASIC')) {
    return null;
  }
  if (elem.policy === 'ADVANCED' && !ctx.policyFilter.has('ADVANCED')) {
    return null;
  }

  const key = elementKey(ctx.parameterId, ...ctx.pathPrefix, elem.name);

  // Search filtering
  if (ctx.matchElementKeys && !ctx.matchElementKeys.has(key)) {
    return null;
  }

  const isDirty = ctx.dirtyPaths.has(key);
  const isSet = ctx.setPaths.has(key);
  const barColor = isSet
    ? 'var(--color-background-support-success)'
    : isDirty
      ? 'var(--color-background-support-warning)'
      : 'transparent';

  const dirtyBar = (
    <span
      style={{
        alignSelf: 'stretch',
        backgroundColor: barColor,
        borderRadius: '2px',
        flexShrink: 0,
        width: '4px',
      }}
    />
  );

  const hasRange = elem.min !== undefined && elem.max !== undefined;
  const tooltipLines: string[] = [];
  if (elem.description) {
    tooltipLines.push(elem.description);
  }
  if (hasRange) {
    tooltipLines.push(
      `Range: ${toHexString(elem.min!)} – ${toHexString(elem.max!)}`,
    );
  }

  const labelEl = (
    <Tree.NodeText className="wrap-break-word w-60 shrink-0">
      {elem.name}
    </Tree.NodeText>
  );

  const labelWithTooltip =
    tooltipLines.length > 0 ? (
      <Tooltip.Root positioning={{placement: 'top'}}>
        <Tooltip.Trigger>{labelEl}</Tooltip.Trigger>
        <Tooltip.Positioner style={{zIndex: 50}}>
          <Tooltip.Content>
            <Tooltip.Arrow>
              <Tooltip.ArrowTip />
            </Tooltip.Arrow>
            <div className="whitespace-pre-line text-xs">
              {tooltipLines.join('\n')}
            </div>
          </Tooltip.Content>
        </Tooltip.Positioner>
      </Tooltip.Root>
    ) : (
      labelEl
    );

  const isFile = elem.displayType === 'FILE' || elem.displayType === 'DUMP';
  const isBitFieldElem =
    elem.displayType === 'BIT_FIELD' &&
    elem.allowedValues &&
    isBitField(elem.allowedValues);
  const currentValue = ctx.elementValues.get(key) ?? elem.value;
  const disabled = ctx.paramReadOnly || elem.isReadOnly;

  // ── BIT_FIELD — render as a branch node (matches old bitfield-parent behaviour)
  if (isBitFieldElem) {
    const bitFields = elem.allowedValues as BitFieldDto[];
    return (
      <Tree.NodeProvider
        key={key}
        indexPath={indexPath}
        node={{id: key, name: elem.name} as never}
      >
        <Tree.Branch>
          <Tree.BranchNode>
            <Tree.NodeIndicator />
            <Tree.BranchTrigger />
            {dirtyBar}
            <div className="flex items-center gap-4">
              <Tree.NodeText className="wrap-break-word w-60 shrink-0">
                {elem.name}
              </Tree.NodeText>
              <span className="font-mono text-sm">{currentValue}</span>
            </div>
          </Tree.BranchNode>
          <Tree.BranchContent>
            <Tree.BranchIndentGuide />
            {bitFields.map((bf, bi) => (
              <BitFieldRow
                key={bf.bitMask}
                bf={bf}
                ctx={ctx}
                disabled={disabled}
                indexPath={[...indexPath, bi]}
                parentKey={key}
                parentValue={currentValue}
              />
            ))}
          </Tree.BranchContent>
        </Tree.Branch>
      </Tree.NodeProvider>
    );
  }

  const control = renderControl(elem, key, currentValue, disabled, ctx);

  // Range hint — always shown as hex to match the hex values in the inputs.
  // Q-format also shows hex (decimal conversion is available in the dual input
  // itself).
  const rangeHintText =
    ctx.showRanges && hasRange
      ? `Range: ${toHexString(elem.min!)} – ${toHexString(elem.max!)}`
      : null;

  if (isFile) {
    return (
      <Tree.NodeProvider
        key={key}
        indexPath={indexPath}
        node={{id: key, name: elem.name} as never}
      >
        <Tree.LeafNode className="h-auto min-h-0 items-start">
          <Tree.NodeIndicator />
          {dirtyBar}
          <div className="flex w-full min-w-0 flex-col gap-1 py-1">
            {labelWithTooltip}
            <div className="w-full">{control}</div>
          </div>
        </Tree.LeafNode>
      </Tree.NodeProvider>
    );
  }

  return (
    <Tree.NodeProvider
      key={key}
      indexPath={indexPath}
      node={{id: key, name: elem.name} as never}
    >
      <Tree.LeafNode
        className={
          rangeHintText ? 'h-auto min-h-0 items-start py-1' : undefined
        }
      >
        <Tree.NodeIndicator />
        {dirtyBar}
        <div className="flex flex-col gap-0.5 py-0.5">
          <div className="flex items-center gap-4">
            {labelWithTooltip}
            <div className="shrink-0">{control}</div>
          </div>
          {rangeHintText && (
            <div className="pl-64 text-xs text-muted-foreground">
              {rangeHintText}
            </div>
          )}
        </div>
      </Tree.LeafNode>
    </Tree.NodeProvider>
  );
}

// ---------------------------------------------------------------------------
// Control dispatch
// ---------------------------------------------------------------------------

function renderControl(
  elem: ConfigElementDto,
  key: string,
  currentValue: string,
  disabled: boolean,
  ctx: RenderElementContext,
): React.ReactNode {
  const {onValueChange} = ctx;

  // FILE / DUMP
  if (elem.displayType === 'FILE' || elem.displayType === 'DUMP') {
    return (
      <TextArea
        defaultValue={currentValue}
        inputProps={{
          rows: 6,
          style: {fontFamily: 'monospace', resize: 'vertical'},
        }}
        readOnly
        size="sm"
      />
    );
  }

  // SWITCH (exactly 2 NameValuePair options with boolean synonym names)
  if (elem.allowedValues && isBooleanSwitch(elem.allowedValues)) {
    const [off, on] = elem.allowedValues;
    return (
      <SwitchControl
        currentValue={currentValue}
        disabled={disabled}
        elementKey={key}
        offValue={off.value}
        onValue={on.value}
        onValueChange={onValueChange}
      />
    );
  }

  // SELECT (3+ NameValuePair options)
  if (
    elem.allowedValues &&
    elem.allowedValues.length > 0 &&
    elem.allowedValues[0].type === 'NAME_VALUE_PAIR'
  ) {
    const options = elem.allowedValues as NameValuePairDto[];
    return (
      <SelectControl
        currentValue={currentValue}
        disabled={disabled}
        elementKey={key}
        onValueChange={onValueChange}
        options={options}
      />
    );
  }

  // Q_FORMATTED_VALUE
  if (
    (elem.displayType === 'Q_FORMATTED_VALUE' || elem.qFormat) &&
    elem.displayType !== 'DROP_DOWN'
  ) {
    const n = parseQFormatN(elem.qFormat ?? 'Q15');
    return (
      <QFormatControl
        currentValue={currentValue}
        disabled={disabled}
        elementKey={key}
        onValueChange={onValueChange}
        qFormatN={n}
      />
    );
  }

  // Default: hex TextInput
  return (
    <HexInputControl
      currentValue={currentValue}
      disabled={disabled}
      elementKey={key}
      onValueChange={onValueChange}
    />
  );
}

// ---------------------------------------------------------------------------
// Individual controls
// ---------------------------------------------------------------------------

function SwitchControl({
  currentValue,
  disabled,
  elementKey: key,
  offValue,
  onValue,
  onValueChange,
}: {
  currentValue: string;
  disabled: boolean;
  elementKey: string;
  offValue: string;
  onValue: string;
  onValueChange: (key: string, value: string) => void;
}) {
  const [checked, setChecked] = useState(currentValue === onValue);
  useEffect(() => {
    setChecked(currentValue === onValue);
  }, [currentValue, onValue]);
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Switch
        aria-label={key}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(isChecked) => {
          setChecked(isChecked);
          onValueChange(key, isChecked ? onValue : offValue);
        }}
        size="sm"
      />
    </div>
  );
}

function SelectControl({
  currentValue,
  disabled,
  elementKey: key,
  onValueChange,
  options,
}: {
  currentValue: string;
  disabled: boolean;
  elementKey: string;
  onValueChange: (key: string, value: string) => void;
  options: NameValuePairDto[];
}) {
  const selectedName = findOptionName(options, currentValue);
  const [selected, setSelected] = useState(selectedName);
  const names = options.map((o) => o.name);
  const collection = selectCollection({items: names});
  const longestName = names.reduce((a, b) => (a.length > b.length ? a : b), '');
  const hexDisplay = options.find((o) => o.name === selected)?.value ?? '';

  return (
    <div className="flex items-center">
      <Select
        aria-label={key}
        clearable={false}
        collection={collection}
        disabled={disabled}
        onValueChange={(details) => {
          const newName = details[0];
          if (!newName) {
            return;
          }
          setSelected(newName);
          const newHex =
            options.find((o) => o.name === newName)?.value ?? currentValue;
          onValueChange(key, newHex);
        }}
        positionerProps={{className: 'min-w-max'}}
        size="sm"
        style={{minWidth: `calc(${longestName.length}ch + 3rem)`}}
        value={[selected]}
        valueTextProps={{className: 'whitespace-nowrap'}}
      />
      {hexDisplay && (
        <span className="ml-4 font-mono text-sm">{hexDisplay}</span>
      )}
    </div>
  );
}

function QFormatControl({
  currentValue,
  disabled,
  elementKey: key,
  onValueChange,
  qFormatN,
}: {
  currentValue: string;
  disabled: boolean;
  elementKey: string;
  onValueChange: (key: string, value: string) => void;
  qFormatN: number;
}) {
  const [hexVal, setHexVal] = useState(currentValue);
  const [decVal, setDecVal] = useState(
    (parseHexOrDec(currentValue) / Math.pow(2, qFormatN)).toFixed(3),
  );
  const hexTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const decTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return (
    <div className="flex items-center gap-2">
      <TextInput
        aria-label={`${key} hex`}
        className="w-28"
        clearable={false}
        disabled={disabled}
        onValueChange={(value) => {
          setHexVal(value);
          const num = parseHexOrDec(value);
          if (!isNaN(num)) {
            setDecVal((num / Math.pow(2, qFormatN)).toFixed(3));
          }
          if (hexTimerRef.current) {
            clearTimeout(hexTimerRef.current);
          }
          hexTimerRef.current = setTimeout(
            () => onValueChange(key, value),
            100,
          );
        }}
        size="sm"
        value={hexVal}
      />
      <TextInput
        aria-label={`${key} dec`}
        className="w-24"
        clearable={false}
        disabled={disabled}
        onValueChange={(value) => {
          setDecVal(value);
          const num = parseFloat(value);
          if (!isNaN(num)) {
            const newHex = `0x${Math.round(num * Math.pow(2, qFormatN))
              .toString(16)
              .padStart(8, '0')}`;
            setHexVal(newHex);
            if (decTimerRef.current) {
              clearTimeout(decTimerRef.current);
            }
            decTimerRef.current = setTimeout(
              () => onValueChange(key, newHex),
              100,
            );
          }
        }}
        size="sm"
        value={decVal}
      />
    </div>
  );
}

function HexInputControl({
  currentValue,
  disabled,
  elementKey: key,
  onValueChange,
}: {
  currentValue: string;
  disabled: boolean;
  elementKey: string;
  onValueChange: (key: string, value: string) => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (
    <TextInput
      aria-label={key}
      className="w-32"
      clearable={false}
      defaultValue={currentValue}
      disabled={disabled}
      onValueChange={(value) => {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }
        timerRef.current = setTimeout(() => onValueChange(key, value), 100);
      }}
      size="sm"
    />
  );
}

/** Single bitfield row — rendered as a Tree.LeafNode inside the BIT_FIELD branch. */
function BitFieldRow({
  bf,
  ctx,
  disabled,
  indexPath,
  parentKey,
  parentValue,
}: {
  bf: BitFieldDto;
  ctx: RenderElementContext;
  disabled: boolean;
  indexPath: number[];
  parentKey: string;
  parentValue: string;
}) {
  const bfKey = `${parentKey}/${bf.bitMask}`;
  const currentParentHex = ctx.elementValues.get(parentKey) ?? parentValue;

  // Derive current bitfield selection from parent hex
  const maskNum = parseHexOrDec(bf.bitMask);
  const parentNum = parseHexOrDec(currentParentHex);
  const currentBfNum = maskNum > 0 ? (parentNum & maskNum) / maskNum : 0;
  const currentBfValueHex = `0x${currentBfNum.toString(16).toUpperCase().padStart(8, '0')}`;

  const names = bf.allowedValues.map((av) => av.name);
  const collection = selectCollection({items: names});
  const selectedName =
    findOptionName(bf.allowedValues, currentBfValueHex) ||
    (bf.allowedValues[0]?.name ?? '');
  const [selected, setSelected] = useState(selectedName);
  const longestName = names.reduce((a, b) => (a.length > b.length ? a : b), '');

  return (
    <Tree.NodeProvider
      indexPath={indexPath}
      node={{id: bfKey, name: bf.name} as never}
    >
      <Tree.LeafNode>
        <Tree.NodeIndicator />
        <div className="flex items-center gap-4">
          <Tree.NodeText className="wrap-break-word w-60 shrink-0">
            {bf.name}
          </Tree.NodeText>
          <Select
            aria-label={bf.name}
            clearable={false}
            collection={collection}
            disabled={disabled}
            onValueChange={(details) => {
              const newName = details[0];
              if (!newName) {
                return;
              }
              setSelected(newName);
              const newOptionHex =
                bf.allowedValues.find((av) => av.name === newName)?.value ??
                '0x0';
              const newParentHex = computeBitfieldParentValue(
                [bf],
                bf.bitMask,
                newOptionHex,
                ctx.elementValues.get(parentKey) ?? parentValue,
              );
              ctx.onValueChange(bfKey, newOptionHex);
              ctx.onValueChange(parentKey, newParentHex);
            }}
            positionerProps={{className: 'min-w-max'}}
            size="sm"
            style={{minWidth: `calc(${longestName.length}ch + 3rem)`}}
            value={[selected]}
            valueTextProps={{className: 'whitespace-nowrap'}}
          />
        </div>
      </Tree.LeafNode>
    </Tree.NodeProvider>
  );
}

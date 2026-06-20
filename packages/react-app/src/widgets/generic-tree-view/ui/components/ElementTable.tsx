/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';

import {createColumnHelper, getCoreRowModel} from '@qualcomm-ui/core/table';
import {Button} from '@qualcomm-ui/react/button';
import {flexRender, Table, useReactTable} from '@qualcomm-ui/react/table';
import {TextInput} from '@qualcomm-ui/react/text-input';

interface TableRowData {
  index: number;
  value: string;
}

const columnHelper = createColumnHelper<TableRowData>();

interface TableComponentProps {
  /** Current (possibly persisted) row data — used for display. */
  data: Array<{index: number; value: string}>;
  disabled?: boolean;
  nodeId: string;
  /** Called whenever a cell value changes so the parent can persist it. */
  onCellChange: (rowIndex: number, value: string) => void;
  onDirty: (nodeId: string, isDirty: boolean) => void;
  /** Original row data from the data source — used for dirty comparison. */
  originalData: Array<{index: number; value: string}>;
}

export function TableComponent({
  data,
  disabled,
  nodeId,
  onCellChange,
  onDirty,
  originalData,
}: TableComponentProps) {
  const tableData = useMemo(() => data, [data]);

  // Initialise dirtyRows by comparing current data against the original so
  // that the dirty indicator is correct when the component remounts with
  // previously-persisted data.
  const [dirtyRows, setDirtyRows] = useState<Set<number>>(() => {
    const dirty = new Set<number>();
    data.forEach((row, i) => {
      if (row.value !== (originalData[i]?.value ?? '')) {
        dirty.add(i);
      }
    });
    return dirty;
  });

  // Keep a stable ref to onCellChange so that handleCellChange (and therefore
  // `columns`) never needs to be recreated on every render. Without this,
  // the table remounts on each keystroke and the focused cell loses focus.
  const onCellChangeRef = useRef(onCellChange);
  useEffect(() => {
    onCellChangeRef.current = onCellChange;
  }, [onCellChange]);

  // Per-row debounce timers for persistence.
  const debounceTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  // Always compare against the original value so that reverting a cell to its
  // original value clears the dirty flag correctly.
  // Dirty state is updated immediately; persistence is debounced (300 ms).
  const handleCellChange = useCallback(
    (rowIndex: number, newValue: string) => {
      const originalValue = originalData[rowIndex]?.value ?? '';
      setDirtyRows((prev) => {
        const next = new Set(prev);
        if (newValue !== originalValue) {
          next.add(rowIndex);
        } else {
          next.delete(rowIndex);
        }
        return next;
      });

      // Debounce the persistence call so rapid keystrokes don't trigger
      // expensive parent state updates on every character.
      const existing = debounceTimers.current.get(rowIndex);
      if (existing) {
        clearTimeout(existing);
      }
      const timer = setTimeout(() => {
        onCellChangeRef.current(rowIndex, newValue);
        debounceTimers.current.delete(rowIndex);
      }, 100);
      debounceTimers.current.set(rowIndex, timer);
    },
    [originalData], // stable — does NOT depend on onCellChange
  );

  // Propagate dirty state whenever the set of dirty rows changes.
  useEffect(() => {
    onDirty(nodeId, dirtyRows.size > 0);
  }, [dirtyRows, nodeId, onDirty]);

  const columns = useMemo(
    () => [
      columnHelper.accessor('index', {
        cell: (info) => info.getValue(),
        header: () => 'Index',
      }),
      columnHelper.accessor('value', {
        cell: (info) => (
          <div className="w-full">
            <TextInput
              aria-label={`element value row ${info.row.index}`}
              clearable={false}
              defaultValue={info.getValue()}
              disabled={disabled}
              onValueChange={(value) => handleCellChange(info.row.index, value)}
              size="sm"
            />
          </div>
        ),
        header: () => 'Element Value',
      }),
    ],
    [handleCellChange, disabled],
  );

  const table = useReactTable({
    columns,
    data: tableData,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="flex items-start gap-2">
      <div className="w-full">
        <Table.Root size="sm">
          <Table.ScrollContainer className="max-h-[250px] overflow-x-hidden">
            <Table.Table>
              <Table.Header>
                {table.getHeaderGroups().map((headerGroup) => (
                  <Table.Row key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <Table.HeaderCell
                        key={header.id}
                        style={{
                          width: header.column.id === 'index' ? '33%' : '67%',
                        }}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                      </Table.HeaderCell>
                    ))}
                  </Table.Row>
                ))}
              </Table.Header>
              <Table.Body>
                {table.getRowModel().rows.map((row) => (
                  <Table.Row key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <Table.Cell
                        key={cell.id}
                        style={{
                          width: cell.column.id === 'index' ? '33%' : '67%',
                        }}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </Table.Cell>
                    ))}
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Table>
          </Table.ScrollContainer>
        </Table.Root>
      </div>
      <div className="flex h-[250px] items-center">
        &emsp;
        <Button size="sm">Import</Button>
      </div>
    </div>
  );
}

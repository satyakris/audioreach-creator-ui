/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

jest.mock('~shared/lib/logger');

import {render, screen} from '@testing-library/react';

import type {CalDataDto} from '~entities/spf-module-cal-data';
import {GenericTreeView} from '~widgets/generic-tree-view';

// ── QUI mocks not already in test-setup ──────────────────────────────────────
//
// @qualcomm-ui/core/* packages are ESM-only and cannot be processed by Jest's
// ts-jest transform without adding them to transformIgnorePatterns (which would
// be a global config change). Mocking them in the test is the pattern the
// rest of the repo uses for QUI components. Only the subset actually imported
// by GenericTreeView and its sub-components is mocked here.

jest.mock('@qualcomm-ui/core/tree', () => ({
  createTreeCollection: jest.fn(() => ({items: [], rootNode: null})),
}));

jest.mock('@qualcomm-ui/core/select', () => ({
  selectCollection: jest.fn(() => ({items: []})),
}));

jest.mock('@qualcomm-ui/core/table', () => ({
  createColumnHelper: jest.fn(() => ({
    accessor: jest.fn(() => ({})),
    display: jest.fn(() => ({})),
  })),
  getCoreRowModel: jest.fn(() => () => ({})),
}));

// Tree — used in ParameterListPanel, ElementTree, LegacyView
jest.mock('@qualcomm-ui/react/tree', () => ({
  Tree: {
    Label: ({children}: {children?: React.ReactNode}) => (
      <div data-testid="tree-label">{children}</div>
    ),
    LeafNode: ({children}: {children?: React.ReactNode}) => (
      <div data-testid="tree-leaf">{children}</div>
    ),
    NodeIndicator: () => null,
    NodeProvider: ({children}: {children?: React.ReactNode}) => (
      <div>{children}</div>
    ),
    NodeText: ({children}: {children?: React.ReactNode}) => (
      <span data-testid="tree-node-text">{children}</span>
    ),
    Root: ({children}: {children?: React.ReactNode}) => (
      <div data-testid="tree-root">{children}</div>
    ),
  },
}));

// Tooltip — test-setup mocks Tooltip as a single function; the widget uses
// Tooltip.Root / .Trigger / .Positioner / .Content / .Arrow / .ArrowTip.
// Override with the sub-component form.
jest.mock('@qualcomm-ui/react/tooltip', () => ({
  Tooltip: {
    Arrow: () => null,
    ArrowTip: () => null,
    Content: ({children}: {children?: React.ReactNode}) => (
      <div>{children}</div>
    ),
    Positioner: ({children}: {children?: React.ReactNode}) => (
      <div>{children}</div>
    ),
    Root: ({children}: {children?: React.ReactNode}) => <div>{children}</div>,
    Trigger: ({children}: {children?: React.ReactNode}) => (
      <div>{children}</div>
    ),
  },
}));

// SegmentedControl — used in Toolbar
jest.mock('@qualcomm-ui/react/segmented-control', () => ({
  SegmentedControl: {
    Item: ({text}: {text?: string}) => <button type="button">{text}</button>,
    Root: ({children}: {children?: React.ReactNode}) => (
      <div data-testid="segmented-control">{children}</div>
    ),
  },
}));

// Override the global TextInput mock to also filter startIcon (a non-DOM prop
// passed by Toolbar) — prevents the "React does not recognize startIcon" warning.
jest.mock('@qualcomm-ui/react/text-input', () => ({
  TextInput: ({
    clearable: _clearable,
    defaultValue: _defaultValue,
    endIcon: _endIcon,
    errorText: _errorText,
    fullWidth: _fullWidth,
    hint: _hint,
    inputProps: _inputProps,
    label: _label,
    onBlur: _onBlur,
    onClear: _onClear,
    onFocus: _onFocus,
    onValueChange,
    placeholder,
    readOnly: _readOnly,
    size: _size,
    startIcon: _startIcon,
    value,
    ...rest
  }: {
    [k: string]: unknown;
    clearable?: boolean;
    defaultValue?: string;
    endIcon?: unknown;
    errorText?: string;
    fullWidth?: boolean;
    hint?: string;
    inputProps?: Record<string, unknown>;
    label?: string;
    onBlur?: () => void;
    onClear?: () => void;
    onFocus?: () => void;
    onValueChange?: (v: string) => void;
    placeholder?: string;
    readOnly?: boolean;
    size?: string;
    startIcon?: unknown;
    value?: string;
  }) => (
    <input
      onChange={(e) => onValueChange?.(e.target.value)}
      placeholder={placeholder}
      type="text"
      value={value ?? ''}
      {...(rest as React.InputHTMLAttributes<HTMLInputElement>)}
    />
  ),
}));

// Switch — used in Toolbar
jest.mock('@qualcomm-ui/react/switch', () => ({
  Switch: ({label}: {label?: string}) => (
    <label>
      <input type="checkbox" />
      {label}
    </label>
  ),
}));

// Badge / StatusBadge — used in ParameterDetailPane and ParameterListPanel
jest.mock('@qualcomm-ui/react/badge', () => ({
  Badge: ({children}: {children?: React.ReactNode}) => (
    <span data-testid="badge">{children}</span>
  ),
  StatusBadge: () => <span data-testid="status-badge" />,
}));

// Accordion — used in ParameterDetailPane
jest.mock('@qualcomm-ui/react/accordion', () => ({
  Accordion: {
    Item: ({children}: {children?: React.ReactNode}) => <div>{children}</div>,
    ItemContent: ({children}: {children?: React.ReactNode}) => (
      <div>{children}</div>
    ),
    ItemIndicator: () => null,
    ItemRoot: ({children}: {children?: React.ReactNode}) => (
      <div>{children}</div>
    ),
    ItemTrigger: ({children}: {children?: React.ReactNode}) => (
      <button type="button">{children}</button>
    ),
    Root: ({children}: {children?: React.ReactNode}) => (
      <div data-testid="accordion">{children}</div>
    ),
  },
}));

// Select — used in renderElement (enum fields)
jest.mock('@qualcomm-ui/react/select', () => ({
  Select: {
    Content: ({children}: {children?: React.ReactNode}) => (
      <div>{children}</div>
    ),
    Item: ({children}: {children?: React.ReactNode}) => <div>{children}</div>,
    ItemText: ({children}: {children?: React.ReactNode}) => (
      <span>{children}</span>
    ),
    Positioner: ({children}: {children?: React.ReactNode}) => (
      <div>{children}</div>
    ),
    Root: ({children}: {children?: React.ReactNode}) => (
      <div data-testid="select-root">{children}</div>
    ),
    Trigger: ({children}: {children?: React.ReactNode}) => (
      <button type="button">{children}</button>
    ),
    ValueText: ({children}: {children?: React.ReactNode}) => (
      <span>{children}</span>
    ),
  },
}));

// TextArea — used in renderElement (long text fields)
jest.mock('@qualcomm-ui/react/text-area', () => ({
  TextArea: ({
    onChange,
    value,
  }: {
    onChange?: React.ChangeEventHandler<HTMLTextAreaElement>;
    value?: string;
  }) => <textarea onChange={onChange} value={value} />,
}));

// Table — used in ElementTable (fixed-length array tables)
jest.mock('@qualcomm-ui/react/table', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  flexRender: (cell: any) =>
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
    typeof cell === 'function' ? (cell({}) as React.ReactNode) : cell,
  Table: ({children}: {children?: React.ReactNode}) => (
    <table data-testid="qui-table">{children}</table>
  ),
  useReactTable: jest.fn(() => ({
    getHeaderGroups: jest.fn(() => []),
    getRowModel: jest.fn(() => ({rows: []})),
  })),
}));

// ── jsdom polyfills ───────────────────────────────────────────────────────────
// jsdom does not implement scrollIntoView; stub it so the ParameterDetailPane
// useEffect does not throw when it tries to scroll a newly selected parameter
// into view.
beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GenericTreeView (smoke)', () => {
  it('renders a parameter name from a populated minimal DTO without throwing', () => {
    const data: CalDataDto = {
      changeInfo: {changeType: 'NONE'},
      Ckv: [],
      parameters: [
        {
          changeInfo: {changeType: 'NONE'},
          elements: [
            {
              isReadOnly: false,
              name: 'enable',
              type: 'CONFIG_ELEMENT',
              value: '0x00000001',
            },
          ],
          name: 'TestParam',
          parameterId: '0x800107C',
          systemId: 'p-1',
        },
      ],
      systemId: 'sys-1',
    };

    render(
      <GenericTreeView
        data={data}
        moduleName="TestModule"
        onGet={jest.fn()}
        onSet={jest.fn()}
      />,
    );

    // TestParam appears in both the list panel and the detail pane header
    expect(screen.getAllByText('TestParam').length).toBeGreaterThan(0);
  });

  it('renders an empty module without throwing', () => {
    const empty: CalDataDto = {
      changeInfo: {changeType: 'NONE'},
      Ckv: [],
      parameters: [],
      systemId: 's',
    };

    const {container} = render(
      <GenericTreeView
        data={empty}
        moduleName="EmptyModule"
        onGet={jest.fn()}
        onSet={jest.fn()}
      />,
    );

    expect(container).toBeInTheDocument();
  });
});

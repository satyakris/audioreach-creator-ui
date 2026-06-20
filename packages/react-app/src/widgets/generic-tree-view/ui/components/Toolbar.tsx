/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Copy,
  List,
  MonitorSpeaker,
  Search,
} from 'lucide-react';

import {Button} from '@qualcomm-ui/react/button';
import {ProgressRing} from '@qualcomm-ui/react/progress-ring';
import {SegmentedControl} from '@qualcomm-ui/react/segmented-control';
import {Switch} from '@qualcomm-ui/react/switch';
import {TextInput} from '@qualcomm-ui/react/text-input';

interface ToolbarProps {
  canGet: boolean;
  canSet: boolean;
  isExpanding?: boolean;
  onBatchCopy: () => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onGet: () => void;
  onPolicyFilterChange: (filter: Set<'BASIC' | 'ADVANCED'>) => void;
  onSearchChange: (text: string) => void;
  onSet: () => void;
  onShowBadgesChange: (show: boolean) => void;
  onShowPidsChange: (show: boolean) => void;
  onShowRangesChange: (show: boolean) => void;
  onViewModeChange: (mode: 'modern' | 'legacy') => void;
  policyFilter: Set<'BASIC' | 'ADVANCED'>;
  searchText: string;
  showBadges: boolean;
  showPids: boolean;
  showRanges: boolean;
  viewMode: 'modern' | 'legacy';
}

export function Toolbar({
  canGet,
  canSet,
  isExpanding = false,
  onBatchCopy,
  onCollapseAll,
  onExpandAll,
  onGet,
  onPolicyFilterChange,
  onSearchChange,
  onSet,
  onShowBadgesChange,
  onShowPidsChange,
  onShowRangesChange,
  onViewModeChange,
  policyFilter,
  searchText,
  showBadges,
  showPids,
  showRanges,
  viewMode,
}: ToolbarProps) {
  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-1.5 border-b px-3 py-1"
      style={{backgroundColor: 'var(--color-surface-primary)'}}
    >
      {/* Search */}
      <TextInput
        aria-label="Search"
        clearable
        onValueChange={onSearchChange}
        placeholder="Search…"
        size="sm"
        startIcon={Search}
        style={{width: '16rem'}}
        value={searchText}
      />

      <div className="mx-0.5 my-1 w-px self-stretch bg-border" />

      {/* Policy filter */}
      <SegmentedControl.Root
        multiple
        onValueChange={(values: string[] | null | undefined) =>
          onPolicyFilterChange(
            new Set((values ?? []) as ('BASIC' | 'ADVANCED')[]),
          )
        }
        size="sm"
        value={Array.from(policyFilter)}
      >
        <SegmentedControl.Item text="Basic" value="BASIC" />
        <SegmentedControl.Item text="Advanced" value="ADVANCED" />
      </SegmentedControl.Root>

      <div className="mx-0.5 my-1 w-px self-stretch bg-border" />

      {/* Collapse / Expand */}
      <Button onClick={onCollapseAll} size="sm" variant="ghost">
        <ChevronUp size={12} />
        Collapse All
      </Button>
      <Button
        disabled={isExpanding}
        onClick={onExpandAll}
        size="sm"
        variant="ghost"
      >
        {isExpanding ? <ProgressRing size="xxs" /> : <ChevronDown size={12} />}
        Expand All
      </Button>

      <div className="mx-0.5 my-1 w-px self-stretch bg-border" />

      {/* View mode toggle */}
      <Button
        onClick={() =>
          onViewModeChange(viewMode === 'modern' ? 'legacy' : 'modern')
        }
        size="sm"
        variant="ghost"
      >
        {viewMode === 'modern' ? (
          <>
            <List size={12} />
            Legacy
          </>
        ) : (
          <>
            <MonitorSpeaker size={12} />
            Modern
          </>
        )}
      </Button>

      <div className="mx-0.5 my-1 w-px self-stretch bg-border" />

      {/* Toggles — modern view only */}
      {viewMode === 'modern' &&
        (
          [
            {checked: showPids, label: 'PIDs', onChange: onShowPidsChange},
            {
              checked: showRanges,
              label: 'Ranges',
              onChange: onShowRangesChange,
            },
            {
              checked: showBadges,
              label: 'Badges',
              onChange: onShowBadgesChange,
            },
          ] as const
        ).map(({checked, label, onChange}) => (
          <Switch
            key={label}
            checked={checked}
            label={label}
            onCheckedChange={onChange}
            size="sm"
          />
        ))}

      <div className="flex-1" />

      {/* Actions */}
      <Button disabled={!canGet} onClick={onGet} size="sm" variant="ghost">
        <ArrowUp size={12} />
        Get
      </Button>
      <Button disabled={!canSet} onClick={onSet} size="sm" variant="ghost">
        <ArrowDown size={12} />
        Set
      </Button>
      <Button onClick={onBatchCopy} size="sm" variant="ghost">
        <Copy size={12} />
        Batch Copy
      </Button>
    </div>
  );
}

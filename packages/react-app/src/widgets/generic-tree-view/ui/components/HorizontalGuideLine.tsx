/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

// Horizontal connector that bridges from the vertical indent guide to the
// start of the node's content area.
export const HorizontalConnector = () => (
  <span
    className="pointer-events-none absolute top-1/2 h-px -translate-y-1/2"
    style={{
      backgroundColor: 'var(--color-background-support-neutral-medium)',
      left: 'calc(1px + var(--indent-spacing, 22px) * (var(--depth, 2) - 1))',
      width:
        'calc(var(--indent-spacing, 22px) + var(--spacing-100, 16px) - 1px)',
    }}
  />
);

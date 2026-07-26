/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export type SessionMode =
  | 'DESIGNER'
  | 'DIFF_MERGE'
  | 'DISCOVERY_WIZARD'
  | 'READONLY'
  | 'TUNING';

export interface SessionResponseDto {
  projectId: string;
  sessionMode: SessionMode;
  summary: string;
}

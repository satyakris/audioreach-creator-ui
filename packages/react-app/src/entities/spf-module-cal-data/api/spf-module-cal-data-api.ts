/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {type ApiResult, httpClient} from '~shared/api';

import type {
  CalDataDto,
  UpdateSpfModuleCalDataRequest,
} from '../model/spf-module-cal-data.dto';

export async function getCalData(
  projectId: string,
  spfModuleSystemId: string,
  ckvSystemId: string,
): Promise<ApiResult<CalDataDto>> {
  return httpClient.get<CalDataDto>(
    `/projects/${projectId}/spf-modules/${spfModuleSystemId}/cal-data/${ckvSystemId}`,
  );
}

export async function queryFirstCkvSystemId(
  projectId: string,
  spfModuleSystemId: string,
): Promise<ApiResult<string>> {
  const result = await httpClient.post<
    Array<{ckvs?: Array<{systemId: string}>}>
  >(`/projects/${projectId}/spf-modules/query?include=ckvs`, {
    systemIds: [spfModuleSystemId],
  });

  if (!result.success) {
    return {errors: result.errors, message: result.message, success: false};
  }

  const systemId = result.data?.[0]?.ckvs?.[0]?.systemId;
  if (systemId) {
    return {data: systemId, message: result.message, success: true};
  }

  return {
    message: `No CKV found for SPF module ${spfModuleSystemId}`,
    success: false,
  };
}

export async function putCalData(
  projectId: string,
  spfModuleSystemId: string,
  ckvSystemId: string,
  payload: UpdateSpfModuleCalDataRequest,
): Promise<ApiResult<CalDataDto>> {
  return httpClient.put<CalDataDto>(
    `/projects/${projectId}/spf-modules/${spfModuleSystemId}/cal-data/${ckvSystemId}`,
    payload,
    {retries: 0},
  );
}

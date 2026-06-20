/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {type ApiResult, httpClient} from '~shared/api';
import {logger} from '~shared/lib/logger';

import type {
  CalDataDto,
  UpdateSpfModuleCalDataRequest,
} from '../model/spf-module-cal-data.dto';

export async function getCalData(
  projectId: string,
  spfModuleSystemId: string,
  ckvSystemId: string,
): Promise<ApiResult<CalDataDto>> {
  const endpoint = `/projects/${projectId}/spf-modules/${spfModuleSystemId}/cal-data/${ckvSystemId}`;
  // [cal-data-debug] GET boundary — log the exact path + IDs sent to backend
  logger.info(
    `[cal-data-debug] getCalData GET ${endpoint} ` +
      `(projectId=${projectId}, spfModuleSystemId=${spfModuleSystemId}, ckvSystemId=${ckvSystemId})`,
    {
      action: 'getCalData',
      component: 'spfModuleCalDataApi',
      tag: 'cal-data-debug',
    },
  );
  const result = await httpClient.get<CalDataDto>(endpoint);
  logger.info(
    `[cal-data-debug] getCalData response success=${result.success} ` +
      `message=${result.message}`,
    {
      action: 'getCalData',
      component: 'spfModuleCalDataApi',
      tag: 'cal-data-debug',
    },
  );
  return result;
}

export async function queryFirstCkvSystemId(
  projectId: string,
  spfModuleSystemId: string,
): Promise<ApiResult<string>> {
  const endpoint = `/projects/${projectId}/spf-modules/query?include=ckvs`;
  const body = {systemIds: [spfModuleSystemId]};
  // [cal-data-debug] CKV-query boundary — log the exact POST body sent to backend.
  // The backend parses each systemId with Number.parseInt and returns 422 on a
  // non-numeric value, so the literal id value here is the key thing to verify.
  logger.info(
    `[cal-data-debug] queryFirstCkvSystemId POST ${endpoint} ` +
      `body=${JSON.stringify(body)} (projectId=${projectId})`,
    {
      action: 'queryFirstCkvSystemId',
      component: 'spfModuleCalDataApi',
      tag: 'cal-data-debug',
    },
  );
  const result = await httpClient.post<
    Array<{ckvs?: Array<{systemId: string}>}>
  >(endpoint, body);

  if (!result.success) {
    logger.error(
      `[cal-data-debug] queryFirstCkvSystemId FAILED ` +
        `success=false message=${result.message} ` +
        `errors=${JSON.stringify(result.errors)}`,
      {
        action: 'queryFirstCkvSystemId',
        component: 'spfModuleCalDataApi',
        error: result.message,
        tag: 'cal-data-debug',
      },
    );
    return {errors: result.errors, message: result.message, success: false};
  }

  const firstModule = result.data?.[0];
  const ckvs = firstModule?.ckvs;
  const firstCkv = ckvs?.[0];
  const systemId = firstCkv?.systemId;
  // [cal-data-debug] Log the raw query response shape so the backend team can
  // see how many modules/ckvs came back and which systemId was picked.
  logger.info(
    `[cal-data-debug] queryFirstCkvSystemId response ` +
      `moduleCount=${result.data?.length ?? 0} ` +
      `ckvCount=${ckvs?.length ?? 0} ` +
      `resolvedCkvSystemId=${systemId ?? '<none>'} ` +
      `rawData=${JSON.stringify(result.data)}`,
    {
      action: 'queryFirstCkvSystemId',
      component: 'spfModuleCalDataApi',
      tag: 'cal-data-debug',
    },
  );
  // [cal-data-debug] Log the CKV array and the first CKV object explicitly, plus
  // the list of every ckv systemId, so the chosen value can be verified against
  // what the backend expects for the cal-data GET path.
  logger.info(
    `[cal-data-debug] queryFirstCkvSystemId ckvs=${JSON.stringify(ckvs)} ` +
      `firstCkv=${JSON.stringify(firstCkv)} ` +
      `allCkvSystemIds=${JSON.stringify(ckvs?.map((c) => c.systemId) ?? [])}`,
    {
      action: 'queryFirstCkvSystemId',
      component: 'spfModuleCalDataApi',
      tag: 'cal-data-debug',
    },
  );
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

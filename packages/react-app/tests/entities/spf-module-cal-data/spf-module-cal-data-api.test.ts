/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

jest.mock('~shared/lib/logger');

import {
  getCalData,
  putCalData,
  queryFirstCkvSystemId,
} from '~entities/spf-module-cal-data';
import {type ApiResult, httpClient} from '~shared/api';

jest.mock('~shared/api', () => ({
  httpClient: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
  },
}));

const mockGet = httpClient.get as jest.Mock;
const mockPost = httpClient.post as jest.Mock;
const mockPut = httpClient.put as jest.Mock;

const PROJECT_ID = 'proj-1';
const MODULE_ID = 'mod-1';
const CKV_ID = 'ckv-1';

describe('spf-module-cal-data API', () => {
  describe('getCalData', () => {
    it('calls httpClient.get with the correct URL', async () => {
      const expected: ApiResult = {data: {}, message: 'OK', success: true};
      mockGet.mockResolvedValue(expected);

      const result = await getCalData(PROJECT_ID, MODULE_ID, CKV_ID);

      expect(mockGet).toHaveBeenCalledWith(
        `/projects/${PROJECT_ID}/spf-modules/${MODULE_ID}/cal-data/${CKV_ID}`,
      );
      expect(result).toBe(expected);
    });
  });

  describe('putCalData', () => {
    it('calls httpClient.put with correct URL, payload, and { retries: 0 }', async () => {
      const expected: ApiResult = {data: {}, message: 'Updated', success: true};
      mockPut.mockResolvedValue(expected);

      const payload = {data: []};
      const result = await putCalData(PROJECT_ID, MODULE_ID, CKV_ID, payload);

      expect(mockPut).toHaveBeenCalledWith(
        `/projects/${PROJECT_ID}/spf-modules/${MODULE_ID}/cal-data/${CKV_ID}`,
        payload,
        {retries: 0},
      );
      expect(result).toBe(expected);
    });
  });

  describe('queryFirstCkvSystemId', () => {
    it('returns the first CKV systemId when ckvs are present', async () => {
      const postResult: ApiResult = {
        data: [{ckvs: [{systemId: 'ckv-abc'}]}],
        message: 'OK',
        success: true,
      };
      mockPost.mockResolvedValue(postResult);

      const result = await queryFirstCkvSystemId(PROJECT_ID, MODULE_ID);

      expect(mockPost).toHaveBeenCalledWith(
        `/projects/${PROJECT_ID}/spf-modules/query?include=ckvs`,
        {systemIds: [MODULE_ID]},
      );
      expect(result).toEqual({data: 'ckv-abc', message: 'OK', success: true});
    });

    it('returns a failed ApiResult when data is empty', async () => {
      const postResult: ApiResult = {
        data: [],
        message: 'OK',
        success: true,
      };
      mockPost.mockResolvedValue(postResult);

      const result = await queryFirstCkvSystemId(PROJECT_ID, MODULE_ID);

      expect(result.success).toBe(false);
      expect(result.message).toContain(MODULE_ID);
    });

    it('returns a failed ApiResult when ckvs array is absent', async () => {
      const postResult: ApiResult = {
        data: [{}],
        message: 'OK',
        success: true,
      };
      mockPost.mockResolvedValue(postResult);

      const result = await queryFirstCkvSystemId(PROJECT_ID, MODULE_ID);

      expect(result.success).toBe(false);
      expect(result.message).toContain(MODULE_ID);
    });

    it('propagates failure when the underlying call fails', async () => {
      const postResult: ApiResult = {
        errors: ['500 Internal Server Error'],
        message: 'Server error',
        success: false,
      };
      mockPost.mockResolvedValue(postResult);

      const result = await queryFirstCkvSystemId(PROJECT_ID, MODULE_ID);

      expect(result).toEqual({
        errors: ['500 Internal Server Error'],
        message: 'Server error',
        success: false,
      });
    });
  });
});

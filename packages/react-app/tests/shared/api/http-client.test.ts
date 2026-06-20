/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

jest.mock('~shared/lib/logger');
jest.mock('~shared/store/global-store', () => ({
  useGlobalStore: {
    getState: jest.fn(() => ({
      failCount: 0,
      incrementFail: jest.fn(),
      isConnected: true,
      markAvailable: jest.fn(),
      markUnavailable: jest.fn(),
      resetFailures: jest.fn(),
    })),
  },
}));

import {HttpClient} from '~shared/api/http-client';

// Mock fetch
global.fetch = jest.fn();

describe('HttpClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('put method', () => {
    it('should issue a PUT request with JSON-serialized body and Content-Type header', async () => {
      const client = new HttpClient({
        baseUrl: 'http://localhost:3000/arc-api/v1',
        timeoutMs: 10000,
      });
      const mockResponse = {
        json: jest.fn().mockResolvedValue({
          data: {id: 1},
          message: 'OK',
          success: true,
        }),
        ok: true,
        status: 200,
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const body = {name: 'test'};
      const result = await client.put('/endpoint', body);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/endpoint'),
        expect.objectContaining({
          body: JSON.stringify(body),
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          method: 'PUT',
        }),
      );
      expect(result.success).toBe(true);
      expect(result.data).toEqual({id: 1});
    });

    it('should return mapped ApiResult<T> on success', async () => {
      const client = new HttpClient({
        baseUrl: 'http://localhost:3000/arc-api/v1',
        timeoutMs: 10000,
      });
      const mockResponse = {
        json: jest.fn().mockResolvedValue({
          data: {id: 42, name: 'updated'},
          message: 'Updated successfully',
          success: true,
        }),
        ok: true,
        status: 200,
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await client.put<{id: number; name: string}>('/resource', {
        name: 'updated',
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Updated successfully');
      expect(result.data).toEqual({id: 42, name: 'updated'});
    });

    it('should support request overrides', async () => {
      const client = new HttpClient({
        baseUrl: 'http://localhost:3000/arc-api/v1',
        timeoutMs: 10000,
      });
      const mockResponse = {
        json: jest.fn().mockResolvedValue({
          message: 'OK',
          success: true,
        }),
        ok: true,
        status: 200,
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const customHeaders = {'X-Custom-Header': 'custom-value'};
      await client.put('/endpoint', {data: 'test'}, {headers: customHeaders});

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/endpoint'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Custom-Header': 'custom-value',
          }),
          method: 'PUT',
        }),
      );
    });
  });
});

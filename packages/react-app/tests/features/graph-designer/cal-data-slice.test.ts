/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

jest.mock('~shared/lib/logger');
jest.mock('~entities/spf-module-cal-data');
jest.mock('~shared/controls/global-toaster');

import {createStore} from 'zustand';

import {
  type CalDataDto,
  getCalData,
  putCalData,
  queryFirstCkvSystemId,
  type UpdateSpfModuleCalDataRequest,
} from '~entities/spf-module-cal-data';
import {
  type CalDataSlice,
  createCalDataSlice,
} from '~features/graph-designer/model/cal-data-slice';
import {showToast} from '~shared/controls/global-toaster';

const mockGetCalData = jest.mocked(getCalData);
const mockPutCalData = jest.mocked(putCalData);
const mockQueryFirstCkvSystemId = jest.mocked(queryFirstCkvSystemId);
const mockShowToast = jest.mocked(showToast);

const PROJECT_ID = 'proj-1';
const MODULE_ID = 'mod-sys-1';
const MODULE_NAME = 'TestModule';
const CKV_ID = 'ckv-sys-1';

function makeStore() {
  return createStore<CalDataSlice>((set, get) =>
    createCalDataSlice(set, get, PROJECT_ID),
  );
}

const makeCalDataDto = (overrides?: Partial<CalDataDto>): CalDataDto => ({
  changeInfo: {changeType: 'NONE'},
  Ckv: [],
  parameters: [
    {
      changeInfo: {changeType: 'NONE'},
      elements: [],
      name: 'Gain',
      parameterId: 'param-1',
      systemId: 'param-sys-1',
    },
    {
      changeInfo: {changeType: 'NONE'},
      elements: [],
      name: 'Delay',
      parameterId: 'param-2',
      systemId: 'param-sys-2',
    },
  ],
  systemId: MODULE_ID,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// fetchCalData
// ---------------------------------------------------------------------------

describe('fetchCalData — happy path', () => {
  it('queries CKV, fetches cal-data, stores entry as ready with dto', async () => {
    const dto = makeCalDataDto();

    mockQueryFirstCkvSystemId.mockResolvedValueOnce({
      data: CKV_ID,
      message: '',
      success: true,
    });
    mockGetCalData.mockResolvedValueOnce({
      data: dto,
      message: '',
      success: true,
    });

    const store = makeStore();
    await store.getState().fetchCalData(MODULE_ID, MODULE_NAME);

    const entry = store.getState().calDataByModuleId[MODULE_ID];
    expect(entry).toBeDefined();
    expect(entry.status).toBe('ready');
    expect(entry.dto).toBe(dto);
    expect(entry.ckvSystemId).toBe(CKV_ID);
    expect(entry.moduleName).toBe(MODULE_NAME);
    expect(entry.error).toBeUndefined();

    expect(mockQueryFirstCkvSystemId).toHaveBeenCalledWith(
      PROJECT_ID,
      MODULE_ID,
    );
    expect(mockGetCalData).toHaveBeenCalledWith(PROJECT_ID, MODULE_ID, CKV_ID);
  });
});

describe('fetchCalData — CKV resolution failure', () => {
  it('sets status error, shows danger toast, does not call getCalData', async () => {
    mockQueryFirstCkvSystemId.mockResolvedValueOnce({
      message: 'No CKV found',
      success: false,
    });

    const store = makeStore();
    await store.getState().fetchCalData(MODULE_ID, MODULE_NAME);

    const entry = store.getState().calDataByModuleId[MODULE_ID];
    expect(entry.status).toBe('error');
    expect(entry.error).toBe('No CKV found');
    expect(mockGetCalData).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith('No CKV found', 'danger');
  });
});

describe('fetchCalData — GET failure', () => {
  it('sets status error and shows danger toast when getCalData returns success:false', async () => {
    mockQueryFirstCkvSystemId.mockResolvedValueOnce({
      data: CKV_ID,
      message: '',
      success: true,
    });
    mockGetCalData.mockResolvedValueOnce({
      message: 'Server error',
      success: false,
    });

    const store = makeStore();
    await store.getState().fetchCalData(MODULE_ID, MODULE_NAME);

    const entry = store.getState().calDataByModuleId[MODULE_ID];
    expect(entry.status).toBe('error');
    expect(entry.error).toBe('Server error');
    expect(mockShowToast).toHaveBeenCalledWith('Server error', 'danger');
  });
});

describe('fetchCalData — CKV reuse on second call', () => {
  it('does not call queryFirstCkvSystemId again when ckvSystemId is already cached', async () => {
    const dto = makeCalDataDto();

    mockQueryFirstCkvSystemId.mockResolvedValue({
      data: CKV_ID,
      message: '',
      success: true,
    });
    mockGetCalData.mockResolvedValue({
      data: dto,
      message: '',
      success: true,
    });

    const store = makeStore();

    // First call — queries CKV
    await store.getState().fetchCalData(MODULE_ID, MODULE_NAME);
    expect(mockQueryFirstCkvSystemId).toHaveBeenCalledTimes(1);

    // Second call — should reuse cached CKV, not query again
    await store.getState().fetchCalData(MODULE_ID, MODULE_NAME);
    expect(mockQueryFirstCkvSystemId).toHaveBeenCalledTimes(1);
    expect(mockGetCalData).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// updateCalData
// ---------------------------------------------------------------------------

describe('updateCalData — success', () => {
  it('stores the returned dto from putCalData and returns it', async () => {
    const initialDto = makeCalDataDto();
    const updatedDto = makeCalDataDto({systemId: 'updated'});

    // Seed with a ready entry
    const store = makeStore();
    store.setState({
      calDataByModuleId: {
        [MODULE_ID]: {
          ckvSystemId: CKV_ID,
          dto: initialDto,
          moduleName: MODULE_NAME,
          status: 'ready',
        },
      },
    });

    mockPutCalData.mockResolvedValueOnce({
      data: updatedDto,
      message: '',
      success: true,
    });

    const payload: UpdateSpfModuleCalDataRequest = {data: []};
    const result = await store.getState().updateCalData(MODULE_ID, payload);

    expect(result).toBe(updatedDto);
    const entry = store.getState().calDataByModuleId[MODULE_ID];
    expect(entry.dto).toBe(updatedDto);
    expect(entry.status).toBe('ready');
    expect(mockPutCalData).toHaveBeenCalledWith(
      PROJECT_ID,
      MODULE_ID,
      CKV_ID,
      payload,
    );
  });
});

describe('updateCalData — failure (putCalData returns success:false)', () => {
  it('shows danger toast, patches dto locally by parameterId, returns void', async () => {
    const initialDto = makeCalDataDto();
    const store = makeStore();

    store.setState({
      calDataByModuleId: {
        [MODULE_ID]: {
          ckvSystemId: CKV_ID,
          dto: initialDto,
          moduleName: MODULE_NAME,
          status: 'ready',
        },
      },
    });

    mockPutCalData.mockResolvedValueOnce({
      message: 'Service unavailable',
      success: false,
    });

    const updatedParam = {
      ...initialDto.parameters[0],
      elements: [
        {
          isReadOnly: false,
          name: 'val',
          type: 'CONFIG_ELEMENT' as const,
          value: '42',
        },
      ],
    };
    const payload: UpdateSpfModuleCalDataRequest = {data: [updatedParam]};

    const result = await store.getState().updateCalData(MODULE_ID, payload);

    expect(result).toBeUndefined();
    expect(mockShowToast).toHaveBeenCalledWith('Service unavailable', 'danger');

    const entry = store.getState().calDataByModuleId[MODULE_ID];
    expect(entry.status).toBe('ready');
    // The patched dto should have the updated param (param-1)
    const patchedParam = entry.dto!.parameters.find(
      (p) => p.parameterId === 'param-1',
    );
    expect(patchedParam?.elements).toEqual(updatedParam.elements);
    // param-2 should be unchanged
    const unchangedParam = entry.dto!.parameters.find(
      (p) => p.parameterId === 'param-2',
    );
    expect(unchangedParam?.elements).toEqual([]);
    // Should be a new dto reference
    expect(entry.dto).not.toBe(initialDto);
  });
});

describe('updateCalData — no entry loaded', () => {
  it('shows toast and returns void when no entry exists for the module', async () => {
    const store = makeStore();
    const payload: UpdateSpfModuleCalDataRequest = {data: []};
    const result = await store.getState().updateCalData(MODULE_ID, payload);

    expect(result).toBeUndefined();
    expect(mockShowToast).toHaveBeenCalledWith(
      'No cal-data loaded for this module',
      'danger',
    );
    expect(mockPutCalData).not.toHaveBeenCalled();
  });
});

describe('fetchCalData — thrown rejection', () => {
  it('sets status error and shows danger toast when queryFirstCkvSystemId rejects', async () => {
    mockQueryFirstCkvSystemId.mockRejectedValue(new Error('boom'));

    const store = makeStore();
    await store.getState().fetchCalData(MODULE_ID, MODULE_NAME);

    const entry = store.getState().calDataByModuleId[MODULE_ID];
    expect(entry.status).toBe('error');
    expect(entry.error).toBe('boom');
    expect(mockShowToast).toHaveBeenCalledWith('boom', 'danger');
  });
});

describe('updateCalData — thrown rejection', () => {
  it('shows danger toast, patches dto locally, returns void when putCalData rejects', async () => {
    const initialDto = makeCalDataDto();
    const store = makeStore();

    store.setState({
      calDataByModuleId: {
        [MODULE_ID]: {
          ckvSystemId: CKV_ID,
          dto: initialDto,
          moduleName: MODULE_NAME,
          status: 'ready',
        },
      },
    });

    mockPutCalData.mockRejectedValue(new Error('boom'));

    const updatedParam = {
      ...initialDto.parameters[0],
      elements: [
        {
          isReadOnly: false,
          name: 'val',
          type: 'CONFIG_ELEMENT' as const,
          value: '99',
        },
      ],
    };
    const payload: UpdateSpfModuleCalDataRequest = {data: [updatedParam]};

    const result = await store.getState().updateCalData(MODULE_ID, payload);

    expect(result).toBeUndefined();
    expect(mockShowToast).toHaveBeenCalledWith('boom', 'danger');

    const entry = store.getState().calDataByModuleId[MODULE_ID];
    expect(entry.status).toBe('ready');
    // dto should be locally patched with payload params
    const patchedParam = entry.dto!.parameters.find(
      (p) => p.parameterId === 'param-1',
    );
    expect(patchedParam?.elements).toEqual(updatedParam.elements);
    expect(entry.dto).not.toBe(initialDto);
  });
});

// ---------------------------------------------------------------------------
// setCalDataOpenTab / clearCalData
// ---------------------------------------------------------------------------

describe('setCalDataOpenTab', () => {
  it('sets the tab id for the given module', () => {
    const store = makeStore();
    store.getState().setCalDataOpenTab(MODULE_ID, 'tab-42');
    expect(store.getState().calDataOpenTabs[MODULE_ID]).toBe('tab-42');
  });

  it('can overwrite an existing tab id', () => {
    const store = makeStore();
    store.getState().setCalDataOpenTab(MODULE_ID, 'tab-1');
    store.getState().setCalDataOpenTab(MODULE_ID, 'tab-2');
    expect(store.getState().calDataOpenTabs[MODULE_ID]).toBe('tab-2');
  });
});

describe('clearCalData', () => {
  it('removes the entry and open-tab for the given module', () => {
    const dto = makeCalDataDto();
    const store = makeStore();

    store.setState({
      calDataByModuleId: {
        [MODULE_ID]: {
          ckvSystemId: CKV_ID,
          dto,
          moduleName: MODULE_NAME,
          status: 'ready',
        },
      },
      calDataOpenTabs: {[MODULE_ID]: 'tab-1'},
    });

    store.getState().clearCalData(MODULE_ID);

    expect(store.getState().calDataByModuleId[MODULE_ID]).toBeUndefined();
    expect(store.getState().calDataOpenTabs[MODULE_ID]).toBeUndefined();
  });

  it('leaves other entries untouched when clearing one module', () => {
    const dto = makeCalDataDto();
    const store = makeStore();
    const OTHER_ID = 'other-mod';

    store.setState({
      calDataByModuleId: {
        [MODULE_ID]: {
          ckvSystemId: CKV_ID,
          dto,
          moduleName: MODULE_NAME,
          status: 'ready',
        },
        [OTHER_ID]: {
          ckvSystemId: 'ckv-2',
          dto,
          moduleName: 'Other',
          status: 'ready',
        },
      },
      calDataOpenTabs: {[MODULE_ID]: 'tab-1', [OTHER_ID]: 'tab-2'},
    });

    store.getState().clearCalData(MODULE_ID);

    expect(store.getState().calDataByModuleId[OTHER_ID]).toBeDefined();
    expect(store.getState().calDataOpenTabs[OTHER_ID]).toBe('tab-2');
  });
});

/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {StoreApi} from 'zustand';

import {
  type CalDataDto,
  getCalData,
  putCalData,
  queryFirstCkvSystemId,
  type UpdateSpfModuleCalDataRequest,
} from '~entities/spf-module-cal-data';
import {showToast} from '~shared/controls/global-toaster';
import {logger} from '~shared/lib/logger';
import type {SliceStatus} from '~shared/store/global-store.types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a raw API error string to a user-facing message.
 * Raw strings like "HTTP error: 500 Internal Server Error" or
 * "No CKV found for SPF module 0x…" are meaningful to developers but
 * confusing in a toast. This maps common patterns to plain English.
 */
function toUserFriendlyError(raw: string, moduleName: string): string {
  const suffix = ` (${moduleName})`;
  if (/HTTP error: 4\d\d/i.test(raw)) {
    return `Calibration data not found for this module.${suffix}`;
  }
  if (/HTTP error: 5\d\d/i.test(raw)) {
    return `Server error loading calibration data. Try again later.${suffix}`;
  }
  if (/no ckv found/i.test(raw)) {
    return `No calibration data is available for this module.${suffix}`;
  }
  if (/request timed out/i.test(raw)) {
    return `Request timed out. Check your connection and try again.${suffix}`;
  }
  if (/network error/i.test(raw)) {
    return `Network error. Check your connection and try again.${suffix}`;
  }
  return `Failed to load calibration data.${suffix}`;
}

// ---------------------------------------------------------------------------
// Debug helpers
// ---------------------------------------------------------------------------

/**
 * [cal-data-debug] Walk the cal-data DTO and log the control-determining
 * fields the backend sent for each leaf element (type, displayType, and the
 * allowedValues used to pick Switch vs Select vs text box). This proves, for
 * example, whether a boolean "enable" element arrived without the
 * allowedValues that the Switch control requires. Debug-only; uses a loose
 * structural shape so it does not couple the slice to the element DTO types.
 */
function logCalDataElementShapes(dto: CalDataDto): void {
  type LooseElement = {
    allowedValues?: unknown;
    displayType?: string;
    name?: string;
    type?: string;
    value?: unknown;
  };

  const walk = (elements: LooseElement[], path: string): void => {
    for (const elem of elements) {
      if (elem.type === 'CONFIG_ELEMENT') {
        logger.info(
          `[cal-data-debug] element ${path}/${elem.name} ` +
            `type=CONFIG_ELEMENT displayType=${elem.displayType ?? '<none>'} ` +
            `allowedValues=${JSON.stringify(elem.allowedValues ?? null)} ` +
            `value=${JSON.stringify(elem.value)}`,
          {
            action: 'logCalDataElementShapes',
            component: 'calDataSlice',
            tag: 'cal-data-debug',
          },
        );
      } else if (Array.isArray((elem as {value?: unknown}).value)) {
        // STRUCT / ELEMENT_TEMPLATE_ARRAY — recurse into child elements.
        walk(
          (elem as {value: LooseElement[]}).value,
          `${path}/${elem.name ?? elem.type}`,
        );
      }
    }
  };

  for (const param of dto.parameters) {
    walk(param.elements as unknown as LooseElement[], param.name);
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CalDataEntry {
  ckvSystemId: string;
  dto?: CalDataDto;
  error?: string;
  moduleName: string;
  status: SliceStatus;
}

export interface CalDataSlice {
  /** moduleSystemId -> entry */
  calDataByModuleId: Record<string, CalDataEntry>;
  /** moduleSystemId -> open tab id (for dedup/focus by Task 8) */
  calDataOpenTabs: Record<string, string>;
  clearCalData: (spfModuleSystemId: string) => void;
  fetchCalData: (
    spfModuleSystemId: string,
    moduleName: string,
  ) => Promise<boolean>;
  setCalDataOpenTab: (spfModuleSystemId: string, tabId: string) => void;
  updateCalData: (
    spfModuleSystemId: string,
    payload: UpdateSpfModuleCalDataRequest,
  ) => Promise<CalDataDto | void>;
}

// ---------------------------------------------------------------------------
// Slice creator
// ---------------------------------------------------------------------------

function applyLocalPatch(
  existingEntry: CalDataEntry,
  patchPayload: UpdateSpfModuleCalDataRequest,
): CalDataDto | undefined {
  if (!existingEntry.dto) {
    return undefined;
  }
  const payloadById = new Map(patchPayload.data.map((p) => [p.parameterId, p]));
  const patchedParameters = existingEntry.dto.parameters.map((p) =>
    payloadById.has(p.parameterId)
      ? {...(payloadById.get(p.parameterId) as typeof p)}
      : p,
  );
  return {...existingEntry.dto, parameters: patchedParameters};
}

/**
 * Creates the cal-data slice for composing into the GraphDesignerStore.
 *
 * @param set - Zustand set function bound to the parent store state.
 * @param get - Zustand get function bound to the parent store state.
 * @param projectId - Project identifier bound at construction time.
 */
export function createCalDataSlice<S extends CalDataSlice>(
  set: StoreApi<S>['setState'],
  get: StoreApi<S>['getState'],
  projectId: string,
): CalDataSlice {
  const setFetchError = (moduleId: string, errorMsg: string): void => {
    set({
      calDataByModuleId: {
        ...get().calDataByModuleId,
        [moduleId]: {
          ...get().calDataByModuleId[moduleId],
          error: errorMsg,
          status: 'error',
        },
      },
    } as Partial<S>);
  };

  return {
    calDataByModuleId: {},

    calDataOpenTabs: {},

    clearCalData: (spfModuleSystemId: string): void => {
      logger.debug('calDataSlice: clearCalData', {
        action: 'clearCalData',
        component: 'calDataSlice',
      });

      const {[spfModuleSystemId]: _removedEntry, ...remainingEntries} =
        get().calDataByModuleId;
      const {[spfModuleSystemId]: _removedTab, ...remainingTabs} =
        get().calDataOpenTabs;

      set({
        calDataByModuleId: remainingEntries,
        calDataOpenTabs: remainingTabs,
      } as Partial<S>);
    },

    fetchCalData: async (
      spfModuleSystemId: string,
      moduleName: string,
    ): Promise<boolean> => {
      // [cal-data-debug] Slice entry — log the IDs the slice received from the UI
      // and the projectId bound at construction.
      logger.info(
        `[cal-data-debug] fetchCalData start ` +
          `(projectId=${projectId}, spfModuleSystemId=${spfModuleSystemId}, ` +
          `moduleName=${moduleName})`,
        {
          action: 'fetchCalData',
          component: 'calDataSlice',
          tag: 'cal-data-debug',
        },
      );

      const existing = get().calDataByModuleId[spfModuleSystemId];

      // Set loading state, preserving existing ckv/dto if available
      set({
        calDataByModuleId: {
          ...get().calDataByModuleId,
          [spfModuleSystemId]: {
            ckvSystemId: existing?.ckvSystemId ?? '',
            dto: existing?.dto,
            error: undefined,
            moduleName,
            status: 'loading',
          },
        },
      } as Partial<S>);

      try {
        // Resolve CKV: reuse if already cached, otherwise query
        let ckvSystemId = existing?.ckvSystemId ?? '';

        if (!ckvSystemId) {
          const ckvResult = await queryFirstCkvSystemId(
            projectId,
            spfModuleSystemId,
          );

          if (!ckvResult.success || !ckvResult.data) {
            const errorMsg =
              ckvResult.message ?? 'Failed to resolve CKV system ID';
            logger.error('calDataSlice: fetchCalData — CKV resolution failed', {
              action: 'fetchCalData',
              component: 'calDataSlice',
              error: errorMsg,
            });
            setFetchError(spfModuleSystemId, errorMsg);
            showToast(toUserFriendlyError(errorMsg, moduleName), 'danger');
            return false;
          }

          ckvSystemId = ckvResult.data;
        }

        // [cal-data-debug] Log the CKV that will be used for the GET, and whether
        // it was reused from cache or freshly resolved via the query endpoint.
        logger.info(
          `[cal-data-debug] fetchCalData resolved ckvSystemId=${ckvSystemId} ` +
            `(reusedFromCache=${Boolean(existing?.ckvSystemId)}) ` +
            `spfModuleSystemId=${spfModuleSystemId}`,
          {
            action: 'fetchCalData',
            component: 'calDataSlice',
            tag: 'cal-data-debug',
          },
        );

        // GET cal-data
        const result = await getCalData(
          projectId,
          spfModuleSystemId,
          ckvSystemId,
        );

        if (!result.success || !result.data) {
          const errorMsg = result.message ?? 'Failed to fetch calibration data';
          logger.error('calDataSlice: fetchCalData — GET failed', {
            action: 'fetchCalData',
            component: 'calDataSlice',
            error: errorMsg,
          });
          setFetchError(spfModuleSystemId, errorMsg);
          showToast(toUserFriendlyError(errorMsg, moduleName), 'danger');
          return false;
        }

        set({
          calDataByModuleId: {
            ...get().calDataByModuleId,
            [spfModuleSystemId]: {
              ckvSystemId,
              dto: result.data,
              error: undefined,
              moduleName,
              status: 'ready',
            },
          },
        } as Partial<S>);

        // [cal-data-debug] Prove what control-determining fields the backend
        // sent per element. A boolean element (e.g. "enable") only renders as a
        // Switch when it carries allowedValues with two boolean-synonym
        // NAME_VALUE_PAIRs; logging displayType + allowedValues here shows
        // whether the backend omitted them (forcing a plain text box).
        logCalDataElementShapes(result.data);

        logger.debug('calDataSlice: fetchCalData — ready', {
          action: 'fetchCalData',
          component: 'calDataSlice',
        });
        return true;
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : 'Unknown error';
        logger.error('calDataSlice: fetchCalData — thrown error', {
          action: 'fetchCalData',
          component: 'calDataSlice',
          error: errorMsg,
        });
        setFetchError(spfModuleSystemId, errorMsg);
        showToast(toUserFriendlyError(errorMsg, moduleName), 'danger');
        return false;
      }
    },

    setCalDataOpenTab: (spfModuleSystemId: string, tabId: string): void => {
      logger.debug('calDataSlice: setCalDataOpenTab', {
        action: 'setCalDataOpenTab',
        component: 'calDataSlice',
      });
      set({
        calDataOpenTabs: {
          ...get().calDataOpenTabs,
          [spfModuleSystemId]: tabId,
        },
      } as Partial<S>);
    },

    updateCalData: async (
      spfModuleSystemId: string,
      payload: UpdateSpfModuleCalDataRequest,
    ): Promise<CalDataDto | void> => {
      logger.debug('calDataSlice: updateCalData', {
        action: 'updateCalData',
        component: 'calDataSlice',
      });

      const entry = get().calDataByModuleId[spfModuleSystemId];

      if (!entry) {
        showToast('No cal-data loaded for this module', 'danger');
        return;
      }

      try {
        const result = await putCalData(
          projectId,
          spfModuleSystemId,
          entry.ckvSystemId,
          payload,
        );

        if (result.success && result.data) {
          set(
            (s) =>
              ({
                calDataByModuleId: {
                  ...s.calDataByModuleId,
                  [spfModuleSystemId]: {
                    ...s.calDataByModuleId[spfModuleSystemId],
                    dto: result.data,
                    status: 'ready',
                  },
                },
              }) as Partial<S>,
          );
          return result.data;
        }

        // Failure path: toast + local fallback patch
        const errorMsg = result.message ?? 'Failed to save calibration data';
        showToast(errorMsg, 'danger');

        const patchedDto = applyLocalPatch(entry, payload);
        if (patchedDto) {
          set(
            (s) =>
              ({
                calDataByModuleId: {
                  ...s.calDataByModuleId,
                  [spfModuleSystemId]: {
                    ...s.calDataByModuleId[spfModuleSystemId],
                    dto: patchedDto,
                    status: 'ready',
                  },
                },
              }) as Partial<S>,
          );
        }
        // Return void — signals widget to commit edit locally
      } catch (error) {
        const errorMsg =
          error instanceof Error
            ? error.message
            : 'Failed to save calibration data';
        logger.error('calDataSlice: updateCalData — thrown error', {
          action: 'updateCalData',
          component: 'calDataSlice',
          error: errorMsg,
        });

        // Same local-fallback path on thrown error — use already-captured entry
        showToast(errorMsg, 'danger');
        const patchedDto = applyLocalPatch(entry, payload);
        if (patchedDto) {
          set(
            (s) =>
              ({
                calDataByModuleId: {
                  ...s.calDataByModuleId,
                  [spfModuleSystemId]: {
                    ...s.calDataByModuleId[spfModuleSystemId],
                    dto: patchedDto,
                    status: 'ready',
                  },
                },
              }) as Partial<S>,
          );
        }
        // Return void — signals widget to commit edit locally
      }
    },
  };
}

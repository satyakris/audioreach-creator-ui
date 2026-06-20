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
  ) => Promise<void>;
  setCalDataOpenTab: (spfModuleSystemId: string, tabId: string) => void;
  updateCalData: (
    spfModuleSystemId: string,
    payload: UpdateSpfModuleCalDataRequest,
  ) => Promise<CalDataDto | void>;
}

// ---------------------------------------------------------------------------
// Slice creator
// ---------------------------------------------------------------------------

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
    ): Promise<void> => {
      logger.debug('calDataSlice: fetchCalData — loading', {
        action: 'fetchCalData',
        component: 'calDataSlice',
      });

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
            set({
              calDataByModuleId: {
                ...get().calDataByModuleId,
                [spfModuleSystemId]: {
                  ...get().calDataByModuleId[spfModuleSystemId],
                  error: errorMsg,
                  status: 'error',
                },
              },
            } as Partial<S>);
            showToast(errorMsg, 'danger');
            return;
          }

          ckvSystemId = ckvResult.data;
        }

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
          set({
            calDataByModuleId: {
              ...get().calDataByModuleId,
              [spfModuleSystemId]: {
                ...get().calDataByModuleId[spfModuleSystemId],
                error: errorMsg,
                status: 'error',
              },
            },
          } as Partial<S>);
          showToast(errorMsg, 'danger');
          return;
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

        logger.debug('calDataSlice: fetchCalData — ready', {
          action: 'fetchCalData',
          component: 'calDataSlice',
        });
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : 'Unknown error';
        logger.error('calDataSlice: fetchCalData — thrown error', {
          action: 'fetchCalData',
          component: 'calDataSlice',
          error: errorMsg,
        });
        set({
          calDataByModuleId: {
            ...get().calDataByModuleId,
            [spfModuleSystemId]: {
              ...get().calDataByModuleId[spfModuleSystemId],
              error: errorMsg,
              status: 'error',
            },
          },
        } as Partial<S>);
        showToast(errorMsg, 'danger');
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

      // Helper: build a patched dto by replacing parameters by parameterId.
      // Returns undefined when the entry has no prior dto to patch against.
      const applyLocalPatch = (
        existingEntry: CalDataEntry,
        patchPayload: UpdateSpfModuleCalDataRequest,
      ): CalDataDto | undefined => {
        if (!existingEntry.dto) {
          return undefined;
        }
        const payloadById = new Map(
          patchPayload.data.map((p) => [p.parameterId, p]),
        );
        const patchedParameters = existingEntry.dto.parameters.map((p) =>
          payloadById.has(p.parameterId)
            ? {...(payloadById.get(p.parameterId) as typeof p)}
            : p,
        );
        return {...existingEntry.dto, parameters: patchedParameters};
      };

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

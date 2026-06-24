/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {useRef} from 'react';

import {ProjectImageService} from '~entities/project/services/project-image-service';
import {ConfigFileManager} from '~shared/config/config-manager';
import {logger} from '~shared/lib/logger';

import type {ProjectLifecycleHook} from '../model/types';

/**
 * Hook for managing project lifecycle events
 * Handles project close with screenshot capture
 */
export function useProjectLifecycle(): ProjectLifecycleHook {
  // Local screenshot registry - stores screenshot functions for each project
  const screenshotRegistryRef = useRef<
    Map<string, () => Promise<string | null>>
  >(new Map());

  /**
   * Handles project close - captures screenshot, saves config, and updates MRU
   * This runs BEFORE the project is removed, while GraphDesigner is still mounted
   */
  const handleProjectClose = async (
    projectId: string,
    projectName: string,
  ): Promise<boolean> => {
    logger.verbose(`Closing project: ${projectName}`, {
      action: 'close_project',
      component: 'useProjectLifecycle',
      projectId,
    });

    try {
      const screenshotFn = screenshotRegistryRef.current.get(projectId);

      // Screenshot capture and config archive are independent — run in parallel.
      await Promise.all([
        screenshotFn
          ? ProjectImageService.captureAndSave(projectId, screenshotFn)
          : Promise.resolve(),
        ConfigFileManager.instance.archiveProjectConfig(projectId).then(
          (saved) => {
            if (!saved) {
              logger.warn('Failed to archive project configuration', {
                action: 'close_project',
                component: 'useProjectLifecycle',
                projectId,
              });
            }
          },
        ),
      ]);
    } catch (error) {
      logger.error('Failed during project close', {
        action: 'close_project',
        component: 'useProjectLifecycle',
        error: error instanceof Error ? error.message : String(error),
        projectId,
      });
      // Don't block close on failure
    } finally {
      screenshotRegistryRef.current.delete(projectId);
    }

    // Allow close to proceed
    return true;
  };

  return {
    handleProjectClose,
    screenshotRegistry: screenshotRegistryRef.current,
  };
}

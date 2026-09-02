/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Locator, Page} from '@playwright/test';

export type GraphPage = {
  expandFirstSubgraph(projectId: string): Promise<void>;
  firstModuleNode(projectId: string): Locator;
  nodeByIdentity(identity: GraphNodeIdentity): Locator;
  selectedNode(identity: GraphNodeIdentity): Locator;
  selectNode(identity: GraphNodeIdentity): Promise<void>;
};

export type GraphNodeIdentity = {
  readonly nodeId: string;
  readonly projectId: string;
};

function escapeAttributeValue(value: string): string {
  return value.replace(/[\\"\n\r\f]/g, (character) => `\\${character}`);
}

export function createGraphPage(page: Page): GraphPage {
  function projectById(projectId: string): Locator {
    if (projectId.trim() === '') {
      throw new Error('Cannot locate a graph node without a project ID');
    }

    return page.locator(
      `[data-project-id="${escapeAttributeValue(projectId)}"]`,
    );
  }

  function nodeByIdentity(identity: GraphNodeIdentity): Locator {
    return projectById(identity.projectId)
      .locator(`[data-node-id="${escapeAttributeValue(identity.nodeId)}"]`)
      .describe(`Graph node ${identity.projectId}/${identity.nodeId}`);
  }

  return {
    expandFirstSubgraph: async (projectId) => {
      const expandButton = projectById(projectId)
        .getByRole('button', {name: 'Expand subgraph'})
        .first();
      if (await expandButton.isVisible()) {
        await expandButton.focus();
        await expandButton.press('Enter');
      }
    },
    firstModuleNode: (projectId) =>
      projectById(projectId).getByTestId('module-node').first(),
    nodeByIdentity,
    selectedNode: (identity) =>
      nodeByIdentity(identity)
        .locator(
          'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " react-flow__node ")][1][contains(concat(" ", normalize-space(@class), " "), " selected ")]',
        )
        .describe(
          `Selected graph node ${identity.projectId}/${identity.nodeId}`,
        ),
    selectNode: async (identity) => {
      await nodeByIdentity(identity).click();
    },
  };
}

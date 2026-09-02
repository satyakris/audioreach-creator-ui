/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {expect} from '@playwright/test';

import {selectModuleNode} from '../commands/graph';
import {openFile, filterAndSelectUseCase} from '../commands/home';
import {testSession} from '../framework';

testSession('EX-5 selects a module node by identity', async ({testSession}) => {
  const opened = await testSession.run(
    openFile({workspacePath: testSession.testData.validOpenProjectPath}),
  );
  expect(opened.ok).toBe(true);

  if (!opened.ok) {
    throw new Error(`open failed: ${opened.message}`);
  }

  await testSession.run(
    filterAndSelectUseCase({query: testSession.testData.useCaseQuery}),
  );
  await testSession.pages.graph.expandFirstSubgraph(opened.project.projectId);
  let nodeId = testSession.testData.moduleNodeId;

  if (nodeId === undefined) {
    const firstModuleNode = testSession.pages.graph.firstModuleNode(
      opened.project.projectId,
    );
    await expect(firstModuleNode).toBeVisible();
    nodeId = await firstModuleNode.getAttribute('data-node-id');
  }

  if (nodeId === null) {
    throw new Error('The first rendered module does not expose a node ID');
  }

  await testSession.run(
    selectModuleNode({
      nodeId,
      projectId: opened.project.projectId,
    }),
  );

  await expect(
    testSession.pages.graph.selectedNode({
      nodeId,
      projectId: opened.project.projectId,
    }),
  ).toBeVisible();
});

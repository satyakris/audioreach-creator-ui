/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {expect, test} from '@playwright/test';

import {createGraphPage} from '../../pages/graph-page';

test('graph page scopes node identity to the active project', async ({
  page,
}) => {
  await page.setContent(`
    <div data-project-id="project-1">
      <button aria-label="Expand subgraph" onclick="this.dataset.expanded = 'true'"></button>
      <div class="react-flow__node selected">
        <div data-node-id="module-1" data-testid="module-node">
          <div data-testid="module-shape-layer">
            <svg data-testid="module-shape-svg"></svg>
          </div>
        </div>
      </div>
    </div>
  `);

  const graph = createGraphPage(page);
  const identity = {nodeId: 'module-1', projectId: 'project-1'};

  await expect(graph.nodeByIdentity(identity)).toHaveCount(1);
  await expect(graph.selectedNode(identity)).toHaveCount(1);
  await expect(
    graph.nodeByIdentity({nodeId: 'module-1', projectId: 'project-2'}),
  ).toHaveCount(0);
  await expect(graph.firstModuleNode('project-1')).toHaveAttribute(
    'data-node-id',
    'module-1',
  );

  await graph.expandFirstSubgraph('project-1');
  await expect(
    page.getByRole('button', {name: 'Expand subgraph'}),
  ).toHaveAttribute('data-expanded', 'true');
});

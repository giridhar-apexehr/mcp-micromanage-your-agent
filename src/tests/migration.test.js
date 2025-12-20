import fs from 'fs';
import os from 'os';
import path from 'path';

import { WorkPlan } from '../../dist/aggregates/workplan.js';

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

describe('legacy migration', () => {
  test('migrates legacy workplan.json into per-workplan files and agents.json', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-micromanage-migration-'));

    try {
      const dataFilePath = path.join(tmpDir, 'workplan.json');

      const agentId = 'agent-a';
      const workplanId = 'wp-1';

      const legacyTicket = {
        goal: 'Legacy Goal',
        pullRequests: [
          {
            goal: 'PR 0',
            status: 'not_started',
            commits: [
              { goal: 'Commit 0', status: 'not_started' },
              { goal: 'Commit 1', status: 'not_started' },
            ],
          },
        ],
      };

      const legacyState = {
        agents: {
          [agentId]: {
            workplans: {
              [workplanId]: legacyTicket,
            },
          },
        },
        lastUpdated: new Date().toISOString(),
        version: '3.0.0',
      };

      fs.writeFileSync(dataFilePath, JSON.stringify(legacyState, null, 2), 'utf8');

      new WorkPlan({ dataDir: tmpDir, dataFileName: 'workplan.json' });

      const workplanPath = path.join(tmpDir, 'agents', agentId, 'workplans', `${workplanId}.json`);
      expect(fs.existsSync(workplanPath)).toBe(true);

      const migratedTicket = readJson(workplanPath);
      expect(migratedTicket.goal).toBe(legacyTicket.goal);
      expect(migratedTicket.pullRequests.length).toBe(1);

      const agentsIndexPath = path.join(tmpDir, 'agents.json');
      expect(fs.existsSync(agentsIndexPath)).toBe(true);

      const agentsIndex = readJson(agentsIndexPath);
      expect(agentsIndex.agents[agentId].workplans[workplanId].goal).toBe(legacyTicket.goal);
      expect(agentsIndex.agents[agentId].workplans[workplanId].prCount).toBe(1);
      expect(agentsIndex.agents[agentId].workplans[workplanId].commitCount).toBe(2);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

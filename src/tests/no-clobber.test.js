import fs from 'fs'
import os from 'os'
import path from 'path'

import { WorkPlan } from '../../dist/aggregates/workplan.js'

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'))

describe('regression: prevent clobber across instances', () => {
  test('two WorkPlan instances persist distinct workplans into agents.json and per-workplan files', () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'mcp-micromanage-no-clobber-'),
    )

    try {
      const planInputA = {
        goal: 'Goal A',
        prPlans: [
          {
            goal: 'PR A0',
            commitPlans: [{ goal: 'Commit A0' }],
          },
        ],
      }

      const planInputB = {
        goal: 'Goal B',
        prPlans: [
          {
            goal: 'PR B0',
            commitPlans: [{ goal: 'Commit B0' }],
          },
        ],
      }

      const wp1 = new WorkPlan({
        dataDir: tmpDir,
        dataFileName: 'workplan.json',
        legacyWriterEnabled: false,
      })

      const wp2 = new WorkPlan({
        dataDir: tmpDir,
        dataFileName: 'workplan.json',
        legacyWriterEnabled: false,
      })

      const agentId = 'agent-a'
      const workplanIdA = 'workplan-a'
      const workplanIdB = 'workplan-b'

      const resA = wp1.plan(planInputA, agentId, workplanIdA)
      expect(resA.isError).not.toBe(true)

      const resB = wp2.plan(planInputB, agentId, workplanIdB)
      expect(resB.isError).not.toBe(true)

      const agentsIndexPath = path.join(tmpDir, 'agents.json')
      expect(fs.existsSync(agentsIndexPath)).toBe(true)

      const agentsIndex = readJson(agentsIndexPath)
      expect(agentsIndex.agents[agentId].workplans[workplanIdA].goal).toBe(
        'Goal A',
      )
      expect(agentsIndex.agents[agentId].workplans[workplanIdB].goal).toBe(
        'Goal B',
      )

      const workplanPathA = path.join(
        tmpDir,
        'agents',
        agentId,
        'workplans',
        `${workplanIdA}.json`,
      )
      const workplanPathB = path.join(
        tmpDir,
        'agents',
        agentId,
        'workplans',
        `${workplanIdB}.json`,
      )

      expect(fs.existsSync(workplanPathA)).toBe(true)
      expect(fs.existsSync(workplanPathB)).toBe(true)

      const ticketA = readJson(workplanPathA)
      const ticketB = readJson(workplanPathB)
      expect(ticketA.goal).toBe('Goal A')
      expect(ticketB.goal).toBe('Goal B')
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})

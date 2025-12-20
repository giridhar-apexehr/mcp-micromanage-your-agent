import fs from 'fs'
import os from 'os'
import path from 'path'

import { WorkPlan } from '../../dist/aggregates/workplan.js'

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'))

describe('latestWorkedOn tracking', () => {
  test('updates latestWorkedOn only on commit status transitions into in_progress/user_review/completed and mirrors to agents.json', () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'mcp-micromanage-latest-worked-'),
    )

    try {
      const wp = new WorkPlan({
        dataDir: tmpDir,
        dataFileName: 'workplan.json',
        legacyWriterEnabled: false,
      })

      const agentId = 'agent-a'
      const workplanId = 'workplan-a'

      const planInput = {
        goal: 'Goal A',
        prPlans: [
          {
            goal: 'PR A0',
            commitPlans: [{ goal: 'Commit A0' }],
          },
        ],
      }

      const planRes = wp.plan(planInput, agentId, workplanId)
      expect(planRes.isError).not.toBe(true)

      const workplanPath = path.join(
        tmpDir,
        'agents',
        agentId,
        'workplans',
        `${workplanId}.json`,
      )
      const agentsIndexPath = path.join(tmpDir, 'agents.json')

      expect(fs.existsSync(workplanPath)).toBe(true)
      expect(fs.existsSync(agentsIndexPath)).toBe(true)

      // Step 1: needsRefinment (should NOT set latestWorkedOn)
      const resNeedsRef = wp.updateStatus(
        { prIndex: 0, commitIndex: 0, status: 'needsRefinment' },
        agentId,
        workplanId,
      )
      expect(resNeedsRef.isError).not.toBe(true)

      let ticket = readJson(workplanPath)
      let agentsIndex = readJson(agentsIndexPath)
      expect(ticket.latestWorkedOn).toBeUndefined()
      expect(
        agentsIndex.agents[agentId].workplans[workplanId].latestWorkedOn,
      ).toBeUndefined()

      // Step 2: in_progress (should set latestWorkedOn)
      const resInProgress = wp.updateStatus(
        { prIndex: 0, commitIndex: 0, status: 'in_progress' },
        agentId,
        workplanId,
      )
      expect(resInProgress.isError).not.toBe(true)

      ticket = readJson(workplanPath)
      agentsIndex = readJson(agentsIndexPath)

      expect(ticket.latestWorkedOn).toBeDefined()
      expect(ticket.latestWorkedOn.prIndex).toBe(0)
      expect(ticket.latestWorkedOn.commitIndex).toBe(0)
      expect(ticket.latestWorkedOn.status).toBe('in_progress')

      expect(
        agentsIndex.agents[agentId].workplans[workplanId].latestWorkedOn,
      ).toBeDefined()
      expect(
        agentsIndex.agents[agentId].workplans[workplanId].latestWorkedOn.status,
      ).toBe('in_progress')

      const atAfterInProgress = ticket.latestWorkedOn.at

      // Step 3: developerNote update without status change (should NOT update latestWorkedOn)
      const resNote = wp.updateStatus(
        {
          prIndex: 0,
          commitIndex: 0,
          status: 'in_progress',
          developerNote: 'note',
        },
        agentId,
        workplanId,
      )
      expect(resNote.isError).not.toBe(true)

      ticket = readJson(workplanPath)
      agentsIndex = readJson(agentsIndexPath)
      expect(ticket.latestWorkedOn.at).toBe(atAfterInProgress)
      expect(
        agentsIndex.agents[agentId].workplans[workplanId].latestWorkedOn.at,
      ).toBe(atAfterInProgress)

      // Step 4: user_review (should update latestWorkedOn)
      const resUserReview = wp.updateStatus(
        { prIndex: 0, commitIndex: 0, status: 'user_review' },
        agentId,
        workplanId,
      )
      expect(resUserReview.isError).not.toBe(true)

      ticket = readJson(workplanPath)
      agentsIndex = readJson(agentsIndexPath)
      expect(ticket.latestWorkedOn.status).toBe('user_review')
      expect(ticket.latestWorkedOn.at).not.toBe(atAfterInProgress)
      expect(
        agentsIndex.agents[agentId].workplans[workplanId].latestWorkedOn.status,
      ).toBe('user_review')

      // Step 5: completed (allowed only after user_review)
      const resCompleted = wp.updateStatus(
        { prIndex: 0, commitIndex: 0, status: 'completed' },
        agentId,
        workplanId,
      )
      expect(resCompleted.isError).not.toBe(true)

      ticket = readJson(workplanPath)
      agentsIndex = readJson(agentsIndexPath)
      expect(ticket.latestWorkedOn.status).toBe('completed')
      expect(
        agentsIndex.agents[agentId].workplans[workplanId].latestWorkedOn.status,
      ).toBe('completed')
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})

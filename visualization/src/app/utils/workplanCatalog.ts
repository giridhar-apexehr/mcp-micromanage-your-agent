/**
 * Workplan catalog types and normalization helpers.
 */

export type WorkplanCatalog = {
  agents: Array<{
    agentId: string
    workplans: Array<{
      workplanId: string
      goal?: string
      hasTicket: boolean
    }>
  }>
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

const hasTicketGoal = (ticket: unknown): ticket is { goal: string } => {
  return isRecord(ticket) && typeof ticket.goal === 'string'
}

const hasTicketEntry = (ticket: unknown): boolean => {
  return ticket !== 'noTicket' && isRecord(ticket)
}

const getTicketGoal = (ticket: unknown): string | undefined => {
  return isRecord(ticket) && typeof ticket.goal === 'string'
    ? String(ticket.goal)
    : undefined
}

/**
 * Builds a normalized catalog of agents and workplans from the JSON payload.
 *
 * Supports multiple legacy schemas:
 * - Current: `{ agents: { [agentId]: { workplans: { [workplanId]: ticket }}}}`
 * - Legacy: `{ workplans: { [workplanId]: ticket }}`
 * - Legacy: `{ currentTicket: ticket }`
 */
export const buildWorkplanCatalog = (
  actualWorkPlan: unknown,
): WorkplanCatalog => {
  // Prefer the current schema: agents[agentId].workplans[workplanId]
  if (isRecord(actualWorkPlan) && isRecord(actualWorkPlan.agents)) {
    const agentsObject = actualWorkPlan.agents as Record<string, unknown>
    const agents = Object.entries(agentsObject)
      .map(([agentId, agentState]) => {
        const rawWorkplans: Record<string, unknown> =
          isRecord(agentState) && isRecord(agentState.workplans)
            ? (agentState.workplans as Record<string, unknown>)
            : {}

        const workplans = Object.entries(rawWorkplans)
          .map(([workplanId, ticket]) => {
            const hasTicket = hasTicketEntry(ticket)
            return {
              workplanId,
              goal: getTicketGoal(ticket),
              hasTicket,
            }
          })
          .sort((a, b) => a.workplanId.localeCompare(b.workplanId))

        return { agentId, workplans }
      })
      .sort((a, b) => a.agentId.localeCompare(b.agentId))

    return { agents }
  }

  // Legacy support: pre-agent schema
  if (isRecord(actualWorkPlan) && isRecord(actualWorkPlan.workplans)) {
    const rawWorkplans = actualWorkPlan.workplans as Record<string, unknown>
    const workplans = Object.entries(rawWorkplans)
      .map(([workplanId, ticket]) => {
        const hasTicket = hasTicketGoal(ticket)
        return {
          workplanId,
          goal: hasTicket ? String(ticket.goal) : undefined,
          hasTicket,
        }
      })
      .sort((a, b) => a.workplanId.localeCompare(b.workplanId))

    return { agents: [{ agentId: 'legacy', workplans }] }
  }

  // Legacy support: currentTicket schema
  if (
    isRecord(actualWorkPlan) &&
    'currentTicket' in actualWorkPlan &&
    actualWorkPlan.currentTicket
  ) {
    const ticket = (actualWorkPlan as Record<string, unknown>).currentTicket
    const hasTicket = hasTicketGoal(ticket)
    return {
      agents: [
        {
          agentId: 'legacy',
          workplans: [
            {
              workplanId: 'legacy',
              goal: hasTicket ? String(ticket.goal) : undefined,
              hasTicket,
            },
          ],
        },
      ],
    }
  }

  return { agents: [] }
}

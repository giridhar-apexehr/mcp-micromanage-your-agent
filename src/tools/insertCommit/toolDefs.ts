import { z } from 'zod'
import { Tool, createErrorResponse, InsertCommitInput } from '../common.js'
import { mcpProxyConfig, workPlan } from '../../index.js'
import logger from '../../utils/logger.js'
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js'
import { callRemoteTool } from '../proxy/http.js'

const goalLengthErrorMessage =
  'Goal must be at most 60 characters. Consider moving detailed information to the developerNote field.'
const developerNoteLengthErrorMessage =
  'Developer note must be at most 300 characters. Consider breaking it into smaller, focused notes.'

export const INSERT_COMMIT_TOOL: Tool<{
  prIndex: z.ZodNumber
  insertAfterCommitIndex: z.ZodNumber
  goal: z.ZodString
  developerNote?: z.ZodOptional<z.ZodString>
  agentId: z.ZodString
  workplanId: z.ZodString
}> = {
  name: 'insertCommit',
  description: `
    Insert a new commit plan into an existing PR at a specific position.

    The commit will be created in the "not_started" state.

    Notes:
    - insertAfterCommitIndex = -1 inserts the commit at the beginning.
    - The PR status will be recomputed based on commit statuses.
    - State will be persisted.
  `,
  schema: {
    prIndex: z
      .number()
      .int()
      .min(0, 'PR index must be a non-negative integer')
      .describe(
        'Index of the PR to insert the commit into. Zero-based index in the PR array.',
      ),
    insertAfterCommitIndex: z
      .number()
      .int()
      .describe(
        'Insert after this commit index. Use -1 to insert at the beginning.',
      ),
    goal: z
      .string()
      .min(1, 'Goal must be a non-empty string')
      .max(60, goalLengthErrorMessage)
      .describe(
        'Description of what this commit aims to accomplish. Should match the format of an actual commit message - concise and specific.',
      ),
    developerNote: z
      .string()
      .max(300, developerNoteLengthErrorMessage)
      .optional()
      .describe(
        'Developer implementation notes for this commit. Use this field for detailed HOW information and implementation considerations discovered during refinement.',
      ),
    agentId: z
      .string()
      .min(1, 'agentId must be a non-empty string')
      .describe('Required identifier for the calling agent.'),
    workplanId: z
      .string()
      .min(1, 'workplanId must be a non-empty string')
      .describe('Required identifier for which workplan to update.'),
  },
  handler: async (params, extra: RequestHandlerExtra) => {
    try {
      logger.info(
        `InsertCommit tool called for PR #${params.prIndex} after commit #${params.insertAfterCommitIndex}`,
      )

      if (mcpProxyConfig.mode === 'remote') {
        const payload: InsertCommitInput = {
          prIndex: params.prIndex,
          insertAfterCommitIndex: params.insertAfterCommitIndex,
          goal: params.goal,
          developerNote: params.developerNote
            ? String(params.developerNote)
            : undefined,
        }

        return await callRemoteTool(mcpProxyConfig, {
          method: 'POST',
          path: `/api/me/workplans/${encodeURIComponent(String(params.workplanId))}/insert-commit`,
          body: payload,
        })
      }

      if (!workPlan) {
        logger.error('WorkPlan instance is not available')
        return createErrorResponse('WorkPlan instance is not initialized')
      }

      if (!workPlan.isInitialized()) {
        logger.error('WorkPlan is not initialized')
        return createErrorResponse(
          'WorkPlan is not ready. Server initialization incomplete.',
        )
      }

      const insertParams: InsertCommitInput = {
        prIndex: params.prIndex,
        insertAfterCommitIndex: params.insertAfterCommitIndex,
        goal: params.goal,
        developerNote: params.developerNote
          ? String(params.developerNote)
          : undefined,
      }

      const result = workPlan.insertCommit(
        insertParams,
        String(params.agentId),
        String(params.workplanId),
      )

      return {
        content: result.content.map((item) => ({
          type: 'text' as const,
          text: item.text,
        })),
        isError: result.isError,
      }
    } catch (error) {
      logger.logError('Error in INSERT_COMMIT tool', error)
      return createErrorResponse(error)
    }
  },
}

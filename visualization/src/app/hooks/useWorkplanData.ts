/**
 * @file useWorkplanData
 *
 * React hook for loading and normalizing workplan data from `/data/workplan.json`.
 *
 * Responsibilities:
 * - Fetch the workplan JSON with cache-busting and no-cache headers.
 * - Build a normalized `WorkplanCatalog` for the Dashboard.
 * - Resolve the selected workplan/ticket based on URL params and `history.state.selected`.
 * - Convert the selected ticket into the `WorkPlan` shape used by the UI.
 * - Provide navigation helpers that update URL/history and trigger reload.
 * - Keep a `popstate` listener to reload when navigating browser history.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { CommitStatus, WorkPlan } from '../../types'
import { buildWorkplanCatalog, WorkplanCatalog } from '../utils/workplanCatalog'

export type UseWorkplanDataResult = {
  workplan: WorkPlan | null
  workplanCatalog: WorkplanCatalog | null
  lastLoadedTime: Date | null
  loadError: string | null
  isLoading: boolean
  loadData: () => Promise<void>
  openWorkplan: (agentId: string, workplanId: string) => void
  goToDashboard: () => void
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

const getString = (value: unknown): string | null => {
  return typeof value === 'string' ? value : null
}

/**
 * Loads and normalizes workplan data and selection state.
 */
export const useWorkplanData = (enabled = true): UseWorkplanDataResult => {
  const [workplan, setWorkplan] = useState<WorkPlan | null>(null)
  const [workplanCatalog, setWorkplanCatalog] =
    useState<WorkplanCatalog | null>(null)
  const [lastLoadedTime, setLastLoadedTime] = useState<Date | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [isLoading, setIsLoading] = useState<boolean>(false)
  const isLoadingRef = useRef<boolean>(false)

  const loadData = useCallback(async () => {
    if (!enabled) return
    if (isLoadingRef.current) return

    isLoadingRef.current = true
    setIsLoading(true)

    try {
      const fetchOptions = {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
          accept: 'application/json',
        },
      }

      const workspacesRes = await fetch('/api/workspaces', fetchOptions)
      if (workspacesRes.status === 401) {
        setWorkplan(null)
        setWorkplanCatalog({ agents: [] })
        setLastLoadedTime(new Date())
        setLoadError(null)
        return
      }

      if (!workspacesRes.ok) {
        throw new Error(
          `Failed to fetch workspaces. Status: ${workspacesRes.status}`,
        )
      }

      const workspacesBody = (await workspacesRes.json()) as unknown
      const rawWorkspaces =
        isRecord(workspacesBody) && Array.isArray(workspacesBody.workspaces)
          ? workspacesBody.workspaces
          : []

      const workspaceSummaries = rawWorkspaces
        .map((ws): { id: string; name: string | null } | null => {
          if (!isRecord(ws)) return null
          const id = getString(ws.id)
          if (!id) return null
          const name = getString(ws.name)
          return { id, name }
        })
        .filter(
          (ws): ws is { id: string; name: string | null } => ws !== null,
        )

      const workspaceIds = workspaceSummaries.map((ws) => ws.id)

      const workplansByWorkspace = await Promise.all(
        workspaceIds.map(async (workspaceId) => {
          const res = await fetch(
            `/api/workspaces/${encodeURIComponent(workspaceId)}/workplans`,
            fetchOptions,
          )
          if (!res.ok) {
            return { workspaceId, workplans: [] as Array<Record<string, unknown>> }
          }
          const body = (await res.json()) as unknown
          const workplans =
            isRecord(body) && Array.isArray(body.workplans) ? body.workplans : []
          return {
            workspaceId,
            workplans: workplans.filter((wp): wp is Record<string, unknown> =>
              isRecord(wp),
            ),
          }
        }),
      )

      const catalogPayload = {
        agents: Object.fromEntries(
          workplansByWorkspace.map(({ workspaceId, workplans }) => {
            const workspaceName =
              workspaceSummaries.find((ws) => ws.id === workspaceId)?.name ??
              undefined
            const workplanEntries = Object.fromEntries(
              workplans
                .map((wp) => {
                  const workplanId = getString(wp.id)
                  if (!workplanId) return null
                  const goal = getString(wp.goal) ?? ''
                  const ticketLike = { goal }
                  return [workplanId, ticketLike]
                })
                .filter(
                  (entry): entry is [string, { goal: string }] => entry !== null,
                ),
            )

            return [
              workspaceId,
              {
                ...(workspaceName ? { name: workspaceName } : {}),
                workplans: workplanEntries,
              },
            ]
          }),
        ),
      }

      const catalog = buildWorkplanCatalog(catalogPayload)
      setWorkplanCatalog(catalog)

      const selectionState = window.history.state as {
        selected?: boolean
      } | null
      const selectedByUser = selectionState?.selected === true

      if (!selectedByUser) {
        setWorkplan(null)
        setLastLoadedTime(new Date())
        setLoadError(null)
        return
      }

      const urlParams = new URLSearchParams(window.location.search)
      const requestedAgentId = urlParams.get('agentId')
      const requestedWorkplanId = urlParams.get('workplanId')

      if (!requestedAgentId || !requestedWorkplanId) {
        setWorkplan(null)
        setLastLoadedTime(new Date())
        setLoadError(null)
        return
      }

      const selectedTicketResponse = await fetch(
        `/api/workspaces/${encodeURIComponent(requestedAgentId)}/workplans/${encodeURIComponent(requestedWorkplanId)}`,
        fetchOptions,
      )

      if (!selectedTicketResponse.ok) {
        setWorkplan(null)
        setLastLoadedTime(new Date())
        setLoadError(null)
        return
      }

      const selectedTicketBody = (await selectedTicketResponse.json()) as unknown
      const resolvedTicket: unknown =
        isRecord(selectedTicketBody) && isRecord(selectedTicketBody.workplan)
          ? selectedTicketBody.workplan
          : null

      // If nothing selected or selection is ambiguous, we show the dashboard instead of erroring.
      if (!resolvedTicket || resolvedTicket === 'noTicket') {
        setWorkplan(null)
        setLastLoadedTime(new Date())
        setLoadError(null)
        return
      }

      if (
        !isRecord(resolvedTicket) ||
        typeof resolvedTicket.goal !== 'string' ||
        !Array.isArray(resolvedTicket.pullRequests)
      ) {
        setWorkplan(null)
        setLastLoadedTime(new Date())
        setLoadError(null)
        return
      }

      const convertedWorkPlan: WorkPlan = {
        goal: resolvedTicket.goal,
        prPlans: resolvedTicket.pullRequests.map(
          (pr: {
            goal: string
            status: string
            developerNote?: string
            commits: Array<{
              goal: string
              status: string
              developerNote?: string
            }>
          }) => ({
            goal: pr.goal,
            status: pr.status as CommitStatus,
            developerNote: pr.developerNote,
            commitPlans: pr.commits.map(
              (commit: {
                goal: string
                status: string
                developerNote?: string
              }) => ({
                goal: commit.goal,
                status: commit.status as CommitStatus,
                developerNote: commit.developerNote,
              }),
            ),
          }),
        ),
      }

      setWorkplan(convertedWorkPlan)
      setLastLoadedTime(new Date())
      setLoadError(null)
    } catch (error) {
      console.error('Error occurred while loading data:', error)
      setLoadError('Failed to load data.')
    } finally {
      isLoadingRef.current = false
      setIsLoading(false)
    }
  }, [enabled])

  const openWorkplan = useCallback(
    (agentId: string, workplanId: string) => {
      const url = new URL(window.location.href)
      url.searchParams.set('agentId', agentId)
      url.searchParams.set('workplanId', workplanId)
      window.history.pushState({ selected: true }, '', url.toString())
      loadData()
    },
    [loadData],
  )

  const goToDashboard = useCallback(() => {
    const url = new URL(window.location.href)
    url.searchParams.delete('agentId')
    url.searchParams.delete('workplanId')
    window.history.pushState({ selected: false }, '', url.toString())
    loadData()
  }, [loadData])

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false)
      isLoadingRef.current = false
      setLoadError(null)
      return
    }

    loadData()
  }, [loadData])

  useEffect(() => {
    const handlePopState = () => {
      loadData()
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [loadData])

  return {
    workplan,
    workplanCatalog,
    lastLoadedTime,
    loadError,
    isLoading,
    loadData,
    openWorkplan,
    goToDashboard,
  }
}

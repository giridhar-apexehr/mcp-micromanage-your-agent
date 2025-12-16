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

/**
 * Loads and normalizes workplan data and selection state.
 */
export const useWorkplanData = (): UseWorkplanDataResult => {
  const [workplan, setWorkplan] = useState<WorkPlan | null>(null)
  const [workplanCatalog, setWorkplanCatalog] =
    useState<WorkplanCatalog | null>(null)
  const [lastLoadedTime, setLastLoadedTime] = useState<Date | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [isLoading, setIsLoading] = useState<boolean>(false)
  const isLoadingRef = useRef<boolean>(false)

  const loadData = useCallback(async () => {
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
        },
      }

      const timestamp = new Date().getTime()
      const response = await fetch(
        `/data/workplan.json?t=${timestamp}`,
        fetchOptions,
      )
      if (!response.ok) {
        throw new Error(`Failed to fetch data. Status: ${response.status}`)
      }

      const actualWorkPlan: unknown = await response.json()

      const catalog = buildWorkplanCatalog(actualWorkPlan)
      setWorkplanCatalog(catalog)

      const selectionState = window.history.state as {
        selected?: boolean
      } | null
      const selectedByUser = selectionState?.selected === true

      const resolvedTicket = (() => {
        const urlParams = new URLSearchParams(window.location.search)
        const requestedAgentId = urlParams.get('agentId')
        const requestedWorkplanId = urlParams.get('workplanId')

        if (!selectedByUser) {
          return null
        }

        if (isRecord(actualWorkPlan)) {
          const record = actualWorkPlan

          if ('currentTicket' in record && record.currentTicket) {
            return record.currentTicket
          }

          if ('workplans' in record && isRecord(record.workplans)) {
            const workplans = record.workplans
            if (requestedWorkplanId && requestedWorkplanId in workplans) {
              return workplans[requestedWorkplanId]
            }
            return null
          }

          if ('agents' in record && isRecord(record.agents)) {
            const agents = record.agents
            const resolvedAgent = (() => {
              if (requestedAgentId && requestedAgentId in agents) {
                return agents[requestedAgentId]
              }
              return null
            })()

            if (!isRecord(resolvedAgent)) {
              return null
            }

            if (
              'workplans' in resolvedAgent &&
              isRecord(resolvedAgent.workplans)
            ) {
              const workplans = resolvedAgent.workplans
              if (requestedWorkplanId && requestedWorkplanId in workplans) {
                return workplans[requestedWorkplanId]
              }
            }

            return null
          }
        }

        return null
      })()

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
  }, [])

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

/**
 * @file usePolling
 *
 * React hook for managing the workplan auto-refresh polling behavior.
 *
 * Responsibilities:
 * - Persist polling interval (`pollingIntervalMs`) to localStorage.
 * - Manage polling enabled state.
 * - Schedule polling via `setTimeout` and clean up on dependency changes/unmount.
 * - Maintain the draft seconds input state used by the Auto-refresh panel.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type UsePollingParams = {
  /** Async callback used to refresh the app's data. */
  loadData: () => Promise<void>
}

export type UsePollingResult = {
  pollingEnabled: boolean
  togglePolling: () => void

  pollingIntervalMs: number
  setPollingIntervalMs: (nextMs: number) => void

  draftPollingSeconds: string
  setDraftPollingSeconds: (nextSeconds: string) => void

  currentPollingSeconds: number
  parsedDraftSeconds: number
  draftSecondsValid: boolean
  draftSecondsForSelection: number
}

/**
 * Hook that encapsulates auto-refresh (polling) state and scheduling.
 */
export const usePolling = ({
  loadData,
}: UsePollingParams): UsePollingResult => {
  const [pollingIntervalMs, setPollingIntervalMsState] = useState<number>(
    () => {
      const saved = localStorage.getItem('pollingIntervalMs')
      const parsed = saved ? Number(saved) : NaN
      if (Number.isFinite(parsed) && parsed > 0) return parsed
      return 1000
    },
  )

  const [pollingEnabled, setPollingEnabled] = useState<boolean>(true)

  const pollingTimeoutRef = useRef<number | null>(null)

  const [draftPollingSeconds, setDraftPollingSeconds] = useState<string>(() =>
    String(Math.max(1, Math.round(pollingIntervalMs / 1000))),
  )

  const setPollingIntervalMs = useCallback((nextMs: number) => {
    setPollingIntervalMsState(nextMs)
  }, [])

  const togglePolling = useCallback(() => {
    setPollingEnabled((prev) => !prev)
  }, [])

  useEffect(() => {
    localStorage.setItem('pollingIntervalMs', String(pollingIntervalMs))
    setDraftPollingSeconds(
      String(Math.max(1, Math.round(pollingIntervalMs / 1000))),
    )
  }, [pollingIntervalMs])

  useEffect(() => {
    const setupPolling = () => {
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current)
        pollingTimeoutRef.current = null
      }

      if (pollingEnabled && pollingIntervalMs > 0) {
        pollingTimeoutRef.current = window.setTimeout(() => {
          loadData().finally(() => {
            if (pollingEnabled) {
              setupPolling()
            }
          })
        }, pollingIntervalMs)
      }
    }

    setupPolling()

    return () => {
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current)
        pollingTimeoutRef.current = null
      }
    }
  }, [loadData, pollingEnabled, pollingIntervalMs])

  const currentPollingSeconds = useMemo(
    () => Math.max(1, Math.round(pollingIntervalMs / 1000)),
    [pollingIntervalMs],
  )
  const parsedDraftSeconds = useMemo(
    () => Number(draftPollingSeconds),
    [draftPollingSeconds],
  )
  const draftSecondsValid = useMemo(
    () => Number.isFinite(parsedDraftSeconds) && parsedDraftSeconds > 0,
    [parsedDraftSeconds],
  )
  const draftSecondsForSelection = useMemo(
    () =>
      draftSecondsValid
        ? Math.round(parsedDraftSeconds)
        : currentPollingSeconds,
    [draftSecondsValid, parsedDraftSeconds, currentPollingSeconds],
  )

  return {
    pollingEnabled,
    togglePolling,
    pollingIntervalMs,
    setPollingIntervalMs,
    draftPollingSeconds,
    setDraftPollingSeconds,
    currentPollingSeconds,
    parsedDraftSeconds,
    draftSecondsValid,
    draftSecondsForSelection,
  }
}

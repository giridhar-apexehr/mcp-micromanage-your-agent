/**
 * @file WorkplanActionsBar
 *
 * Action bar for the workplan page header.
 *
 * Renders:
 * - Last updated timestamp
 * - Auto-refresh toggle + dropdown trigger (split button)
 * - Manual refresh
 * - Theme toggle
 * - Filter toggle
 */

import { useCallback, useState, type RefObject } from 'react'
import {
  Camera,
  ChevronDown,
  Monitor,
  Moon,
  RefreshCw,
  RotateCw,
  SlidersHorizontal,
  Sun,
} from 'lucide-react'
import { toPng } from 'html-to-image'
import { getNodesBounds, useReactFlow } from 'reactflow'

import type { ThemeMode } from '../../app/hooks/useThemeMode'

type WorkplanActionsBarProps = {
  lastLoadedTime: Date | null

  pollingEnabled: boolean
  currentPollingSeconds: number
  showAutoRefreshPanel: boolean
  autoRefreshAnchorRef: RefObject<HTMLDivElement | null>
  autoRefreshButtonRef: RefObject<HTMLButtonElement | null>
  onTogglePolling: () => void
  onToggleAutoRefreshDropdown: () => void
  onCloseAutoRefreshPanel: () => void

  isLoading: boolean
  refreshSpinTick: number
  onRefresh: () => void

  themeMode: ThemeMode
  onToggleThemeMode: () => void

  showFilterPanel: boolean
  filterButtonRef: RefObject<HTMLButtonElement | null>
  onToggleFilterPanel: () => void
}

/**
 * Workplan actions bar component.
 */
function WorkplanActionsBar({
  lastLoadedTime,
  pollingEnabled,
  currentPollingSeconds,
  showAutoRefreshPanel,
  autoRefreshAnchorRef,
  autoRefreshButtonRef,
  onTogglePolling,
  onToggleAutoRefreshDropdown,
  onCloseAutoRefreshPanel,
  isLoading,
  refreshSpinTick,
  onRefresh,
  themeMode,
  onToggleThemeMode,
  showFilterPanel,
  filterButtonRef,
  onToggleFilterPanel,
}: WorkplanActionsBarProps) {
  const reactFlow = useReactFlow()
  const [isSnapshotting, setIsSnapshotting] = useState(false)

  const handleSnapshot = useCallback(async () => {
    if (isSnapshotting) return
    setIsSnapshotting(true)

    const flowRoot = document.querySelector('.react-flow') as HTMLElement | null
    if (!flowRoot) {
      setIsSnapshotting(false)
      return
    }

    const nodes = reactFlow.getNodes()
    if (nodes.length === 0) {
      setIsSnapshotting(false)
      return
    }

    const bounds = getNodesBounds(nodes)
    const longest = Math.max(bounds.width, bounds.height)
    const margin = longest * 0.1

    const width = Math.ceil(bounds.width + margin * 2)
    const height = Math.ceil(bounds.height + margin * 2)

    const prevViewport = reactFlow.getViewport()
    const prevWidth = flowRoot.style.width
    const prevHeight = flowRoot.style.height
    const prevOverflow = flowRoot.style.overflow

    try {
      flowRoot.style.width = `${width}px`
      flowRoot.style.height = `${height}px`
      flowRoot.style.overflow = 'visible'

      await reactFlow.setViewport(
        {
          x: -bounds.x + margin,
          y: -bounds.y + margin,
          zoom: 1,
        },
        { duration: 0 },
      )

      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      )

      const dataUrl = await toPng(flowRoot, {
        pixelRatio: 1,
        filter: (node) => {
          if (!(node instanceof HTMLElement)) return true
          if (node.classList.contains('react-flow__minimap')) return false
          if (node.classList.contains('react-flow__controls')) return false
          if (node.classList.contains('react-flow__panel')) return false
          return true
        },
      })

      const a = document.createElement('a')
      a.href = dataUrl
      a.download = 'workplan-snapshot.png'
      a.click()
    } finally {
      flowRoot.style.width = prevWidth
      flowRoot.style.height = prevHeight
      flowRoot.style.overflow = prevOverflow

      await reactFlow.setViewport(prevViewport, { duration: 0 })
      setIsSnapshotting(false)
    }
  }, [isSnapshotting, reactFlow])

  return (
    <div className="topbar-actions">
      {lastLoadedTime && (
        <span className="topbar-meta">
          Updated {lastLoadedTime.toLocaleTimeString()}
        </span>
      )}

      <div className="morphic-bar" role="group" aria-label="Actions">
        <div
          className="morphic-split"
          role="group"
          aria-label="Auto refresh"
          ref={autoRefreshAnchorRef}
        >
          <button
            onClick={() => {
              onTogglePolling()
              if (showAutoRefreshPanel) {
                onCloseAutoRefreshPanel()
              }
            }}
            className={`morphic-btn morphic-btn--quiet morphic-split__left ${pollingEnabled ? 'is-on' : 'is-off'}`}
            title={
              pollingEnabled
                ? `Stop auto-refresh (every ${currentPollingSeconds}s)`
                : `Start auto-refresh (every ${currentPollingSeconds}s)`
            }
            aria-label={
              pollingEnabled
                ? `Stop auto-refresh (every ${currentPollingSeconds} seconds)`
                : `Start auto-refresh (every ${currentPollingSeconds} seconds)`
            }
            type="button"
          >
            <span className="morphic-btn__icon" aria-hidden="true">
              <RotateCw
                className={`morphic-icon ${pollingEnabled ? 'is-spinning' : ''}`}
                size={18}
                strokeWidth={2}
              />
            </span>
            <span className="morphic-btn__label">Auto</span>
            <span
              className={`morphic-dot ${pollingEnabled ? 'is-on' : 'is-off'}`}
              aria-hidden="true"
            />
          </button>

          <button
            onClick={onToggleAutoRefreshDropdown}
            ref={autoRefreshButtonRef}
            className={`morphic-btn morphic-btn--icon morphic-split__right ${showAutoRefreshPanel ? 'is-active' : ''}`}
            title="Auto-refresh interval"
            aria-label="Auto-refresh interval"
            aria-haspopup="dialog"
            aria-expanded={showAutoRefreshPanel}
            type="button"
          >
            <span className="morphic-btn__icon" aria-hidden="true">
              <ChevronDown className="morphic-icon" size={18} strokeWidth={2} />
            </span>
          </button>
        </div>

        <div className="morphic-divider" aria-hidden="true" />

        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="morphic-btn"
          title="Refresh now"
          aria-label="Refresh now"
          type="button"
        >
          <span className="morphic-btn__icon" aria-hidden="true">
            <RefreshCw
              key={refreshSpinTick}
              className={`morphic-icon ${refreshSpinTick > 0 ? 'morphic-icon--spin-once' : ''}`}
              size={18}
              strokeWidth={2}
            />
          </span>
          <span className="morphic-btn__label">Refresh</span>
        </button>

        <button
          onClick={handleSnapshot}
          disabled={isLoading || isSnapshotting}
          className="morphic-btn morphic-btn--icon"
          title={isSnapshotting ? 'Creating snapshot…' : 'Snapshot (100%)'}
          aria-label={
            isSnapshotting ? 'Creating snapshot' : 'Snapshot at 100% scale'
          }
          type="button"
        >
          <span className="morphic-btn__icon" aria-hidden="true">
            <Camera className="morphic-icon" size={18} strokeWidth={2} />
          </span>
        </button>

        <button
          onClick={onToggleThemeMode}
          className="morphic-btn morphic-btn--icon"
          title={`Theme: ${themeMode.charAt(0).toUpperCase()}${themeMode.slice(1)} (click to change)`}
          aria-label={`Theme: ${themeMode}. Click to change.`}
          type="button"
        >
          <span className="morphic-btn__icon" aria-hidden="true">
            {themeMode === 'light' && (
              <Sun className="morphic-icon" size={18} strokeWidth={2} />
            )}
            {themeMode === 'dark' && (
              <Moon className="morphic-icon" size={18} strokeWidth={2} />
            )}
            {themeMode === 'system' && (
              <Monitor className="morphic-icon" size={18} strokeWidth={2} />
            )}
          </span>
        </button>

        <button
          onClick={onToggleFilterPanel}
          ref={filterButtonRef}
          className={`morphic-btn ${showFilterPanel ? 'is-active' : ''}`}
          aria-label="Open filter"
          type="button"
        >
          <span className="morphic-btn__icon" aria-hidden="true">
            <SlidersHorizontal
              className="morphic-icon"
              size={18}
              strokeWidth={2}
            />
          </span>
          <span className="morphic-btn__label">Filter</span>
        </button>
      </div>
    </div>
  )
}

export { WorkplanActionsBar }

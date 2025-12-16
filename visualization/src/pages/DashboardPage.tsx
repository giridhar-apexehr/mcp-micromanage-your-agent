/**
 * @file DashboardPage
 *
 * Dashboard page shown when no workplan is selected.
 *
 * Renders:
 * - Header with theme toggle
 * - Workplan catalog list grouped by agent
 */

import { Monitor, Moon, Sun } from 'lucide-react'

import type { ThemeMode } from '../app/hooks/useThemeMode'
import type { WorkplanCatalog } from '../app/utils/workplanCatalog'

type DashboardPageProps = {
  isDarkMode: boolean
  themeMode: ThemeMode
  toggleThemeMode: () => void
  workplanCatalog: WorkplanCatalog | null
  lastLoadedTime: Date | null
  openWorkplan: (agentId: string, workplanId: string) => void
}

/**
 * Dashboard page showing available agents/workplans.
 */
export function DashboardPage({
  isDarkMode,
  themeMode,
  toggleThemeMode,
  workplanCatalog,
  lastLoadedTime,
  openWorkplan,
}: DashboardPageProps) {
  return (
    <div className={`app ${isDarkMode ? 'dark-theme' : 'light-theme'}`}>
      <header className="app-topbar">
        <div className="topbar-inner">
          <div className="topbar-brand">
            <div className="topbar-title">Workplans</div>
            <div
              className="topbar-subtitle"
              title="Select an agent and workplan"
            >
              Select an agent and workplan
            </div>
          </div>

          <div className="topbar-actions">
            <button
              onClick={toggleThemeMode}
              className="morphic-btn morphic-btn--icon"
              aria-label="Toggle theme"
              title="Toggle theme"
              type="button"
            >
              {themeMode === 'system' ? (
                <Monitor size={16} />
              ) : themeMode === 'dark' ? (
                <Moon size={16} />
              ) : (
                <Sun size={16} />
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="morphic-panel">
            <div className="morphic-panel-title">Dashboard</div>
            <div className="text-sm opacity-80 mb-4">
              {lastLoadedTime
                ? `Last updated: ${lastLoadedTime.toLocaleTimeString()}`
                : 'Loading...'}
            </div>

            <div className="space-y-6">
              {(workplanCatalog?.agents ?? []).map((agent) => (
                <div key={agent.agentId} className="morphic-subpanel">
                  <div className="font-semibold mb-3">{agent.agentId}</div>
                  {agent.workplans.length === 0 ? (
                    <div className="text-sm opacity-70">No workplans</div>
                  ) : (
                    <div className="grid gap-2">
                      {agent.workplans.map((wp) => (
                        <button
                          key={`${agent.agentId}:${wp.workplanId}`}
                          type="button"
                          className="morphic-row-button"
                          onClick={() =>
                            openWorkplan(agent.agentId, wp.workplanId)
                          }
                          disabled={!wp.hasTicket}
                          title={
                            wp.hasTicket
                              ? 'Open workplan'
                              : 'No ticket planned for this workplan'
                          }
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0">
                              <div className="font-medium truncate">
                                {wp.workplanId}
                              </div>
                              <div className="text-sm opacity-75 truncate">
                                {wp.goal ?? 'No ticket'}
                              </div>
                            </div>
                            <div className="opacity-70">›</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

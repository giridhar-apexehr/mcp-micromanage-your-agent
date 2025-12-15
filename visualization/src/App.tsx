import { useState, useEffect, useCallback, useRef } from 'react'
import { ReactFlowProvider } from 'reactflow'
import WorkplanFlow from './components/WorkplanFlow'
import FilterPanel, { FilterOptions } from './components/FilterPanel'
import OrientationWarning from './components/OrientationWarning'
import { useThemeMode } from './app/hooks/useThemeMode'
import { useWorkplanData } from './app/hooks/useWorkplanData'
import { ArrowLeft, ChevronDown, Monitor, Moon, RefreshCw, RotateCw, SlidersHorizontal, Sun } from 'lucide-react'
import './App.css'

function App() {
  const {
    workplan,
    workplanCatalog,
    lastLoadedTime,
    loadError,
    isLoading,
    loadData,
    openWorkplan,
    goToDashboard: goToDashboardBase
  } = useWorkplanData();
  // Polling interval (milliseconds)
  const [pollingIntervalMs, setPollingIntervalMs] = useState<number>(() => {
    const saved = localStorage.getItem('pollingIntervalMs');
    const parsed = saved ? Number(saved) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return 1000;
  });
  // Whether polling is enabled
  const [pollingEnabled, setPollingEnabled] = useState<boolean>(true);
  const [refreshSpinTick, setRefreshSpinTick] = useState<number>(0);
  // Track last polling attempt
  const pollingTimeoutRef = useRef<number | null>(null);
  const [showAutoRefreshPanel, setShowAutoRefreshPanel] = useState<boolean>(false);
  const autoRefreshAnchorRef = useRef<HTMLDivElement | null>(null);
  const autoRefreshButtonRef = useRef<HTMLButtonElement | null>(null);
  const autoRefreshPanelRef = useRef<HTMLDivElement | null>(null);
  const [autoRefreshPanelPosition, setAutoRefreshPanelPosition] = useState<{ top: number; left: number } | null>(null);
  const [isAutoRefreshPanelRendered, setIsAutoRefreshPanelRendered] = useState<boolean>(false);
  const autoRefreshPanelCloseTimeoutRef = useRef<number | null>(null);
  const [draftPollingSeconds, setDraftPollingSeconds] = useState<string>(() => String(Math.max(1, Math.round(pollingIntervalMs / 1000))));
  
  const [showFilterPanel, setShowFilterPanel] = useState<boolean>(false);
  const filterButtonRef = useRef<HTMLButtonElement | null>(null);
  const [filterPanelPosition, setFilterPanelPosition] = useState<{ top: number; left: number } | null>(null);
  const [isFilterPanelRendered, setIsFilterPanelRendered] = useState<boolean>(false);
  const filterPanelCloseTimeoutRef = useRef<number | null>(null);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    statusFilter: 'all',
    searchQuery: '',
    onlyShowActive: false
  });

  const { themeMode, isDarkMode, toggleThemeMode } = useThemeMode();

  const goToDashboard = useCallback(() => {
    setShowAutoRefreshPanel(false);
    setIsAutoRefreshPanelRendered(false);
    setShowFilterPanel(false);
    setIsFilterPanelRendered(false);
    goToDashboardBase();
  }, [goToDashboardBase]);

  // Get data from JSON file on initial load
  useEffect(() => {
    // Initial load
    loadData();
    
    // Set up polling
    const setupPolling = () => {
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
        pollingTimeoutRef.current = null;
      }
      
      if (pollingEnabled && pollingIntervalMs > 0) {
        pollingTimeoutRef.current = window.setTimeout(() => {
          // Load data, then schedule next polling
          loadData().finally(() => {
            if (pollingEnabled) {
              setupPolling();
            }
          });
        }, pollingIntervalMs);
      }
    };
    
    // Start polling
    setupPolling();
    
    // Clean up on component unmount
    return () => {
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
        pollingTimeoutRef.current = null;
      }
    };
  }, [loadData, pollingEnabled, pollingIntervalMs]);

  useEffect(() => {
    localStorage.setItem('pollingIntervalMs', String(pollingIntervalMs));
    setDraftPollingSeconds(String(Math.max(1, Math.round(pollingIntervalMs / 1000))));
  }, [pollingIntervalMs]);

  // Filter options change handler
  const handleFilterChange = useCallback((newOptions: FilterOptions) => {
    setFilterOptions(newOptions);
  }, []);

  // Filter button click handler
  const closeFilterPanel = useCallback(() => {
    setShowFilterPanel(false);

    if (filterPanelCloseTimeoutRef.current) {
      window.clearTimeout(filterPanelCloseTimeoutRef.current);
      filterPanelCloseTimeoutRef.current = null;
    }

    // Keep mounted briefly so CSS transition can animate out.
    filterPanelCloseTimeoutRef.current = window.setTimeout(() => {
      setIsFilterPanelRendered(false);
      filterPanelCloseTimeoutRef.current = null;
    }, 180);
  }, []);

  const openFilterPanel = useCallback(() => {
    if (filterPanelCloseTimeoutRef.current) {
      window.clearTimeout(filterPanelCloseTimeoutRef.current);
      filterPanelCloseTimeoutRef.current = null;
    }

    setIsFilterPanelRendered(true);
    // Defer to allow initial DOM paint so transition can play.
    requestAnimationFrame(() => {
      setShowFilterPanel(true);
    });
  }, []);

  const handleFilterClick = useCallback(() => {
    if (showFilterPanel) {
      closeFilterPanel();
      return;
    }
    openFilterPanel();
  }, [closeFilterPanel, openFilterPanel, showFilterPanel]);

  const closeAutoRefreshPanel = useCallback(() => {
    setShowAutoRefreshPanel(false);

    if (autoRefreshPanelCloseTimeoutRef.current) {
      window.clearTimeout(autoRefreshPanelCloseTimeoutRef.current);
      autoRefreshPanelCloseTimeoutRef.current = null;
    }

    autoRefreshPanelCloseTimeoutRef.current = window.setTimeout(() => {
      setIsAutoRefreshPanelRendered(false);
      autoRefreshPanelCloseTimeoutRef.current = null;
    }, 180);
  }, []);

  const openAutoRefreshPanel = useCallback(() => {
    if (autoRefreshPanelCloseTimeoutRef.current) {
      window.clearTimeout(autoRefreshPanelCloseTimeoutRef.current);
      autoRefreshPanelCloseTimeoutRef.current = null;
    }

    setIsAutoRefreshPanelRendered(true);
    requestAnimationFrame(() => {
      setShowAutoRefreshPanel(true);
    });
  }, []);

  const handleAutoRefreshDropdownClick = useCallback(() => {
    if (showAutoRefreshPanel) {
      closeAutoRefreshPanel();
      return;
    }
    openAutoRefreshPanel();
  }, [closeAutoRefreshPanel, openAutoRefreshPanel, showAutoRefreshPanel]);

  useEffect(() => {
    return () => {
      if (autoRefreshPanelCloseTimeoutRef.current) {
        window.clearTimeout(autoRefreshPanelCloseTimeoutRef.current);
      }
    };
  }, []);

  const updateAutoRefreshPanelPosition = useCallback(() => {
    const button = autoRefreshButtonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const margin = 10;
    const viewportWidth = window.innerWidth;
    const panelWidth = Math.min(320, Math.max(220, viewportWidth - 20));
    const desiredLeft = rect.left;
    const clampedLeft = Math.min(Math.max(10, desiredLeft), viewportWidth - 10 - panelWidth);
    const top = rect.bottom + margin;

    setAutoRefreshPanelPosition({ top, left: clampedLeft });
  }, []);

  useEffect(() => {
    if (!showAutoRefreshPanel) return;

    updateAutoRefreshPanelPosition();

    const handleViewportChange = () => {
      updateAutoRefreshPanelPosition();
    };

    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [showAutoRefreshPanel, updateAutoRefreshPanelPosition]);

  useEffect(() => {
    if (!showAutoRefreshPanel) return;

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (autoRefreshAnchorRef.current && autoRefreshAnchorRef.current.contains(target)) {
        return;
      }
      if (autoRefreshPanelRef.current && autoRefreshPanelRef.current.contains(target)) {
        return;
      }
      closeAutoRefreshPanel();
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [closeAutoRefreshPanel, showAutoRefreshPanel]);

  useEffect(() => {
    if (!showAutoRefreshPanel) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeAutoRefreshPanel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeAutoRefreshPanel, showAutoRefreshPanel]);

  useEffect(() => {
    return () => {
      if (filterPanelCloseTimeoutRef.current) {
        window.clearTimeout(filterPanelCloseTimeoutRef.current);
      }
    };
  }, []);

  const updateFilterPanelPosition = useCallback(() => {
    const button = filterButtonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const margin = 10;
    const viewportWidth = window.innerWidth;

    // Keep behavior consistent with CSS: width is at most 320px, but can shrink to fit viewport.
    const panelWidth = Math.min(320, Math.max(200, viewportWidth - 20));
    const desiredLeft = rect.left;
    const clampedLeft = Math.min(Math.max(10, desiredLeft), viewportWidth - 10 - panelWidth);
    const top = rect.bottom + margin;

    setFilterPanelPosition({ top, left: clampedLeft });
  }, []);

  useEffect(() => {
    if (!showFilterPanel) return;

    updateFilterPanelPosition();

    const handleViewportChange = () => {
      updateFilterPanelPosition();
    };

    window.addEventListener('resize', handleViewportChange);
    // Capture scroll events from nested scroll containers too.
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [showFilterPanel, updateFilterPanelPosition]);
  
  // Polling settings toggle handler
  const togglePolling = useCallback(() => {
    setPollingEnabled(prev => !prev);
  }, []);

  const AUTO_REFRESH_PRESETS_SECONDS = [1, 2, 5, 10, 30, 60];
  const currentPollingSeconds = Math.max(1, Math.round(pollingIntervalMs / 1000));
  const parsedDraftSeconds = Number(draftPollingSeconds);
  const draftSecondsValid = Number.isFinite(parsedDraftSeconds) && parsedDraftSeconds > 0;
  const draftSecondsForSelection = draftSecondsValid ? Math.round(parsedDraftSeconds) : currentPollingSeconds;

  // Fallback display for errors
  if (loadError) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white dark:bg-gray-900 z-50">
        <div className="text-center p-8 max-w-md">
          <div className="animate-pulse text-5xl mb-6">⚠️</div>
          <h2 className="text-xl font-bold text-red-600 dark:text-red-400 mb-4">
            An error occurred
          </h2>
          <p className="text-gray-700 dark:text-gray-300 mb-6">
            {loadError || "Workplan data not found"}
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }

  if (!workplan) {
    return (
      <div className={`app ${isDarkMode ? 'dark-theme' : 'light-theme'}`}>
        <header className="app-topbar">
          <div className="topbar-inner">
            <div className="topbar-brand">
              <div className="topbar-title">Workplans</div>
              <div className="topbar-subtitle" title="Select an agent and workplan">
                Select an agent and workplan
              </div>
            </div>

            <div className="topbar-actions">
              <button
                onClick={toggleThemeMode}
                className="morphic-btn morphic-btn--icon"
                aria-label="Toggle theme"
                title="Toggle theme"
              >
                {themeMode === 'system' ? <Monitor size={16} /> : themeMode === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <div className="max-w-5xl mx-auto px-6 py-8">
            <div className="morphic-panel">
              <div className="morphic-panel-title">Dashboard</div>
              <div className="text-sm opacity-80 mb-4">
                {lastLoadedTime ? `Last updated: ${lastLoadedTime.toLocaleTimeString()}` : 'Loading...'}
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
                            onClick={() => openWorkplan(agent.agentId, wp.workplanId)}
                            disabled={!wp.hasTicket}
                            title={wp.hasTicket ? 'Open workplan' : 'No ticket planned for this workplan'}
                          >
                            <div className="flex items-center justify-between gap-4">
                              <div className="min-w-0">
                                <div className="font-medium truncate">{wp.workplanId}</div>
                                <div className="text-sm opacity-75 truncate">{wp.goal ?? 'No ticket'}</div>
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
    );
  }

  return (
    <div className={`app ${isDarkMode ? 'dark-theme' : 'light-theme'}`}>
      <header className="app-topbar">
        <div className="topbar-inner">
          <div className="topbar-nav">
            <button
              type="button"
              className="morphic-btn morphic-btn--icon"
              onClick={goToDashboard}
              title="Back to dashboard"
              aria-label="Back to dashboard"
            >
              <span className="morphic-btn__icon" aria-hidden="true">
                <ArrowLeft className="morphic-icon" size={18} strokeWidth={2} />
              </span>
            </button>
          </div>

          <div className="topbar-brand">
            {/* Currently unused area - available for future use */}
            <div className="topbar-title">Workplan</div>
            <div className="topbar-subtitle" title={workplan.goal}>{workplan.goal}</div>
          </div>

          <div className="topbar-actions">
            {lastLoadedTime && (
              <span className="topbar-meta">
                Updated {lastLoadedTime.toLocaleTimeString()}
              </span>
            )}

            <div className="morphic-bar" role="group" aria-label="Actions">
              <div className="morphic-split" role="group" aria-label="Auto refresh" ref={autoRefreshAnchorRef}>
                <button
                  onClick={() => {
                    togglePolling();
                    if (showAutoRefreshPanel) {
                      closeAutoRefreshPanel();
                    }
                  }}
                  className={`morphic-btn morphic-btn--quiet morphic-split__left ${pollingEnabled ? 'is-on' : 'is-off'}`}
                  title={pollingEnabled ? `Stop auto-refresh (every ${currentPollingSeconds}s)` : `Start auto-refresh (every ${currentPollingSeconds}s)`}
                  aria-label={pollingEnabled ? `Stop auto-refresh (every ${currentPollingSeconds} seconds)` : `Start auto-refresh (every ${currentPollingSeconds} seconds)`}
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
                  <span className={`morphic-dot ${pollingEnabled ? 'is-on' : 'is-off'}`} aria-hidden="true" />
                </button>

                <button
                  onClick={handleAutoRefreshDropdownClick}
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
                onClick={() => {
                  setRefreshSpinTick((prev) => prev + 1);
                  loadData();
                }}
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
                onClick={toggleThemeMode}
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
                onClick={handleFilterClick}
                ref={filterButtonRef}
                className={`morphic-btn ${showFilterPanel ? 'is-active' : ''}`}
                aria-label="Open filter"
                type="button"
              >
                <span className="morphic-btn__icon" aria-hidden="true">
                  <SlidersHorizontal className="morphic-icon" size={18} strokeWidth={2} />
                </span>
                <span className="morphic-btn__label">Filter</span>
              </button>
            </div>
          </div>
        </div>
      </header>
      
      <main className="app-main">
        <ReactFlowProvider>
          <WorkplanFlow 
            workplan={workplan}
            filterOptions={filterOptions}
          />
        </ReactFlowProvider>
      </main>

      {isAutoRefreshPanelRendered && autoRefreshPanelPosition && (
        <div
          className={`auto-refresh-panel-container ${showAutoRefreshPanel ? 'is-open' : 'is-closed'}`}
          style={{ top: autoRefreshPanelPosition.top, left: autoRefreshPanelPosition.left }}
        >
          <div ref={autoRefreshPanelRef} className="auto-refresh-panel" role="dialog" aria-label="Auto-refresh settings">
            <div className="auto-refresh-panel__header">
              <div className="auto-refresh-panel__title">Auto-refresh</div>
              <div className="auto-refresh-panel__subtitle">Current: {currentPollingSeconds}s</div>
            </div>

            <div className="auto-refresh-panel__section">
              <div className="auto-refresh-panel__label">Presets</div>
              <div className="auto-refresh-panel__preset-grid" role="listbox" aria-label="Preset durations">
                {AUTO_REFRESH_PRESETS_SECONDS.map((seconds) => {
                  const selected = seconds === draftSecondsForSelection;
                  return (
                    <button
                      key={seconds}
                      type="button"
                      className={`auto-refresh-panel__preset ${selected ? 'is-selected' : ''}`}
                      aria-label={`${seconds} seconds`}
                      onClick={() => setDraftPollingSeconds(String(seconds))}
                    >
                      {seconds}s
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="auto-refresh-panel__section">
              <label className="auto-refresh-panel__label" htmlFor="auto-refresh-seconds">
                Custom (seconds)
              </label>
              <input
                id="auto-refresh-seconds"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                className="auto-refresh-panel__input"
                value={draftPollingSeconds}
                onChange={(e) => setDraftPollingSeconds(e.target.value)}
              />
            </div>

            <div className="auto-refresh-panel__footer">
              <button
                type="button"
                className="morphic-btn"
                disabled={!draftSecondsValid}
                onClick={() => {
                  if (!draftSecondsValid) return;
                  const nextMs = Math.round(parsedDraftSeconds) * 1000;
                  setPollingIntervalMs(nextMs);
                  closeAutoRefreshPanel();
                }}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Filter panel */}
      {isFilterPanelRendered && filterPanelPosition && (
        <div
          className={`filter-panel-container ${showFilterPanel ? 'is-open' : 'is-closed'}`}
          style={{ top: filterPanelPosition.top, left: filterPanelPosition.left }}
        >
          <FilterPanel
            options={filterOptions}
            onChange={handleFilterChange}
            isOpen={showFilterPanel}
            onClose={closeFilterPanel}
            ignoreOutsideClickRef={filterButtonRef}
          />
        </div>
      )}
      
      {/* Device orientation warning (mobile only) */}
      <OrientationWarning />
    </div>
  );
}

export default App

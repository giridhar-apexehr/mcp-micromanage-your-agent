import { useState, useEffect, useCallback, useRef } from 'react'
import FilterPanel, { FilterOptions } from './components/FilterPanel'
import OrientationWarning from './components/OrientationWarning'
import { useThemeMode } from './app/hooks/useThemeMode'
import { useWorkplanData } from './app/hooks/useWorkplanData'
import { usePolling } from './app/hooks/usePolling'
import DashboardPage from './components/dashboard/DashboardPage'
import WorkplanPage from './components/workplan/WorkplanPage'
import WorkplanTopbar from './components/workplan/WorkplanTopbar'
import WorkplanActionsBar from './components/workplan/WorkplanActionsBar'
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
  const {
    pollingEnabled,
    togglePolling,
    setPollingIntervalMs,
    draftPollingSeconds,
    setDraftPollingSeconds,
    currentPollingSeconds,
    parsedDraftSeconds,
    draftSecondsValid,
    draftSecondsForSelection
  } = usePolling({ loadData });
  const [refreshSpinTick, setRefreshSpinTick] = useState<number>(0);
  const [showAutoRefreshPanel, setShowAutoRefreshPanel] = useState<boolean>(false);
  const autoRefreshAnchorRef = useRef<HTMLDivElement | null>(null);
  const autoRefreshButtonRef = useRef<HTMLButtonElement | null>(null);
  const autoRefreshPanelRef = useRef<HTMLDivElement | null>(null);
  const [autoRefreshPanelPosition, setAutoRefreshPanelPosition] = useState<{ top: number; left: number } | null>(null);
  const [isAutoRefreshPanelRendered, setIsAutoRefreshPanelRendered] = useState<boolean>(false);
  const autoRefreshPanelCloseTimeoutRef = useRef<number | null>(null);

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
  
  const AUTO_REFRESH_PRESETS_SECONDS = [1, 2, 5, 10, 30, 60];

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
      <DashboardPage
        isDarkMode={isDarkMode}
        themeMode={themeMode}
        toggleThemeMode={toggleThemeMode}
        workplanCatalog={workplanCatalog}
        lastLoadedTime={lastLoadedTime}
        openWorkplan={openWorkplan}
      />
    );
  }

  return (
    <WorkplanPage
      isDarkMode={isDarkMode}
      workplan={workplan}
      filterOptions={filterOptions}
      header={(
        <WorkplanTopbar
          title={workplan.goal}
          onBack={goToDashboard}
          actions={(
            <WorkplanActionsBar
              lastLoadedTime={lastLoadedTime}
              pollingEnabled={pollingEnabled}
              currentPollingSeconds={currentPollingSeconds}
              showAutoRefreshPanel={showAutoRefreshPanel}
              autoRefreshAnchorRef={autoRefreshAnchorRef}
              autoRefreshButtonRef={autoRefreshButtonRef}
              onTogglePolling={togglePolling}
              onToggleAutoRefreshDropdown={handleAutoRefreshDropdownClick}
              onCloseAutoRefreshPanel={closeAutoRefreshPanel}
              isLoading={isLoading}
              refreshSpinTick={refreshSpinTick}
              onRefresh={() => {
                setRefreshSpinTick((prev) => prev + 1);
                loadData();
              }}
              themeMode={themeMode}
              onToggleThemeMode={toggleThemeMode}
              showFilterPanel={showFilterPanel}
              filterButtonRef={filterButtonRef}
              onToggleFilterPanel={handleFilterClick}
            />
          )}
        />
      )}
    >
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
    </WorkplanPage>
  );
}

export default App

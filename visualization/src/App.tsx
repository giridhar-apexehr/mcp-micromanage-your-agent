import { useState, useEffect, useCallback, useRef } from 'react'
import { ReactFlowProvider } from 'reactflow'
import WorkplanFlow from './components/WorkplanFlow'
import FilterPanel, { FilterOptions } from './components/FilterPanel'
import OrientationWarning from './components/OrientationWarning'
import { WorkPlan, CommitStatus } from './types'
import { Monitor, Moon, RefreshCw, RotateCw, SlidersHorizontal, Sun } from 'lucide-react'
import './App.css'

function App() {
  // Initialize with normalized sample data
  const [workplan, setWorkplan] = useState<WorkPlan | null>(null);
  const [lastLoadedTime, setLastLoadedTime] = useState<Date | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Polling interval (milliseconds)
  const [pollingInterval] = useState<number>(5000); // Default: 1 second
  // Whether polling is enabled
  const [pollingEnabled, setPollingEnabled] = useState<boolean>(true);
  // Loading flag
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const isLoadingRef = useRef<boolean>(false);
  const [refreshSpinTick, setRefreshSpinTick] = useState<number>(0);
  // Track last polling attempt
  const pollingTimeoutRef = useRef<number | null>(null);
  
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
  
  type ThemeMode = 'system' | 'light' | 'dark';

  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const savedThemeMode = localStorage.getItem('themeMode');
    if (savedThemeMode === 'system' || savedThemeMode === 'light' || savedThemeMode === 'dark') {
      return savedThemeMode;
    }

    const legacyDarkMode = localStorage.getItem('darkMode');
    if (legacyDarkMode !== null) {
      return legacyDarkMode === 'true' ? 'dark' : 'light';
    }

    return 'system';
  });

  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  const isDarkMode = themeMode === 'dark' ? true : themeMode === 'light' ? false : systemPrefersDark;

  // Separate data loading function for reusability
  const loadData = useCallback(async () => {
    if (isLoadingRef.current) return; // Do nothing if already loading
    
    isLoadingRef.current = true;
    setIsLoading(true);
    try {
      // Get JSON file directly (add timestamp parameter to avoid cache)
      // Options to completely disable caching
      const fetchOptions = {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      };
      
      const timestamp = new Date().getTime();
      const response = await fetch(`/data/workplan.json?t=${timestamp}`, fetchOptions);
      if (!response.ok) {
        throw new Error(`Failed to fetch data. Status: ${response.status}`);
      }
      
      const actualWorkPlan = await response.json();
      
      // Data structure conversion
      const convertedWorkPlan: WorkPlan = {
        goal: actualWorkPlan.currentTicket.goal,
        prPlans: actualWorkPlan.currentTicket.pullRequests.map((pr: {
          goal: string;
          status: string;
          developerNote?: string;
          commits: Array<{
            goal: string;
            status: string;
            developerNote?: string;
          }>;
        }) => ({
          goal: pr.goal,
          status: pr.status as CommitStatus,
          developerNote: pr.developerNote,
          commitPlans: pr.commits.map((commit: {
            goal: string;
            status: string;
            developerNote?: string;
          }) => ({
            goal: commit.goal,
            status: commit.status as CommitStatus,
            developerNote: commit.developerNote
          }))
        }))
      };
      
      // Apply updates
      setWorkplan(convertedWorkPlan);
      setLastLoadedTime(new Date());
      setLoadError(null);
    } catch (error) {
      console.error('Error occurred while loading data:', error);
      setLoadError('Failed to load data.');
    } finally {
      isLoadingRef.current = false;
      setIsLoading(false);
    }
  }, []);

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
      
      if (pollingEnabled && pollingInterval > 0) {
        pollingTimeoutRef.current = window.setTimeout(() => {
          // Load data, then schedule next polling
          loadData().finally(() => {
            if (pollingEnabled) {
              setupPolling();
            }
          });
        }, pollingInterval);
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
  }, [loadData, pollingEnabled, pollingInterval]);
  
  // Add/remove class from html tag when theme setting changes
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark-mode');
    } else {
      document.documentElement.classList.remove('dark-mode');
    }
    
    localStorage.setItem('themeMode', themeMode);
  }, [isDarkMode, themeMode]);

  useEffect(() => {
    if (themeMode !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemPrefersDark(event.matches);
    };

    setSystemPrefersDark(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, [themeMode]);

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
  
  const toggleThemeMode = useCallback(() => {
    setThemeMode((prev) => {
      if (prev === 'system') return 'dark';
      if (prev === 'dark') return 'light';
      return 'system';
    });
  }, []);

  // Polling settings toggle handler
  const togglePolling = useCallback(() => {
    setPollingEnabled(prev => !prev);
  }, []);

  // Fallback display for errors
  if (loadError || !workplan) {
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

  return (
    <div className={`app ${isDarkMode ? 'dark-theme' : 'light-theme'}`}>
      <header className="app-topbar">
        <div className="topbar-inner">
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
              <button
                onClick={togglePolling}
                className={`morphic-btn morphic-btn--quiet ${pollingEnabled ? 'is-on' : 'is-off'}`}
                title={pollingEnabled ? "Stop auto-refresh" : "Start auto-refresh"}
                aria-label={pollingEnabled ? "Stop auto-refresh" : "Start auto-refresh"}
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

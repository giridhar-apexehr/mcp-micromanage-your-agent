import { useState, useEffect, useCallback, useRef } from 'react'
import { ReactFlowProvider } from 'reactflow'
import WorkplanFlow from './components/WorkplanFlow'
import FilterPanel, { FilterOptions } from './components/FilterPanel'
import OrientationWarning from './components/OrientationWarning'
import { WorkPlan, CommitStatus } from './types'
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

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [themeMode]);

  // Filter options change handler
  const handleFilterChange = useCallback((newOptions: FilterOptions) => {
    setFilterOptions(newOptions);
  }, []);

  // Filter button click handler
  const handleFilterClick = useCallback(() => {
    setShowFilterPanel(true);
  }, []);
  
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
                  <svg className={`morphic-icon ${pollingEnabled ? 'is-spinning' : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path>
                    <path d="M21 3v5h-5"></path>
                  </svg>
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
                  <svg
                    key={refreshSpinTick}
                    className={`morphic-icon ${refreshSpinTick > 0 ? 'morphic-icon--spin-once' : ''}`}
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="1 4 1 10 7 10"></polyline>
                    <polyline points="23 20 23 14 17 14"></polyline>
                    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path>
                  </svg>
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
                    <svg className="morphic-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                    </svg>
                  )}
                  {themeMode === 'dark' && (
                    <svg className="morphic-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                    </svg>
                  )}
                  {themeMode === 'system' && (
                    <svg className="morphic-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="12" rx="2" ry="2" />
                      <line x1="8" y1="20" x2="16" y2="20" />
                      <line x1="12" y1="16" x2="12" y2="20" />
                    </svg>
                  )}
                </span>
              </button>

              <button
                onClick={handleFilterClick}
                className="morphic-btn morphic-btn--primary"
                aria-label="Open filter"
                type="button"
              >
                <span className="morphic-btn__icon" aria-hidden="true">
                  <svg className="morphic-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                  </svg>
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
      <div className="filter-panel-container">
        {showFilterPanel && (
          <FilterPanel
            options={filterOptions}
            onChange={handleFilterChange}
            isOpen={showFilterPanel}
            onClose={() => setShowFilterPanel(false)}
          />
        )}
      </div>
      
      {/* Device orientation warning (mobile only) */}
      <OrientationWarning />
    </div>
  );
}

export default App

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
import ErrorOverlay from './components/common/ErrorOverlay'
import AutoRefreshPanelHost, { AutoRefreshPanelApi } from './components/panels/AutoRefreshPanelHost'
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
  const autoRefreshAnchorRef = useRef<HTMLDivElement | null>(null);
  const autoRefreshButtonRef = useRef<HTMLButtonElement | null>(null);
  const autoRefreshApiRef = useRef<AutoRefreshPanelApi | null>(null);
  const [isAutoRefreshPanelOpen, setIsAutoRefreshPanelOpen] = useState<boolean>(false);

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
    autoRefreshApiRef.current?.reset();
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

  const handleAutoRefreshDropdownClick = useCallback(() => {
    autoRefreshApiRef.current?.toggle();
  }, []);

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
    return <ErrorOverlay loadError={loadError} onReload={() => window.location.reload()} />;
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
              showAutoRefreshPanel={isAutoRefreshPanelOpen}
              autoRefreshAnchorRef={autoRefreshAnchorRef}
              autoRefreshButtonRef={autoRefreshButtonRef}
              onTogglePolling={togglePolling}
              onToggleAutoRefreshDropdown={handleAutoRefreshDropdownClick}
              onCloseAutoRefreshPanel={() => autoRefreshApiRef.current?.close()}
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
      <AutoRefreshPanelHost
        anchorRef={autoRefreshButtonRef}
        ignoreOutsideClickRef={autoRefreshAnchorRef}
        onApi={(api) => {
          autoRefreshApiRef.current = api;
        }}
        onStateChange={({ isOpen }) => {
          setIsAutoRefreshPanelOpen(isOpen);
        }}
        currentPollingSeconds={currentPollingSeconds}
        presetsSeconds={AUTO_REFRESH_PRESETS_SECONDS}
        draftPollingSeconds={draftPollingSeconds}
        draftSecondsForSelection={draftSecondsForSelection}
        draftSecondsValid={draftSecondsValid}
        onSelectPresetSeconds={(seconds) => setDraftPollingSeconds(String(seconds))}
        onDraftSecondsChange={setDraftPollingSeconds}
        onApply={() => {
          if (!draftSecondsValid) return;
          const nextMs = Math.round(parsedDraftSeconds) * 1000;
          setPollingIntervalMs(nextMs);
          autoRefreshApiRef.current?.close();
        }}
      />
      
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

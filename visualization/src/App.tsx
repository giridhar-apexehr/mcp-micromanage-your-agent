import { useState, useCallback, useRef } from 'react'
import { FilterOptions } from './components/FilterPanel'
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
import FilterPanelHost, { FilterPanelApi } from './components/panels/FilterPanelHost'
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

  const filterButtonRef = useRef<HTMLButtonElement | null>(null);
  const filterApiRef = useRef<FilterPanelApi | null>(null);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState<boolean>(false);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    statusFilter: 'all',
    searchQuery: '',
    onlyShowActive: false
  });

  const { themeMode, isDarkMode, toggleThemeMode } = useThemeMode();

  const goToDashboard = useCallback(() => {
    autoRefreshApiRef.current?.reset();
    filterApiRef.current?.reset();
    goToDashboardBase();
  }, [goToDashboardBase]);

  // Filter options change handler
  const handleFilterChange = useCallback((newOptions: FilterOptions) => {
    setFilterOptions(newOptions);
  }, []);

  const handleFilterClick = useCallback(() => {
    filterApiRef.current?.toggle();
  }, []);

  const handleAutoRefreshDropdownClick = useCallback(() => {
    autoRefreshApiRef.current?.toggle();
  }, []);

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
              showFilterPanel={isFilterPanelOpen}
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

      <FilterPanelHost
        anchorRef={filterButtonRef}
        onApi={(api) => {
          filterApiRef.current = api;
        }}
        onStateChange={({ isOpen }) => {
          setIsFilterPanelOpen(isOpen);
        }}
        options={filterOptions}
        onChange={handleFilterChange}
        ignoreOutsideClickRef={filterButtonRef}
      />
      
      {/* Device orientation warning (mobile only) */}
      <OrientationWarning />
    </WorkplanPage>
  );
}

export default App

import { useState, useCallback, useRef } from 'react'
import FilterPanel, { FilterOptions } from './components/panels/FilterPanel'
import OrientationWarning from './components/OrientationWarning'
import { useThemeMode } from './app/hooks/useThemeMode'
import { useWorkplanData } from './app/hooks/useWorkplanData'
import { usePolling } from './app/hooks/usePolling'
import { useFloatingPanel } from './app/hooks/useFloatingPanel'
import DashboardPage from './pages/DashboardPage'
import WorkplanPage from './pages/WorkplanPage'
import WorkplanTopbar from './components/workplan/WorkplanTopbar'
import WorkplanActionsBar from './components/workplan/WorkplanActionsBar'
import ErrorOverlay from './components/common/ErrorOverlay'
import AutoRefreshPanel from './components/panels/AutoRefreshPanel'
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
  const autoRefreshPanelRef = useRef<HTMLDivElement | null>(null);

  const filterButtonRef = useRef<HTMLButtonElement | null>(null);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    statusFilter: 'all',
    searchQuery: '',
    onlyShowActive: false
  });

  const autoRefreshPanel = useFloatingPanel({
    anchorRef: autoRefreshButtonRef,
    panelRef: autoRefreshPanelRef,
    ignoreOutsideClickRef: autoRefreshAnchorRef,
    closeOnOutsideClick: true,
    closeOnEscape: true,
    margin: 10,
    minPanelWidth: 220,
    maxPanelWidth: 320,
    closeDelayMs: 180
  });

  const filterPanel = useFloatingPanel({
    anchorRef: filterButtonRef,
    closeOnOutsideClick: false,
    closeOnEscape: false,
    margin: 10,
    minPanelWidth: 200,
    maxPanelWidth: 320,
    closeDelayMs: 180
  });

  const { themeMode, isDarkMode, toggleThemeMode } = useThemeMode();

  const goToDashboard = useCallback(() => {
    autoRefreshPanel.reset();
    filterPanel.reset();
    goToDashboardBase();
  }, [autoRefreshPanel, filterPanel, goToDashboardBase]);

  // Filter options change handler
  const handleFilterChange = useCallback((newOptions: FilterOptions) => {
    setFilterOptions(newOptions);
  }, []);

  const handleFilterClick = useCallback(() => {
    filterPanel.toggle();
  }, [filterPanel]);

  const handleAutoRefreshDropdownClick = useCallback(() => {
    autoRefreshPanel.toggle();
  }, [autoRefreshPanel]);

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
              showAutoRefreshPanel={autoRefreshPanel.isOpen}
              autoRefreshAnchorRef={autoRefreshAnchorRef}
              autoRefreshButtonRef={autoRefreshButtonRef}
              onTogglePolling={togglePolling}
              onToggleAutoRefreshDropdown={handleAutoRefreshDropdownClick}
              onCloseAutoRefreshPanel={autoRefreshPanel.close}
              isLoading={isLoading}
              refreshSpinTick={refreshSpinTick}
              onRefresh={() => {
                setRefreshSpinTick((prev) => prev + 1);
                loadData();
              }}
              themeMode={themeMode}
              onToggleThemeMode={toggleThemeMode}
              showFilterPanel={filterPanel.isOpen}
              filterButtonRef={filterButtonRef}
              onToggleFilterPanel={handleFilterClick}
            />
          )}
        />
      )}
    >
      {autoRefreshPanel.isRendered && autoRefreshPanel.position && (
        <div
          className={`auto-refresh-panel-container ${autoRefreshPanel.isOpen ? 'is-open' : 'is-closed'}`}
          style={{ top: autoRefreshPanel.position.top, left: autoRefreshPanel.position.left }}
        >
          <div ref={autoRefreshPanelRef} className="auto-refresh-panel" role="dialog" aria-label="Auto-refresh settings">
            <AutoRefreshPanel
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
                autoRefreshPanel.close();
              }}
            />
          </div>
        </div>
      )}

      {filterPanel.isRendered && filterPanel.position && (
        <div
          className={`filter-panel-container ${filterPanel.isOpen ? 'is-open' : 'is-closed'}`}
          style={{ top: filterPanel.position.top, left: filterPanel.position.left }}
        >
          <FilterPanel
            options={filterOptions}
            onChange={handleFilterChange}
            isOpen={filterPanel.isOpen}
            onClose={filterPanel.close}
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

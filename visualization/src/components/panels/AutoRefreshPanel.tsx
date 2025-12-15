/**
 * @file AutoRefreshPanel
 *
 * Presentational auto-refresh settings panel.
 *
 * Note: container positioning and open/close behavior are handled by the host.
 */

export type AutoRefreshPanelProps = {
  currentPollingSeconds: number;
  presetsSeconds: number[];
  draftPollingSeconds: string;
  draftSecondsForSelection: number;
  draftSecondsValid: boolean;
  onSelectPresetSeconds: (seconds: number) => void;
  onDraftSecondsChange: (value: string) => void;
  onApply: () => void;
};

/**
 * Auto-refresh settings panel.
 */
export function AutoRefreshPanel({
  currentPollingSeconds,
  presetsSeconds,
  draftPollingSeconds,
  draftSecondsForSelection,
  draftSecondsValid,
  onSelectPresetSeconds,
  onDraftSecondsChange,
  onApply
}: AutoRefreshPanelProps) {
  return (
    <>
      <div className="auto-refresh-panel__header">
        <div className="auto-refresh-panel__title">Auto-refresh</div>
        <div className="auto-refresh-panel__subtitle">Current: {currentPollingSeconds}s</div>
      </div>

      <div className="auto-refresh-panel__section">
        <div className="auto-refresh-panel__label">Presets</div>
        <div className="auto-refresh-panel__preset-grid" role="listbox" aria-label="Preset durations">
          {presetsSeconds.map((seconds) => {
            const selected = seconds === draftSecondsForSelection;
            return (
              <button
                key={seconds}
                type="button"
                className={`auto-refresh-panel__preset ${selected ? 'is-selected' : ''}`}
                aria-label={`${seconds} seconds`}
                onClick={() => onSelectPresetSeconds(seconds)}
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
          onChange={(e) => onDraftSecondsChange(e.target.value)}
        />
      </div>

      <div className="auto-refresh-panel__footer">
        <button
          type="button"
          className="morphic-btn"
          disabled={!draftSecondsValid}
          onClick={onApply}
        >
          Apply
        </button>
      </div>
    </>
  );
}

export default AutoRefreshPanel;

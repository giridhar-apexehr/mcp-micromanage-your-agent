/**
 * @file AutoRefreshPanelHost
 *
 * Host component for the auto-refresh floating panel.
 *
 * Wires panel lifecycle/positioning via `useFloatingPanel` and renders the
 * presentational `AutoRefreshPanel`.
 */

import type { RefObject } from 'react';
import { useEffect, useRef } from 'react';

import { useFloatingPanel } from '../../app/hooks/useFloatingPanel';
import AutoRefreshPanel from './AutoRefreshPanel';

export type AutoRefreshPanelApi = {
  toggle: () => void;
  close: () => void;
  reset: () => void;
};

export type AutoRefreshPanelHostProps = {
  anchorRef: RefObject<HTMLButtonElement | null>;
  ignoreOutsideClickRef: RefObject<HTMLDivElement | null>;

  /** Used to register imperative actions back to the parent (for toolbar buttons / navigation). */
  onApi: (api: AutoRefreshPanelApi) => void;

  /** Optional subscription to the panel's open/rendered state for UI synchronization. */
  onStateChange?: (state: { isOpen: boolean; isRendered: boolean }) => void;

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
 * Auto-refresh panel host.
 */
export function AutoRefreshPanelHost({
  anchorRef,
  ignoreOutsideClickRef,
  onApi,
  onStateChange,
  currentPollingSeconds,
  presetsSeconds,
  draftPollingSeconds,
  draftSecondsForSelection,
  draftSecondsValid,
  onSelectPresetSeconds,
  onDraftSecondsChange,
  onApply
}: AutoRefreshPanelHostProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  const { isRendered, isOpen, position, toggle, close, reset } = useFloatingPanel({
    anchorRef,
    panelRef,
    ignoreOutsideClickRef,
    closeOnOutsideClick: true,
    closeOnEscape: true,
    margin: 10,
    minPanelWidth: 220,
    maxPanelWidth: 320,
    closeDelayMs: 180
  });

  useEffect(() => {
    onApi({ toggle, close, reset });
  }, [close, onApi, reset, toggle]);

  useEffect(() => {
    onStateChange?.({ isOpen, isRendered });
  }, [isOpen, isRendered, onStateChange]);

  if (!isRendered || !position) return null;

  return (
    <div
      className={`auto-refresh-panel-container ${isOpen ? 'is-open' : 'is-closed'}`}
      style={{ top: position.top, left: position.left }}
    >
      <div ref={panelRef} className="auto-refresh-panel" role="dialog" aria-label="Auto-refresh settings">
        <AutoRefreshPanel
          currentPollingSeconds={currentPollingSeconds}
          presetsSeconds={presetsSeconds}
          draftPollingSeconds={draftPollingSeconds}
          draftSecondsForSelection={draftSecondsForSelection}
          draftSecondsValid={draftSecondsValid}
          onSelectPresetSeconds={onSelectPresetSeconds}
          onDraftSecondsChange={onDraftSecondsChange}
          onApply={onApply}
        />
      </div>
    </div>
  );
}

export default AutoRefreshPanelHost;

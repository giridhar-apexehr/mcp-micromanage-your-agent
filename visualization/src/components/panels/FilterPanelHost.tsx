/**
 * @file FilterPanelHost
 *
 * Host component for the filter floating panel.
 *
 * Responsibilities:
 * - Manage mount/open state, positioning, and exit-delay via `useFloatingPanel`.
 * - Render existing `FilterPanel` inside the same `.filter-panel-container` wrapper
 *   so CSS transitions remain unchanged.
 *
 * Note: `FilterPanel` already owns outside-click and Escape handling; the host only
 * manages positioning and mount/unmount timing.
 */

import type { RefObject } from 'react';
import { useEffect } from 'react';

import { useFloatingPanel } from '../../app/hooks/useFloatingPanel';
import FilterPanel, { type FilterOptions } from '../FilterPanel';

export type FilterPanelApi = {
  toggle: () => void;
  close: () => void;
  reset: () => void;
};

export type FilterPanelHostProps = {
  anchorRef: RefObject<HTMLButtonElement | null>;

  /** Used to register imperative actions back to the parent (for toolbar buttons / navigation). */
  onApi: (api: FilterPanelApi) => void;

  /** Optional subscription to the panel's open/rendered state for UI synchronization. */
  onStateChange?: (state: { isOpen: boolean; isRendered: boolean }) => void;

  options: FilterOptions;
  onChange: (newOptions: FilterOptions) => void;

  /** Ref passed through to FilterPanel for its own outside-click handling. */
  ignoreOutsideClickRef?: RefObject<HTMLElement | null>;
};

/**
 * Filter panel host.
 */
export function FilterPanelHost({
  anchorRef,
  onApi,
  onStateChange,
  options,
  onChange,
  ignoreOutsideClickRef
}: FilterPanelHostProps) {
  const { isRendered, isOpen, position, toggle, close, reset } = useFloatingPanel({
    anchorRef,
    // Let FilterPanel handle outside-click/Escape itself.
    closeOnOutsideClick: false,
    closeOnEscape: false,
    margin: 10,
    minPanelWidth: 200,
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
      className={`filter-panel-container ${isOpen ? 'is-open' : 'is-closed'}`}
      style={{ top: position.top, left: position.left }}
    >
      <FilterPanel
        options={options}
        onChange={onChange}
        isOpen={isOpen}
        onClose={close}
        ignoreOutsideClickRef={ignoreOutsideClickRef}
      />
    </div>
  );
}

export default FilterPanelHost;

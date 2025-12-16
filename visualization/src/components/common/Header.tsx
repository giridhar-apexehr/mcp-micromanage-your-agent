/**
 * @file Header
 *
 * Shared topbar header shell.
 *
 * This component preserves the existing DOM structure and classNames used by the
 * morphic theme (`app-topbar`, `topbar-inner`, etc.) while allowing pages to supply
 * content via slots.
 */

import type { ReactNode } from 'react'

/**
 * Props for the Header component.
 */
export type HeaderProps = {
  /**
   * Optional left-side navigation slot.
   *
   * Typical usage is a back button.
   */
  nav?: ReactNode
  /**
   * Main title content for the header.
   */
  title: ReactNode
  /**
   * Optional subtitle content rendered below the title.
   */
  subtitle?: ReactNode
  /**
   * Optional `title` attribute applied to the subtitle for truncation/hover.
   */
  subtitleTitle?: string
  /**
   * Optional right-side actions content.
   */
  actions?: ReactNode
  /**
   * When true, wraps `actions` in a `.topbar-actions` container.
   *
   * Set to false when the provided actions already include a `.topbar-actions`
   * wrapper (e.g. when passing an existing component that owns that structure).
   */
  wrapActions?: boolean
}

/**
 * Renders a shared app topbar header with optional navigation and actions slots.
 *
 * @param nav - Optional left-side navigation slot.
 * @param title - Main title content.
 * @param subtitle - Optional subtitle content.
 * @param subtitleTitle - Optional tooltip/title attribute for the subtitle.
 * @param actions - Optional right-side actions content.
 * @param wrapActions - Whether to wrap actions in a `.topbar-actions` container.
 * @returns The rendered header.
 */
export function Header({
  nav,
  title,
  subtitle,
  subtitleTitle,
  actions,
  wrapActions = true,
}: HeaderProps) {
  return (
    <header className="app-topbar">
      <div className="topbar-inner">
        {nav && <div className="topbar-nav">{nav}</div>}

        <div className="topbar-brand">
          <div className="topbar-title">{title}</div>
          {subtitle && (
            <div className="topbar-subtitle" title={subtitleTitle}>
              {subtitle}
            </div>
          )}
        </div>

        {actions &&
          (wrapActions ? (
            <div className="topbar-actions">{actions}</div>
          ) : (
            actions
          ))}
      </div>
    </header>
  )
}

export default Header

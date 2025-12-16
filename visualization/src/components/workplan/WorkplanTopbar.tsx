/**
 * @file WorkplanTopbar
 *
 * Topbar shell for the workplan page.
 *
 * Uses composition for the actions slot so the parent can decide which controls to render.
 */

import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'

type WorkplanTopbarProps = {
  title: string
  onBack: () => void
  actions?: ReactNode
  backButtonTitle?: string
}

/**
 * Workplan topbar with a back button, title section, and action slot.
 */
export function WorkplanTopbar({
  title,
  onBack,
  actions,
  backButtonTitle = 'Back to dashboard',
}: WorkplanTopbarProps) {
  return (
    <header className="app-topbar">
      <div className="topbar-inner">
        <div className="topbar-nav">
          <button
            type="button"
            className="morphic-btn morphic-btn--icon"
            onClick={onBack}
            title={backButtonTitle}
            aria-label={backButtonTitle}
          >
            <span className="morphic-btn__icon" aria-hidden="true">
              <ArrowLeft className="morphic-icon" size={18} strokeWidth={2} />
            </span>
          </button>
        </div>

        <div className="topbar-brand">
          {/* Currently unused area - available for future use */}
          <div className="topbar-title">Workplan</div>
          <div className="topbar-subtitle" title={title}>
            {title}
          </div>
        </div>

        {actions}
      </div>
    </header>
  )
}

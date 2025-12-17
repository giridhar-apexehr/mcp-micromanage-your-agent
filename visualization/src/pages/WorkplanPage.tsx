/**
 * @file WorkplanPage
 *
 * Workplan page scaffold shown when a workplan is selected.
 *
 * Uses composition for the header and overlays so App can keep wiring the controls
 * while this component owns the page shell and the main flow area.
 */

import type { ReactNode } from 'react'
import { ReactFlowProvider } from 'reactflow'

import { WorkplanFlow } from '../components/WorkplanFlow'
import type { FilterOptions } from '../components/panels/FilterPanel.types'
import type { WorkPlan } from '../types'

type WorkplanPageProps = {
  header: ReactNode
  workplan: WorkPlan
  filterOptions: FilterOptions
  children?: ReactNode
}

/**
 * Workplan page scaffold.
 */
export function WorkplanPage({
  header,
  workplan,
  filterOptions,
  children,
}: WorkplanPageProps) {
  return (
    <div className="app">
      <ReactFlowProvider>
        {header}

        <main className="app-main">
          <WorkplanFlow workplan={workplan} filterOptions={filterOptions} />
        </main>

        {children}
      </ReactFlowProvider>
    </div>
  )
}

/**
 * @file WorkplanPage
 *
 * Workplan page scaffold shown when a workplan is selected.
 *
 * Uses composition for the header and overlays so App can keep wiring the controls
 * while this component owns the page shell and the main flow area.
 */

import type { ReactNode } from 'react';
import { ReactFlowProvider } from 'reactflow';

import WorkplanFlow from '../components/WorkplanFlow';
import type { FilterOptions } from '../components/panels/FilterPanel';
import type { WorkPlan } from '../types';

export type WorkplanPageProps = {
  isDarkMode: boolean;
  header: ReactNode;
  workplan: WorkPlan;
  filterOptions: FilterOptions;
  children?: ReactNode;
};

/**
 * Workplan page scaffold.
 */
export function WorkplanPage({ isDarkMode, header, workplan, filterOptions, children }: WorkplanPageProps) {
  return (
    <div className={`app ${isDarkMode ? 'dark-theme' : 'light-theme'}`}>
      <ReactFlowProvider>
        {header}

        <main className="app-main">
          <WorkplanFlow workplan={workplan} filterOptions={filterOptions} />
        </main>

        {children}
      </ReactFlowProvider>
    </div>
  );
}

export default WorkplanPage;

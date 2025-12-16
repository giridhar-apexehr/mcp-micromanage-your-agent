import type { CommitStatus } from '../../types'

export interface FilterOptions {
  statusFilter: CommitStatus | 'all'
  searchQuery: string
  onlyShowActive: boolean
}

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@heroui/button'
import { Card, CardBody, CardHeader } from '@heroui/card'
import { Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from '@heroui/dropdown'
import { Input } from '@heroui/input'
import { Switch } from '@heroui/switch'
import { Chip } from '@heroui/chip'
import { CommitStatus } from '../../types'
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronDown,
  Circle,
  Eye,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
  XCircle,
  type LucideProps,
} from 'lucide-react'

import type { FilterOptions } from './FilterPanel.types'

interface FilterPanelProps {
  options: FilterOptions
  onChange: (newOptions: FilterOptions) => void
  isOpen: boolean
  onClose: () => void
  ignoreOutsideClickRef?: React.RefObject<HTMLElement | null>
}

// Status display name mapping
const STATUS_LABELS: Record<CommitStatus | 'all', string> = {
  all: 'All',
  not_started: 'Not Started',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  completed: 'Completed',
  cancelled: 'Cancelled',
  needsRefinment: 'Needs Refinement',
  user_review: 'Awaiting User Review',
}

// Status icon mapping
type IconType = React.ComponentType<LucideProps>
const STATUS_ICONS: Record<CommitStatus | 'all', IconType> = {
  all: Search,
  not_started: Circle,
  in_progress: RefreshCw,
  blocked: Ban,
  completed: CheckCircle2,
  cancelled: XCircle,
  needsRefinment: AlertTriangle,
  user_review: Eye,
}

/**
 * Filter panel component using HeroUI primitives.
 * Preserves keyboard/focus behavior and floating positioning contract.
 */
export const FilterPanel = ({
  options,
  onChange,
  isOpen,
  onClose,
  ignoreOutsideClickRef,
}: FilterPanelProps) => {
  const [localOptions, setLocalOptions] = useState<FilterOptions>(options)
  const panelRef = useRef<HTMLDivElement>(null)
  const statusValues = Object.keys(STATUS_LABELS) as Array<CommitStatus | 'all'>

  /**
   * Update internal state when options from props change
   */
  useEffect(() => {
    setLocalOptions(options)
  }, [options])

  /**
   * Change handler (memoized)
   */
  const handleChange = useCallback(
    <K extends keyof FilterOptions>(key: K, value: FilterOptions[K]) => {
      const newOptions = { ...localOptions, [key]: value }
      setLocalOptions(newOptions)
      onChange(newOptions)
    },
    [localOptions, onChange],
  )

  /**
   * Reset handler (memoized)
   */
  const handleReset = useCallback(() => {
    const defaultOptions: FilterOptions = {
      statusFilter: 'all',
      searchQuery: '',
      onlyShowActive: false,
    }
    setLocalOptions(defaultOptions)
    onChange(defaultOptions)
  }, [onChange])

  /**
   * Close when clicking outside the panel
   */
  useEffect(() => {
    if (!isOpen) return

    const handleOutsideClick = (event: MouseEvent) => {
      if (
        ignoreOutsideClickRef?.current &&
        ignoreOutsideClickRef.current.contains(event.target as Node)
      ) {
        return
      }
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node)
      ) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [isOpen, onClose, ignoreOutsideClickRef])

  /**
   * Close panel with Esc key
   */
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  /**
   * Render active filter chips
   */
  const renderActiveFilters = () => {
    const hasActiveFilters =
      localOptions.statusFilter !== 'all' ||
      localOptions.searchQuery.trim() ||
      localOptions.onlyShowActive

    if (!hasActiveFilters) return null

    return (
      <div className="filter-panel__badges">
        <div className="filter-panel__badges-label">Active filters:</div>

        {localOptions.statusFilter !== 'all' && (
          <Chip
            className="filter-panel__chip filter-panel__chip--blue"
            onClose={() => handleChange('statusFilter', 'all')}
            startContent={
              (() => {
                const Icon = STATUS_ICONS[localOptions.statusFilter as CommitStatus]
                return <Icon className="morphic-icon" size={14} strokeWidth={2} />
              })()
            }
            endContent={
              <button
                type="button"
                className="filter-panel__chip-close"
                onClick={() => handleChange('statusFilter', 'all')}
                aria-label="Clear status filter"
              >
                <X size={14} strokeWidth={2} aria-hidden="true" />
              </button>
            }
          >
            <span className="filter-panel__chip-text">
              {STATUS_LABELS[localOptions.statusFilter as CommitStatus]}
            </span>
          </Chip>
        )}

        {localOptions.searchQuery.trim() && (
          <Chip
            className="filter-panel__chip filter-panel__chip--green"
            onClose={() => handleChange('searchQuery', '')}
            startContent={
              <Search className="morphic-icon" size={14} strokeWidth={2} aria-hidden="true" />
            }
            endContent={
              <button
                type="button"
                className="filter-panel__chip-close"
                onClick={() => handleChange('searchQuery', '')}
                aria-label="Clear search filter"
              >
                <X size={14} strokeWidth={2} aria-hidden="true" />
              </button>
            }
          >
            <span className="filter-panel__chip-text">{localOptions.searchQuery}</span>
          </Chip>
        )}

        {localOptions.onlyShowActive && (
          <Chip
            className="filter-panel__chip filter-panel__chip--yellow"
            onClose={() => handleChange('onlyShowActive', false)}
            startContent={
              <RefreshCw className="morphic-icon" size={14} strokeWidth={2} aria-hidden="true" />
            }
            endContent={
              <button
                type="button"
                className="filter-panel__chip-close"
                onClick={() => handleChange('onlyShowActive', false)}
                aria-label="Clear active-only filter"
              >
                <X size={14} strokeWidth={2} aria-hidden="true" />
              </button>
            }
          >
            <span className="filter-panel__chip-text">Active Only</span>
          </Chip>
        )}
      </div>
    )
  }

  return (
    <Card
      ref={panelRef}
      className="auto-refresh-panel filter-panel"
      role="dialog"
      aria-label="Filter settings"
    >
      <CardHeader className="auto-refresh-panel__header">
        <div className="auto-refresh-panel__title filter-panel__title">
          <span className="filter-panel__title-icon" aria-hidden="true">
            <SlidersHorizontal className="morphic-icon" size={18} strokeWidth={2} />
          </span>
          Filter Settings
        </div>
        <button
          onClick={onClose}
          className="filter-panel__close"
          aria-label="Close"
          type="button"
        >
          <X className="morphic-icon" size={18} strokeWidth={2} />
        </button>
      </CardHeader>
      <CardBody className="p-0">
        {/* Status filter */}
        <div className="auto-refresh-panel__section">
          <div className="filter-panel__field">
            <label className="auto-refresh-panel__label">Status</label>
            <Dropdown>
              <DropdownTrigger>
                <Button
                  type="button"
                  className="auto-refresh-panel__input filter-panel__control"
                  aria-label="Status"
                  startContent={
                    <span className="filter-panel__field-icon morphic-input-icon" aria-hidden="true">
                      {(() => {
                        const Icon =
                          STATUS_ICONS[localOptions.statusFilter as CommitStatus | 'all']
                        return <Icon className="morphic-icon" size={16} strokeWidth={2} />
                      })()}
                    </span>
                  }
                  endContent={
                    <span className="filter-panel__field-suffix morphic-input-suffix" aria-hidden="true">
                      <ChevronDown className="filter-panel__chevron" size={18} strokeWidth={2} />
                    </span>
                  }
                >
                  {STATUS_LABELS[localOptions.statusFilter as CommitStatus | 'all']}
                </Button>
              </DropdownTrigger>
              <DropdownMenu
                aria-label="Status"
                className="filter-panel__menu filter-panel__menu--dropdown"
                selectedKeys={new Set([localOptions.statusFilter])}
                onSelectionChange={(keys) => {
                  const selected = Array.from(keys)[0] as CommitStatus | 'all'
                  handleChange('statusFilter', selected)
                }}
              >
                {statusValues.map((status) => {
                  const Icon = STATUS_ICONS[status]
                  const isSelected = status === localOptions.statusFilter

                  return (
                    <DropdownItem
                      key={status}
                      className={`filter-panel__menu-item ${isSelected ? 'is-selected' : ''}`}
                      startContent={
                        <span className="filter-panel__menu-icon" aria-hidden="true">
                          <Icon className="morphic-icon" size={16} strokeWidth={2} />
                        </span>
                      }
                    >
                      <span className="filter-panel__menu-label">{STATUS_LABELS[status]}</span>
                    </DropdownItem>
                  )
                })}
              </DropdownMenu>
            </Dropdown>
          </div>
        </div>

        {/* Search filter */}
        <div className="auto-refresh-panel__section">
          <div className="filter-panel__field">
            <label className="auto-refresh-panel__label" htmlFor="filter-search">
              Search
            </label>
            <Input
              id="filter-search"
              type="text"
              aria-label="Search"
              placeholder="Search in commit content..."
              value={localOptions.searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                handleChange('searchQuery', e.target.value)
              }
              classNames={{
                inputWrapper: 'auto-refresh-panel__input filter-panel__input',
                // innerWrapper: 'auto-refresh-panel__input filter-panel__input',
              }}
              startContent={
                <span className="filter-panel__field-icon morphic-input-icon" aria-hidden="true">
                  <Search className="morphic-icon" size={18} strokeWidth={2} />
                </span>
              }
              endContent={
                localOptions.searchQuery ? (
                  <Button
                    type="button"
                    className="filter-panel__icon-btn morphic-input-action"
                    aria-label="Clear search"
                    onPress={() => handleChange('searchQuery', '')}
                  >
                    <X className="morphic-icon" size={18} strokeWidth={2} aria-hidden="true" />
                  </Button>
                ) : null
              }
            />
          </div>
        </div>

        {/* Show only active items */}
        <div className="auto-refresh-panel__section filter-panel__section">
          <div className="filter-panel__toggle">
            <Switch
              isSelected={localOptions.onlyShowActive}
              onValueChange={(value) => handleChange('onlyShowActive', value)}
            >
              Show only active tasks
            </Switch>
          </div>
        </div>

        {/* Active filters */}
        <div className="auto-refresh-panel__section filter-panel__section">{renderActiveFilters()}</div>

        <div className="auto-refresh-panel__footer">
          <Button
            onPress={handleReset}
            className="morphic-btn filter-panel__reset"
            type="button"
            startContent={<RotateCcw className="morphic-icon" size={16} strokeWidth={2} aria-hidden="true" />}
          >
            Reset
          </Button>
        </div>
      </CardBody>
    </Card>
  )
}

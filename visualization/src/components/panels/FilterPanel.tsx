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
   * Render status dropdown items with icons
   */
  const renderStatusItems = () => {
    return statusValues.map((status: CommitStatus | 'all') => {
      const Icon = STATUS_ICONS[status]
      const isSelected = status === localOptions.statusFilter

      return (
        <DropdownItem
          key={status}
          startContent={
            <Icon
              className="text-default-500"
              size={16}
              strokeWidth={2}
            />
          }
          onPress={() => handleChange('statusFilter', status)}
          isSelected={isSelected}
        >
          {STATUS_LABELS[status]}
        </DropdownItem>
      )
    })
  }

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
      <div className="space-y-2">
        <div className="text-sm font-medium">Active filters:</div>
        <div className="flex flex-wrap gap-2">
          {localOptions.statusFilter !== 'all' && (
            <Chip
              color="primary"
              variant="flat"
              onClose={() => handleChange('statusFilter', 'all')}
              endContent={
                <Button
                  isIconOnly
                  size="sm"
                  variant="light"
                  onClick={() => handleChange('statusFilter', 'all')}
                  className="ml-1"
                >
                  <X size={12} strokeWidth={2} />
                </Button>
              }
              startContent={
                (() => {
                  const Icon = STATUS_ICONS[localOptions.statusFilter as CommitStatus]
                  return <Icon size={14} strokeWidth={2} />
                })()
              }
            >
              {STATUS_LABELS[localOptions.statusFilter as CommitStatus]}
            </Chip>
          )}

          {localOptions.searchQuery.trim() && (
            <Chip
              color="success"
              variant="flat"
              onClose={() => handleChange('searchQuery', '')}
              endContent={
                <Button
                  isIconOnly
                  size="sm"
                  variant="light"
                  onClick={() => handleChange('searchQuery', '')}
                  className="ml-1"
                >
                  <X size={12} strokeWidth={2} />
                </Button>
              }
              startContent={<Search size={14} strokeWidth={2} />}
            >
              {localOptions.searchQuery}
            </Chip>
          )}

          {localOptions.onlyShowActive && (
            <Chip
              color="warning"
              variant="flat"
              onClose={() => handleChange('onlyShowActive', false)}
              endContent={
                <Button
                  isIconOnly
                  size="sm"
                  variant="light"
                  onClick={() => handleChange('onlyShowActive', false)}
                  className="ml-1"
                >
                  <X size={12} strokeWidth={2} />
                </Button>
              }
              startContent={<RefreshCw size={14} strokeWidth={2} />}
            >
              Active Only
            </Chip>
          )}
        </div>
      </div>
    )
  }

  return (
    <Card
      ref={panelRef}
      className="w-80 filter-panel"
      role="dialog"
      aria-label="Filter settings"
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <SlidersHorizontal
              className="text-default-500"
              size={18}
              strokeWidth={2}
            />
            <div className="text-lg font-semibold">Filter Settings</div>
          </div>
          <Button
            isIconOnly
            size="sm"
            variant="light"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} strokeWidth={2} />
          </Button>
        </div>
      </CardHeader>
      <CardBody className="pt-0">
        <div className="space-y-4">
          {/* Status filter */}
          <div>
            <div className="text-sm font-medium mb-2">Status</div>
            <Dropdown>
              <DropdownTrigger>
                <Button
                  variant="bordered"
                  className="w-full justify-start"
                  endContent={<ChevronDown className="text-default-400" size={16} />}
                  startContent={
                    (() => {
                      const Icon = STATUS_ICONS[localOptions.statusFilter as CommitStatus | 'all']
                      return <Icon className="text-default-500" size={16} strokeWidth={2} />
                    })()
                  }
                >
                  {STATUS_LABELS[localOptions.statusFilter as CommitStatus | 'all']}
                </Button>
              </DropdownTrigger>
              <DropdownMenu
                aria-label="Status"
                selectedKeys={new Set([localOptions.statusFilter])}
                onSelectionChange={(keys) => {
                  const selected = Array.from(keys)[0] as CommitStatus | 'all'
                  handleChange('statusFilter', selected)
                }}
              >
                {renderStatusItems()}
              </DropdownMenu>
            </Dropdown>
          </div>

          {/* Search filter */}
          <div>
            <Input
              type="text"
              label="Search"
              labelPlacement="outside"
              placeholder="Search in commit content..."
              value={localOptions.searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('searchQuery', e.target.value)}
              startContent={<Search className="text-default-400" size={16} />}
              endContent={
                localOptions.searchQuery && (
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    onClick={() => handleChange('searchQuery', '')}
                    aria-label="Clear search"
                  >
                    <X size={14} strokeWidth={2} />
                  </Button>
                )
              }
            />
          </div>

          {/* Show only active items */}
          <div>
            <Switch
              isSelected={localOptions.onlyShowActive}
              onValueChange={(value) => handleChange('onlyShowActive', value)}
            >
              Show only active tasks
            </Switch>
          </div>

          {/* Active filters */}
          {renderActiveFilters()}

          {/* Reset button */}
          <div className="pt-2">
            <Button
              variant="flat"
              color="default"
              className="w-full"
              startContent={<RotateCcw size={16} strokeWidth={2} />}
              onClick={handleReset}
            >
              Reset
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  )
}

import { useState, useEffect, useRef, useCallback } from 'react';
import { CommitStatus } from '../types';
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
} from 'lucide-react';

// Filter settings type
export interface FilterOptions {
  statusFilter: CommitStatus | 'all';
  searchQuery: string;
  onlyShowActive: boolean; // Show only active PRs/commits
}

interface FilterPanelProps {
  options: FilterOptions;
  onChange: (newOptions: FilterOptions) => void;
  isOpen: boolean;
  onClose: () => void;
  ignoreOutsideClickRef?: React.RefObject<HTMLElement | null>;
}

// Status display name mapping
const STATUS_LABELS: Record<CommitStatus | 'all', string> = {
  'all': 'All',
  'not_started': 'Not Started',
  'in_progress': 'In Progress',
  'blocked': 'Blocked',
  'completed': 'Completed',
  'cancelled': 'Cancelled',
  'needsRefinment': 'Needs Refinement',
  'user_review': 'Awaiting User Review'
};

// Status icon mapping
type IconType = React.ComponentType<LucideProps>;
const STATUS_ICONS: Record<CommitStatus | 'all', IconType> = {
  'all': Search,
  'not_started': Circle,
  'in_progress': RefreshCw,
  'blocked': Ban,
  'completed': CheckCircle2,
  'cancelled': XCircle,
  'needsRefinment': AlertTriangle,
  'user_review': Eye,
};

// Pre-generate status options
const STATUS_OPTIONS = Object.entries(STATUS_LABELS).map(([status, label]) => (
  <option key={status} value={status}>
    {label}
  </option>
));

const FilterPanel: React.FC<FilterPanelProps> = ({ 
  options, 
  onChange,
  isOpen,
  onClose,
  ignoreOutsideClickRef
}) => {
  const [localOptions, setLocalOptions] = useState<FilterOptions>(options);
  const panelRef = useRef<HTMLDivElement>(null);
  
  // Update internal state when options from props change
  useEffect(() => {
    setLocalOptions(options);
  }, [options]);
  
  // Change handler (memoized)
  const handleChange = useCallback(<K extends keyof FilterOptions>(key: K, value: FilterOptions[K]) => {
    const newOptions = { ...localOptions, [key]: value };
    setLocalOptions(newOptions);
    onChange(newOptions);
  }, [localOptions, onChange]);
  
  // Reset handler (memoized)
  const handleReset = useCallback(() => {
    const defaultOptions: FilterOptions = {
      statusFilter: 'all',
      searchQuery: '',
      onlyShowActive: false
    };
    setLocalOptions(defaultOptions);
    onChange(defaultOptions);
  }, [onChange]);
  
  // Close when clicking outside the panel
  useEffect(() => {
    if (!isOpen) return;
    
    const handleOutsideClick = (event: MouseEvent) => {
      if (ignoreOutsideClickRef?.current && ignoreOutsideClickRef.current.contains(event.target as Node)) {
        return;
      }
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen, onClose, ignoreOutsideClickRef]);
  
  // Close panel with Esc key
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);
  
  if (!isOpen) return null;

  return (
    <div 
      ref={panelRef}
      className="filter-panel bg-white rounded-lg shadow-lg p-4 border border-gray-200 transition-all duration-300"
    >
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-800 flex items-center">
          <span className="mr-2" aria-hidden="true">
            <SlidersHorizontal className="morphic-icon" size={18} strokeWidth={2} />
          </span>
          Filter Settings
        </h3>
        <button 
          onClick={onClose}
          className="filter-panel__close text-gray-500 hover:text-gray-700 text-xl transition-colors p-1 rounded-full hover:bg-gray-100"
          aria-label="Close"
          type="button"
        >
          <X className="morphic-icon" size={18} strokeWidth={2} />
        </button>
      </div>
      
      <div className="space-y-4">
        {/* Status filter */}
        <div className="filter-panel__field">
          <label className="filter-panel__label block text-sm font-medium text-gray-700 mb-1">
            Status
          </label>
          <div className="relative">
            <select
              value={localOptions.statusFilter}
              onChange={(e) => handleChange('statusFilter', e.target.value as FilterOptions['statusFilter'])}
              className="w-full p-2 pl-8 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none"
            >
              {STATUS_OPTIONS}
            </select>
            <div className="filter-panel__field-icon absolute inset-y-0 left-0 flex items-center pl-2 pointer-events-none">
              {(() => {
                const Icon = STATUS_ICONS[localOptions.statusFilter as CommitStatus | 'all'];
                return <Icon className="morphic-icon" size={16} strokeWidth={2} />;
              })()}
            </div>
            <div className="filter-panel__field-suffix absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
              <ChevronDown className="h-5 w-5 text-gray-400 filter-panel__chevron" aria-hidden="true" />
            </div>
          </div>
        </div>
        
        {/* Search filter */}
        <div className="filter-panel__field">
          <label className="filter-panel__label block text-sm font-medium text-gray-700 mb-1">
            Search
          </label>
          <div className="relative">
            <input
              type="text"
              value={localOptions.searchQuery}
              onChange={(e) => handleChange('searchQuery', e.target.value)}
              placeholder="Search in commit content..."
              className="w-full p-2 pl-8 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <div className="filter-panel__field-icon absolute inset-y-0 left-0 flex items-center pl-2 pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" aria-hidden="true" />
            </div>
            {localOptions.searchQuery && (
              <button
                onClick={() => handleChange('searchQuery', '')}
                className="filter-panel__icon-btn absolute inset-y-0 right-0 flex items-center pr-2 text-gray-400 hover:text-gray-600"
                aria-label="Clear search"
                type="button"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        
        {/* Show only active items */}
        <label className="filter-panel__toggle" htmlFor="onlyActive">
          <input
            type="checkbox"
            id="onlyActive"
            checked={localOptions.onlyShowActive}
            onChange={(e) => handleChange('onlyShowActive', e.target.checked)}
            className="filter-panel__checkbox"
          />
          <span className="filter-panel__check" aria-hidden="true" />
          <span className="filter-panel__toggle-label">Show only active tasks</span>
        </label>
        
        {/* Filter badge display */}
        {(localOptions.statusFilter !== 'all' || 
         localOptions.searchQuery.trim() || 
         localOptions.onlyShowActive) && (
          <div className="flex flex-wrap gap-2 pt-2 pb-3">
            <p className="w-full text-xs text-gray-500 mb-1">Active filters:</p>
            
            {localOptions.statusFilter !== 'all' && (
              <span className="filter-panel__chip filter-panel__chip--blue inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                {(() => {
                  const Icon = STATUS_ICONS[localOptions.statusFilter as CommitStatus];
                  return <Icon className="morphic-icon" size={14} strokeWidth={2} />;
                })()}
                <span className="ml-1">{STATUS_LABELS[localOptions.statusFilter as CommitStatus]}</span>
                <button
                  onClick={() => handleChange('statusFilter', 'all')}
                  className="filter-panel__chip-close ml-1 text-blue-500 hover:text-blue-700"
                  aria-label="Clear status filter"
                  type="button"
                >
                  <X size={14} strokeWidth={2} aria-hidden="true" />
                </button>
              </span>
            )}
            
            {localOptions.searchQuery.trim() && (
              <span className="filter-panel__chip filter-panel__chip--green inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                <Search className="morphic-icon" size={14} strokeWidth={2} aria-hidden="true" />
                <span className="ml-1">{localOptions.searchQuery}</span>
                <button
                  onClick={() => handleChange('searchQuery', '')}
                  className="filter-panel__chip-close ml-1 text-green-500 hover:text-green-700"
                  aria-label="Clear search filter"
                  type="button"
                >
                  <X size={14} strokeWidth={2} aria-hidden="true" />
                </button>
              </span>
            )}
            
            {localOptions.onlyShowActive && (
              <span className="filter-panel__chip filter-panel__chip--yellow inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                <RefreshCw className="morphic-icon" size={14} strokeWidth={2} aria-hidden="true" />
                <span className="ml-1">Active Only</span>
                <button
                  onClick={() => handleChange('onlyShowActive', false)}
                  className="filter-panel__chip-close ml-1 text-yellow-500 hover:text-yellow-700"
                  aria-label="Clear active-only filter"
                  type="button"
                >
                  <X size={14} strokeWidth={2} aria-hidden="true" />
                </button>
              </span>
            )}
          </div>
        )}
        
        {/* Reset button */}
        <div className="pt-2 flex justify-end">
          <button
            onClick={handleReset}
            className="filter-panel__reset px-3 py-1.5 bg-gray-200 hover:bg-gray-300 rounded text-gray-700 text-sm transition-colors flex items-center"
            type="button"
          >
            <RotateCcw className="w-4 h-4 mr-1" aria-hidden="true" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
};

export default FilterPanel; 
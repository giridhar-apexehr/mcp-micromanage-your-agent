import { useRef, useState } from 'react';
import { Handle, Position } from 'reactflow';
import { CommitStatus } from '../types';

export interface CommitNodeData {
  title: string;
  label?: string;
  status: CommitStatus;
  prIndex: number;
  commitIndex: number;
  developerNote?: string; // Developer implementation notes captured during refinement
}

const statusLabels: Record<CommitStatus, string> = {
  'not_started': 'Not Started',
  'in_progress': 'In Progress',
  'blocked': 'Blocked',
  'completed': 'Completed',
  'cancelled': 'Cancelled',
  'needsRefinment': 'Needs Refinement',
  'user_review': 'Awaiting User Review'
};

const statusIcons: Record<CommitStatus, string> = {
  'not_started': '⚪',
  'in_progress': '🔵',
  'blocked': '⛔',
  'completed': '✅',
  'cancelled': '❌',
  'needsRefinment': '🔄',
  'user_review': '👀'
};

function CommitNode({ data }: { data: CommitNodeData }) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  const getStatusClass = (status: CommitStatus): string => {
    const baseClass = `status-badge ${status}`;
    
    // Additional style for completed commits
    if (status === 'completed') {
      return `${baseClass} completed-commit`;
    }
    
    return baseClass;
  };

  return (
    <div 
      ref={nodeRef}
      className={`commit-node transition-all relative py-3 px-4 rounded-md border shadow-sm ${
        data.status === 'completed' ? 'completed-node' : ''
      }`}
      aria-label={`Commit: ${data.title}, Status: ${statusLabels[data.status]}`}
      onMouseEnter={() => data.developerNote && setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="w-3 h-3 !bg-blue-500"
        aria-label="Left input point"
      />
      
      <Handle
        type="target"
        position={Position.Left}
        id="top"
        className="w-3 h-3 !bg-blue-500"
        aria-label="Top input point"
      />
      
      {/* Status Badge */}
      <div 
        className={`${getStatusClass(data.status)} inline-flex items-center px-2 py-1 rounded-full text-xs font-medium mx-auto`}
        aria-label={`Status: ${statusLabels[data.status]}`}
      >
        <span className="mr-1" aria-hidden="true">{statusIcons[data.status]}</span>
        <span>{statusLabels[data.status]}</span>
      </div>
      <div 
        className="commit-node__goal text-base font-medium text-center mb-2"
        aria-label="Commit goal"
        title={data.title}
      >
        {data.title}
      </div>
      
      {/* Developer Note Tooltip */}
      {showTooltip && data.developerNote && (
        <div className="absolute z-10 bg-white dark:bg-gray-800 p-3 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 max-w-xs -translate-x-1/2 left-1/2 bottom-full mb-2 text-sm">
          <div className="font-semibold mb-1 text-gray-700 dark:text-gray-300">Developer Note:</div>
          <div className="text-gray-600 dark:text-gray-400">{data.developerNote}</div>
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-l-transparent border-r-8 border-r-transparent border-t-8 border-t-gray-200 dark:border-t-gray-700"></div>
        </div>
      )}
      
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="w-3 h-3 !bg-blue-500"
        aria-label="Right output point"
      />
      
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="w-3 h-3 !bg-blue-500"
        aria-label="Bottom output point"
      />
    </div>
  );
}

export default CommitNode; 
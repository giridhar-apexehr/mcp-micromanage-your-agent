import { Handle, Position, type NodeProps } from 'reactflow';
import { CommitStatus, type NodeData } from '../types';

const statusLabels: Record<CommitStatus, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  completed: 'Completed',
  cancelled: 'Cancelled',
  needsRefinment: 'Needs Refinement',
  user_review: 'Awaiting User Review',
};

function getLabelText(label: NodeData['label']): string {
  if (typeof label === 'string') return label;
  if (typeof label === 'number') return String(label);
  return '';
}

function PRNode({ data }: NodeProps<NodeData>) {
  const labelText = getLabelText(data.label);
  const status = data.status;

  return (
    <div className="pr-node__content" aria-label={labelText || 'PR'}>
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="w-3 h-3 !bg-blue-500"
        aria-label="Left input point"
      />

      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="w-3 h-3 !bg-blue-500"
        aria-label="Right output point"
      />

      {status && (
        <div className={`status-badge ${status} inline-flex items-center px-2 py-1 rounded-full text-xs font-medium mb-2`}>
          <span>{statusLabels[status]}</span>
        </div>
      )}

      <div className="pr-node__goal" title={labelText}>
        {data.label}
      </div>
    </div>
  );
}

export default PRNode;

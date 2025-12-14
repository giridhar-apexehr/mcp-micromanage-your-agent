import { useState, useCallback, useMemo } from 'react';
import ReactFlow, {
  MiniMap,
  Background,
  useNodesState,
  useEdgesState,
  NodeTypes,
  EdgeTypes,
  Panel,
  BackgroundVariant,
  getBezierPath,
  EdgeProps,
  MarkerType,
  Position,
  useReactFlow,
  useStore,
  useStoreApi,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { WorkPlan, NodeData, ExtendedNode, CommitStatus } from '../types';
import { 
  convertWorkPlanToFlow, 
  filterWorkplan,
  filterNodesAndEdges
} from '../utils/workplanConverter';
import { useResponsiveFlowDimensions } from '../utils/responsiveUtils';
import CommitNode from './CommitNode';
import type { CommitNodeData } from './CommitNode';
import PRNode from './PRNode';
import { FilterOptions } from '../components/FilterPanel';
import './nodes/nodes.css';

import { Lock, Maximize2, Minus, Plus, Unlock } from 'lucide-react';

export interface WorkplanFlowProps {
  workplan: WorkPlan;
  filterOptions: FilterOptions;
}

// Custom edge component
const CustomEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data,
  markerEnd,
  animated,
  className
}: EdgeProps & { className?: string }) => {
  // Adjust connection point calculation
  // Ensure targetPosition is set to Position.Left
  const targetPos = targetPosition || Position.Left;
  const sourcePos = sourcePosition || Position.Right;
  
  // Adjust arguments for getBezierPath
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition: sourcePos,
    targetX,
    targetY,
    targetPosition: targetPos,
    curvature: 0.4
  });

  return (
    <>
      <path
        id={id}
        style={{
          ...style,
          strokeWidth: style.strokeWidth || 2,
          transition: 'stroke 0.3s, stroke-width 0.3s',
        }}
        className={`react-flow__edge-path ${animated ? 'animated' : ''} ${className || ''}`}
        d={edgePath}
        markerEnd={markerEnd}
      />
      {data?.label && (
        <text
          x={labelX}
          y={labelY}
          style={{
            fontSize: '10px',
            textAnchor: 'middle',
            dominantBaseline: 'middle',
            pointerEvents: 'none',
            fontWeight: 'normal',
          }}
          className="react-flow__edge-text"
        >
          {data.label}
        </text>
      )}
    </>
  );
};

// Register custom node types
const nodeTypes: NodeTypes = {
  commitNode: CommitNode,
  prNode: PRNode,
};

// Register custom edge types
const edgeTypes: EdgeTypes = {
  custom: CustomEdge,
};

const selectInteractivity = (s: {
  nodesDraggable: boolean;
  nodesConnectable: boolean;
  elementsSelectable: boolean;
  transform: [number, number, number];
  minZoom: number;
  maxZoom: number;
}) => ({
  isInteractive: s.nodesDraggable || s.nodesConnectable || s.elementsSelectable,
  minZoomReached: s.transform[2] <= s.minZoom,
  maxZoomReached: s.transform[2] >= s.maxZoom,
});

// Status label definitions
const statusLabels: Record<CommitStatus, string> = {
  'not_started': 'Not Started',
  'in_progress': 'In Progress',
  'blocked': 'Blocked',
  'completed': 'Completed',
  'cancelled': 'Cancelled',
  'needsRefinment': 'Needs Refinement',
  'user_review': 'Awaiting User Review'
};


const WorkplanFlow = ({ 
  workplan, 
  filterOptions
}: WorkplanFlowProps) => {
  const isCommitStatus = (value: unknown): value is CommitStatus => {
    return (
      value === 'not_started' ||
      value === 'in_progress' ||
      value === 'blocked' ||
      value === 'completed' ||
      value === 'cancelled' ||
      value === 'needsRefinment' ||
      value === 'user_review'
    );
  };

  const getNodeStatus = (data: unknown): CommitStatus | undefined => {
    if (!data || typeof data !== 'object') return undefined;
    const maybeStatus = (data as { status?: unknown }).status;
    return isCommitStatus(maybeStatus) ? maybeStatus : undefined;
  };

  // Default filter options
  const defaultFilterOptions: FilterOptions = {
    statusFilter: 'all',
    searchQuery: '',
    onlyShowActive: false
  };
  
  // Get responsive settings
  const {
    nodePadding,
    nodeSpacing,
    miniMapVisible,
    controlsStyle,
    miniMapStyle,
    currentBreakpoint
  } = useResponsiveFlowDimensions();

  // FitView options based on current breakpoint
  const fitViewOptions = useMemo(() => ({
    padding: currentBreakpoint === 'xs' ? 0.1 : 
             currentBreakpoint === 'sm' ? 0.15 : 0.2,
    maxZoom: 1.5,
    includeHiddenNodes: false,
    minZoom: 0.2,
    alignmentX: 0.5,  // Horizontal center
    alignmentY: 0,    // Top alignment
  }), [currentBreakpoint]);

  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const store = useStoreApi();
  const { isInteractive, minZoomReached, maxZoomReached } = useStore(selectInteractivity);

  const handleZoomIn = useCallback(() => {
    zoomIn();
  }, [zoomIn]);

  const handleZoomOut = useCallback(() => {
    zoomOut();
  }, [zoomOut]);

  const handleFitView = useCallback(() => {
    fitView(fitViewOptions);
  }, [fitView, fitViewOptions]);

  const handleToggleInteractivity = useCallback(() => {
    store.setState({
      nodesDraggable: !isInteractive,
      nodesConnectable: !isInteractive,
      elementsSelectable: !isInteractive,
    });
  }, [isInteractive, store]);
  
  // Use provided filter options or default
  const activeFilterOptions = filterOptions || defaultFilterOptions;
  
  // Apply filtering
  const filteredWorkplan = useMemo(() => {
    return filterWorkplan(workplan, activeFilterOptions);
  }, [workplan, activeFilterOptions]);

  // Set initial nodes and edges (generated from filtered workplan)
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    return convertWorkPlanToFlow(filteredWorkplan, { nodePadding, nodeSpacing });
  }, [filteredWorkplan, nodePadding, nodeSpacing]);
  
  // Add callbacks to commit nodes
  const nodesWithCallbacks = useMemo(() => {
    return initialNodes.map(node => {
      if (node.type === 'commitNode') {
        const nodeData = node.data as unknown as Partial<CommitNodeData> & {
          label?: unknown;
          status?: unknown;
          title?: unknown;
          prIndex?: unknown;
          commitIndex?: unknown;
        };

        const titleFromLabel = typeof nodeData.label === 'string' ? nodeData.label : '';
        const title = typeof nodeData.title === 'string' ? nodeData.title : titleFromLabel;
        const status: CommitNodeData['status'] = isCommitStatus(nodeData.status) ? nodeData.status : 'not_started';
        const prIndex = typeof nodeData.prIndex === 'number' ? nodeData.prIndex : 0;
        const commitIndex = typeof nodeData.commitIndex === 'number' ? nodeData.commitIndex : 0;

        const normalizedData: CommitNodeData = {
          ...(nodeData as unknown as CommitNodeData),
          title,
          status,
          prIndex,
          commitIndex,
        };
        return {
          ...node,
          data: normalizedData,
        };
      }
      return node;
    });
  }, [initialNodes]);
  
  // Change edge type to custom
  const customEdges = useMemo(() => {
    return initialEdges.map(edge => ({
      ...edge,
      type: 'custom',
      data: { ...edge.data, label: edge.label },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: 'currentColor',
      },
    }));
  }, [initialEdges]);
  
  // Apply filtering directly to nodes and edges
  const { nodes: filteredNodes, edges: filteredEdges } = useMemo(() => {
    return filterNodesAndEdges(nodesWithCallbacks, customEdges, activeFilterOptions);
  }, [nodesWithCallbacks, customEdges, activeFilterOptions]);
  
  // Use handlers for interaction only
  const [, , onNodesChange] = useNodesState([]);
  const [, , onEdgesChange] = useEdgesState([]);
  
  // Selected node information
  const [selectedNode, setSelectedNode] = useState<ExtendedNode<NodeData> | null>(null);

  // Handler for node selection
  const onNodeClick = useCallback((_event: React.MouseEvent, node: ExtendedNode) => {
    setSelectedNode(node as ExtendedNode<NodeData>);
  }, []);
  
  // Handler for canvas click (deselection)
  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);
  
  // Flow component style
  const proOptions = { hideAttribution: true };

  // Initial viewport settings
  const defaultViewport = { x: 0, y: 0, zoom: 1 };

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <ReactFlow
        nodes={filteredNodes}
        edges={filteredEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={fitViewOptions}
        defaultViewport={defaultViewport}
        proOptions={proOptions}
        minZoom={0.1}
        maxZoom={2}
      >
        {/* Display active filters - responsive */}
        {(activeFilterOptions.statusFilter !== 'all' || 
          activeFilterOptions.searchQuery.trim() || 
          activeFilterOptions.onlyShowActive) && (
          <Panel 
            position="top-left" 
            className={`bg-white p-2 rounded-lg shadow-md border border-gray-200 ${
              currentBreakpoint === 'xs' ? 'text-xs max-w-[80vw]' : ''
            }`}
          >
            <div className={`text-gray-700 ${currentBreakpoint === 'xs' ? 'text-xs' : 'text-sm'}`}>
              <span className="font-bold">Filters Applied:</span>
              <div className={`flex flex-wrap gap-1 mt-1 ${currentBreakpoint === 'xs' ? 'max-w-full' : ''}`}>
                {activeFilterOptions.statusFilter !== 'all' && (
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs">
                    Status: {activeFilterOptions.statusFilter}
                  </span>
                )}
                {activeFilterOptions.searchQuery.trim() && (
                  <span className="px-2 py-0.5 bg-green-100 text-green-800 rounded-full text-xs">
                    Search: {activeFilterOptions.searchQuery}
                  </span>
                )}
                {activeFilterOptions.onlyShowActive && (
                  <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full text-xs">
                    Active Only
                  </span>
                )}
              </div>
            </div>
          </Panel>
        )}
        
        {/* Mini map - responsive */}
        {miniMapVisible && (
          <MiniMap 
            style={miniMapStyle}
            nodeStrokeWidth={3}
            nodeColor={(node) => {
              const status = getNodeStatus(node.data);
              if (!status) return 'var(--node-bg)';
              return `var(--status-border-${status})`;
            }}
            nodeStrokeColor={(node) => {
              const status = getNodeStatus(node.data);
              if (!status) return 'var(--node-border)';
              return 'var(--node-border)';
            }}
            zoomable
            pannable
          />
        )}
        
        <Panel position="bottom-right" style={controlsStyle} className="react-flow__controls" aria-label="Viewport controls">
          <button
            type="button"
            className="react-flow__controls-button react-flow__controls-zoomin"
            onClick={handleZoomIn}
            aria-label="zoom in"
            title="zoom in"
            disabled={maxZoomReached}
          >
            <Plus size={14} strokeWidth={2} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="react-flow__controls-button react-flow__controls-zoomout"
            onClick={handleZoomOut}
            aria-label="zoom out"
            title="zoom out"
            disabled={minZoomReached}
          >
            <Minus size={14} strokeWidth={2} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="react-flow__controls-button react-flow__controls-fitview"
            onClick={handleFitView}
            aria-label="fit view"
            title="fit view"
          >
            <Maximize2 size={14} strokeWidth={2} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="react-flow__controls-button react-flow__controls-interactive"
            onClick={handleToggleInteractivity}
            aria-label="toggle interactivity"
            title="toggle interactivity"
          >
            {isInteractive ? (
              <Unlock size={14} strokeWidth={2} aria-hidden="true" />
            ) : (
              <Lock size={14} strokeWidth={2} aria-hidden="true" />
            )}
          </button>
        </Panel>
        
        <Background
          variant={BackgroundVariant.Dots}
          gap={12}
          size={1}
        />
        
        {/* Help information for mobile display */}
        {currentBreakpoint === 'xs' && (
          <Panel position="bottom-center" className="p-2 bg-white bg-opacity-80 rounded text-xs text-center">
            Pinch to zoom, swipe to move
          </Panel>
        )}
      </ReactFlow>
      
      {/* Detailed information for selected node - responsive */}
      {selectedNode && (
        <div 
          className={`absolute p-3 bg-white dark:bg-gray-800 border rounded-md shadow-lg 
            ${currentBreakpoint === 'xs' ? 'left-2 right-2 bottom-2' : 'right-4 top-4 w-64'}`}
        >
          <div className="flex justify-between mb-2">
            <h3 className="font-bold">Details</h3>
            <button 
              onClick={onPaneClick}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>
          <div className="text-sm">
            <p><strong>Title:</strong> {selectedNode.data.label}</p>
            <p><strong>Status:</strong> {selectedNode.data.status && statusLabels[selectedNode.data.status]}</p>
            {selectedNode.data.description && (
              <p><strong>Description:</strong> {selectedNode.data.description}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkplanFlow; 
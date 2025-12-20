import { Edge, Position } from 'reactflow'
import { WorkPlan, CommitStatus, NodeData, ExtendedNode } from '../types'
import { CommitNodeData } from '../components/CommitNode'
import type { FilterOptions } from '../components/panels/FilterPanel.types'

// Function to return color based on status
export const getStatusColor = (status: CommitStatus): string => {
  switch (status) {
    case 'completed':
      return 'var(--status-border-completed)'
    case 'in_progress':
      return 'var(--status-border-in_progress)'
    case 'cancelled':
      return 'var(--status-border-cancelled)'
    case 'needsRefinment':
      return 'var(--status-border-needsRefinment)'
    case 'user_review':
      return 'var(--status-border-user_review)'
    case 'not_started':
    default:
      return 'var(--status-border-not_started)'
  }
}

// Function to return background color based on status
export const getStatusBackgroundColor = (status: CommitStatus): string => {
  switch (status) {
    case 'completed':
      return 'var(--status-node-bg-completed)'
    case 'in_progress':
      return 'var(--status-node-bg-in_progress)'
    case 'cancelled':
      return 'var(--status-node-bg-cancelled)'
    case 'needsRefinment':
      return 'var(--status-node-bg-needsRefinment)'
    case 'user_review':
      return 'var(--status-node-bg-user_review)'
    case 'not_started':
    default:
      return 'var(--status-node-bg-not_started)'
  }
}

// Function to return label based on status
const getStatusLabel = (status: CommitStatus): string => {
  switch (status) {
    case 'completed':
      return 'Completed'
    case 'in_progress':
      return 'In Progress'
    case 'cancelled':
      return 'Cancelled'
    case 'needsRefinment':
      return 'Needs Refinement'
    case 'user_review':
      return 'Waiting for User Review'
    case 'not_started':
    default:
      return 'Not Started'
  }
}

// Function to return icon based on status
const getStatusIcon = (status: CommitStatus): string => {
  switch (status) {
    case 'completed':
      return '✅'
    case 'in_progress':
      return '🔄'
    case 'cancelled':
      return '❌'
    case 'needsRefinment':
      return '🔍'
    case 'user_review':
      return '👀'
    case 'not_started':
    default:
      return '⏳'
  }
}

// Layout constants
const DEFAULT_LAYOUT = {
  HORIZONTAL_SPACING: 550, // Horizontal spacing between PR nodes
  PR_WIDTH: 200, // Width of PR nodes
  COMMIT_WIDTH: 240, // Width of commit nodes
  COMMIT_HEIGHT: 100, // Height of commit nodes
  VERTICAL_CENTER: 100, // Vertical center position (top alignment)
  COMMIT_HORIZONTAL_OFFSET: 250, // Horizontal offset for commit nodes to the right of PR
  INITIAL_X: 100, // Initial X coordinate for the first node
}

// Interface for responsive layout options
export interface LayoutOptions {
  nodePadding?: number
  nodeSpacing?: number
}

/**
 * Function to convert workplan to react-flow nodes and edges
 * @param workplan Workplan
 * @param options Responsive layout options
 * @returns Object containing nodes and edges
 */
export const convertWorkPlanToFlow = (
  workplan: WorkPlan,
  options?: LayoutOptions,
) => {
  if (!workplan) return { nodes: [], edges: [] }

  // Initialize arrays for nodes and edges
  const nodes: ExtendedNode<NodeData | CommitNodeData>[] = []
  const edges: Edge[] = []

  // Apply spacing and padding factors
  const spacing = options?.nodeSpacing ?? 1
  const padding = options?.nodePadding ?? 1

  // Calculate responsive layout values
  const layout = {
    HORIZONTAL_SPACING: DEFAULT_LAYOUT.HORIZONTAL_SPACING * spacing,
    PR_WIDTH: DEFAULT_LAYOUT.PR_WIDTH * padding,
    COMMIT_WIDTH: DEFAULT_LAYOUT.COMMIT_WIDTH * padding,
    COMMIT_HEIGHT: DEFAULT_LAYOUT.COMMIT_HEIGHT,
    VERTICAL_CENTER: DEFAULT_LAYOUT.VERTICAL_CENTER,
    COMMIT_HORIZONTAL_OFFSET: DEFAULT_LAYOUT.COMMIT_HORIZONTAL_OFFSET * spacing,
    INITIAL_X: DEFAULT_LAYOUT.INITIAL_X * spacing,
  }

  // Generate PR nodes and commit nodes
  workplan.prPlans.forEach((pr, prIndex) => {
    // PR node
    const prId = `pr-${prIndex}`
    const prStatus = getOverallStatus(
      pr.commitPlans.map((commit) => commit.status),
    )

    const prNode: ExtendedNode<NodeData | CommitNodeData> = {
      id: prId,
      type: 'prNode',
      className: `pr-node status-${prStatus}`,
      position: {
        x: layout.INITIAL_X + layout.HORIZONTAL_SPACING * prIndex,
        y: layout.VERTICAL_CENTER,
      },
      data: {
        label: pr.goal,
        description: `PR ${prIndex + 1}`,
        status: prStatus,
        statusLabel: getStatusLabel(prStatus),
        statusIcon: getStatusIcon(prStatus),
        developerNote: pr.developerNote,
      },
      style: {
        width: layout.PR_WIDTH,
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    }

    nodes.push(prNode)

    // Connect to previous PR (for second and subsequent PRs)
    if (prIndex > 0) {
      edges.push({
        id: `pr-${prIndex - 1}-to-${prId}`,
        source: `pr-${prIndex - 1}`,
        target: prId,
        animated: false,
        sourceHandle: 'right',
        targetHandle: 'left',
        className: 'edge-neutral',
      })
    }

    // Commit node
    pr.commitPlans.forEach((commit, commitIndex) => {
      const commitId = `commit-${prIndex}-${commitIndex}`
      const commitStatus = commit.status || 'not_started'

      // Calculate commit vertical position (spread out from PR center)
      const verticalOffset =
        (commitIndex - (pr.commitPlans.length - 1) / 2) *
        (layout.COMMIT_HEIGHT * 1.5)

      // Commit node
      const commitNode: ExtendedNode<CommitNodeData> = {
        id: commitId,
        type: 'commitNode',
        className: `status-${commitStatus}`,
        position: {
          x:
            layout.INITIAL_X +
            layout.HORIZONTAL_SPACING * prIndex +
            layout.COMMIT_HORIZONTAL_OFFSET,
          y: layout.VERTICAL_CENTER + verticalOffset,
        },
        data: {
          title: commit.goal,
          label: commit.goal,
          status: commitStatus,
          prIndex: prIndex,
          commitIndex: commitIndex,
          developerNote: commit.developerNote,
        },
        style: {
          width: layout.COMMIT_WIDTH,
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      }

      nodes.push(commitNode)

      // Connect commit to PR
      edges.push({
        id: `${prId}-to-${commitId}`,
        source: prId,
        target: commitId,
        animated: false,
        sourceHandle: 'right',
        targetHandle: 'left',
        label: `Commit ${commitIndex + 1}`,
        className: `status-${commitStatus}`,
        data: {
          status: commitStatus,
        },
      })

      // If there's a next PR, add edge from final commit to next PR
      if (
        prIndex < workplan.prPlans.length - 1 &&
        commitIndex === pr.commitPlans.length - 1
      ) {
        edges.push({
          id: `${commitId}-to-pr-${prIndex + 1}`,
          source: commitId,
          target: `pr-${prIndex + 1}`,
          animated: false,
          sourceHandle: 'right',
          targetHandle: 'left',
          style: {
            strokeDasharray: '5, 5',
          },
          className: 'edge-neutral',
        })
      }
    })
  })

  return { nodes, edges }
}

// Function to determine overall status of PR based on commit statuses
const getOverallStatus = (
  statuses: (CommitStatus | undefined)[],
): CommitStatus => {
  // Treat undefined status as 'not_started'
  const definedStatuses = statuses.map((s) => s || 'not_started')
  const nonCancelledStatuses = definedStatuses.filter(
    (status) => status !== 'cancelled',
  )

  if (
    nonCancelledStatuses.length === 0 &&
    definedStatuses.some((status) => status === 'cancelled')
  ) {
    return 'cancelled'
  }

  if (
    nonCancelledStatuses.length > 0 &&
    nonCancelledStatuses.every((status) => status === 'completed')
  ) {
    return 'completed'
  }

  if (nonCancelledStatuses.some((status) => status === 'in_progress')) {
    return 'in_progress'
  }

  if (nonCancelledStatuses.some((status) => status === 'needsRefinment')) {
    return 'needsRefinment'
  }

  if (nonCancelledStatuses.some((status) => status === 'user_review')) {
    return 'user_review'
  }

  return 'not_started'
}

// Function to filter workplan
export const filterWorkplan = (
  workplan: WorkPlan,
  options: FilterOptions,
): WorkPlan => {
  if (!workplan) return { goal: '', prPlans: [] }

  // Return unchanged if filtering is not needed
  if (
    options.statusFilter === 'all' &&
    !options.searchQuery &&
    !options.onlyShowActive
  ) {
    return workplan
  }

  // Convert search query to lowercase
  const searchQueryLower = options.searchQuery.toLowerCase()

  const filteredPrPlans = workplan.prPlans
    .map((pr) => {
      // Filter commits in PR
      const filteredCommits = pr.commitPlans.filter((commit) => {
        // Status filter
        const statusMatch =
          options.statusFilter === 'all' ||
          commit.status === options.statusFilter

        // Search filter
        const searchMatch =
          !searchQueryLower ||
          commit.goal.toLowerCase().includes(searchQueryLower)

        // Active filter
        const activeMatch =
          !options.onlyShowActive ||
          commit.status === 'in_progress' ||
          commit.status === 'needsRefinment'

        return statusMatch && searchMatch && activeMatch
      })

      // Return PR with filtered commits
      return {
        ...pr,
        commitPlans: filteredCommits,
      }
    })
    .filter((pr) => {
      // Keep PRs with non-empty commits
      return pr.commitPlans.length > 0
    })

  return {
    goal: workplan.goal,
    prPlans: filteredPrPlans,
  }
}

// Function to apply direct filtering to nodes and edges
export const filterNodesAndEdges = (
  nodes: ExtendedNode<NodeData | CommitNodeData>[],
  edges: Edge[],
  options: FilterOptions,
): { nodes: ExtendedNode<NodeData | CommitNodeData>[]; edges: Edge[] } => {
  // Return unchanged if filtering is not needed
  if (
    options.statusFilter === 'all' &&
    !options.searchQuery &&
    !options.onlyShowActive
  ) {
    return { nodes, edges }
  }

  // Convert search query to lowercase
  const searchQueryLower = options.searchQuery.toLowerCase()

  // Apply filtering to commit nodes
  // PR nodes are always displayed
  const filteredNodeIds = new Set()

  // Collect displayed node IDs
  const filteredNodes = nodes.filter((node) => {
    // Always display PR nodes
    if (node.type !== 'commitNode') {
      filteredNodeIds.add(node.id)
      return true
    }

    // Apply filtering to commit nodes
    const nodeData = node.data as CommitNodeData

    // Status filter
    const statusMatch =
      options.statusFilter === 'all' || nodeData.status === options.statusFilter

    // Search filter
    const searchMatch =
      !searchQueryLower ||
      nodeData.title.toLowerCase().includes(searchQueryLower)

    // Active filter
    const activeMatch =
      !options.onlyShowActive ||
      nodeData.status === 'in_progress' ||
      nodeData.status === 'user_review'

    // If all conditions match, include this node
    const shouldInclude = statusMatch && searchMatch && activeMatch

    if (shouldInclude) {
      filteredNodeIds.add(node.id)
    }

    return shouldInclude
  })

  // Display only edges connected to filtered nodes
  const filteredEdges = edges.filter(
    (edge) =>
      filteredNodeIds.has(edge.source) && filteredNodeIds.has(edge.target),
  )

  return { nodes: filteredNodes, edges: filteredEdges }
}

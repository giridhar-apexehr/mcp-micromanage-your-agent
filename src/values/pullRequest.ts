import { Status } from './status.js';
import { Commit } from './commit.js';

export type PullRequest = {
  goal: string;
  status: Status;
  commits: Commit[];
  needsMoreThoughts?: boolean;
  developerNote?: string;
};

/**
 * Generates summary information for a list of pull requests
 */
export const generatePRSummaries = (pullRequests: PullRequest[]): Array<{
  prIndex: number;
  goal: string;
  status: Status;
  developerNote?: string;
  commits: {
    completed: number;
    total: number;
    percentComplete: number;
  };
}> => {
  return pullRequests.map((pr: PullRequest, prIndex: number) => {
    const nonCancelledCommits = pr.commits.filter((c: { status: Status }) => c.status !== 'cancelled');
    const completedCommits = nonCancelledCommits.filter(
      (c: { status: Status }) => c.status === 'completed'
    ).length;
    const totalCommits = nonCancelledCommits.length;
    
    return {
      prIndex: prIndex,
      goal: pr.goal,
      status: pr.status,
      developerNote: pr.developerNote,
      commits: {
        completed: completedCommits,
        total: totalCommits,
        percentComplete: totalCommits ? Math.round((completedCommits / totalCommits) * 100) : 0
      }
    };
  });
};

// Helper functions for status updates
export const updatePRStatusBasedOnCommits = (pr: PullRequest): PullRequest => {
  const commits = pr.commits;
  
  if (commits.length === 0) return pr;

  const nonCancelledCommits = commits.filter(commit => commit.status !== 'cancelled');
  
  const updatedPr = { ...pr };
  
  // If all commits are completed, mark PR as completed
  if (nonCancelledCommits.length > 0 && nonCancelledCommits.every(commit => commit.status === 'completed')) {
    updatedPr.status = "completed";
  }
  // If any commit is in user_review status, mark PR as user_review (unless there are in_progress commits)
  else if (nonCancelledCommits.length > 0 && nonCancelledCommits.some(commit => commit.status === 'user_review') &&
           !nonCancelledCommits.some(commit => commit.status === 'in_progress')) {
    updatedPr.status = "user_review";
  }
  // If any commit is in progress, mark PR as in progress
  else if (nonCancelledCommits.some(commit => commit.status === 'in_progress')) {
    updatedPr.status = "in_progress";
  }
  // "blocked" status has been removed as per requirements
  
  // If any commit needs refinement, mark PR as needs refinement
  else if (nonCancelledCommits.length > 0 && nonCancelledCommits.some(commit => commit.status === 'needsRefinment') &&
           !nonCancelledCommits.some(commit => commit.status === 'in_progress')) {
    updatedPr.status = "needsRefinment";
  }
  else if (nonCancelledCommits.length === 0 && commits.some(commit => commit.status === 'cancelled')) {
    updatedPr.status = 'cancelled';
  }
  
  return updatedPr;
};

/**
 * Updates the developer note for a pull request
 */
export const updatePRDeveloperNote = (pr: PullRequest, note: string): PullRequest => {
  return {
    ...pr,
    developerNote: note
  };
};

/**
 * Updates the developer note for a commit in a pull request
 */
export const updateCommitDeveloperNote = (pr: PullRequest, commitIndex: number, note: string): PullRequest => {
  if (commitIndex < 0 || commitIndex >= pr.commits.length) {
    return pr; // Invalid commit index
  }

  const updatedCommits = [...pr.commits];
  updatedCommits[commitIndex] = {
    ...updatedCommits[commitIndex],
    developerNote: note
  };

  return {
    ...pr,
    commits: updatedCommits
  };
}; 
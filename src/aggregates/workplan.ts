import { progressInstructionGuide } from '../prompts.js';
import fs from 'fs';
import { Ticket, planTicket, ensureTicketExists } from '../values/ticket.js';
import { PullRequest, updatePRStatusBasedOnCommits, generatePRSummaries } from '../values/pullRequest.js';
import { Status, validateStatusTransition } from '../values/status.js';
import * as fileStorage from '../utils/fileStorage.js';
import logger from '../utils/logger.js';

// command input schema
export interface PlanTaskInput {
  goal: string;
  prPlans: Array<{
    goal: string;
    commitPlans: Array<{
      goal: string;
      developerNote?: string;  // Added field for developer implementation notes
    }>;
    developerNote?: string;  // Added field for developer implementation notes
  }>;
  needsMoreThoughts?: boolean;
}

export interface UpdateStatusInput {
  prIndex: number;
  commitIndex: number;
  status: Status;
  goal?: string;
  developerNote?: string;  // Added field for developer implementation notes
}

export interface InsertCommitInput {
  prIndex: number;
  insertAfterCommitIndex: number;
  goal: string;
  developerNote?: string;
}

// 初期化オプション
export interface WorkPlanInitOptions {
  dataDir?: string;         // データディレクトリパス
  dataFileName?: string;    // データファイル名
}

// helpers
const errorResponse = (error: string): { content: Array<{ type: string; text: string }>; isError: boolean } => {
  logger.error(`Error response generated: ${error}`);
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        error: error,
        status: 'failed'
      }, null, 2)
    }],
    isError: true
  };
};

// ファイル操作に関連するエラーハンドリング
const handleFileOperationError = (operation: string, error: unknown): void => {
  logger.logError(`File operation error during ${operation}`, error);
};

// WorkPlanの状態をJSON形式で表現するインターフェース
export interface AgentWorkPlanState {
  workplans: Record<string, Ticket | "noTicket">;
}

export interface WorkPlanState {
  agents: Record<string, AgentWorkPlanState>;
  lastUpdated?: string;     // 最終更新日時
  version?: string;         // データ形式のバージョン
}

const createMigratedAgentId = (suffix: string): string => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `migrated_agent_${suffix}_${stamp}`;
};

const createMigratedWorkplanId = (suffix: string): string => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `migrated_${suffix}_${stamp}`;
};

// aggregate
export class WorkPlan {
  // state
  private agents: Record<string, AgentWorkPlanState> = {};
  private initialized: boolean = false;
  private lastUpdated: string = new Date().toISOString();
  private readonly version: string = "3.0.0"; // データ形式のバージョン
  private legacyMigrationNeeded: boolean = false;
  
  constructor(options?: WorkPlanInitOptions) {
    // 初期化オプションの処理
    if (options) {
      this.initialize(options);
    }

  }

  private loadTicketFromFile(agentId: string, workplanId: string): Ticket | "noTicket" {
    try {
      const filePath = fileStorage.getWorkplanPath(agentId, workplanId);
      if (!fs.existsSync(filePath)) {
        return "noTicket";
      }

      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;

      if (!parsed || typeof parsed !== 'object') {
        return "noTicket";
      }

      const ticket = parsed as Partial<Ticket>;
      if (typeof ticket.goal !== 'string' || !Array.isArray((ticket as { pullRequests?: unknown }).pullRequests)) {
        return "noTicket";
      }

      return ticket as Ticket;
    } catch (error) {
      logger.logError('Failed to load ticket from per-workplan file', error);
      return "noTicket";
    }
  }

  private saveTicketToFile(agentId: string, workplanId: string, ticket: Ticket | "noTicket"): boolean {
    try {
      const filePath = fileStorage.getWorkplanPath(agentId, workplanId);
      return fileStorage.writeJsonAtomic(filePath, ticket);
    } catch (error) {
      logger.logError('Failed to save ticket to per-workplan file', error);
      return false;
    }
  }

  public insertCommit(input: InsertCommitInput, agentId: string, workplanId: string): { content: Array<{ type: string; text: string }>; isError?: boolean } {
    try {
      if (!this.initialized) {
        return errorResponse('WorkPlan is not initialized. Call initialize() first.');
      }

      logger.info(`Inserting commit for PR #${input.prIndex} after commit #${input.insertAfterCommitIndex}`);

      if (!agentId || !String(agentId).trim()) {
        return errorResponse('agentId is required.');
      }

      if (!workplanId || !String(workplanId).trim()) {
        return errorResponse('workplanId is required.');
      }

      const agentState = this.agents[agentId];
      if (!agentState) {
        return errorResponse(`No agent found for agentId: ${agentId}`);
      }

      const fileTicket = this.loadTicketFromFile(agentId, workplanId);
      const workingTicket = fileTicket !== "noTicket" ? fileTicket : (agentState.workplans[workplanId] ?? "noTicket");

      const ticketCheck = ensureTicketExists(workingTicket, true);
      if (!ticketCheck.result) {
        logger.warn('No implementation plan found');
        return ticketCheck.response;
      }

      const ticket = ticketCheck.ticket;

      const inProgressCommits = ticket.pullRequests.reduce((sum: number, pullRequest: PullRequest) => {
        return sum + pullRequest.commits.filter((c: { status: Status }) => c.status === 'in_progress').length;
      }, 0);

      if (inProgressCommits > 1) {
        const error = `Invalid state: found ${inProgressCommits} commits with status "in_progress". There must be exactly one task in "in_progress" (or none).`;
        logger.error(error);
        return errorResponse(error);
      }

      const prIndex = input.prIndex;
      if (prIndex < 0 || prIndex >= ticket.pullRequests.length) {
        const error = `Invalid prIndex: must be between 0 and ${ticket.pullRequests.length - 1}`;
        logger.error(error);
        return errorResponse(error);
      }

      const pr = ticket.pullRequests[prIndex];
      const commits = pr.commits;

      const insertAfterCommitIndex = input.insertAfterCommitIndex;
      if (insertAfterCommitIndex < -1 || insertAfterCommitIndex >= commits.length) {
        const error = `Invalid insertAfterCommitIndex: must be -1 or between 0 and ${Math.max(commits.length - 1, 0)}`;
        logger.error(error);
        return errorResponse(error);
      }

      const insertAtIndex = insertAfterCommitIndex === -1 ? 0 : insertAfterCommitIndex + 1;

      const newCommit = {
        goal: input.goal,
        status: "not_started" as Status,
        developerNote: input.developerNote
      };

      const newCommits = [
        ...commits.slice(0, insertAtIndex),
        newCommit,
        ...commits.slice(insertAtIndex)
      ];

      const updatedPr = updatePRStatusBasedOnCommits({
        ...pr,
        commits: newCommits
      });

      ticket.pullRequests[prIndex] = updatedPr;

      const perWorkplanSaved = this.saveTicketToFile(agentId, workplanId, ticket);
      if (!perWorkplanSaved) {
        logger.warn(`Failed to persist per-workplan ticket file for agentId=${agentId}, workplanId=${workplanId}`);
      } else {
        const prCount = ticket.pullRequests.length;
        const commitCount = ticket.pullRequests.reduce((sum: number, pr: PullRequest) => sum + pr.commits.length, 0);

        const entryLastUpdated = new Date().toISOString();
        const indexUpdated = fileStorage.updateAgentsIndex((state) => {
          const next = state;
          if (!next.agents[agentId]) {
            next.agents[agentId] = { workplans: {} };
          }
          if (!next.agents[agentId].workplans) {
            next.agents[agentId].workplans = {};
          }
          next.agents[agentId].workplans[workplanId] = {
            goal: ticket.goal,
            prCount,
            commitCount,
            lastUpdated: entryLastUpdated,
          };
        });

        if (!indexUpdated) {
          logger.warn(`Failed to update agents index for agentId=${agentId}, workplanId=${workplanId}`);
        }
      }

      this.agents = {
        ...this.agents,
        [agentId]: {
          ...agentState,
          workplans: { ...agentState.workplans, [workplanId]: ticket }
        }
      };

      const saveSuccess = this.saveState();

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            message: `Commit inserted at index ${insertAtIndex} for PR #${prIndex}.`,
            agentId,
            workplanId,
            prIndex,
            insertAfterCommitIndex,
            insertedCommitIndex: insertAtIndex,
            goal: input.goal,
            developerNote: input.developerNote,
            persistenceStatus: saveSuccess ? 'saved' : 'memory_only',
            lastUpdated: this.lastUpdated
          }, null, 2)
        }]
      };
    } catch (error) {
      logger.logError('Error during commit insertion', error);
      return errorResponse(error instanceof Error ? error.message : String(error));
    }
  }
  
  /**
   * WorkPlanの初期化メソッド
   * @param options 初期化オプション
   * @returns 初期化が成功したかどうか
   */
  public initialize(options: WorkPlanInitOptions = {}): boolean {
    try {
      logger.info('Initializing WorkPlan with options:', options);
      
      // データディレクトリの設定
      if (options.dataDir) {
        fileStorage.setDataDirectory(options.dataDir);
      }
      
      // データファイル名の設定
      if (options.dataFileName) {
        fileStorage.setDataFileName(options.dataFileName);
      }
      
      // 常に自動的にデータをロードする
      this.loadState();
      
      // ファイルが存在しない場合に常に新規作成
      if (!fileStorage.fileExists()) {
        logger.info('Creating initial data file as it does not exist');
        this.saveState();
      }
      
      this.initialized = true;
      logger.info(`WorkPlan initialized successfully. Using data file: ${fileStorage.getDataFilePath()}`);
      return true;
    } catch (error) {
      handleFileOperationError('initialization', error);
      return false;
    }
  }
  
  /**
   * WorkPlanが初期化されているかどうかを確認
   * @returns 初期化済みの場合はtrue
   */
  public isInitialized(): boolean {
    return this.initialized;
  }
  
  // ファイルから状態を読み込む
  private loadState(): void {
    try {
      logger.info('Loading WorkPlan state from file');
      const defaultState: WorkPlanState = {
        agents: {},
        lastUpdated: this.lastUpdated,
        version: this.version
      };

      const agentsIndexExists = fs.existsSync(fileStorage.getAgentsIndexPath());
      const legacyWorkplanExists = fs.existsSync(fileStorage.getDataFilePath());
      this.legacyMigrationNeeded = !agentsIndexExists && legacyWorkplanExists;
      logger.info(
        `Migration check: agentsIndexExists=${agentsIndexExists}, legacyWorkplanExists=${legacyWorkplanExists}, legacyMigrationNeeded=${this.legacyMigrationNeeded}`,
      );

      const savedStateRaw = fileStorage.loadFromFile<unknown>(defaultState);

      const savedState = savedStateRaw as Partial<WorkPlanState> & {
        // legacy
        currentTicket?: Ticket | "noTicket";
        // pre-agent multi-workplan schema
        workplans?: Record<string, Ticket | "noTicket">;
        activeWorkplanId?: string | null;
        // legacy agent schema fields
        activeAgentId?: string | null;
      };

      const hasAgentsSchema = typeof savedState.agents !== 'undefined' && savedState.agents !== null;
      const hasWorkplansSchema = typeof savedState.workplans !== 'undefined' && savedState.workplans !== null;
      const hasLegacySchema = typeof savedState.currentTicket !== 'undefined' && !hasAgentsSchema && !hasWorkplansSchema;

      if (hasAgentsSchema) {
        const rawAgents = savedState.agents && typeof savedState.agents === 'object'
          ? (savedState.agents as Record<string, unknown>)
          : defaultState.agents;

        // Normalize shape and drop any persisted "active" fields
        this.agents = Object.fromEntries(
          Object.entries(rawAgents).map(([agentId, agentState]) => {
            const maybeState = agentState as Partial<AgentWorkPlanState> & {
              activeWorkplanId?: string | null;
            };
            return [agentId, { workplans: maybeState.workplans ?? {} } satisfies AgentWorkPlanState];
          })
        );

        this.lastUpdated = savedState.lastUpdated || new Date().toISOString();

        // バージョンチェック (将来の互換性のため)
        if (savedState.version && savedState.version !== this.version) {
          logger.warn(`Data version mismatch: file=${savedState.version}, current=${this.version}`);
        }
      } else if (hasWorkplansSchema) {
        const migratedAgentId = createMigratedAgentId('workplans');
        const migratedAgentState: AgentWorkPlanState = {
          workplans: savedState.workplans && typeof savedState.workplans === 'object'
            ? (savedState.workplans as Record<string, Ticket | "noTicket">)
            : {},
        };

        // Remove implicit "default" workplan key if present
        if (Object.prototype.hasOwnProperty.call(migratedAgentState.workplans, 'default')) {
          const migratedId = createMigratedWorkplanId('default');
          const defaultTicket = migratedAgentState.workplans['default'];
          delete migratedAgentState.workplans['default'];
          migratedAgentState.workplans[migratedId] = defaultTicket;
        }

        const migratedState: WorkPlanState = {
          agents: { [migratedAgentId]: migratedAgentState },
          lastUpdated: savedState.lastUpdated || this.lastUpdated,
          version: this.version
        };

        this.agents = migratedState.agents;
        this.lastUpdated = migratedState.lastUpdated || new Date().toISOString();

        logger.info('Pre-agent workplan schema detected; migrated to agent-scoped format');
        this.saveState();
      } else if (hasLegacySchema) {
        const migratedAgentId = createMigratedAgentId('legacy');
        const migratedWorkplanId = createMigratedWorkplanId('legacy');
        const migratedState: WorkPlanState = {
          agents: {
            [migratedAgentId]: {
              workplans: { [migratedWorkplanId]: savedState.currentTicket ?? "noTicket" }
            }
          },
          lastUpdated: savedState.lastUpdated || this.lastUpdated,
          version: this.version
        };

        this.agents = migratedState.agents;
        this.lastUpdated = migratedState.lastUpdated || new Date().toISOString();

        logger.info('Legacy single-ticket schema detected; migrated to agent-scoped format');
        this.saveState();
      } else {
        this.agents = defaultState.agents;
        this.lastUpdated = savedState.lastUpdated || new Date().toISOString();
      }

      logger.info(`WorkPlan state loaded from file: ${fileStorage.getDataFilePath()}`);

      const agentCount = Object.keys(this.agents).length;
      if (!agentCount) {
        logger.info('No agents found in loaded state');
      }
    } catch (error) {
      handleFileOperationError('loading state from file', error);
    }
  }
  
  // 状態をファイルに保存
  private saveState(): boolean {
    try {
      logger.info('Saving WorkPlan state to file');
      
      // 最終更新日時を更新
      this.lastUpdated = new Date().toISOString();
      
      const state: WorkPlanState = {
        agents: this.agents,
        lastUpdated: this.lastUpdated,
        version: this.version
      };
      
      const success = fileStorage.saveToFile<WorkPlanState>(state);
      
      if (success) {
        logger.info(`WorkPlan state saved to file: ${fileStorage.getDataFilePath()}`);
      } else {
        logger.error('Failed to save WorkPlan state to file');
      }
      
      return success;
    } catch (error) {
      handleFileOperationError('saving state to file', error);
      return false;
    }
  }

  // commands
  public plan(input: PlanTaskInput, agentId: string, workplanId: string): { content: Array<{ type: string; text: string }>; isError?: boolean } {
    try {
      // 初期化チェック
      if (!this.initialized) {
        return errorResponse('WorkPlan is not initialized. Call initialize() first.');
      }

      if (!agentId || !String(agentId).trim()) {
        return errorResponse('agentId is required. Provide a unique identifier for the calling agent.');
      }

      if (!workplanId || !String(workplanId).trim()) {
        return errorResponse('workplanId is required. Provide a unique identifier for this workplan.');
      }
      
      logger.info(`Creating plan with goal: ${input.goal}, ${input.prPlans.length} PRs`);
      const newTicket = planTicket(input);

      const perWorkplanSaved = this.saveTicketToFile(agentId, workplanId, newTicket);
      if (!perWorkplanSaved) {
        logger.warn(`Failed to persist per-workplan ticket file for agentId=${agentId}, workplanId=${workplanId}`);
      } else {
        const prCount = newTicket.pullRequests.length;
        const commitCount = newTicket.pullRequests.reduce((sum: number, pr: PullRequest) => sum + pr.commits.length, 0);

        const entryLastUpdated = new Date().toISOString();
        const indexUpdated = fileStorage.updateAgentsIndex((state) => {
          const next = state;
          if (!next.agents[agentId]) {
            next.agents[agentId] = { workplans: {} };
          }
          if (!next.agents[agentId].workplans) {
            next.agents[agentId].workplans = {};
          }
          next.agents[agentId].workplans[workplanId] = {
            goal: newTicket.goal,
            prCount,
            commitCount,
            lastUpdated: entryLastUpdated,
          };
        });

        if (!indexUpdated) {
          logger.warn(`Failed to update agents index for agentId=${agentId}, workplanId=${workplanId}`);
        }
      }

      const agentState: AgentWorkPlanState = this.agents[agentId] ?? { workplans: {} };
      const existing = agentState.workplans[workplanId] ?? "noTicket";
      const isReplacing = existing !== "noTicket";

      this.agents = {
        ...this.agents,
        [agentId]: {
          ...agentState,
          workplans: { ...agentState.workplans, [workplanId]: newTicket }
        }
      };
      
      // 状態をファイルに保存
      const saveSuccess = this.saveState();

      let message = `Implementation plan created with ${newTicket.pullRequests.length} PRs and ${newTicket.pullRequests.reduce((sum: number, pr: PullRequest) => sum + pr.commits.length, 0)} commits.`;
      
      if (isReplacing) {
        message = `Previous plan has been replaced. ${message}`;
      }

      logger.info(message);
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            agentId,
            workplanId,
            prCount: newTicket.pullRequests.length,
            commitCount: newTicket.pullRequests.reduce((sum: number, pr: PullRequest) => sum + pr.commits.length, 0),
            message,
            persistenceStatus: saveSuccess ? 'saved' : 'memory_only',
            lastUpdated: this.lastUpdated
          }, null, 2)
        }]
      };
    } catch (error) {
      logger.logError('Error during plan creation', error);
      return errorResponse(error instanceof Error ? error.message : String(error));
    }
  }

  public trackProgress(agentId: string, workplanId: string): { content: Array<{ type: string; text: string }>; isError?: boolean } {
    try {
      // 初期化チェック
      if (!this.initialized) {
        return errorResponse('WorkPlan is not initialized. Call initialize() first.');
      }
      
      logger.info('Tracking progress');

      if (!agentId || !String(agentId).trim()) {
        return errorResponse('agentId is required.');
      }

      if (!workplanId || !String(workplanId).trim()) {
        return errorResponse('workplanId is required.');
      }

      const agentState = this.agents[agentId];
      if (!agentState) {
        return errorResponse(`No agent found for agentId: ${agentId}`);
      }

      const ticketCheck = ensureTicketExists(agentState.workplans[workplanId] ?? "noTicket");
      if (!ticketCheck.result) {
        logger.warn('No implementation plan found');
        return ticketCheck.response;
      }
      
      const ticket = ticketCheck.ticket;
      
      // Calculate progress statistics
      const completedPRs = ticket.pullRequests.filter((pr: PullRequest) => pr.status === "completed").length;
      const totalPRs = ticket.pullRequests.length;
      const completedCommits = ticket.pullRequests.reduce((sum: number, pr: PullRequest) => {
        const nonCancelledCommits = pr.commits.filter((c: { status: Status }) => c.status !== 'cancelled');
        return sum + nonCancelledCommits.filter((c: { status: Status }) => c.status === 'completed').length;
      }, 0);
      const totalCommits = ticket.pullRequests.reduce((sum: number, pr: PullRequest) => {
        return sum + pr.commits.filter((c: { status: Status }) => c.status !== 'cancelled').length;
      }, 0);
      
      // Generate PR status summary
      const prSummaries = generatePRSummaries(ticket.pullRequests);
      
      // Create detailed PR and commit information including developer notes
      const detailedPRs = ticket.pullRequests.map((pr: PullRequest, prIndex: number) => {
        const detailedCommits = pr.commits.map((commit, commitIndex) => {
          return {
            commitIndex,
            goal: commit.goal,
            status: commit.status,
            developerNote: commit.developerNote
          };
        });

        return {
          prIndex,
          goal: pr.goal,
          status: pr.status,
          developerNote: pr.developerNote,
          commits: detailedCommits
        };
      });
      
      logger.info(
        `Progress: ${completedPRs}/${totalPRs} PRs, ${completedCommits}/${totalCommits} commits, ` +
        `${totalCommits ? Math.round((completedCommits / totalCommits) * 100) : 0}% complete`
      );
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            agentId,
            workplanId,
            goal: ticket.goal,
            progress: {
              prs: `${completedPRs}/${totalPRs}`,
              commits: `${completedCommits}/${totalCommits}`,
              percentComplete: totalCommits ? Math.round((completedCommits / totalCommits) * 100) : 0
            },
            pullRequests: prSummaries,
            detailedPullRequests: detailedPRs,  // Add detailed information including developer notes
            agentInstruction: progressInstructionGuide.text,
            persistenceInfo: {
              dataFilePath: fileStorage.getDataFilePath(),
              fileExists: fileStorage.fileExists(),
              lastUpdated: this.lastUpdated
            }
          }, null, 2)
        }]
      };
    } catch (error) {
      logger.logError('Error during progress tracking', error);
      return errorResponse(error instanceof Error ? error.message : String(error));
    }
  }

  // Method to update status
  public updateStatus(input: UpdateStatusInput, agentId: string, workplanId: string): { content: Array<{ type: string; text: string }>; isError?: boolean } {
    try {
      // 初期化チェック
      if (!this.initialized) {
        return errorResponse('WorkPlan is not initialized. Call initialize() first.');
      }
      
      logger.info(`Updating status for PR #${input.prIndex}, commit #${input.commitIndex} to "${input.status}"`);

      if (!agentId || !String(agentId).trim()) {
        return errorResponse('agentId is required.');
      }

      if (!workplanId || !String(workplanId).trim()) {
        return errorResponse('workplanId is required.');
      }

      const agentState = this.agents[agentId];
      if (!agentState) {
        return errorResponse(`No agent found for agentId: ${agentId}`);
      }

      const fileTicket = this.loadTicketFromFile(agentId, workplanId);
      const workingTicket = fileTicket !== "noTicket" ? fileTicket : (agentState.workplans[workplanId] ?? "noTicket");

      const ticketCheck = ensureTicketExists(workingTicket, true);
      if (!ticketCheck.result) {
        logger.warn('No implementation plan found');
        return ticketCheck.response;
      }
      
      const ticket = ticketCheck.ticket;
      
      const prIndex = input.prIndex;
      if (prIndex < 0 || prIndex >= ticket.pullRequests.length) {
        const error = `Invalid prIndex: must be between 0 and ${ticket.pullRequests.length - 1}`;
        logger.error(error);
        return errorResponse(error);
      }

      const changes: string[] = [];
      const pr = ticket.pullRequests[prIndex];
      
      // Special case: commit index -1 means we're updating the PR itself, not a commit
      // This allows adding developer notes directly to PRs
      if (input.commitIndex === -1) {
        // Only update the developer note for the PR
        if (input.developerNote !== undefined) {
          ticket.pullRequests[prIndex].developerNote = input.developerNote;
          changes.push(`PR developer note updated`);
          logger.info(`Updated PR developer note: ${input.developerNote}`);

          const perWorkplanSaved = this.saveTicketToFile(agentId, workplanId, ticket);
          if (!perWorkplanSaved) {
            logger.warn(`Failed to persist per-workplan ticket file for agentId=${agentId}, workplanId=${workplanId}`);
          } else {
            const prCount = ticket.pullRequests.length;
            const commitCount = ticket.pullRequests.reduce((sum: number, pr: PullRequest) => sum + pr.commits.length, 0);

            const entryLastUpdated = new Date().toISOString();
            const indexUpdated = fileStorage.updateAgentsIndex((state) => {
              const next = state;
              if (!next.agents[agentId]) {
                next.agents[agentId] = { workplans: {} };
              }
              if (!next.agents[agentId].workplans) {
                next.agents[agentId].workplans = {};
              }
              next.agents[agentId].workplans[workplanId] = {
                goal: ticket.goal,
                prCount,
                commitCount,
                lastUpdated: entryLastUpdated,
              };
            });

            if (!indexUpdated) {
              logger.warn(`Failed to update agents index for agentId=${agentId}, workplanId=${workplanId}`);
            }
          }

          this.agents = {
            ...this.agents,
            [agentId]: {
              ...agentState,
              workplans: { ...agentState.workplans, [workplanId]: ticket }
            }
          };

          // 変更をファイルに保存
          const saveSuccess = this.saveState();

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                message: `PR #${prIndex} ${changes.join(" and ")}.`,
                agentId,
                workplanId,
                prIndex: prIndex,
                developerNote: input.developerNote,
                persistenceStatus: saveSuccess ? 'saved' : 'memory_only',
                lastUpdated: this.lastUpdated
              }, null, 2)
            }]
          };
        } else {
          const error = `When updating a PR directly (commitIndex -1), developerNote must be provided`;
          logger.error(error);
          return errorResponse(error);
        }
      }
      
      const commitIndex = input.commitIndex;
      if (commitIndex < 0 || commitIndex >= pr.commits.length) {
        const error = `Invalid commitIndex: must be between 0 and ${pr.commits.length - 1}`;
        logger.error(error);
        return errorResponse(error);
      }
      
      // ステータス遷移のバリデーション
      const currentStatus = ticket.pullRequests[prIndex].commits[commitIndex].status;
      
      // ステータス遷移のバリデーションを実行
      const validationResult = validateStatusTransition(currentStatus, input.status);
      if (!validationResult.isValid) {
        const errorMessage = validationResult.errorMessage || 'ステータス遷移が無効です';
        logger.error(errorMessage);
        return errorResponse(errorMessage);
      }
      
      // If setting a task to "in_progress", reset any other in-progress tasks to "not_started"
      if (input.status === 'in_progress') {
        // Find all in-progress tasks and reset them to not_started
        let resetTasksCount = 0;
        ticket.pullRequests.forEach((pullRequest, pullRequestIndex) => {
          pullRequest.commits.forEach((commit, commitIdx) => {
            // Skip the current task being updated
            if (pullRequestIndex === prIndex && commitIdx === commitIndex) {
              return;
            }
            
            // Reset any other in-progress tasks to not_started
            if (commit.status === 'in_progress') {
              ticket.pullRequests[pullRequestIndex].commits[commitIdx].status = 'not_started';
              resetTasksCount++;
              logger.info(`Reset task PR #${pullRequestIndex}, commit #${commitIdx} from "in_progress" to "not_started"`);
            }
          });
        });
        
        if (resetTasksCount > 0) {
          changes.push(`${resetTasksCount} other in-progress tasks reset to "not_started"`);
        }
      }
      
      ticket.pullRequests[prIndex].commits[commitIndex].status = input.status;
      changes.push(`status updated to "${input.status}"`);
      
      // Update PR status based on commits
      const updatedPr = updatePRStatusBasedOnCommits(ticket.pullRequests[prIndex]);
      ticket.pullRequests[prIndex] = updatedPr;
      
      // ゴール更新
      if (input.goal !== undefined) {
        ticket.pullRequests[prIndex].commits[commitIndex].goal = input.goal;
        changes.push(`goal updated to "${input.goal}"`);
        logger.info(`Updated commit goal to: ${input.goal}`);
      }
      
      // 開発者メモの更新
      if (input.developerNote !== undefined) {
        ticket.pullRequests[prIndex].commits[commitIndex].developerNote = input.developerNote;
        changes.push(`developer note updated`);
        logger.info(`Updated developer note: ${input.developerNote}`);
      }

      const perWorkplanSaved = this.saveTicketToFile(agentId, workplanId, ticket);
      if (!perWorkplanSaved) {
        logger.warn(`Failed to persist per-workplan ticket file for agentId=${agentId}, workplanId=${workplanId}`);
      } else {
        const prCount = ticket.pullRequests.length;
        const commitCount = ticket.pullRequests.reduce((sum: number, pr: PullRequest) => sum + pr.commits.length, 0);

        const entryLastUpdated = new Date().toISOString();
        const indexUpdated = fileStorage.updateAgentsIndex((state) => {
          const next = state;
          if (!next.agents[agentId]) {
            next.agents[agentId] = { workplans: {} };
          }
          if (!next.agents[agentId].workplans) {
            next.agents[agentId].workplans = {};
          }
          next.agents[agentId].workplans[workplanId] = {
            goal: ticket.goal,
            prCount,
            commitCount,
            lastUpdated: entryLastUpdated,
          };
        });

        if (!indexUpdated) {
          logger.warn(`Failed to update agents index for agentId=${agentId}, workplanId=${workplanId}`);
        }
      }

      this.agents = {
        ...this.agents,
        [agentId]: {
          ...agentState,
          workplans: { ...agentState.workplans, [workplanId]: ticket }
        }
      };

      // 変更をファイルに保存
      const saveSuccess = this.saveState();
      
      logger.info(`Commit #${commitIndex} ${changes.join(" and ")}`);
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            message: `Commit #${commitIndex} ${changes.join(" and ")}.`,
            agentId,
            workplanId,
            prIndex: prIndex,
            commitIndex: commitIndex,
            status: input.status,
            goal: input.goal,
            developerNote: input.developerNote,
            persistenceStatus: saveSuccess ? 'saved' : 'memory_only',
            lastUpdated: this.lastUpdated
          }, null, 2)
        }]
      };
    } catch (error) {
      logger.logError('Error during status update', error);
      return errorResponse(error instanceof Error ? error.message : String(error));
    }
  }
  
  // カスタム設定のための公開メソッド
  public setDataDirectory(dir: string): void {
    logger.info(`Setting data directory to: ${dir}`);
    fileStorage.setDataDirectory(dir);
  }
  
  public setDataFileName(fileName: string): void {
    logger.info(`Setting data file name to: ${fileName}`);
    fileStorage.setDataFileName(fileName);
  }
  
  /**
   * データを再ロードする
   * @returns 再ロードに成功した場合はtrue
   */
  public reloadData(): boolean {
    try {
      this.loadState();
      return true;
    } catch (error) {
      handleFileOperationError('reloading data', error);
      return false;
    }
  }
  
  /**
   * 現在のデータを強制的に保存する
   * @returns 保存に成功した場合はtrue
   */
  public forceSave(): boolean {
    return this.saveState();
  }
  
}
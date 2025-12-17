import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './logger.js';

// ファイルパスを解決するための定数
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// データディレクトリのパス（デフォルトでは src/data に設定）
const DEFAULT_DATA_DIR = path.resolve(__dirname, '../visualization/public/data');
const DEFAULT_FILE_NAME = 'workplan.json';

// 設定可能なオプション
let dataDir = DEFAULT_DATA_DIR;
let dataFileName = DEFAULT_FILE_NAME;

/**
 * ファイル保存先ディレクトリを設定
 * @param dir 保存先ディレクトリのパス
 */
export function setDataDirectory(dir: string): void {
  logger.info(`Setting data directory to: ${dir}`);
  dataDir = dir;
  ensureDirectoryExists(dataDir);
}

/**
 * ファイル名を設定
 * @param fileName ファイル名
 */
export function setDataFileName(fileName: string): void {
  logger.info(`Setting data file name to: ${fileName}`);
  dataFileName = fileName;
}

/**
 * データファイルの完全パスを取得
 * @returns データファイルの完全パス
 */
export function getDataFilePath(): string {
  return path.resolve(dataDir, dataFileName);
}

export function getAgentsIndexPath(): string {
  return path.resolve(dataDir, 'agents.json');
}

export function getWorkplanPath(agentId: string, workplanId: string): string {
  return path.resolve(dataDir, 'agents', agentId, 'workplans', `${workplanId}.json`);
}

export type AgentsIndexWorkplanEntry = {
  goal?: string;
  lastUpdated?: string;
  prCount?: number;
  commitCount?: number;
};

export type AgentsIndexAgentEntry = {
  workplans: Record<string, AgentsIndexWorkplanEntry>;
};

export type AgentsIndexState = {
  version?: string;
  lastUpdated?: string;
  agents: Record<string, AgentsIndexAgentEntry>;
};

export function loadAgentsIndex(defaultData: AgentsIndexState = { agents: {} }): AgentsIndexState {
  try {
    const filePath = getAgentsIndexPath();

    if (!fs.existsSync(filePath)) {
      return defaultData;
    }

    const fileContent = fs.readFileSync(filePath, 'utf8');
    const parsedData = JSON.parse(fileContent) as AgentsIndexState;

    if (!parsedData || typeof parsedData !== 'object' || !('agents' in parsedData)) {
      return defaultData;
    }

    return parsedData;
  } catch (error) {
    logger.logError(`Failed to load agents index`, error);
    return defaultData;
  }
}

export function updateAgentsIndex(
  mutator: (state: AgentsIndexState) => AgentsIndexState | void,
  defaultData: AgentsIndexState = { agents: {} },
): boolean {
  const indexPath = getAgentsIndexPath();
  const lockPath = `${indexPath}.lock`;

  return withFileLock(lockPath, () => {
    const state = loadAgentsIndex(defaultData);
    const mutated = mutator(state);
    const nextState = mutated ?? state;

    return writeJsonAtomic(indexPath, {
      ...nextState,
      lastUpdated: new Date().toISOString(),
    });
  });
}

/**
 * ディレクトリが存在することを確認し、存在しない場合は作成
 * @param dirPath 確認するディレクトリパス
 */
export function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    logger.info(`Creating directory: ${dirPath}`);
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * JSONデータをファイルに保存
 * @param data 保存するJSONデータ
 * @returns 成功した場合はtrue、失敗した場合はfalse
 */
export function saveToFile<T>(data: T): boolean {
  try {
    ensureDirectoryExists(dataDir);
    const filePath = getDataFilePath();
    logger.debug(`Saving data to file: ${filePath}`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    logger.info(`Data successfully saved to: ${filePath}`);
    return true;
  } catch (error) {
    logger.logError(`Failed to save data to file`, error);
    return false;
  }
}

const sleepSync = (ms: number): void => {
  if (ms <= 0) return;
  const buffer = new SharedArrayBuffer(4);
  const view = new Int32Array(buffer);
  Atomics.wait(view, 0, 0, ms);
};

export type FileLockOptions = {
  retries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
};

export type FileLockHandle = {
  filePath: string;
  fd: number;
};

export function acquireFileLock(filePath: string, options: FileLockOptions = {}): FileLockHandle {
  const retries = options.retries ?? 50;
  const initialDelayMs = options.initialDelayMs ?? 25;
  const maxDelayMs = options.maxDelayMs ?? 250;

  ensureDirectoryExists(path.dirname(filePath));

  let attempt = 0;
  let delay = initialDelayMs;
  while (true) {
    try {
      const fd = fs.openSync(filePath, 'wx');
      try {
        fs.writeFileSync(fd, `${process.pid} ${new Date().toISOString()}`, 'utf8');
      } catch {
        // ignore lock file metadata write failures
      }
      return { filePath, fd };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'EEXIST') {
        throw error;
      }
      if (attempt >= retries) {
        throw new Error(`Failed to acquire file lock after ${retries} retries: ${filePath}`);
      }
      sleepSync(delay);
      delay = Math.min(maxDelayMs, delay * 2);
      attempt += 1;
    }
  }
}

export function releaseFileLock(handle: FileLockHandle): void {
  try {
    fs.closeSync(handle.fd);
  } catch {
    // ignore
  }
  try {
    if (fs.existsSync(handle.filePath)) {
      fs.unlinkSync(handle.filePath);
    }
  } catch {
    // ignore
  }
}

export function withFileLock<T>(filePath: string, fn: () => T, options: FileLockOptions = {}): T {
  const handle = acquireFileLock(filePath, options);
  try {
    return fn();
  } finally {
    releaseFileLock(handle);
  }
}

export function writeJsonAtomic(filePath: string, data: unknown): boolean {
  try {
    ensureDirectoryExists(path.dirname(filePath));
    const dir = path.dirname(filePath);
    const base = path.basename(filePath);
    const tmpPath = path.join(dir, `.${base}.${process.pid}.${Date.now()}.tmp`);

    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpPath, filePath);
    return true;
  } catch (error) {
    logger.logError(`Failed to atomically write JSON to file: ${filePath}`, error);
    try {
      const dir = path.dirname(filePath);
      const base = path.basename(filePath);
      const candidate = path.join(dir, `.${base}.${process.pid}.${Date.now()}.tmp`);
      if (fs.existsSync(candidate)) {
        fs.unlinkSync(candidate);
      }
    } catch {
      // ignore cleanup failures
    }
    return false;
  }
}

/**
 * ファイルからJSONデータを読み込み
 * @param defaultData ファイルが存在しない場合のデフォルトデータ
 * @returns 読み込んだデータまたはデフォルトデータ
 */
export function loadFromFile<T>(defaultData: T): T {
  try {
    const filePath = getDataFilePath();
    
    if (!fs.existsSync(filePath)) {
      logger.info(`File not found: ${filePath}, using default data`);
      return defaultData;
    }
    
    logger.debug(`Loading data from file: ${filePath}`);
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const parsedData = JSON.parse(fileContent) as T;
    logger.info(`Data successfully loaded from: ${filePath}`);
    return parsedData;
  } catch (error) {
    logger.logError(`Failed to load data from file`, error);
    return defaultData;
  }
}

/**
 * ファイルが存在するかどうかを確認
 * @returns ファイルが存在する場合はtrue、そうでない場合はfalse
 */
export function fileExists(): boolean {
  const filePath = getDataFilePath();
  const exists = fs.existsSync(filePath);
  logger.debug(`Checking if file exists: ${filePath} - ${exists ? 'Yes' : 'No'}`);
  return exists;
}

// 初期化時にデータディレクトリの存在を確認
ensureDirectoryExists(dataDir);
logger.info(`File storage initialized with data directory: ${dataDir} and file name: ${dataFileName}`); 
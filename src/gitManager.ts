/**
 * GitManager — low-level wrapper around Git CLI commands.
 *
 * Every public method spawns a child process, captures output,
 * and returns structured results. All I/O is asynchronous.
 */

import { exec } from 'child_process';
import * as path from 'path';
import { Logger } from './utils/logger';

// ── Types ───────────────────────────────────────────────────────

/** Possible high-level sync states for a repository. */
export enum SyncStatus {
    Synced   = 'synced',
    Behind   = 'behind',
    Ahead    = 'ahead',
    Diverged = 'diverged',
    Conflict = 'conflict',
    Unknown  = 'unknown',
}

/** Structured result of `git status` analysis. */
export interface RepoStatus {
    branch: string;
    remoteBranch: string;
    commitsBehind: number;
    commitsAhead: number;
    syncStatus: SyncStatus;
    hasLocalChanges: boolean;
    conflictFiles: string[];
}

/** Generic wrapper for a Git command result. */
interface GitResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}

// ── Constants ───────────────────────────────────────────────────

/** Maximum time (ms) we wait for a single git command. */
const GIT_TIMEOUT = 60_000;

// ── Implementation ──────────────────────────────────────────────

export class GitManager {
    private logger = Logger.getInstance();

    constructor(private readonly repoPath: string) {}

    /** Human-readable repository name derived from the folder. */
    public get repoName(): string {
        return path.basename(this.repoPath);
    }

    // ── High-level operations ───────────────────────────────────

    /** Run `git fetch` to update remote tracking refs. */
    public async fetch(): Promise<boolean> {
        this.logger.debug('Running git fetch', this.repoName);
        const result = await this.run('git fetch --all --prune');
        if (result.exitCode !== 0) {
            this.logger.error(`Fetch failed: ${result.stderr}`, this.repoName);
            return false;
        }
        this.logger.debug('Fetch completed', this.repoName);
        return true;
    }

    /**
     * Analyse the current repo state and return a structured status.
     * Assumes `fetch` has already been called.
     */
    public async getStatus(): Promise<RepoStatus> {
        const branch = await this.getCurrentBranch();
        const remoteBranch = await this.getTrackingBranch();

        let commitsBehind = 0;
        let commitsAhead = 0;
        let syncStatus = SyncStatus.Unknown;
        const conflictFiles: string[] = [];

        if (remoteBranch) {
            commitsBehind = await this.countCommits(`${branch}..${remoteBranch}`);
            commitsAhead  = await this.countCommits(`${remoteBranch}..${branch}`);

            if (commitsBehind === 0 && commitsAhead === 0) {
                syncStatus = SyncStatus.Synced;
            } else if (commitsBehind > 0 && commitsAhead === 0) {
                syncStatus = SyncStatus.Behind;
            } else if (commitsBehind === 0 && commitsAhead > 0) {
                syncStatus = SyncStatus.Ahead;
            } else {
                syncStatus = SyncStatus.Diverged;
            }
        }

        // Check for merge conflicts
        const conflicts = await this.getConflictFiles();
        if (conflicts.length > 0) {
            syncStatus = SyncStatus.Conflict;
            conflictFiles.push(...conflicts);
        }

        const hasLocalChanges = await this.hasUncommittedChanges();

        return {
            branch,
            remoteBranch,
            commitsBehind,
            commitsAhead,
            syncStatus,
            hasLocalChanges,
            conflictFiles,
        };
    }

    /**
     * Pull with rebase and optional autostash.
     * Returns `true` when the working tree is clean after pull.
     */
    public async pull(autoStash: boolean): Promise<boolean> {
        const stashFlag = autoStash ? ' --autostash' : '';
        const cmd = `git pull --rebase${stashFlag}`;
        this.logger.info(`Running: ${cmd}`, this.repoName);

        const result = await this.run(cmd);

        if (result.exitCode !== 0) {
            // Detect conflict markers
            if (
                result.stderr.includes('CONFLICT') ||
                result.stdout.includes('CONFLICT')
            ) {
                this.logger.warn('Merge conflict detected during pull', this.repoName);
                return false;
            }
            this.logger.error(`Pull failed: ${result.stderr}`, this.repoName);
            return false;
        }

        this.logger.info('Pull completed successfully', this.repoName);
        return true;
    }

    /** Stash uncommitted changes. */
    public async stash(): Promise<boolean> {
        this.logger.debug('Stashing local changes', this.repoName);
        const result = await this.run('git stash push -m "AutoRepoSync auto-stash"');
        return result.exitCode === 0;
    }

    /** Pop the most recent stash entry. */
    public async stashPop(): Promise<boolean> {
        this.logger.debug('Popping stash', this.repoName);
        const result = await this.run('git stash pop');

        if (result.exitCode !== 0) {
            if (
                result.stderr.includes('CONFLICT') ||
                result.stdout.includes('CONFLICT')
            ) {
                this.logger.warn('Conflict after stash pop', this.repoName);
                return false;
            }
            this.logger.error(`Stash pop failed: ${result.stderr}`, this.repoName);
            return false;
        }
        return true;
    }

    /** Abort a rebase in progress (recovery path). */
    public async abortRebase(): Promise<void> {
        await this.run('git rebase --abort');
    }

    // ── Query helpers ───────────────────────────────────────────

    /** Get the name of the currently checked-out branch. */
    public async getCurrentBranch(): Promise<string> {
        const result = await this.run('git rev-parse --abbrev-ref HEAD');
        return result.stdout.trim() || 'unknown';
    }

    /** Get the upstream tracking branch (e.g. `origin/main`). */
    public async getTrackingBranch(): Promise<string> {
        const result = await this.run(
            'git rev-parse --abbrev-ref --symbolic-full-name @{u}',
        );
        return result.stdout.trim();
    }

    /** Count commits in a revision range. */
    private async countCommits(range: string): Promise<number> {
        const result = await this.run(`git rev-list --count ${range}`);
        const n = parseInt(result.stdout.trim(), 10);
        return Number.isNaN(n) ? 0 : n;
    }

    /** Return `true` when the working tree or index is dirty. */
    public async hasUncommittedChanges(): Promise<boolean> {
        const result = await this.run('git status --porcelain');
        return result.stdout.trim().length > 0;
    }

    /** List files currently in a conflicted state. */
    public async getConflictFiles(): Promise<string[]> {
        const result = await this.run('git diff --name-only --diff-filter=U');
        const raw = result.stdout.trim();
        return raw.length > 0 ? raw.split('\n').map((f) => f.trim()) : [];
    }

    /** Check whether the given directory actually contains a git repo. */
    public async isGitRepository(): Promise<boolean> {
        const result = await this.run('git rev-parse --is-inside-work-tree');
        return result.stdout.trim() === 'true';
    }

    /** Get the remote URL (first remote). */
    public async getRemoteUrl(): Promise<string> {
        const result = await this.run('git remote get-url origin');
        return result.stdout.trim();
    }

    // ── Low-level executor ──────────────────────────────────────

    /**
     * Execute an arbitrary shell command inside the repository directory.
     * Resolves with structured output; never rejects.
     */
    private run(command: string): Promise<GitResult> {
        return new Promise<GitResult>((resolve) => {
            exec(
                command,
                {
                    cwd: this.repoPath,
                    timeout: GIT_TIMEOUT,
                    maxBuffer: 10 * 1024 * 1024, // 10 MB
                    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
                },
                (error, stdout, stderr) => {
                    resolve({
                        stdout: stdout ?? '',
                        stderr: stderr ?? '',
                        exitCode: error?.code ?? (error ? 1 : 0),
                    });
                },
            );
        });
    }
}

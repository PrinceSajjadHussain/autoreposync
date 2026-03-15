/**
 * SyncService — orchestrates the periodic background sync loop.
 *
 * For every discovered repository the service:
 *  1. Fetches remote refs
 *  2. Compares local vs remote
 *  3. Pulls (with rebase + autostash) when behind
 *  4. Handles stash / conflict edge-cases
 *  5. Emits state updates consumed by the dashboard
 */

import * as vscode from 'vscode';
import { GitManager, RepoStatus, SyncStatus } from './gitManager';
import { DiscoveredRepo, RepoWatcher } from './repoWatcher';
import { Logger } from './utils/logger';
import { AutoSyncSettings, getSettings } from './utils/settings';

// ── Types ───────────────────────────────────────────────────────

/** Per-repository runtime state exposed to the UI. */
export interface RepoSyncState {
    repo: DiscoveredRepo;
    status: RepoStatus | null;
    lastSyncTime: Date | null;
    isSyncing: boolean;
    isPaused: boolean;
    error: string | null;
}

// ── Service ─────────────────────────────────────────────────────

export class SyncService implements vscode.Disposable {
    private logger = Logger.getInstance();
    private timer: ReturnType<typeof setInterval> | null = null;
    private states: Map<string, RepoSyncState> = new Map();
    private running = false;
    private disposed = false;

    /** Fires when any repo's sync state changes. */
    private readonly _onStateChanged = new vscode.EventEmitter<RepoSyncState[]>();
    public readonly onStateChanged: vscode.Event<RepoSyncState[]> =
        this._onStateChanged.event;

    constructor(private readonly repoWatcher: RepoWatcher) {
        // Keep state map in sync with discovered repos
        this.repoWatcher.onReposChanged((repos) => {
            this.rebuildStateMap(repos);
        });
    }

    // ── Lifecycle ───────────────────────────────────────────────

    /** Start the periodic sync loop. */
    public start(): void {
        if (this.running) {
            return;
        }
        this.running = true;

        const settings = getSettings();
        this.logger.info(
            `Sync service started (interval: ${settings.interval}s)`,
        );

        // Immediate first tick
        this.tick();

        this.timer = setInterval(() => {
            if (!this.disposed) {
                this.tick();
            }
        }, settings.interval * 1000);
    }

    /** Stop the periodic loop but keep state. */
    public stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.running = false;
        this.logger.info('Sync service stopped');
    }

    /** Restart with potentially new interval. */
    public restart(): void {
        this.stop();
        this.start();
    }

    /** Whether the service loop is active. */
    public isRunning(): boolean {
        return this.running;
    }

    // ── Manual triggers ─────────────────────────────────────────

    /** Force an immediate sync cycle for all repos. */
    public async syncNow(): Promise<void> {
        this.logger.info('Manual sync triggered');
        await this.tick();
    }

    /** Force sync a specific repo by path. */
    public async syncRepo(repoPath: string): Promise<void> {
        const state = this.states.get(repoPath);
        if (state) {
            await this.syncOne(state);
        }
    }

    /** Pause sync for a single repo. */
    public pauseRepo(repoPath: string): void {
        const state = this.states.get(repoPath);
        if (state) {
            state.isPaused = true;
            this.emitStates();
            this.logger.info('Sync paused', state.repo.name);
        }
    }

    /** Resume sync for a single repo. */
    public resumeRepo(repoPath: string): void {
        const state = this.states.get(repoPath);
        if (state) {
            state.isPaused = false;
            this.emitStates();
            this.logger.info('Sync resumed', state.repo.name);
        }
    }

    // ── State access ────────────────────────────────────────────

    /** Snapshot of all repo states. */
    public getStates(): RepoSyncState[] {
        return Array.from(this.states.values());
    }

    // ── Core sync loop ──────────────────────────────────────────

    private async tick(): Promise<void> {
        const settings = getSettings();
        if (!settings.enabled) {
            return;
        }

        const promises = Array.from(this.states.values()).map((s) =>
            this.syncOne(s),
        );

        // Run all repos in parallel but don't let one failure kill the rest
        await Promise.allSettled(promises);
    }

    /**
     * Synchronise a single repository:
     *  fetch → compare → pull (if behind) → handle stash / conflict
     */
    private async syncOne(state: RepoSyncState): Promise<void> {
        if (state.isPaused || state.isSyncing) {
            return;
        }

        const { git } = state.repo;
        const settings = getSettings();
        const name = state.repo.name;

        state.isSyncing = true;
        state.error = null;
        this.emitStates();

        try {
            // 1 — Fetch
            this.logger.info('Checking remote changes', name);
            const fetched = await git.fetch();
            if (!fetched) {
                state.error = 'Fetch failed (network?)';
                return;
            }

            // 2 — Status
            const status = await git.getStatus();
            state.status = status;

            if (status.syncStatus === SyncStatus.Synced) {
                this.logger.debug('Already up to date', name);
                state.lastSyncTime = new Date();
                return;
            }

            if (status.syncStatus === SyncStatus.Conflict) {
                this.logger.warn(
                    `Conflict detected in ${status.conflictFiles.length} file(s)`,
                    name,
                );
                state.error = 'Merge conflict — resolve manually';
                this.notifyConflict(state);
                return;
            }

            if (
                status.syncStatus === SyncStatus.Behind ||
                status.syncStatus === SyncStatus.Diverged
            ) {
                this.logger.info(
                    `${status.commitsBehind} new commit(s) detected`,
                    name,
                );

                // 3 — Pull
                const pulled = await git.pull(settings.autoStash);

                if (!pulled) {
                    // Conflict during pull — try to recover
                    const conflicts = await git.getConflictFiles();
                    if (conflicts.length > 0) {
                        state.status = {
                            ...status,
                            syncStatus: SyncStatus.Conflict,
                            conflictFiles: conflicts,
                        };
                        state.error = 'Conflict during pull — resolve manually';
                        this.notifyConflict(state);
                    } else {
                        state.error = 'Pull failed';
                    }
                    return;
                }

                this.logger.info('Sync completed', name);
                this.notifySuccess(state);

                // Refresh status after successful pull
                state.status = await git.getStatus();
            }

            state.lastSyncTime = new Date();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.error(`Sync error: ${msg}`, name);
            state.error = msg;
        } finally {
            state.isSyncing = false;
            this.emitStates();
        }
    }

    // ── Notifications ───────────────────────────────────────────

    private notifyConflict(state: RepoSyncState): void {
        const settings = getSettings();
        if (!settings.showNotifications) {
            return;
        }

        const files = state.status?.conflictFiles ?? [];
        vscode.window
            .showWarningMessage(
                `AutoRepoSync: Conflict in ${state.repo.name} (${files.length} file(s))`,
                'Open Dashboard',
                'Dismiss',
            )
            .then((choice) => {
                if (choice === 'Open Dashboard') {
                    vscode.commands.executeCommand('AutoRepoSync.openDashboard');
                }
            });
    }

    private notifySuccess(state: RepoSyncState): void {
        const settings = getSettings();
        if (!settings.showNotifications) {
            return;
        }

        const behind = state.status?.commitsBehind ?? 0;
        if (behind > 0) {
            vscode.window.showInformationMessage(
                `AutoRepoSync: Pulled ${behind} commit(s) in ${state.repo.name}`,
            );
        }
    }

    // ── Helpers ─────────────────────────────────────────────────

    /** Rebuild the state map after the repo list changes. */
    private rebuildStateMap(repos: DiscoveredRepo[]): void {
        const newMap = new Map<string, RepoSyncState>();
        for (const repo of repos) {
            const existing = this.states.get(repo.rootPath);
            newMap.set(repo.rootPath, existing ?? {
                repo,
                status: null,
                lastSyncTime: null,
                isSyncing: false,
                isPaused: false,
                error: null,
            });
        }
        this.states = newMap;
        this.emitStates();
    }

    private emitStates(): void {
        this._onStateChanged.fire(this.getStates());
    }

    // ── Disposal ────────────────────────────────────────────────

    public dispose(): void {
        this.disposed = true;
        this.stop();
        this._onStateChanged.dispose();
    }
}

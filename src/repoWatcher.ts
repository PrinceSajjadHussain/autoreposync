/**
 * RepoWatcher — discovers and monitors Git repositories in the workspace.
 *
 * Scans all workspace folders (and their immediate children) for `.git`
 * directories, then exposes a live list of discovered repositories.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { GitManager } from './gitManager';
import { Logger } from './utils/logger';

/** Represents a single discovered repository. */
export interface DiscoveredRepo {
    /** Absolute path to the repo root. */
    rootPath: string;
    /** Friendly display name (last path segment). */
    name: string;
    /** Pre-created GitManager instance for this repo. */
    git: GitManager;
}

export class RepoWatcher implements vscode.Disposable {
    private logger = Logger.getInstance();
    private repos: DiscoveredRepo[] = [];
    private disposables: vscode.Disposable[] = [];

    /** Fires whenever the repo list changes. */
    private readonly _onReposChanged = new vscode.EventEmitter<DiscoveredRepo[]>();
    public readonly onReposChanged: vscode.Event<DiscoveredRepo[]> =
        this._onReposChanged.event;

    constructor() {
        // Re-scan when workspace folders change
        this.disposables.push(
            vscode.workspace.onDidChangeWorkspaceFolders(() => {
                this.scan();
            }),
        );
    }

    /** Run the initial (or manual) scan. */
    public async scan(): Promise<DiscoveredRepo[]> {
        this.logger.info('Scanning workspace for Git repositories');
        const folders = vscode.workspace.workspaceFolders ?? [];
        const found: DiscoveredRepo[] = [];

        for (const folder of folders) {
            const root = folder.uri.fsPath;

            // Check if the folder itself is a repo
            if (this.hasGitDir(root)) {
                found.push(this.makeRepo(root));
                continue;
            }

            // Check immediate children (mono-repo style)
            try {
                const entries = fs.readdirSync(root, { withFileTypes: true });
                for (const entry of entries) {
                    if (!entry.isDirectory()) {
                        continue;
                    }
                    const childPath = path.join(root, entry.name);
                    if (this.hasGitDir(childPath)) {
                        found.push(this.makeRepo(childPath));
                    }
                }
            } catch {
                this.logger.warn(`Could not read directory: ${root}`);
            }
        }

        // De-duplicate by absolute path
        const seen = new Set<string>();
        this.repos = found.filter((r) => {
            if (seen.has(r.rootPath)) {
                return false;
            }
            seen.add(r.rootPath);
            return true;
        });

        this.logger.info(`Discovered ${this.repos.length} repository(ies)`);
        this._onReposChanged.fire(this.repos);
        return this.repos;
    }

    /** Return the current list of repos. */
    public getRepos(): ReadonlyArray<DiscoveredRepo> {
        return this.repos;
    }

    // ── Internals ───────────────────────────────────────────────

    private hasGitDir(dirPath: string): boolean {
        try {
            return fs.statSync(path.join(dirPath, '.git')).isDirectory();
        } catch {
            return false;
        }
    }

    private makeRepo(rootPath: string): DiscoveredRepo {
        return {
            rootPath,
            name: path.basename(rootPath),
            git: new GitManager(rootPath),
        };
    }

    // ── Disposal ────────────────────────────────────────────────

    public dispose(): void {
        this._onReposChanged.dispose();
        this.disposables.forEach((d) => d.dispose());
    }
}

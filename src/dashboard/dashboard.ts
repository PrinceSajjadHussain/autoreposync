/**
 * DashboardPanel — VS Code Webview panel that displays repository
 * sync states, activity logs, and provides manual controls.
 *
 * Uses a single-panel pattern: only one instance exists at a time.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SyncService, RepoSyncState } from '../syncService';
import { Logger, LogEntry, LogLevel } from '../utils/logger';

export class DashboardPanel {
    public static currentPanel: DashboardPanel | undefined;
    private static readonly viewType = 'autoRepoSyncDashboard';

    private readonly panel: vscode.WebviewPanel;
    private readonly extensionUri: vscode.Uri;
    private disposables: vscode.Disposable[] = [];
    private logger = Logger.getInstance();

    /** Show (or re-focus) the dashboard panel. */
    public static createOrShow(
        extensionUri: vscode.Uri,
        syncService: SyncService,
    ): DashboardPanel {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // Re-use existing panel
        if (DashboardPanel.currentPanel) {
            DashboardPanel.currentPanel.panel.reveal(column);
            DashboardPanel.currentPanel.update(syncService.getStates());
            return DashboardPanel.currentPanel;
        }

        const panel = vscode.window.createWebviewPanel(
            DashboardPanel.viewType,
            'AutoRepoSync Dashboard',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'src', 'dashboard'),
                    vscode.Uri.joinPath(extensionUri, 'out', 'dashboard'),
                    vscode.Uri.joinPath(extensionUri, 'media'),
                ],
            },
        );

        DashboardPanel.currentPanel = new DashboardPanel(
            panel,
            extensionUri,
            syncService,
        );
        return DashboardPanel.currentPanel;
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        private readonly syncService: SyncService,
    ) {
        this.panel = panel;
        this.extensionUri = extensionUri;

        // Initial HTML
        this.panel.webview.html = this.getHtmlForWebview();
        this.panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'icon.png');

        // Listen for disposal
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

        // Listen for messages from the webview
        this.panel.webview.onDidReceiveMessage(
            (msg) => this.handleMessage(msg),
            null,
            this.disposables,
        );

        // Push state changes to the webview
        this.disposables.push(
            this.syncService.onStateChanged((states) => this.update(states)),
        );

        // Push new log entries
        this.disposables.push(
            this.logger.onLogEntry((entry) => this.pushLogEntry(entry)),
        );

        // Send initial data
        this.update(this.syncService.getStates());
        this.sendLogs();
    }

    // ── Webview ↔ Extension messaging ───────────────────────────

    /** Push full state snapshot to the webview. */
    public update(states: RepoSyncState[]): void {
        this.panel.webview.postMessage({
            type: 'stateUpdate',
            payload: states.map((s) => this.serialiseState(s)),
        });
    }

    /** Push a single log entry to the webview. */
    private pushLogEntry(entry: LogEntry): void {
        this.panel.webview.postMessage({
            type: 'logEntry',
            payload: {
                timestamp: entry.timestamp.toISOString(),
                level: LogLevel[entry.level],
                message: entry.message,
                repoName: entry.repoName ?? null,
            },
        });
    }

    /** Send the full log buffer on first load. */
    private sendLogs(): void {
        const entries = this.logger.getEntries().map((e) => ({
            timestamp: e.timestamp.toISOString(),
            level: LogLevel[e.level],
            message: e.message,
            repoName: e.repoName ?? null,
        }));
        this.panel.webview.postMessage({ type: 'logBatch', payload: entries });
    }

    /** Handle commands sent from the webview JS. */
    private handleMessage(msg: { command: string; repoPath?: string }): void {
        switch (msg.command) {
            case 'syncNow':
                if (msg.repoPath) {
                    this.syncService.syncRepo(msg.repoPath);
                } else {
                    this.syncService.syncNow();
                }
                break;
            case 'pause':
                if (msg.repoPath) {
                    this.syncService.pauseRepo(msg.repoPath);
                }
                break;
            case 'resume':
                if (msg.repoPath) {
                    this.syncService.resumeRepo(msg.repoPath);
                }
                break;
            case 'openRepo':
                if (msg.repoPath) {
                    const uri = vscode.Uri.file(msg.repoPath);
                    vscode.commands.executeCommand('vscode.openFolder', uri, true);
                }
                break;
            case 'viewLogs':
                this.logger.show();
                break;
            case 'refreshLogs':
                this.sendLogs();
                break;
            default:
                break;
        }
    }

    // ── Serialisation helpers ───────────────────────────────────

    private serialiseState(s: RepoSyncState): Record<string, unknown> {
        return {
            repoPath: s.repo.rootPath,
            repoName: s.repo.name,
            branch: s.status?.branch ?? '—',
            remoteBranch: s.status?.remoteBranch ?? '—',
            commitsBehind: s.status?.commitsBehind ?? 0,
            commitsAhead: s.status?.commitsAhead ?? 0,
            syncStatus: s.status?.syncStatus ?? 'unknown',
            hasLocalChanges: s.status?.hasLocalChanges ?? false,
            conflictFiles: s.status?.conflictFiles ?? [],
            lastSyncTime: s.lastSyncTime?.toISOString() ?? null,
            isSyncing: s.isSyncing,
            isPaused: s.isPaused,
            error: s.error,
        };
    }

    // ── HTML generation ─────────────────────────────────────────

    private getHtmlForWebview(): string {
        const webview = this.panel.webview;

        // Read the static HTML file
        const htmlPath = path.join(
            this.extensionUri.fsPath,
            'src',
            'dashboard',
            'dashboard.html',
        );

        let html: string;
        try {
            html = fs.readFileSync(htmlPath, 'utf8');
        } catch {
            // Fallback: inline HTML
            return this.getFallbackHtml();
        }

        // Resolve CSS and JS URIs
        const cssUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                this.extensionUri,
                'src',
                'dashboard',
                'dashboard.css',
            ),
        );
        const jsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                this.extensionUri,
                'src',
                'dashboard',
                'dashboard.js',
            ),
        );

        // Nonce for CSP
        const nonce = this.getNonce();

        html = html
            .replace(/{{cssUri}}/g, cssUri.toString())
            .replace(/{{jsUri}}/g, jsUri.toString())
            .replace(/{{nonce}}/g, nonce)
            .replace(
                /{{cspSource}}/g,
                webview.cspSource,
            );

        return html;
    }

    private getFallbackHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>AutoRepoSync</title></head>
<body><h1>Dashboard failed to load</h1><p>Check that dashboard.html exists in the extension directory.</p></body>
</html>`;
    }

    private getNonce(): string {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let nonce = '';
        for (let i = 0; i < 32; i++) {
            nonce += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return nonce;
    }

    // ── Disposal ────────────────────────────────────────────────

    public dispose(): void {
        DashboardPanel.currentPanel = undefined;
        this.panel.dispose();
        this.disposables.forEach((d) => d.dispose());
    }
}

/**
 * AutoRepoSync — VS Code Extension Entry Point.
 *
 * This module wires up every subsystem (repo watcher, sync service,
 * webhook server, dashboard) and registers all commands / settings
 * listeners with the VS Code extension host.
 */

import * as vscode from 'vscode';
import { RepoWatcher } from './repoWatcher';
import { SyncService } from './syncService';
import { WebhookServer } from './webhookServer';
import { DashboardPanel } from './dashboard/dashboard';
import { Logger } from './utils/logger';
import { getSettings, onSettingsChanged, AutoSyncSettings } from './utils/settings';

// ── Module-level references ─────────────────────────────────────

let repoWatcher: RepoWatcher;
let syncService: SyncService;
let webhookServer: WebhookServer;
let statusBarItem: vscode.StatusBarItem;
let logger: Logger;

// ── Activation ──────────────────────────────────────────────────

export async function activate(
    context: vscode.ExtensionContext,
): Promise<void> {
    logger = Logger.getInstance();
    const settings = getSettings();
    logger.setLevel(settings.logLevel);
    logger.info('AutoRepoSync activating…');

    // ── Instantiate subsystems ──────────────────────────────
    repoWatcher   = new RepoWatcher();
    syncService   = new SyncService(repoWatcher);
    webhookServer = new WebhookServer(syncService, repoWatcher);

    // ── Discover repos ──────────────────────────────────────
    await repoWatcher.scan();

    // ── Start sync service (if enabled) ─────────────────────
    if (settings.enabled) {
        syncService.start();
    }

    // ── Start webhook server (if enabled) ───────────────────
    if (settings.enableWebhookMode) {
        webhookServer.start(settings.webhookPort);
    }

    // ── Status bar ──────────────────────────────────────────
    statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        100,
    );
    statusBarItem.command = 'AutoRepoSync.openDashboard';
    updateStatusBar(settings);
    statusBarItem.show();

    // Update the status bar when sync state changes
    syncService.onStateChanged((states) => {
        const syncing   = states.some((s) => s.isSyncing);
        const conflicts = states.some(
            (s) => s.status?.syncStatus === 'conflict',
        );

        if (conflicts) {
            statusBarItem.text = '$(error) AutoSync: Conflict';
            statusBarItem.backgroundColor = new vscode.ThemeColor(
                'statusBarItem.errorBackground',
            );
        } else if (syncing) {
            statusBarItem.text = '$(sync~spin) AutoSync: Syncing…';
            statusBarItem.backgroundColor = undefined;
        } else {
            statusBarItem.text = '$(check) AutoSync';
            statusBarItem.backgroundColor = undefined;
        }
    });

    // ── Register commands ───────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('AutoRepoSync.start', () => {
            syncService.start();
            logger.info('Sync service started via command');
            vscode.window.showInformationMessage('AutoRepoSync: Sync started');
            updateStatusBar(getSettings());
        }),

        vscode.commands.registerCommand('AutoRepoSync.stop', () => {
            syncService.stop();
            logger.info('Sync service stopped via command');
            vscode.window.showInformationMessage('AutoRepoSync: Sync stopped');
            statusBarItem.text = '$(circle-slash) AutoSync: Stopped';
        }),

        vscode.commands.registerCommand('AutoRepoSync.syncNow', () => {
            syncService.syncNow();
        }),

        vscode.commands.registerCommand('AutoRepoSync.openDashboard', () => {
            DashboardPanel.createOrShow(context.extensionUri, syncService);
        }),
    );

    // ── React to setting changes ────────────────────────────
    context.subscriptions.push(
        onSettingsChanged((newSettings: AutoSyncSettings) => {
            logger.setLevel(newSettings.logLevel);

            // Sync service
            if (newSettings.enabled && !syncService.isRunning()) {
                syncService.start();
            } else if (!newSettings.enabled && syncService.isRunning()) {
                syncService.stop();
            } else if (newSettings.enabled) {
                // Interval may have changed
                syncService.restart();
            }

            // Webhook server
            if (newSettings.enableWebhookMode && !webhookServer.isRunning()) {
                webhookServer.start(newSettings.webhookPort);
            } else if (!newSettings.enableWebhookMode && webhookServer.isRunning()) {
                webhookServer.stop();
            }

            updateStatusBar(newSettings);
            logger.info('Settings reloaded');
        }),
    );

    // ── Disposables ─────────────────────────────────────────
    context.subscriptions.push(
        repoWatcher,
        syncService,
        statusBarItem,
        { dispose: () => { webhookServer.stop(); } },
        { dispose: () => { logger.dispose(); } },
    );

    logger.info(
        `AutoRepoSync activated — ${repoWatcher.getRepos().length} repo(s)`,
    );
}

// ── Deactivation ────────────────────────────────────────────────

export function deactivate(): void {
    // Subscriptions are disposed automatically by VS Code
    Logger.getInstance().info('AutoRepoSync deactivated');
}

// ── Helpers ─────────────────────────────────────────────────────

function updateStatusBar(settings: AutoSyncSettings): void {
    if (settings.enabled) {
        statusBarItem.text = '$(check) AutoSync';
        statusBarItem.tooltip = `AutoRepoSync — syncing every ${settings.interval}s`;
    } else {
        statusBarItem.text = '$(circle-slash) AutoSync: Off';
        statusBarItem.tooltip = 'AutoRepoSync is disabled';
    }
}

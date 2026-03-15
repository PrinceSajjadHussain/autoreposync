/**
 * Settings utility for AutoRepoSync.
 *
 * Provides a typed, cached interface to the extension's configuration
 * section in VS Code settings (`autosync.*`).
 */

import * as vscode from 'vscode';

/** Typed representation of the extension configuration. */
export interface AutoSyncSettings {
    /** Master on/off toggle. */
    enabled: boolean;
    /** Polling interval in seconds. */
    interval: number;
    /** Automatically stash local changes before pull. */
    autoStash: boolean;
    /** Enable the webhook listener for instant sync. */
    enableWebhookMode: boolean;
    /** Port the webhook HTTP server binds to. */
    webhookPort: number;
    /** Show VS Code notification popups. */
    showNotifications: boolean;
    /** Minimum log level (debug | info | warn | error). */
    logLevel: string;
}

const SECTION = 'autosync';

/**
 * Read the full settings object from VS Code configuration.
 * Every call reads fresh values so config changes are picked up immediately.
 */
export function getSettings(): AutoSyncSettings {
    const cfg = vscode.workspace.getConfiguration(SECTION);

    return {
        enabled:           cfg.get<boolean>('enabled', true),
        interval:          cfg.get<number>('interval', 30),
        autoStash:         cfg.get<boolean>('autoStash', true),
        enableWebhookMode: cfg.get<boolean>('enableWebhookMode', false),
        webhookPort:       cfg.get<number>('webhookPort', 9090),
        showNotifications: cfg.get<boolean>('showNotifications', true),
        logLevel:          cfg.get<string>('logLevel', 'info'),
    };
}

/**
 * Register a listener that fires whenever any `autosync.*` setting changes.
 * Returns a disposable that can be added to the extension's subscriptions.
 */
export function onSettingsChanged(
    callback: (settings: AutoSyncSettings) => void,
): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(SECTION)) {
            callback(getSettings());
        }
    });
}

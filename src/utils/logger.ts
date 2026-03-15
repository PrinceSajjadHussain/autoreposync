/**
 * Logger utility for AutoRepoSync.
 *
 * Provides a dual-output logging system that writes to both
 * the VS Code Output Channel and an in-memory ring buffer
 * consumed by the dashboard.
 */

import * as vscode from 'vscode';

/** Severity levels ordered by verbosity. */
export enum LogLevel {
    Debug = 0,
    Info = 1,
    Warn = 2,
    Error = 3,
}

/** A single immutable log entry. */
export interface LogEntry {
    readonly timestamp: Date;
    readonly level: LogLevel;
    readonly message: string;
    readonly repoName?: string;
}

/** Maximum entries kept in the in-memory buffer. */
const MAX_BUFFER_SIZE = 500;

/**
 * Centralised logger that writes to the VS Code Output Channel
 * and maintains an in-memory ring buffer for the dashboard UI.
 */
export class Logger {
    private static instance: Logger;
    private outputChannel: vscode.OutputChannel;
    private buffer: LogEntry[] = [];
    private configuredLevel: LogLevel = LogLevel.Info;

    /** Event emitter so the dashboard can subscribe to new entries. */
    private readonly _onLogEntry = new vscode.EventEmitter<LogEntry>();
    public readonly onLogEntry: vscode.Event<LogEntry> = this._onLogEntry.event;

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('AutoRepoSync');
    }

    /** Singleton accessor. */
    public static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    // ── Configuration ───────────────────────────────────────────

    /** Set the minimum log level from user settings. */
    public setLevel(level: string): void {
        switch (level) {
            case 'debug': this.configuredLevel = LogLevel.Debug; break;
            case 'info':  this.configuredLevel = LogLevel.Info;  break;
            case 'warn':  this.configuredLevel = LogLevel.Warn;  break;
            case 'error': this.configuredLevel = LogLevel.Error; break;
            default:      this.configuredLevel = LogLevel.Info;
        }
    }

    // ── Public log methods ──────────────────────────────────────

    public debug(message: string, repoName?: string): void {
        this.log(LogLevel.Debug, message, repoName);
    }

    public info(message: string, repoName?: string): void {
        this.log(LogLevel.Info, message, repoName);
    }

    public warn(message: string, repoName?: string): void {
        this.log(LogLevel.Warn, message, repoName);
    }

    public error(message: string, repoName?: string): void {
        this.log(LogLevel.Error, message, repoName);
    }

    // ── Buffer access ───────────────────────────────────────────

    /** Return a snapshot of the current log buffer (newest last). */
    public getEntries(): ReadonlyArray<LogEntry> {
        return [...this.buffer];
    }

    /** Clear the in-memory buffer. */
    public clearBuffer(): void {
        this.buffer = [];
    }

    /** Show the output channel in the VS Code panel. */
    public show(): void {
        this.outputChannel.show(true);
    }

    /** Dispose resources. */
    public dispose(): void {
        this._onLogEntry.dispose();
        this.outputChannel.dispose();
    }

    // ── Internal ────────────────────────────────────────────────

    private log(level: LogLevel, message: string, repoName?: string): void {
        if (level < this.configuredLevel) {
            return;
        }

        const entry: LogEntry = {
            timestamp: new Date(),
            level,
            message,
            repoName,
        };

        // Ring buffer
        this.buffer.push(entry);
        if (this.buffer.length > MAX_BUFFER_SIZE) {
            this.buffer.shift();
        }

        // Format for output channel
        const time = entry.timestamp.toLocaleTimeString('en-GB', { hour12: false });
        const tag = LogLevel[level].toUpperCase().padEnd(5);
        const repo = repoName ? `[${repoName}] ` : '';
        const line = `[${time}] ${tag} ${repo}${message}`;

        this.outputChannel.appendLine(line);
        this._onLogEntry.fire(entry);
    }
}

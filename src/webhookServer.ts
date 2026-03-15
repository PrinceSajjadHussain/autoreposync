/**
 * WebhookServer — optional Express-based HTTP server that receives
 * GitHub push events and triggers an immediate sync.
 *
 * Enabled via `autosync.enableWebhookMode`.
 *
 * GitHub webhook payload (push event) includes `repository.full_name`
 * which is matched against the remote URL of discovered repos.
 */

import * as http from 'http';
import { Logger } from './utils/logger';
import { SyncService } from './syncService';
import { RepoWatcher } from './repoWatcher';

export class WebhookServer {
    private logger = Logger.getInstance();
    private server: http.Server | null = null;

    constructor(
        private readonly syncService: SyncService,
        private readonly repoWatcher: RepoWatcher,
    ) {}

    /**
     * Start the HTTP server on the given port.
     * Accepts POST requests to `/webhook` with a JSON body.
     */
    public start(port: number): void {
        if (this.server) {
            this.logger.warn('Webhook server already running');
            return;
        }

        this.server = http.createServer((req, res) => {
            if (req.method === 'POST' && req.url === '/webhook') {
                this.handleWebhook(req, res);
            } else if (req.method === 'GET' && req.url === '/health') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'ok' }));
            } else {
                res.writeHead(404);
                res.end('Not Found');
            }
        });

        this.server.listen(port, () => {
            this.logger.info(`Webhook server listening on port ${port}`);
        });

        this.server.on('error', (err: Error) => {
            this.logger.error(`Webhook server error: ${err.message}`);
        });
    }

    /** Gracefully shut down the server. */
    public stop(): Promise<void> {
        return new Promise((resolve) => {
            if (!this.server) {
                resolve();
                return;
            }
            this.server.close(() => {
                this.logger.info('Webhook server stopped');
                this.server = null;
                resolve();
            });
        });
    }

    /** Whether the server is currently listening. */
    public isRunning(): boolean {
        return this.server !== null && this.server.listening;
    }

    // ── Request handler ─────────────────────────────────────────

    private handleWebhook(
        req: http.IncomingMessage,
        res: http.ServerResponse,
    ): void {
        let body = '';

        req.on('data', (chunk: Buffer) => {
            body += chunk.toString();
            // Limit body size to 1 MB
            if (body.length > 1_048_576) {
                res.writeHead(413);
                res.end('Payload too large');
                req.destroy();
            }
        });

        req.on('end', async () => {
            try {
                const payload = JSON.parse(body);
                const repoFullName: string | undefined =
                    payload?.repository?.full_name;

                if (!repoFullName) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Missing repository.full_name' }));
                    return;
                }

                this.logger.info(
                    `Webhook received push event for ${repoFullName}`,
                );

                // Match against discovered repos
                const repos = this.repoWatcher.getRepos();
                let matched = false;

                for (const repo of repos) {
                    const remoteUrl = await repo.git.getRemoteUrl();
                    if (this.matchesRepo(remoteUrl, repoFullName)) {
                        this.logger.info(
                            `Triggering instant sync for ${repo.name}`,
                        );
                        await this.syncService.syncRepo(repo.rootPath);
                        matched = true;
                    }
                }

                if (matched) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'sync_triggered' }));
                } else {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(
                        JSON.stringify({
                            status: 'no_matching_repo',
                            repository: repoFullName,
                        }),
                    );
                }
            } catch {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
        });
    }

    /**
     * Check whether a remote URL matches the GitHub `owner/repo` full name.
     * Supports HTTPS and SSH URL formats.
     */
    private matchesRepo(remoteUrl: string, fullName: string): boolean {
        // Normalise: strip protocol, .git suffix, trailing slashes
        const normalised = remoteUrl
            .replace(/^(https?:\/\/|git@)/, '')
            .replace(/\.git$/, '')
            .replace(/\/$/, '');

        // HTTPS style: github.com/owner/repo
        // SSH   style: github.com:owner/repo
        return (
            normalised.endsWith(fullName) ||
            normalised.endsWith(fullName.replace('/', ':'))
        );
    }
}

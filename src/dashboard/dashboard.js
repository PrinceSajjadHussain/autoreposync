/**
 * AutoRepoSync Dashboard — Client-side logic.
 *
 * Runs inside the VS Code webview. Communicates with the
 * extension host via `acquireVsCodeApi().postMessage()` and
 * `window.addEventListener('message', …)`.
 */

// @ts-nocheck
/* eslint-disable no-undef */

(function () {
    'use strict';

    // ── VS Code API ─────────────────────────────────────────
    const vscode = acquireVsCodeApi();

    // ── DOM references ──────────────────────────────────────
    const repoGrid       = document.getElementById('repoGrid');
    const emptyState     = document.getElementById('emptyState');
    const logContainer   = document.getElementById('logContainer');
    const btnSyncAll     = document.getElementById('btnSyncAll');
    const btnViewLogs    = document.getElementById('btnViewLogs');
    const btnClearLogs   = document.getElementById('btnClearLogs');
    const cardTemplate   = document.getElementById('repoCardTemplate');

    /** Map<repoPath, HTMLElement> for efficient updates. */
    const cardElements = new Map();

    // ── State ───────────────────────────────────────────────
    let logEntries = [];
    const MAX_LOG_DISPLAY = 200;

    // ── Message handler ─────────────────────────────────────
    window.addEventListener('message', (event) => {
        const { type, payload } = event.data;

        switch (type) {
            case 'stateUpdate':
                renderRepos(payload);
                break;
            case 'logEntry':
                addLogEntry(payload);
                break;
            case 'logBatch':
                logEntries = payload;
                renderLogs();
                break;
        }
    });

    // ── Header buttons ──────────────────────────────────────
    btnSyncAll.addEventListener('click', () => {
        vscode.postMessage({ command: 'syncNow' });
    });

    btnViewLogs.addEventListener('click', () => {
        vscode.postMessage({ command: 'viewLogs' });
    });

    btnClearLogs.addEventListener('click', () => {
        logEntries = [];
        renderLogs();
    });

    // ── Repository rendering ────────────────────────────────

    /**
     * Render the full list of repositories.
     * Creates new cards when needed; updates existing ones in-place.
     */
    function renderRepos(states) {
        if (!states || states.length === 0) {
            emptyState.style.display = '';
            // Remove leftover cards
            cardElements.forEach((el) => el.remove());
            cardElements.clear();
            return;
        }

        emptyState.style.display = 'none';

        const activePaths = new Set(states.map((s) => s.repoPath));

        // Remove cards for repos no longer present
        cardElements.forEach((el, path) => {
            if (!activePaths.has(path)) {
                el.remove();
                cardElements.delete(path);
            }
        });

        // Create or update
        for (const state of states) {
            let card = cardElements.get(state.repoPath);
            if (!card) {
                card = createCard(state);
                repoGrid.appendChild(card);
                cardElements.set(state.repoPath, card);
            }
            updateCard(card, state);
        }
    }

    /** Clone the template and wire button handlers. */
    function createCard(state) {
        const fragment = cardTemplate.content.cloneNode(true);
        const card = fragment.querySelector('.repo-card');
        card.dataset.repoPath = state.repoPath;

        // Wire buttons
        card.querySelector('.action-sync').addEventListener('click', () => {
            vscode.postMessage({ command: 'syncNow', repoPath: state.repoPath });
        });

        card.querySelector('.action-pause').addEventListener('click', () => {
            vscode.postMessage({ command: 'pause', repoPath: state.repoPath });
        });

        card.querySelector('.action-resume').addEventListener('click', () => {
            vscode.postMessage({ command: 'resume', repoPath: state.repoPath });
        });

        card.querySelector('.action-open').addEventListener('click', () => {
            vscode.postMessage({ command: 'openRepo', repoPath: state.repoPath });
        });

        return card;
    }

    /** Patch a card's text & classes from a state object. */
    function updateCard(card, state) {
        const status = state.isSyncing ? 'pulling' : (state.syncStatus || 'unknown');

        card.dataset.status = status;
        card.classList.toggle('syncing', state.isSyncing);

        // Name & badge
        card.querySelector('.repo-name').textContent = state.repoName;
        const badge = card.querySelector('.repo-badge');
        badge.textContent = status;
        badge.className = 'repo-badge ' + status;

        // Meta fields
        setValue(card, 'branch', state.branch);
        setValue(card, 'behind', String(state.commitsBehind));
        setValue(card, 'ahead', String(state.commitsAhead));
        setValue(card, 'lastSync', state.lastSyncTime ? formatTime(state.lastSyncTime) : '—');

        // Error
        const errorEl = card.querySelector('[data-field="error"]');
        if (state.error) {
            errorEl.textContent = state.error;
            errorEl.style.display = '';
        } else {
            errorEl.style.display = 'none';
        }

        // Conflicts
        const conflictsEl = card.querySelector('[data-field="conflicts"]');
        if (state.conflictFiles && state.conflictFiles.length > 0) {
            conflictsEl.innerHTML =
                '<strong>Conflicting files:</strong><ul>' +
                state.conflictFiles.map((f) => '<li>' + escapeHtml(f) + '</li>').join('') +
                '</ul>';
            conflictsEl.style.display = '';
        } else {
            conflictsEl.style.display = 'none';
        }

        // Pause / Resume buttons
        const pauseBtn  = card.querySelector('.action-pause');
        const resumeBtn = card.querySelector('.action-resume');
        if (state.isPaused) {
            pauseBtn.style.display = 'none';
            resumeBtn.style.display = '';
        } else {
            pauseBtn.style.display = '';
            resumeBtn.style.display = 'none';
        }
    }

    function setValue(card, field, value) {
        const el = card.querySelector('[data-field="' + field + '"]');
        if (el) {
            el.textContent = value;
        }
    }

    // ── Log rendering ───────────────────────────────────────

    function addLogEntry(entry) {
        logEntries.push(entry);
        if (logEntries.length > MAX_LOG_DISPLAY) {
            logEntries = logEntries.slice(-MAX_LOG_DISPLAY);
        }
        appendLogLine(entry);
        scrollLogToBottom();
    }

    function renderLogs() {
        if (logEntries.length === 0) {
            logContainer.innerHTML = '<div class="log-empty">Waiting for activity…</div>';
            return;
        }

        logContainer.innerHTML = '';
        const display = logEntries.slice(-MAX_LOG_DISPLAY);
        for (const entry of display) {
            appendLogLine(entry);
        }
        scrollLogToBottom();
    }

    function appendLogLine(entry) {
        // Remove empty-state placeholder if present
        const empty = logContainer.querySelector('.log-empty');
        if (empty) {
            empty.remove();
        }

        const line = document.createElement('div');
        line.className = 'log-entry';

        const time = document.createElement('span');
        time.className = 'log-time';
        time.textContent = formatLogTime(entry.timestamp);

        const level = document.createElement('span');
        level.className = 'log-level ' + entry.level;
        level.textContent = entry.level;

        const msg = document.createElement('span');
        msg.className = 'log-message';

        if (entry.repoName) {
            const repo = document.createElement('span');
            repo.className = 'log-repo';
            repo.textContent = '[' + entry.repoName + '] ';
            msg.appendChild(repo);
        }

        msg.appendChild(document.createTextNode(entry.message));

        line.appendChild(time);
        line.appendChild(level);
        line.appendChild(msg);
        logContainer.appendChild(line);
    }

    function scrollLogToBottom() {
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    // ── Helpers ─────────────────────────────────────────────

    function formatTime(isoString) {
        try {
            const d = new Date(isoString);
            return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        } catch {
            return isoString;
        }
    }

    function formatLogTime(isoString) {
        try {
            const d = new Date(isoString);
            return d.toLocaleTimeString('en-GB', { hour12: false });
        } catch {
            return '??:??:??';
        }
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }
})();

# Changelog

All notable changes to the **AutoRepoSync** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-03-15

### Added

- **Automatic remote change detection** — periodic `git fetch` + `git status` comparison.
- **Zero-prompt sync** — automatic `git pull --rebase --autostash` when behind remote.
- **Auto stash** — local modifications are stashed before pull and restored after.
- **Background sync service** — configurable polling interval (default 30 s).
- **Multi-repository support** — discovers all `.git` repos in the workspace.
- **Real-time dashboard** — webview panel showing repo status, branch info, behind/ahead counts, conflicts, and activity logs.
- **Smart conflict detection** — conflicting files listed in the dashboard with quick-open support.
- **Webhook mode** — optional HTTP server for instant GitHub push-triggered sync.
- **Status bar indicator** — shows sync status with colour-coded icons.
- **Activity logging** — dual-output to VS Code Output Channel and dashboard.
- **Commands** — `Start Sync`, `Stop Sync`, `Sync Now`, `Open Dashboard`.
- **Configurable settings** — `autosync.enabled`, `autosync.interval`, `autosync.autoStash`, `autosync.enableWebhookMode`, `autosync.webhookPort`, `autosync.showNotifications`, `autosync.logLevel`.

---

## [Unreleased]

- AI-powered conflict resolution suggestions (planned).
- Auto branch-switching detection (planned).
- File change preview before pull (planned).

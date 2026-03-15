# ⚡ AutoRepoSync Sajjad

**Automatically keep your local Git repositories synchronized with their remote GitHub repositories — zero prompts, zero hassle.**

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![VS Code](https://img.shields.io/badge/vscode-%5E1.85.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## 🎯 What It Does

AutoRepoSync runs silently in the background and:

1. **Periodically fetches** remote changes (`git fetch`)
2. **Detects** when your branch is behind remote
3. **Automatically pulls** updates (`git pull --rebase --autostash`)
4. **Stashes** your local changes safely before pulling
5. **Detects merge conflicts** and shows them in a real-time dashboard
6. **Supports multiple repositories** in the same workspace

You never have to remember to pull again.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔄 **Auto Sync** | Background polling at a configurable interval (default: 30 s) |
| 🤫 **Zero-Prompt** | No confirmation dialogs — changes are pulled silently |
| 📦 **Auto Stash** | Local modifications are stashed and restored automatically |
| 🖥️ **Dashboard** | Real-time webview showing repo status, conflicts, and logs |
| 📡 **Webhook Mode** | Optional HTTP server for instant GitHub push-triggered sync |
| 🗂️ **Multi-Repo** | Detects every `.git` repo in your workspace |
| 🔔 **Notifications** | Optional popups for new commits and conflicts |
| 📊 **Activity Log** | Full sync history in the dashboard & VS Code Output Channel |

---

## 📸 Dashboard

Open via **Command Palette → `AutoRepoSync: Open Dashboard`**

The dashboard shows:

- Repository list with branch, behind/ahead counts, last sync time
- **Green** = synced · **Yellow** = pulling · **Red** = conflict
- Buttons: Sync Now, Pause, Resume, Open Repo, View Logs
- Live activity log

---

## 🚀 Getting Started

### Install from Marketplace

1. Open VS Code
2. Go to **Extensions** (`Ctrl+Shift+X`)
3. Search for **AutoRepoSync**
4. Click **Install**

### Install from VSIX

```bash
code --install-extension autoreposync-1.0.0.vsix
```

### Requirements

- **Git** must be installed and available on your PATH
- VS Code ≥ 1.85.0

---

## ⚙️ Configuration

All settings live under the `autosync.*` namespace in VS Code Settings.

| Setting | Type | Default | Description |
|---|---|---|---|
| `autosync.enabled` | `boolean` | `true` | Master on/off toggle |
| `autosync.interval` | `number` | `30` | Polling interval in seconds (5–3600) |
| `autosync.autoStash` | `boolean` | `true` | Stash local changes before pulling |
| `autosync.enableWebhookMode` | `boolean` | `false` | Start a local HTTP webhook server |
| `autosync.webhookPort` | `number` | `9090` | Port for the webhook server |
| `autosync.showNotifications` | `boolean` | `true` | Show VS Code notification popups |
| `autosync.logLevel` | `string` | `"info"` | `debug`, `info`, `warn`, or `error` |

---

## 🎮 Commands

| Command | Description |
|---|---|
| `AutoRepoSync: Start Sync` | Start the background sync loop |
| `AutoRepoSync: Stop Sync` | Stop the background sync loop |
| `AutoRepoSync: Sync Now` | Trigger an immediate sync for all repos |
| `AutoRepoSync: Open Dashboard` | Open the monitoring dashboard |

---

## 📡 Webhook Mode (Advanced)

For instant sync on push, enable the webhook server:

1. Set `autosync.enableWebhookMode` to `true`
2. Configure `autosync.webhookPort` (default `9090`)
3. In your GitHub repo → Settings → Webhooks:
   - **Payload URL**: `http://<your-ip>:9090/webhook`
   - **Content type**: `application/json`
   - **Events**: Just the push event
4. The extension will instantly sync when a push is received

> **Note:** The webhook server listens on all interfaces. Use a reverse proxy or firewall in production.

---

## 🏗️ Architecture

```
src/
├── extension.ts          ← Entry point, wires everything
├── gitManager.ts         ← Low-level Git CLI wrapper
├── syncService.ts        ← Periodic sync orchestrator
├── repoWatcher.ts        ← Workspace repo discovery
├── webhookServer.ts      ← Optional HTTP webhook server
├── dashboard/
│   ├── dashboard.ts      ← Webview panel controller
│   ├── dashboard.html    ← Dashboard markup
│   ├── dashboard.css     ← Dashboard styles
│   └── dashboard.js      ← Dashboard client logic
└── utils/
    ├── logger.ts         ← Dual-output logger
    └── settings.ts       ← Typed config reader
```

### Sync Engine Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│  Timer / │────▶│  Fetch   │────▶│ Compare  │
│  Webhook │     │  Remote  │     │ Local vs │
└──────────┘     └──────────┘     │  Remote  │
                                  └────┬─────┘
                                       │
                          ┌────────────┼────────────┐
                          ▼            ▼            ▼
                      Up to date   Behind       Conflict
                      (no-op)      Pull+Rebase  Notify user
```

---

## 🛠️ Development

### Build from source

```bash
git clone https://github.com/autoreposync/autoreposync.git
cd autoreposync
npm install
npm run compile
```

### Run in VS Code

1. Open the `autoreposync` folder in VS Code
2. Press `F5` to launch the Extension Development Host
3. The extension activates in any workspace with a `.git` directory

### Package

```bash
npm install -g @vscode/vsce
vsce package
```

This produces `autoreposync-1.0.0.vsix`.

### Publish

```bash
vsce publish
```

---

## 📋 Changelog

See [CHANGELOG.md](CHANGELOG.md).

---

## 📄 License

MIT © AutoRepoSync Contributors

🚀 AutoRepoSync 
# ⚡ AutoRepoSync Sajjad

> Never forget to pull again.

**AutoRepoSync automatically keeps your local Git repositories synchronized with GitHub — silently in the background.**

No prompts.  
No manual pulls.  
No "your branch is behind".

Just open VS Code and your repo stays updated.

---

## 🎬 Demo

![AutoRepoSync Demo](screenshots/demo.gif)

Push → Fetch → Pull → Synced automatically.

---

## 🤯 The Problem

If you work in a team, you know this pain:

❌ You start coding  
❌ Someone pushes new commits  
❌ Your branch is now outdated  
❌ You forget to pull  
❌ Merge conflicts appear

Or worse:


Your branch is behind 'origin/main' by 5 commits


Now your workflow is broken.

---

## 💡 The Solution

**AutoRepoSync handles everything automatically.**

The extension runs in the background and:

1️⃣ Fetches remote changes  
2️⃣ Detects if your branch is behind  
3️⃣ Pulls updates automatically  
4️⃣ Safely stashes your changes  
5️⃣ Restores your work after syncing  

You stay focused on coding.

---

## ✨ Features

| Feature | Description |
|------|-------------|
| 🔄 Auto Fetch | Periodically checks GitHub for updates |
| ⚡ Auto Pull | Pulls updates automatically |
| 📦 Auto Stash | Safely stashes local changes |
| 🖥 Dashboard | Real-time repo sync dashboard |
| 📡 Webhook Mode | Instant sync from GitHub pushes |
| 🗂 Multi Repo | Works with multiple repos |
| 🔔 Notifications | Optional commit notifications |
| 📊 Activity Logs | Full sync history |

---

## 🖥 Dashboard

Monitor all repositories in one place.

![Dashboard](screenshots/dashboard.png)

Shows:

- Repo status
- Behind/ahead count
- Last sync
- Conflict alerts
- Activity logs

┌─────────────┐
│ Timer/Event │
└──────┬──────┘
│
▼
┌─────────────┐
│ git fetch │
└──────┬──────┘
│
▼
┌─────────────┐
│ Compare │
│ Local/Remote│
└──────┬──────┘
│
▼
┌─────────────┐
│ git pull │
│ --rebase │
│ --autostash │
└─────────────┘

## 🚀 Installation

### Install from VS Code Marketplace

1. Open **VS Code**
2. Go to Extensions (`Ctrl + Shift + X`)
3. Search **AutoRepoSync**
4. Click **Install**

---

### Install via VSIX


code --install-extension autoreposync.vsix


---

## ⚙️ Configuration

Customize the extension in VS Code settings.

| Setting | Default | Description |
|-------|--------|-------------|
| autosync.enabled | true | Enable auto syncing |
| autosync.interval | 30 | Sync interval (seconds) |
| autosync.autoStash | true | Stash local changes |
| autosync.enableWebhookMode | false | Enable webhook sync |
| autosync.webhookPort | 9090 | Webhook server port |
| autosync.showNotifications | true | Show notifications |

---

## 🎮 Commands

| Command | Description |
|------|-------------|
| AutoRepoSync: Start Sync | Start auto sync |
| AutoRepoSync: Stop Sync | Stop auto sync |
| AutoRepoSync: Sync Now | Manual sync |
| AutoRepoSync: Open Dashboard | Open dashboard |

---

## 📡 Webhook Mode

Enable instant syncing using GitHub Webhooks.

Steps:

1️⃣ Enable webhook mode in settings  
2️⃣ Add webhook in GitHub repo  
3️⃣ Auto sync triggers instantly on push

Payload URL:


http://localhost:9090/webhook


---

## 🏗 Architecture


src
├── extension.ts
├── gitManager.ts
├── syncService.ts
├── repoWatcher.ts
├── webhookServer.ts
└── dashboard


Modules:

- **Git Manager** → CLI wrapper
- **Sync Service** → orchestrates sync
- **Repo Watcher** → detects repositories
- **Dashboard** → monitoring UI
- **Webhook Server** → push-triggered sync

---

## 🛠 Development

Clone the repo:


git clone https://github.com/autoreposync/autoreposync.git

cd autoreposync
npm install
npm run compile


Run extension:


Press F5


---

## 📦 Package Extension


npm install -g @vscode/vsce
vsce package


Output:


autoreposync-1.0.0.vsix


---

## 📈 Roadmap

Planned features:

- 🤖 AI merge conflict resolution
- 📢 Slack / Discord alerts
- 📊 Team sync analytics
- 🧠 Smart branch awareness
- 🧾 Commit summaries

---

## 🤝 Contributing

Pull requests are welcome.

Steps:

1. Fork repository
2. Create feature branch
3. Submit PR

---

## ⭐ Support

If this project helps you, please consider giving it a star ⭐

It helps more developers discover the project.

---

## 📄 License

MIT License

# GTM Console - Installation & Quickstart Guide

Welcome to **GTM Console**, an autonomous AI-powered BDR and Omnichannel GTM Outreach Platform.

---

## 🚀 Quickstart (1-Click Run)

###  macOS / 🐧 Linux
1. Unzip `gtm_console_app.zip` to your desired folder.
2. Open Terminal and navigate to the project directory:
   ```bash
   cd /path/to/gtm_console_app
   ```
3. Run using **`bash`** (bypasses macOS quarantine permissions automatically):
   ```bash
   bash run_local.sh
   ```

> ⚠️ **Note for macOS "operation not permitted" error**:
> If macOS displays `zsh: operation not permitted: ./run_local.sh`, run any of these 3 easy 1-second fixes:
> - **Fix 1 (Recommended)**: Run `bash run_local.sh` instead of `./run_local.sh`.
> - **Fix 2 (Clear Quarantine)**: Run `xattr -c run_local.sh` then `./run_local.sh`.
> - **Fix 3 (Direct Python)**: Run `python3 server.py`.

---

### 🪟 Windows
1. Unzip `gtm_console_app.zip` to your desired folder.
2. Double-click **`run_local.bat`**.
3. Your default web browser will open automatically at **`http://localhost:8001`**.

---

## 🛠️ System Requirements
- **Python**: Python 3.9+ installed ([Download Python](https://www.python.org/downloads/)).
- **Browser**: Google Chrome or Microsoft Edge recommended for local Excel workbook read/write permissions.

---

## ⚡ Features Included
- **Firebase Auth**: Live account sign-in & Google OAuth authentication.
- **Google Workspace Sync**: Real Read & Write for Gmail sending & Google Calendar scheduling.
- **Lemlist Outbound Integration**: Remote MCP server connection (`https://app.lemlist.com/mcp`).
- **Firecrawl Agentic Scraping**: Multi-tab Google Dorking, press release scanning, and executive dossier compilation.
- **Autonomous GTM AI Assistant**: Minimalist chatbot UI with 12-node LangGraph execution pipeline.
- **Local Excel Database (.xlsx)**: Persistent sheet session memory and 3-second background auto-save daemon.

---

## ❓ Troubleshooting
- If Python is not recognized, install Python 3.9 or newer and ensure "Add Python to PATH" is checked during installation on Windows.
- Keep the terminal / command prompt window open while using the application.

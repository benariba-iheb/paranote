![GitHub commit activity](https://img.shields.io/github/commit-activity/y/BENARIBA-Iheb/paranote) | ![GitHub repo size](https://img.shields.io/github/repo-size/BENARIBA-Iheb/PARANOTE)

# ParaNote (formerly LBLI-QT)

ParaNote is a powerful Chrome Extension designed for teams working on LabLabee learning content. it allows users to take notes and log content issues directly on laboratory paragraphs, with seamless synchronization to Google Drive.

## 🚀 Key Features

- **Dual-Mode Architecture**: Distinct builds for `Support` (Issue Logging) and `Lab` (Issue Resolution) teams.
- **Persistent Highlighting**: Leverages robust 53-bit paragraph hashing to pin notes exactly where they belong, even if content changes slightly.
- **Google Drive Sync**: Automatically and manually syncs notes and issues (with screenshots) to a shared Google Drive folder in CSV and XLSX formats.
- **Smart Conflict Protection**: Sophisticated "Option A" sync logic that prevents remote updates from overwriting your unsaved local modifications.
- **Rich Interaction**: Searchable issue types, expandable cards, and full-screen screenshot viewing.
- **RBAC Security**: Access control based on a whitelist of allowed Gmail accounts.

## 🛠️ Tech Stack

- **Framework**: React 18
- **Core**: TypeScript, Vite
- **Styling**: Tailwind CSS + shadcn/ui
- **Icons**: Lucide React
- **Extension**: CRXJS (Manifest V3)
- **Persistence**: Chrome Storage Local + Google Drive API

## 📦 Getting Started

### Prerequisites

- Node.js (v18+)
- A Google Cloud Project with the **Google Drive API** enabled.
- Optimized for Chrome/Chromium browsers.

### Local Development

1. **Clone the repository**:
   ```bash
   git clone https://github.com/benariba-iheb/paranote.git
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment**:
   Create a `.env` file from the example:
   ```bash
   VITE_APP_TARGET=support # or 'lab'
   ```

4. **Run the Build**:
   ```bash
   npm run build
   ```

5. **Load in Chrome**:
   - Open `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `dist/support` or `dist/lab` folder.

## 📒 Usage

1. **Sign In**: Open the extension popup, enter your GCP Client ID and Shared Folder ID.
2. **Annotate**: Hover over any paragraph on LabLabee pages to see the "Take Note" or "Log Issue" trigger.
3. **View**: Toggle "View Notes on Page" from the popup to see all annotations anchored in place.
4. **Sync**: Use the "Backup to Drive" button to publish your changes or allow the 15s auto-sync to pull team updates.

---

*Developed for the LabLabee team for high-efficiency content QA.*

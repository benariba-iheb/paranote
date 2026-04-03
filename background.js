// background.js - Manifest V3 Service Worker

chrome.runtime.onInstalled.addListener(() => {
  console.log("ParaNote Extension Installed.");
  chrome.storage.local.set({ notesDatabase: [], issuesDatabase: [] });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 1. FETCH NOTES LOGIC
  if (request.action === "FETCH_NOTES_FOR_URL") {
    const tabUrl = sender.tab ? sender.tab.url : null;
    if (tabUrl) {
      const currentUrl = new URL(tabUrl).hostname;
      chrome.storage.local.get(['notesDatabase', 'issuesDatabase'], (result) => {
        const notesDb = result.notesDatabase || [];
        const issuesDb = result.issuesDatabase || [];
        const combinedDb = [...notesDb, ...issuesDb];
        const siteNotes = combinedDb.filter(note => note.domain === currentUrl);
        sendResponse({ success: true, notes: siteNotes });
      });
    }
    return true;
  }

  // 2. ACTUAL SAVE LOGIC
  if (request.action === "SAVE_NOTE") {
    chrome.storage.local.get(['notesDatabase', 'issuesDatabase'], (result) => {
      const isNote = request.payload.type === "Note";
      const db = isNote ? (result.notesDatabase || []) : (result.issuesDatabase || []);
      const domain = sender.tab && sender.tab.url ? new URL(sender.tab.url).hostname : "unknown";

      const newNote = {
        hash: request.payload.hash,
        content: request.payload.content,
        url: request.payload.url,
        domain: domain,
        timestamp: request.payload.timestamp,
        screenshot: request.payload.screenshot,
        type: request.payload.type || "Content Typo"
      };

      const existingIndex = db.findIndex(n => n.hash === newNote.hash && n.domain === newNote.domain);
      if (existingIndex !== -1) {
        db[existingIndex] = newNote;
      } else {
        db.push(newNote);
      }

      if (isNote) {
        chrome.storage.local.set({ notesDatabase: db }, () => sendResponse({ success: true }));
      } else {
        chrome.storage.local.set({ issuesDatabase: db }, () => sendResponse({ success: true }));
      }
    });

    return true;
  }

  if (request.action === "DELETE_NOTE") {
    chrome.storage.local.get(['notesDatabase', 'issuesDatabase'], (result) => {
      let notesDb = result.notesDatabase || [];
      let issuesDb = result.issuesDatabase || [];
      const domain = sender.tab && sender.tab.url ? new URL(sender.tab.url).hostname : "unknown";

      notesDb = notesDb.filter(n => !(n.hash === request.hash && n.domain === domain));
      issuesDb = issuesDb.filter(n => !(n.hash === request.hash && n.domain === domain));

      chrome.storage.local.set({ notesDatabase: notesDb, issuesDatabase: issuesDb }, () => {
        sendResponse({ success: true });
      });
    });

    return true;
  }

  // 3. GOOGLE DRIVE BACKUP
  // Trigger a manual backup to the cloud
  if (request.action === "BACKUP_TO_CLOUD") {
    DriveSyncEngine.backupToDrive().then(success => sendResponse({ success }));
    return true;
  }

  // Trigger a manual restore from the cloud
  if (request.action === "RESTORE_FROM_CLOUD") {
    DriveSyncEngine.restoreFromDrive().then(success => sendResponse({ success }));
    return true;
  }
});


// ==========================================
// GOOGLE DRIVE SYNC ENGINE (background.js)
// ==========================================

const DRIVE_FILE_NAME = 'paranote_backup.json';

class DriveSyncEngine {
  // 1. Get OAuth Token
  static async getToken() {
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, function (token) {
        if (chrome.runtime.lastError || !token) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(token);
        }
      });
    });
  }

  // 2. Find the hidden file in the appDataFolder
  static async getFileId(token) {
    const query = encodeURIComponent(`name='${DRIVE_FILE_NAME}' and 'appDataFolder' in parents`);
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&spaces=appDataFolder`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();
    return data.files && data.files.length > 0 ? data.files[0].id : null;
  }

  // 3. Create the file if it doesn't exist
  static async createFile(token) {
    const metadata = {
      name: DRIVE_FILE_NAME,
      parents: ['appDataFolder']
    };
    const response = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(metadata)
    });
    const data = await response.json();
    return data.id;
  }

  // 4. Upload local data to Google Drive
  static async backupToDrive() {
    try {
      console.log("ParaNote: Starting Drive Backup...");
      const token = await this.getToken();
      let fileId = await this.getFileId(token);

      if (!fileId) {
        console.log("ParaNote: Creating new sync file in Drive...");
        fileId = await this.createFile(token);
      }

      // Get local data
      const localData = await chrome.storage.local.get(['notesDatabase', 'issuesDatabase']);
      const db = {
        notes: localData.notesDatabase || [],
        issues: localData.issuesDatabase || []
      };

      // Upload content to the file
      await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(db)
      });

      console.log("ParaNote: Backup Successful! ✅");
      return true;
    } catch (error) {
      console.error("ParaNote Drive Backup Failed:", error);
      return false;
    }
  }

  // 5. Download data from Google Drive to Local Storage
  static async restoreFromDrive() {
    try {
      console.log("ParaNote: Fetching from Drive...");
      const token = await this.getToken();
      const fileId = await this.getFileId(token);

      if (!fileId) {
        console.log("ParaNote: No remote backup found.");
        return false;
      }

      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const remoteData = await response.json();

      // Legacy migration check: if the remote data is an Array, assume they are all issues
      if (Array.isArray(remoteData)) {
        console.log("ParaNote: Migrating legacy backup format into issuesDatabase...");
        await chrome.storage.local.set({ issuesDatabase: remoteData, notesDatabase: [] });
      } else {
        // New format
        await chrome.storage.local.set({
          notesDatabase: remoteData.notes || [],
          issuesDatabase: remoteData.issues || []
        });
      }

      console.log("ParaNote: Restore Successful! ✅");
      return true;
    } catch (error) {
      console.error("ParaNote Drive Restore Failed:", error);
      return false;
    }
  }
}
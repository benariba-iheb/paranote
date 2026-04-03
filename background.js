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
        type: request.payload.type || "Content Typo",
        taskContext: request.payload.taskContext || null
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

  // 4. CSV Conversion
  static convertIssuesToCSV(issuesArray) {
    if (!issuesArray || issuesArray.length === 0) return "Content,Issue Type,Subchallenge,Screenshot,Hash\n";
    const headers = ["Content", "Issue Type", "Subchallenge", "Screenshot", "Hash"];
    const lines = [headers.join(',')];
    issuesArray.forEach(issue => {
      const type = `"${(issue.type || "").replace(/"/g, '""')}"`;
      const content = `"${(issue.content || "").replace(/"/g, '""')}"`;
      const ctxText = issue.taskContext ? `${issue.taskContext.activeTask || ''} / ${issue.taskContext.activeSubtask || ''}` : "Unknown";
      const context = `"${ctxText.replace(/"/g, '""')}"`;
      const screenshot = issue.screenshot ? `"${issue.screenshot}"` : `""`;
      const hash = `"${issue.hash || ""}"`;
      lines.push([content, type, context, screenshot, hash].join(','));
    });
    return lines.join('\n');
  }

  // 5. Notes CSV Conversion
  static convertNotesToCSV(notesArray) {
    if (!notesArray || notesArray.length === 0) return "Content,Context,Screenshot,Hash\n";
    const headers = ["Content", "Context", "Screenshot", "Hash"];
    const lines = [headers.join(',')];
    notesArray.forEach(note => {
      const content = `"${(note.content || "").replace(/"/g, '""')}"`;
      const ctxText = note.taskContext ? `${note.taskContext.activeTask || ''} / ${note.taskContext.activeSubtask || ''}` : "Unknown";
      const context = `"${ctxText.replace(/"/g, '""')}"`;
      const screenshot = note.screenshot ? `"${note.screenshot}"` : `""`;
      const hash = `"${note.hash || ""}"`;
      lines.push([content, context, screenshot, hash].join(','));
    });
    return lines.join('\n');
  }

  // 5. Get or Create Visible Folder
  static async getOrCreateFolder(token, folderName, parentId = null) {
    const parentQuery = parentId ? ` and '${parentId}' in parents` : "";
    const query = encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false${parentQuery}`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.files && data.files.length > 0) return data.files[0].id;

    const requestBody = { name: folderName, mimeType: 'application/vnd.google-apps.folder' };
    if (parentId) requestBody.parents = [parentId];

    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
    const createData = await createRes.json();
    return createData.id;
  }

  // 6. Get or Create Visible CSV File
  static async getOrCreateCsvFile(token, folderId, fileName) {
    const query = encodeURIComponent(`name='${fileName}' and '${folderId}' in parents and trashed=false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.files && data.files.length > 0) return data.files[0].id;

    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: fileName, parents: [folderId] })
    });
    const createData = await createRes.json();
    return createData.id;
  }

  // 7. Extract Image to Drive
  static async uploadImageToDrive(token, baseDataUri, fileName, folderId) {
    const query = encodeURIComponent(`name='${fileName}' and '${folderId}' in parents and trashed=false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.files && data.files.length > 0) return data.files[0].id;

    let blob;
    try {
      const response = await fetch(baseDataUri);
      blob = await response.blob();
    } catch (e) {
      return null;
    }

    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: fileName, parents: [folderId], mimeType: 'image/jpeg' })
    });
    const createData = await createRes.json();
    const fileId = createData.id;

    await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'image/jpeg' },
      body: blob
    });
    return fileId;
  }

  // 8. Universal Export Pipeline
  static async exportDataCategory(token, dataArray, rootFolderName, fileNamePrefix, conversionFunction) {
      console.log(`ParaNote: Exporting to /${rootFolderName}/ folder...`);
      const rootFolderId = await this.getOrCreateFolder(token, rootFolderName);

      const groupedData = {};
      for (let item of dataArray) {
        let lName = (item.taskContext && item.taskContext.labName) ? item.taskContext.labName : "General";
        // Append Quality Tester suffix ONLY for issues
        if (rootFolderName === 'lab_issues') lName = `${lName}_QT`; 
        if (!groupedData[lName]) groupedData[lName] = [];
        groupedData[lName].push(item);
      }

      for (const [labName, group] of Object.entries(groupedData)) {
        console.log(`ParaNote: Exporting group ${labName}...`);
        const labFolderId = await this.getOrCreateFolder(token, labName, rootFolderId);
        const csvFileId = await this.getOrCreateCsvFile(token, labFolderId, `${fileNamePrefix}_export.csv`);
        const screenshotsFolderId = await this.getOrCreateFolder(token, 'screenshots', labFolderId);

        let exportArray = JSON.parse(JSON.stringify(group)); // Deep clone

        for (let item of exportArray) {
          if (item.screenshot && item.screenshot.startsWith('data:image')) {
            const fileName = `${item.hash}.jpg`;
            const imgFileId = await this.uploadImageToDrive(token, item.screenshot, fileName, screenshotsFolderId);
            if (imgFileId) {
              item.screenshot = `https://drive.google.com/file/d/${imgFileId}/view`;
            } else {
              item.screenshot = "";
            }
          }
        }

        const csvString = conversionFunction(exportArray);
        
        const csvRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${csvFileId}?uploadType=media`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'text/csv'
          },
          body: csvString
        });
        if (!csvRes.ok) throw new Error(`CSV Upload Failed for ${labName}`);
      }
  }

  // 9. Upload local data to Google Drive
  static async backupToDrive() {
    try {
      console.log("ParaNote: Starting Drive Backup...");
      const token = await this.getToken();
      const localData = await chrome.storage.local.get(['notesDatabase', 'issuesDatabase']);

      // Execute dual export pipelines
      if (localData.issuesDatabase && localData.issuesDatabase.length > 0) {
        await this.exportDataCategory(token, localData.issuesDatabase, 'lab_issues', 'issues', this.convertIssuesToCSV);
      }
      if (localData.notesDatabase && localData.notesDatabase.length > 0) {
        await this.exportDataCategory(token, localData.notesDatabase, 'notes', 'notes', this.convertNotesToCSV);
      }

      // -- ORIGINAL: Keep Hidden Sync JSON Backup for State Restore --
      let fileId = await this.getFileId(token);

      if (!fileId) {
        console.log("ParaNote: Creating new sync file in Drive...");
        fileId = await this.createFile(token);
      }

      const db = {
        notes: localData.notesDatabase || [],
        issues: localData.issuesDatabase || []
      };

      // Upload content to the JSON file
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
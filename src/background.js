// background.js - Manifest V3 Service Worker
import allowedUsers from './auth/allowed-users.json';
import * as XLSX from 'xlsx';

const APP_TARGET = import.meta.env.VITE_APP_TARGET || 'support';
const ALLOWED_EMAILS = (allowedUsers[APP_TARGET] || []).map(e => e.toLowerCase());

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
    chrome.storage.local.get(['notesDatabase', 'issuesDatabase', 'authUser'], (result) => {
      const isNote = request.payload.type === "Note";
      const db = isNote ? (result.notesDatabase || []) : (result.issuesDatabase || []);
      const domain = sender.tab && sender.tab.url ? new URL(sender.tab.url).hostname : "unknown";
      const authorName = result.authUser
        ? (result.authUser.name || result.authUser.email || 'Unknown')
        : 'Unknown';

      const incomingNote = {
        hash: request.payload.hash,
        content: request.payload.content,
        url: request.payload.url,
        domain: domain,
        timestamp: request.payload.timestamp,
        screenshot: request.payload.screenshot,
        type: request.payload.type || "Content Typo",
        labComment: request.payload.labComment || null,
        labFixType: request.payload.labFixType || "Pending",
        taskContext: request.payload.taskContext || null,
        fixedBy: request.payload.fixedBy || null
      };

      const existingIndex = db.findIndex(n => n.hash === incomingNote.hash && n.domain === incomingNote.domain);
      if (existingIndex !== -1) {
        const existing = db[existingIndex];
        // Merge: keep existing fields that the incoming payload did not supply,
        // so Lab resolutions don't wipe out Support's screenshot / taskContext and vice-versa.
        db[existingIndex] = {
          ...existing,
          // Always update mutable fields
          content:    incomingNote.content    || existing.content,
          type:       incomingNote.type       || existing.type,
          timestamp:  incomingNote.timestamp,
          // Preserve screenshot and taskContext from whichever side originally set them
          screenshot: incomingNote.screenshot ?? existing.screenshot,
          taskContext: incomingNote.taskContext ?? existing.taskContext,
          // Lab resolution fields: only overwrite when the incoming value is non-null
          labComment: incomingNote.labComment  !== null ? incomingNote.labComment  : existing.labComment,
          labFixType: incomingNote.labFixType  !== null ? incomingNote.labFixType  : existing.labFixType,
          // Authorship: keep original author, always update last modifier
          lastModifiedBy: authorName,
          // Fixed-by: stamp the current user when a lab resolution is applied
          fixedBy: incomingNote.labFixType && incomingNote.labFixType !== 'Pending'
            ? authorName
            : (existing.fixedBy || null),
        };
      } else {
        incomingNote.author = authorName;
        incomingNote.lastModifiedBy = authorName;
        db.push(incomingNote);
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

      // Only delete from the matching database, not both — prevents a note and
      // an issue on the same paragraph from wiping each other out.
      if (request.isNote) {
        notesDb = notesDb.filter(n => !(n.hash === request.hash && n.domain === domain));
      } else {
        issuesDb = issuesDb.filter(n => !(n.hash === request.hash && n.domain === domain));
      }
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

  // CHECK_AUTH — verify the signed-in Google account is on the allowlist
  if (request.action === "CHECK_AUTH") {
    chrome.storage.local.get(['clientId'], (result) => {
      const clientId = result.clientId;
      if (!clientId) {
        sendResponse({ success: false, allowed: false, error: 'no_client_id' });
        return;
      }
      doAuth(clientId);
    });

    function doAuth(clientId) {
      const redirectUri = chrome.identity.getRedirectURL();
      const scopes = encodeURIComponent([
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/drive"
      ].join(' '));
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&prompt=consent`;

      chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, async (redirectUrl) => {
        if (chrome.runtime.lastError || !redirectUrl) {
          sendResponse({ success: false, allowed: false, error: 'no_token', detail: chrome.runtime.lastError?.message });
          return;
        }
        
        // Extract token from redirect URL hash part (#access_token=...)
        const urlHash = redirectUrl.split('#')[1];
        const params = new URLSearchParams(urlHash);
        const token = params.get('access_token');
        
        if (!token) {
          sendResponse({ success: false, allowed: false, error: 'parsing_failed' });
          return;
        }

        // Cache the token manually so DriveSyncEngine can use it without prompting
        chrome.storage.local.set({ authToken: token });

        try {
          const profile = await DriveSyncEngine.getUserProfile(token);
          const email = profile.email.toLowerCase();
          const allowed = ALLOWED_EMAILS.some(entry => {
            if (entry.startsWith('*@')) {
              return email.endsWith(entry.slice(1));
            }
            return entry === email;
          });
          const authUser = { email: profile.email, name: profile.name, picture: profile.picture, allowed };
          chrome.storage.local.set({ authUser });
          sendResponse({ success: true, allowed, email: profile.email, name: profile.name, picture: profile.picture });
        } catch (e) {
          sendResponse({ success: false, allowed: false, error: 'profile_fetch_failed' });
        }
      });
    }
    return true;
  }

  // SIGN_OUT — clear cached user and token
  if (request.action === "SIGN_OUT") {
    chrome.storage.local.get(['authToken'], (res) => {
      if (res.authToken) fetch(`https://accounts.google.com/o/oauth2/revoke?token=${res.authToken}`);
      chrome.storage.local.remove(['authUser', 'authToken']);
      sendResponse({ success: true });
    });
    return true;
  }
});


// ==========================================
// GOOGLE DRIVE SYNC ENGINE (background.js)
// ==========================================

const DRIVE_FILE_NAME = 'paranote_backup.json';

class DriveSyncEngine {
  // --- Helper: wraps fetch for Drive API calls and throws with detailed Google errors ---
  static async driveRequest(url, options = {}) {
    const res = await fetch(url, options);
    if (!res.ok) {
      let body = '';
      try { body = await res.text(); } catch (_) { /* ignore */ }
      throw new Error(`Drive API ${res.status} on ${url.split('?')[0].split('/').slice(-2).join('/')} — ${body}`);
    }
    return res;
  }

  // 1. Get OAuth Token — relies on the token cached by CHECK_AUTH
  static async getToken() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['authToken', 'clientId'], (result) => {
        if (result.authToken) {
          resolve(result.authToken);
        } else if (!result.clientId) {
          reject(new Error("No Client ID configured"));
        } else {
          // If for some reason Drive Sync needs a token, allow interactive flow
          // because backup/restore are manual user actions triggered from the popup.
          const redirectUri = chrome.identity.getRedirectURL();
          const scopes = encodeURIComponent(["openid", "email", "profile", "https://www.googleapis.com/auth/drive"].join(' '));
          const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${result.clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&prompt=none`;
          
          chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, (redirectUrl) => {
            if (chrome.runtime.lastError || !redirectUrl) {
              reject(chrome.runtime.lastError || new Error('No token returned'));
            } else {
              const urlHash = redirectUrl.split('#')[1];
              const params = new URLSearchParams(urlHash);
              const token = params.get('access_token');
              if (token) {
                chrome.storage.local.set({ authToken: token });
                resolve(token);
              } else {
                reject(new Error('Failed to parse token'));
              }
            }
          });
        }
      });
    });
  }

  // 1c. Get the configured Shared Folder ID
  static async getSharedFolderId() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['folderId'], (result) => {
        resolve(result.folderId || null);
      });
    });
  }

  // 1b. Fetch the signed-in user's Google profile (email, name, picture)
  static async getUserProfile(token) {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('userinfo_failed');
    return res.json(); // { email, name, picture, ... }
  }

  // 2. Find the sync file in the Shared Drive Folder
  static async getFileId(token) {
    const parentId = await this.getSharedFolderId();
    if (!parentId || parentId.trim() === '.' || parentId.trim() === '') throw new Error("Invalid Shared Folder ID configured");
    const query = encodeURIComponent(`name='${DRIVE_FILE_NAME}' and '${parentId}' in parents and trashed=false`);
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&supportsAllDrives=true&includeItemsFromAllDrives=true`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();
    return data.files && data.files.length > 0 ? data.files[0].id : null;
  }

  // 3. Create the file if it doesn't exist inside the Shared Drive Folder
  static async createFile(token) {
    const parentId = await this.getSharedFolderId();
    if (!parentId || parentId.trim() === '.' || parentId.trim() === '') throw new Error("Invalid Shared Folder ID configured");
    const metadata = {
      name: DRIVE_FILE_NAME,
      parents: [parentId]
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
    if (!issuesArray || issuesArray.length === 0) return "Content,Issue Type,Subchallenge,Screenshot,Hash,Lab Fix Type,Lab Comment,Created By,Last Edited By,Fixed By\n";
    const headers = ["Content", "Issue Type", "Subchallenge", "Screenshot", "Hash", "Lab Fix Type", "Lab Comment", "Created By", "Last Edited By", "Fixed By"];
    const lines = [headers.join(',')];
    issuesArray.forEach(issue => {
      const type = `"${(issue.type || "").replace(/"/g, '""')}"`;
      const content = `"${(issue.content || "").replace(/"/g, '""')}"`;
      const ctxText = issue.taskContext ? `${issue.taskContext.activeTask || ''} / ${issue.taskContext.activeSubtask || ''}` : "Unknown";
      const context = `"${ctxText.replace(/"/g, '""')}"`;
      const screenshot = issue.screenshot ? `"${issue.screenshot}"` : `""`;
      const hash = `"${issue.hash || ""}"`;
      const labFixType = `"${(issue.labFixType || "").replace(/"/g, '""')}"`;
      const labComment = `"${(issue.labComment || "").replace(/"/g, '""')}"`;
      const author = `"${(issue.author || "").replace(/"/g, '""')}"`;
      const lastModifiedBy = `"${(issue.lastModifiedBy || "").replace(/"/g, '""')}"`;
      const fixedBy = `"${(issue.fixedBy || "").replace(/"/g, '""')}"`;
      lines.push([content, type, context, screenshot, hash, labFixType, labComment, author, lastModifiedBy, fixedBy].join(','));
    });
    return lines.join('\n');
  }

  // 5. Notes CSV Conversion
  static convertNotesToCSV(notesArray) {
    if (!notesArray || notesArray.length === 0) return "Content,Context,Screenshot,Hash,Created By,Last Edited By\n";
    const headers = ["Content", "Context", "Screenshot", "Hash", "Created By", "Last Edited By"];
    const lines = [headers.join(',')];
    notesArray.forEach(note => {
      const content = `"${(note.content || "").replace(/"/g, '""')}"`;
      const ctxText = note.taskContext ? `${note.taskContext.activeTask || ''} / ${note.taskContext.activeSubtask || ''}` : "Unknown";
      const context = `"${ctxText.replace(/"/g, '""')}"`;
      const screenshot = note.screenshot ? `"${note.screenshot}"` : `""`;
      const hash = `"${note.hash || ""}"`;
      const author = `"${(note.author || "").replace(/"/g, '""')}"`;
      const lastModifiedBy = `"${(note.lastModifiedBy || "").replace(/"/g, '""')}"`;
      lines.push([content, context, screenshot, hash, author, lastModifiedBy].join(','));
    });
    return lines.join('\n');
  }

  // 4b. Issues XLSX Conversion
  static convertIssuesToXlsx(issuesArray) {
    const rows = (issuesArray || []).map(issue => ({
      'Content':         issue.content   || '',
      'Issue Type':      issue.type      || '',
      'Subchallenge':    issue.taskContext ? `${issue.taskContext.activeTask || ''} / ${issue.taskContext.activeSubtask || ''}` : 'Unknown',
      'Screenshot':      issue.screenshot || 'NA',
      'Lab Fix Type':    issue.labFixType || '',
      'Lab Comment':     issue.labComment || ''
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Issues');
    return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  }

  // 5b. Notes XLSX Conversion
  static convertNotesToXlsx(notesArray) {
    const rows = (notesArray || []).map(note => ({
      'Content':    note.content || '',
      'Context':    note.taskContext ? `${note.taskContext.activeTask || ''} / ${note.taskContext.activeSubtask || ''}` : 'Unknown',
      'Screenshot': note.screenshot || 'NA'
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Notes');
    return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  }

  // 5. Get or Create Visible Folder
  static async getOrCreateFolder(token, folderName, parentId = null) {
    if (parentId && parentId.trim() === '.') throw new Error("Invalid Shared Folder ID configured");
    const parentQuery = parentId ? ` and '${parentId}' in parents` : "";
    const query = encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false${parentQuery}`);
    const res = await this.driveRequest(`https://www.googleapis.com/drive/v3/files?q=${query}&supportsAllDrives=true&includeItemsFromAllDrives=true`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.files && data.files.length > 0) return data.files[0].id;

    const requestBody = { name: folderName, mimeType: 'application/vnd.google-apps.folder' };
    if (parentId) requestBody.parents = [parentId];

    const createRes = await this.driveRequest('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
    const createData = await createRes.json();
    if (!createData.id) throw new Error(`Folder creation returned no ID for "${folderName}" — response: ${JSON.stringify(createData)}`);
    return createData.id;
  }

  // 6. Get or Create Visible CSV File
  static async getOrCreateCsvFile(token, folderId, fileName) {
    const query = encodeURIComponent(`name='${fileName}' and '${folderId}' in parents and trashed=false`);
    const res = await this.driveRequest(`https://www.googleapis.com/drive/v3/files?q=${query}&supportsAllDrives=true&includeItemsFromAllDrives=true`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.files && data.files.length > 0) return data.files[0].id;

    const createRes = await this.driveRequest('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: fileName, parents: [folderId] })
    });
    const createData = await createRes.json();
    if (!createData.id) throw new Error(`File creation returned no ID for "${fileName}" — response: ${JSON.stringify(createData)}`);
    return createData.id;
  }

  // 7. Extract Image to Drive
  static async uploadImageToDrive(token, baseDataUri, fileName, folderId) {
    const query = encodeURIComponent(`name='${fileName}' and '${folderId}' in parents and trashed=false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&supportsAllDrives=true&includeItemsFromAllDrives=true`, {
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
  static async exportDataCategory(token, dataArray, rootFolderName, fileNamePrefix, conversionFunction, xlsxConversionFunction) {
      console.log(`ParaNote: Exporting to /${rootFolderName}/ folder...`);
      const parentId = await this.getSharedFolderId();
      if (!parentId) throw new Error("Shared Folder ID not configured");
      const rootFolderId = await this.getOrCreateFolder(token, rootFolderName, parentId);

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
        const csvFileId  = await this.getOrCreateCsvFile(token, labFolderId, `${fileNamePrefix}_export.csv`);
        const xlsxFileId = await this.getOrCreateCsvFile(token, labFolderId, `${fileNamePrefix}_export.xlsx`);
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

        // --- CSV upload ---
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

        // --- XLSX upload (mirror of CSV) ---
        const xlsxData = xlsxConversionFunction(exportArray);
        const xlsxRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${xlsxFileId}?uploadType=media`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          },
          body: new Uint8Array(xlsxData)
        });
        if (!xlsxRes.ok) throw new Error(`XLSX Upload Failed for ${labName}`);
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
        await this.exportDataCategory(token, localData.issuesDatabase, 'lab_issues', 'issues', this.convertIssuesToCSV, this.convertIssuesToXlsx);
      }
      if (localData.notesDatabase && localData.notesDatabase.length > 0) {
        await this.exportDataCategory(token, localData.notesDatabase, 'notes', 'notes', this.convertNotesToCSV, this.convertNotesToXlsx);
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
// background.js - Manifest V3 Service Worker

chrome.runtime.onInstalled.addListener(() => {
  console.log("ParaNote Extension Installed.");
  chrome.storage.local.set({ notesDatabase: [] });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 1. FETCH NOTES LOGIC
  if (request.action === "FETCH_NOTES_FOR_URL") {
    const tabUrl = sender.tab ? sender.tab.url : null;
    if (tabUrl) {
      const currentUrl = new URL(tabUrl).hostname;
      chrome.storage.local.get(['notesDatabase'], (result) => {
         const db = result.notesDatabase || [];
         const siteNotes = db.filter(note => note.domain === currentUrl);
         sendResponse({ success: true, notes: siteNotes });
      });
    }
    return true; 
  }
  
  // 2. ACTUAL SAVE LOGIC
  if (request.action === "SAVE_NOTE") {
     chrome.storage.local.get(['notesDatabase'], (result) => {
       const db = result.notesDatabase || [];
       const domain = sender.tab && sender.tab.url ? new URL(sender.tab.url).hostname : "unknown";
       
       const newNote = { 
         hash: request.payload.hash,
         content: request.payload.content,
         url: request.payload.url,
         domain: domain,
         timestamp: request.payload.timestamp
       };
       
       const existingIndex = db.findIndex(n => n.hash === newNote.hash && n.domain === newNote.domain);
       if (existingIndex !== -1) {
         db[existingIndex] = newNote;
       } else {
         db.push(newNote);
       }
       
       chrome.storage.local.set({ notesDatabase: db }, () => {
         sendResponse({ success: true });
       });
     });
     
     return true; 
  }
});
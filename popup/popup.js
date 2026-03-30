// popup/popup.js

const statusMsg = document.getElementById('status-msg');

// --- ROUTE 1: Messages to the active Web Page (Content Script) ---
function sendToPage(actionName) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].id) {
      chrome.tabs.sendMessage(tabs[0].id, { action: actionName }, (response) => {
        if (chrome.runtime.lastError) {
          statusMsg.innerText = "Error: Refresh the page.";
          statusMsg.style.color = "#ea4335";
        } else {
          window.close(); 
        }
      });
    }
  });
}

// --- ROUTE 2: Messages to the Extension Core (Background Script) ---
function sendToCloud(actionName, loadingText) {
  statusMsg.innerText = loadingText;
  statusMsg.style.color = "#5f6368";
  
  // Disable buttons while syncing
  document.querySelectorAll('button').forEach(b => b.disabled = true);

  chrome.runtime.sendMessage({ action: actionName }, (response) => {
    document.querySelectorAll('button').forEach(b => b.disabled = false);
    
    if (response && response.success) {
      statusMsg.innerText = "Success! ✅";
      statusMsg.style.color = "#34a853";
      setTimeout(() => window.close(), 1500); // Close after showing success
    } else {
      statusMsg.innerText = "Sync Failed ❌";
      statusMsg.style.color = "#ea4335";
    }
  });
}

// Bind Page Events
document.getElementById('btn-add').addEventListener('click', () => sendToPage("START_ADDING"));
document.getElementById('btn-view').addEventListener('click', () => sendToPage("SHOW_SUMMARY"));
document.getElementById('btn-quit').addEventListener('click', () => sendToPage("STOP_APP"));

// Bind Cloud Events
document.getElementById('btn-backup').addEventListener('click', () => sendToCloud("BACKUP_TO_CLOUD", "Backing up to Drive..."));
document.getElementById('btn-restore').addEventListener('click', () => sendToCloud("RESTORE_FROM_CLOUD", "Downloading from Drive..."));
// popup/popup.js

function sendCommand(actionName) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].id) {
      // Send the message, and ONLY close the popup in the callback
      chrome.tabs.sendMessage(tabs[0].id, { action: actionName }, (response) => {
        // We catch chrome.runtime.lastError to prevent console errors if the page isn't ready
        if (chrome.runtime.lastError) {
          console.warn("ParaNote: Could not connect to the webpage. Please refresh the page.");
        } else {
          window.close(); // Safely close the menu now
        }
      });
    }
  });
}

document.getElementById('btn-add').addEventListener('click', () => sendCommand("START_ADDING"));
document.getElementById('btn-view').addEventListener('click', () => sendCommand("SHOW_SUMMARY"));
document.getElementById('btn-quit').addEventListener('click', () => sendCommand("STOP_APP"));
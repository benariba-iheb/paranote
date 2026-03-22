// content/content.js - Integrated On-Page Display Architecture

// ==========================================
// 1. UI COMPONENTS (Shadow DOM)
// ==========================================

// --- THE EDITOR (For ADDING Notes) ---
// This class manages the input popup. (Unchanged from previous functional version)
class ParaNoteEditor {
  constructor() {
    this.hostElement = document.createElement('div');
    this.hostElement.id = 'paranote-editor-host';
    this.hostElement.style.cssText = 'display: none; position: absolute; z-index: 2147483647; pointer-events: auto;';
    this.shadowRoot = this.hostElement.attachShadow({ mode: 'open' });
    this.currentHash = null;

    this.shadowRoot.innerHTML = `
      <style>
        .editor-container { background: #fff; border: 1px solid #dadce0; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); width: 300px; padding: 12px; display: flex; flex-direction: column; gap: 8px; font-family: sans-serif; box-sizing: border-box;}
        textarea { width: 100%; height: 80px; border: 1px solid #ccc; border-radius: 4px; padding: 8px; font-size: 14px; box-sizing: border-box; resize: vertical; background: transparent; color: #202124;}
        .actions { display: flex; justify-content: flex-end; gap: 8px; }
        button { cursor: pointer; padding: 6px 12px; border: none; border-radius: 4px; font-size: 13px; font-weight: 500;}
        .btn-cancel { background: transparent; color: #5f6368; }
        .btn-cancel:hover { background: rgba(0,0,0,0.05); }
        .btn-save { background: #1a73e8; color: white; }
        .btn-save:hover { background: #1557b0; }
        @media (prefers-color-scheme: dark) {
          .editor-container { background: #202124; border-color: #5f6368; color: #e8eaed;}
          textarea { border-color: #5f6368; color: #e8eaed;}
          .btn-cancel { color: #80868b; }
          .btn-cancel:hover { background: rgba(255,255,255,0.05); }
        }
      </style>
      <div class="editor-container">
        <textarea id="note-input" placeholder="Type your note for this paragraph..."></textarea>
        <div class="actions">
          <button class="btn-cancel" id="btn-cancel">Cancel</button>
          <button class="btn-save" id="btn-save">Save Note</button>
        </div>
      </div>
    `;

    this.shadowRoot.getElementById('btn-cancel').addEventListener('click', () => this.close());
    this.shadowRoot.getElementById('btn-save').addEventListener('click', () => this.saveNote());
    document.body.appendChild(this.hostElement);
  }

  open(hash, x, y, existingText = "") {
    this.currentHash = hash;
    this.hostElement.style.display = 'block';
    this.hostElement.style.left = `${x}px`;
    this.hostElement.style.top = `${y}px`;
    const textarea = this.shadowRoot.getElementById('note-input');
    textarea.value = existingText;
    setTimeout(() => textarea.focus(), 10);
  }

  close() {
    this.hostElement.style.display = 'none';
    this.currentHash = null;
    this.shadowRoot.getElementById('note-input').value = '';
  }

saveNote() {
    const text = this.shadowRoot.getElementById('note-input').value.trim();
    if (!text) return this.close();
    chrome.runtime.sendMessage({ action: "SAVE_NOTE", payload: { hash: this.currentHash, content: text, url: window.location.href, timestamp: Date.now() } }, (response) => {
      if (response && response.success) {
        this.close();
        // Pass the actual content along with the hash!
        window.dispatchEvent(new CustomEvent('paranote-saved', { detail: { hash: this.currentHash, content: text } }));
      }
    });
  }
}

// --- NEW: THE DISPLAY CARD (For VIEWING Notes) ---
// This class creates an immutable note card anchored to a specific paragraph.
class ParaNoteDisplay {
  constructor(content, x, y) {
    this.hostElement = document.createElement('div');
    this.hostElement.className = 'paranote-display-host'; // Used for cleanup
    this.hostElement.style.cssText = `
      position: absolute;
      z-index: 2147483646; /* Slightly lower than editor */
      pointer-events: auto;
      width: 200px; /* Constrained width for sideline notes */
      left: ${x}px;
      top: ${y}px;
    `;
    this.shadowRoot = this.hostElement.attachShadow({ mode: 'open' });

    this.shadowRoot.innerHTML = `
      <style>
        .note-card {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          background: #ffffff;
          border: 1px solid #dadce0;
          border-left: 4px solid #34a853; /* Match highlight color */
          border-radius: 6px;
          padding: 10px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          color: #202124;
          box-sizing: border-box;
        }
        .note-content {
          font-size: 14px;
          line-height: 1.4;
          margin-bottom: 4px;
          word-wrap: break-word;
        }
        @media (prefers-color-scheme: dark) {
          .note-card { background: #2a2b2e; border-color: #5f6368; color: #e8eaed; box-shadow: 0 4px 10px rgba(0,0,0,0.3);}
          .note-content { color: #e8eaed;}
        }
      </style>
      <div class="note-card">
        <div class="note-content">${content}</div>
      </div>
    `;

    document.body.appendChild(this.hostElement);
  }
}

// Instantiate Global Components
const editorComponent = new ParaNoteEditor();


// ==========================================
// 2. STATE & CORE LOGIC
// ==========================================
let isAppActive = false;
let isViewModeActive = false; // Tracks if notes are currently visible on page
let activeAddButton = null;
let currentHoveredParagraph = null;
let hideButtonTimeout = null;
let loadedNotesData = []; // Store full note objects, not just hashes

function generateTextHash(str) {
  let hash = 0;
  if (str.length === 0) return hash.toString(16);
  for (let i = 0; i < str.length; i++) { hash = (hash << 5) - hash + str.charCodeAt(i); hash |= 0; }
  return hash.toString(16);
}

// --- The Hover Handlers (Add Note Button) ---
function handleMouseOver(event) {
  if (event.target === activeAddButton || (currentHoveredParagraph && currentHoveredParagraph.contains(event.target))) {
    clearTimeout(hideButtonTimeout);
    if (event.target === activeAddButton) return; 
  }
  
  const paragraph = event.target.closest('p');
  if (!paragraph || paragraph === currentHoveredParagraph) return;
  if (activeAddButton) activeAddButton.remove();
  
  currentHoveredParagraph = paragraph;
  
  // 1. Calculate the hash immediately to check for existing notes
  const textHash = generateTextHash(paragraph.textContent.trim());
  const existingNote = loadedNotesData.find(note => note.hash === textHash);
  
  // 2. Create the button, changing the text if a note already exists
  activeAddButton = document.createElement('button');
  activeAddButton.innerText = existingNote ? '✏️ Edit Note' : '📝 Add Note';
  activeAddButton.className = 'paranote-trigger-btn';
  
  const rect = paragraph.getBoundingClientRect();
  activeAddButton.style.top = `${window.scrollY + rect.top - 25}px`;
  activeAddButton.style.left = `${window.scrollX + rect.right - 80}px`;
  
  document.body.appendChild(activeAddButton);

  activeAddButton.addEventListener('click', (e) => {
    e.stopPropagation(); 
    const editorRect = paragraph.getBoundingClientRect();
    
    // 3. Pass the existing text (if any) into the editor when opening
    const textToLoad = existingNote ? existingNote.content : "";
    editorComponent.open(textHash, window.scrollX + editorRect.left, window.scrollY + editorRect.bottom + 10, textToLoad);
    
    activeAddButton.remove(); 
    activeAddButton = null;
  });
}

function handleMouseOut(event) {
  // Grace period to cross the gap
  if (currentHoveredParagraph && !currentHoveredParagraph.contains(event.relatedTarget) && event.relatedTarget !== activeAddButton) {
     hideButtonTimeout = setTimeout(() => {
       if (activeAddButton) { activeAddButton.remove(); activeAddButton = null; }
       currentHoveredParagraph = null;
     }, 300);
  }
}

// --- Highlight Function (Adds .paranote-highlighted class) ---
function applyHighlights(notesList) {
    if (!notesList || notesList.length === 0) return;
    const notesHashes = new Set(notesList.map(note => note.hash));
    document.querySelectorAll('p').forEach(p => {
        if (notesHashes.has(generateTextHash(p.textContent.trim()))) {
          p.classList.add('paranote-highlighted');
        }
    });
}

// ==========================================
// 3. EXTENSION COMMANDS (The Switchboard)
// ==========================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "START_ADDING") {
    startApp();
  } else if (request.action === "SHOW_SUMMARY") {
    showNotesOnPage();
  } else if (request.action === "STOP_APP") {
    stopApp();
  }
});

// COMMAND: Start Adding Notes
function startApp() {
  if (isAppActive) return; 
  isAppActive = true;
  console.log("ParaNote: Annotation Mode ON");

  // 1. Fetch existing notes for context and apply highlights
  chrome.runtime.sendMessage({ action: "FETCH_NOTES_FOR_URL" }, (response) => {
    if (response && response.success && response.notes.length > 0) {
      loadedNotesData = response.notes;
      applyHighlights(loadedNotesData);
    }
  });

  // 2. Attach hover listeners
  document.body.addEventListener('mouseover', handleMouseOver);
  document.body.addEventListener('mouseout', handleMouseOut);
}

// COMMAND: View Notes on Page (Anchored to Paragraphs)
function showNotesOnPage() {
    // If notes are already visible, this acts as a refresh/toggle
    hideVisibleNotes(); 
    isViewModeActive = true;
    console.log("ParaNote: Displaying all notes on page...");

    // Fetch fresh data (in case notes were updated)
    chrome.runtime.sendMessage({ action: "FETCH_NOTES_FOR_URL" }, (response) => {
        if (response && response.success && response.notes.length > 0) {
            loadedNotesData = response.notes;
            applyHighlights(loadedNotesData); // Ensure highlights are active

            // Create a lookup map for faster processing
            const notesMap = new Map(loadedNotesData.map(note => [note.hash, note.content]));

            // Scan the DOM for paragraphs matching the hashes
            document.querySelectorAll('p').forEach(p => {
                const hash = generateTextHash(p.textContent.trim());
                if (notesMap.has(hash)) {
                    // WE FOUND A MATCH!
                    const content = notesMap.get(hash);
                    
                    // Position: Aligned to Right-Top of paragraph
                    const rect = p.getBoundingClientRect();
                    // window.scrollX/Y is critical because we anchor to document.body
                    const x = window.scrollX + rect.right + 15; // 15px gutter to the right
                    const y = window.scrollY + rect.top; // Align to paragraph top

                    // Create the individual display card
                    new ParaNoteDisplay(content, x, y);
                }
            });
        }
    });
}

// Utility: Internal cleanup of the note cards
function hideVisibleNotes() {
    isViewModeActive = false;
    document.querySelectorAll('.paranote-display-host').forEach(el => el.remove());
}

// COMMAND: Stop App (Cleanup Everything)
function stopApp() {
  if (!isAppActive && !isViewModeActive) return;
  isAppActive = false;
  console.log("ParaNote: Shutting down...");

  // 1. Remove Add Note Listeners
  document.body.removeEventListener('mouseover', handleMouseOver);
  document.body.removeEventListener('mouseout', handleMouseOut);

  // 2. Clean up UI elements (Editor and anchored notes)
  if (activeAddButton) activeAddButton.remove();
  editorComponent.close();
  hideVisibleNotes();

  // 3. Remove Highlights
  document.querySelectorAll('.paranote-highlighted').forEach(p => {
    p.classList.remove('paranote-highlighted');
  });
}

// Listen for newly saved notes to update highlights instantly
// Listen for newly saved notes to update highlights instantly
window.addEventListener('paranote-saved', (e) => {
  // Check if we are updating an existing note, or adding a brand new one
  const existingIndex = loadedNotesData.findIndex(n => n.hash === e.detail.hash);
  if (existingIndex !== -1) {
    loadedNotesData[existingIndex].content = e.detail.content; // Update existing
  } else {
    loadedNotesData.push({ hash: e.detail.hash, content: e.detail.content }); // Add new
  }
  
  if (currentHoveredParagraph) {
    currentHoveredParagraph.classList.add('paranote-highlighted');
  }
});
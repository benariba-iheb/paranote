// content/content.js - Integrated On-Page Display Architecture

// ==========================================
// 1. UI COMPONENTS (Shadow DOM)
// ==========================================
import { createRoot } from "react-dom/client";
import { EditorOverlay } from "./components/Editor";
import styles from "../globals.css?inline";

const isLab = import.meta.env.VITE_APP_TARGET === 'lab';

const NOTE_TYPES = {
  "Note": "#34a853",
  "Content Typo": "#ff1500ff",
  "Image Typo": "#e7034fff",
  "User guide": "#cf2c0381",
  "Catalog Lab information": "#0c86e9a1",
  "Lab logo": "#0004ffff",
  "Quizzes": "#e88f1a6e",
  "Challenge validation": "#f4030334",
  "Sudoers Problem": "#d4006350",
  "Copy Command": "#fc3657ff",
  "Translation Error": "#664b00ff",
  "Service Down": "#ff9800",
  "Content Wrong": "#ff5722",
  "Instance creation": "#795548",
  "Terminal Problem": "#990033ff",
  "RDP Problem": "#202124",
  "Issue Fixed": "#4caf50",
  "Additional Info Required": "#ffeb3b",
  "No issue here": "#9e9e9e"
};

const globalStyles = document.createElement('style');
globalStyles.id = 'paranote-extension-global-css';
globalStyles.textContent = `
  /* === Keyframes === */
  @keyframes paranote-slide-in {
    from { opacity: 0; transform: translateX(8px) scale(0.96); }
    to   { opacity: 1; transform: translateX(0)  scale(1);    }
  }
  @keyframes paranote-fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes paranote-pop-in {
    0%   { opacity: 0; transform: scale(0.85); }
    60%  { transform: scale(1.04); }
    100% { opacity: 1; transform: scale(1); }
  }
  @keyframes paranote-highlight-pulse {
    0%   { background-color: rgba(255,255,255,0.06); }
    50%  { background-color: rgba(255,255,255,0.12); }
    100% { background-color: rgba(255,255,255,0.06); }
  }

  /* === Trigger Button === */
  .paranote-trigger-btn {
    position: absolute;
    z-index: 2147483647;
    background-color: #242424;
    color: #ffffff;
    border: 1px solid #333333;
    padding: 6px 14px;
    border-radius: 8px;
    cursor: pointer;
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    animation: paranote-pop-in 0.18s cubic-bezier(0.34,1.56,0.64,1) both;
    transition: transform 0.15s cubic-bezier(0.34,1.56,0.64,1),
                background-color 0.15s ease,
                box-shadow 0.15s ease,
                opacity 0.15s ease;
  }

  .paranote-trigger-btn:hover {
    background-color: #383838;
    transform: scale(1.06) translateY(-1px);
    box-shadow: 0 6px 16px rgba(0,0,0,0.35);
  }

  .paranote-trigger-btn:active {
    transform: scale(0.97);
    box-shadow: 0 2px 6px rgba(0,0,0,0.2);
  }

  /* === Highlighted Paragraph === */
  .paranote-highlighted {
    border-left: 4px solid !important;
    padding-left: 10px !important;
    transition: border-left-color 0.3s ease,
                background-color 0.3s ease,
                padding-left 0.2s ease;
    animation: paranote-highlight-pulse 2s ease-in-out 1;
  }

  /* === Display Card Host === */
  .paranote-display-host {
    animation: paranote-slide-in 0.22s cubic-bezier(0.34,1.56,0.64,1) both;
    transition: top 0.12s cubic-bezier(0.25, 0.46, 0.45, 0.94),
                left 0.12s cubic-bezier(0.25, 0.46, 0.45, 0.94),
                opacity 0.2s ease;
  }
`;
if (!document.getElementById('paranote-extension-global-css')) {
  document.head.appendChild(globalStyles);
}

// Global SVG Canvas for connecting lines
function getConnectorCanvas() {
  let canvas = document.getElementById('paranote-connector-canvas') as any;
  if (!canvas) {
    canvas = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    canvas.id = 'paranote-connector-canvas';
    canvas.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 1px;
      height: 1px;
      overflow: visible;
      pointer-events: none;
      z-index: 2147483644;
    `;
    document.body.appendChild(canvas);
  }
  return canvas;
}

// --- THE EDITOR (For ADDING Notes) ---
// This class manages the input popup.
class ParaNoteEditor {
  hostElement: HTMLElement;
  shadowRoot: ShadowRoot;
  currentHash: string | null;
  currentScreenshot: string | null;
  reactRoot: any;
  anchorElement: HTMLElement | null;
  mountPoint: HTMLElement;
  connectorPath: SVGPathElement;

  constructor() {
    this.hostElement = document.createElement('div');
    this.hostElement.id = 'paranote-editor-host';
    this.hostElement.style.cssText = 'display: none; position: absolute; z-index: 2147483647; pointer-events: auto;';
    this.shadowRoot = this.hostElement.attachShadow({ mode: 'open' });
    this.currentHash = null;
    this.currentScreenshot = null;
    this.reactRoot = createRoot(this.shadowRoot);

    // Inject Tailwind styles directly into shadow DOM
    const styleElement = document.createElement('style');
    styleElement.textContent = styles;
    this.shadowRoot.appendChild(styleElement);

    this.mountPoint = document.createElement('div');
    this.shadowRoot.appendChild(this.mountPoint);

    this.connectorPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    this.connectorPath.setAttribute("fill", "transparent");
    this.connectorPath.setAttribute("stroke-width", "2");
    this.connectorPath.setAttribute("stroke-dasharray", "4");
    this.connectorPath.style.display = 'none';

    document.body.appendChild(this.hostElement);
  }

  updatePosition() {
    if (!this.anchorElement) return;
    const rect = this.anchorElement.getBoundingClientRect();
    const x = window.scrollX + rect.left;
    const y = window.scrollY + rect.bottom + 10;
    this.hostElement.style.left = `${x}px`;
    this.hostElement.style.top = `${y}px`;

    const pX = window.scrollX + rect.left + 20; // 20px from left
    const pY = window.scrollY + rect.bottom;
    const eX = x + 20;
    const eY = y;

    this.connectorPath.setAttribute("d", `M ${pX} ${pY} C ${pX} ${pY + 15}, ${eX} ${eY - 15}, ${eX} ${eY}`);
    this.connectorPath.setAttribute("stroke", "#ffffff");
  }

  open(hash, existingText = "", screenshotDataUrl = null, type = null, anchorElement = null, mode = "issue", existingNote = null) {
    this.currentHash = hash;
    this.currentScreenshot = screenshotDataUrl;
    this.anchorElement = anchorElement;

    this.hostElement.style.display = 'block';

    const canvas = getConnectorCanvas();
    if (!canvas.contains(this.connectorPath)) {
      canvas.appendChild(this.connectorPath);
    }
    this.connectorPath.style.display = 'block';

    this.updatePosition();

    this.reactRoot.render(
      <EditorOverlay
        mode={mode}
        initialText={existingText}
        initialType={type}
        screenshotUrl={screenshotDataUrl}
        existingNote={existingNote}
        onClose={() => this.close()}
        onSave={(text: string, image: string, selectedType: string, labComment?: string, labFixType?: string) => this.finalizeSave(text, image, selectedType, labComment, labFixType)}
        onDelete={() => this.deleteNote()}
      />
    );
  }

  close() {
    this.hostElement.style.display = 'none';
    if (this.connectorPath && this.connectorPath.parentNode) {
      this.connectorPath.parentNode.removeChild(this.connectorPath);
    }
    this.connectorPath.style.display = 'none';
    this.currentHash = null;
    this.currentScreenshot = null;
    this.reactRoot.render(null); // Unmount
  }

  deleteNote() {
    chrome.runtime.sendMessage({ action: "DELETE_NOTE", hash: this.currentHash }, (response) => {
      if (response && response.success) {
        this.close();
        window.dispatchEvent(new CustomEvent('paranote-deleted', { detail: { hash: this.currentHash } }));
      }
    });
  }

  finalizeSave(text, screenshotDataUrl, typeDesc, labComment, labFixType) {
    const isIssue = typeDesc && typeDesc !== "Note";
    // Support app always tags new issues as Pending so the Lab team can triage them.
    // The Lab app preserves whatever resolution the user selected.
    const effectiveLabFixType = (!isLab && isIssue) ? "Pending" : (labFixType || null);

    const payload = {
      hash: this.currentHash,
      content: text,
      url: window.location.href,
      timestamp: Date.now(),
      type: typeDesc || "Content Typo",
      labComment: labComment || null,
      labFixType: effectiveLabFixType,
      taskContext: extractCurrentTaskAndSubtask()
    };
    if (screenshotDataUrl) {
      payload.screenshot = screenshotDataUrl;
    } else {
      payload.screenshot = null;
    }

    chrome.runtime.sendMessage({ action: "SAVE_NOTE", payload: payload }, (response) => {
      if (response && response.success) {
        this.close();
        window.dispatchEvent(new CustomEvent('paranote-saved', { detail: { hash: this.currentHash, content: text, screenshot: screenshotDataUrl, type: typeDesc, anchorElement: this.anchorElement } }));
      }
    });
  }
}


import { NoteCard } from "./components/NoteCard";

// --- NEW: THE DISPLAY CARD (For VIEWING Notes) ---
// This class creates an immutable note card anchored to a specific paragraph.
class ParaNoteDisplay {
  anchorElement: HTMLElement;
  hostElement: HTMLElement;
  shadowRoot: ShadowRoot;
  reactRoot: any;
  intersectionObserver: IntersectionObserver;
  updatePosition: () => void;
  connectorPath: SVGPathElement;

  constructor(noteData: any, anchorElement: HTMLElement) {
    this.anchorElement = anchorElement;
    this.hostElement = document.createElement('div') as any;
    this.hostElement.className = 'paranote-display-host'; // Used for cleanup
    this.hostElement.dataset.hash = noteData.hash;
    this.hostElement.style.cssText = `
      position: absolute;
      z-index: 2147483645; 
      pointer-events: auto;
      width: 250px; 
      transition: top 0.1s ease;
      display: none; /* Initially hidden until IntersectionObserver fires */
    `;
    this.shadowRoot = this.hostElement.attachShadow({ mode: 'open' });
    this.reactRoot = createRoot(this.shadowRoot);

    const styleElement = document.createElement('style');
    styleElement.textContent = styles;
    this.shadowRoot.appendChild(styleElement);

    const noteType = typeof noteData === 'object' && noteData.type ? noteData.type : "Content Typo";
    const typeColor = (NOTE_TYPES as any)[noteType] || "#34a853";

    this.connectorPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    this.connectorPath.setAttribute("fill", "transparent");
    this.connectorPath.setAttribute("stroke-width", "2");
    this.connectorPath.setAttribute("stroke-dasharray", "4");
    this.connectorPath.setAttribute("stroke", typeColor);

    const canvas = getConnectorCanvas();
    canvas.appendChild(this.connectorPath);

    this.updatePosition = () => {
      if (!this.anchorElement) return;
      const rect = this.anchorElement.getBoundingClientRect();
      const documentY = window.scrollY + rect.top;
      this.hostElement.dataset.originalY = documentY;
      const x = window.scrollX + rect.right + 15;
      this.hostElement.style.left = `${x}px`;
      if (!this.hostElement.style.top) this.hostElement.style.top = `${documentY}px`;

      const pX = window.scrollX + rect.right;
      const pY = window.scrollY + rect.top + rect.height / 2;

      const hostTop = parseFloat(this.hostElement.style.top) || documentY;
      const eX = x;
      const eY = hostTop + 20;

      this.connectorPath.setAttribute("d", `M ${pX} ${pY} C ${pX + 30} ${pY}, ${eX - 30} ${eY}, ${eX} ${eY}`);

      if (this.hostElement.style.display === 'none') {
        this.connectorPath.style.display = 'none';
      } else {
        this.connectorPath.style.display = 'block';
      }
    };
    this.updatePosition();
    this.hostElement.addEventListener('update-position', this.updatePosition);

    const contentHtml = typeof noteData === 'string' ? noteData : noteData.content;
    const screenshotHtml = (typeof noteData === 'object' && noteData.screenshot)
      ? noteData.screenshot : null;

    const contextHtml = (typeof noteData === 'object' && noteData.taskContext && noteData.taskContext.activeTask)
      ? `${noteData.taskContext.activeSubtask ? noteData.taskContext.activeSubtask : noteData.taskContext.activeTask}`
      : null;

    document.body.appendChild(this.hostElement);

    this.reactRoot.render(
      <NoteCard
        hash={noteData.hash}
        contentHtml={contentHtml}
        noteType={noteType}
        typeColor={typeColor}
        contextHtml={contextHtml}
        screenshotHtml={screenshotHtml}
        labComment={noteData.labComment || null}
        labFixType={noteData.labFixType || null}
        onDelete={(h: string) => {
          chrome.runtime.sendMessage({ action: "DELETE_NOTE", hash: h }, (response) => {
            if (response && response.success) {
              window.dispatchEvent(new CustomEvent('paranote-deleted', { detail: { hash: h } }));
            }
          });
        }}
        onHeightChange={() => window.dispatchEvent(new CustomEvent('paranote-layout-changed'))}
      />
    );

    this.intersectionObserver = new IntersectionObserver((entries) => {
      let changed = false;
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          if (this.hostElement.style.display === 'none') {
            this.hostElement.style.display = 'block';
            changed = true;
          }
        } else {
          if (this.hostElement.style.display !== 'none') {
            this.hostElement.style.display = 'none';
            changed = true;
          }
        }
      });
      if (changed) {
        this.updatePosition();
        window.dispatchEvent(new CustomEvent('paranote-layout-changed'));
      }
    }, { rootMargin: '150px' });

    if (this.anchorElement) {
      this.intersectionObserver.observe(this.anchorElement);
    }

    (this.hostElement as any).paranoteDestroy = () => {
      if (this.intersectionObserver) this.intersectionObserver.disconnect();
      if (this.connectorPath && this.connectorPath.parentNode) {
        this.connectorPath.parentNode.removeChild(this.connectorPath);
      }
      this.reactRoot.unmount();
      this.hostElement.remove();
    };
  }
}

// Instantiate Global Components
const editorComponent = new ParaNoteEditor();


// ==========================================
// 2. STATE & CORE LOGIC
// ==========================================
let isAppActive = false;
let isViewModeActive = false; // Tracks if notes are currently visible on page
let appAddingMode = null; // 'issue' or 'note'
let appViewingMode = null; // 'issue' or 'note'
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

  // Option A Enforced: Lab team cannot log new issues, only fix existing ones
  if (!existingNote && isLab && appAddingMode !== 'note') return;

  // 2. Create the button, changing the text if a note already exists
  activeAddButton = document.createElement('button');
  activeAddButton.className = 'paranote-trigger-btn';

  if (existingNote) {
    activeAddButton.innerText = appAddingMode === 'note' ? '✏️ Edit Note' : (isLab ? '✏️ Edit Fix' : '✏️ Edit Issue');
  } else {
    activeAddButton.innerText = appAddingMode === 'note' ? '📝 Take Note' : (isLab ? '🐞 Fix Issues' : '🐞 Log Issue');
  }

  const rect = paragraph.getBoundingClientRect();
  activeAddButton.style.top = `${window.scrollY + rect.top - 25}px`;
  activeAddButton.style.left = `${window.scrollX + rect.right - 80}px`;

  document.body.appendChild(activeAddButton);

  activeAddButton.addEventListener('click', (e) => {
    e.stopPropagation();
    const textToLoad = existingNote ? existingNote.content : "";
    const btn = activeAddButton;
    btn.style.display = 'none'; // hide button so it isn't in screenshot

    let screenshotToUse = existingNote ? existingNote.screenshot : null;
    let typeToUse = existingNote ? existingNote.type : (appAddingMode === 'note' ? "Note" : "Content Typo");

    editorComponent.open(textHash, textToLoad, screenshotToUse, typeToUse, paragraph, appAddingMode, existingNote);
    if (btn && btn.parentNode) btn.remove();
    if (activeAddButton === btn) activeAddButton = null;
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
  const notesMap = new Map(notesList.map(note => [note.hash, note]));
  document.querySelectorAll('p').forEach(p => {
    const hash = generateTextHash(p.textContent.trim());
    if (notesMap.has(hash)) {
      const noteData = notesMap.get(hash);
      p.classList.add('paranote-highlighted');
      p.style.setProperty('border-left-color', NOTE_TYPES[noteData.type] || '#34a853', 'important');
      if (noteData.type === "Note") {
        p.style.setProperty('background-color', 'rgba(52, 168, 83, 0.15)', 'important');
      } else {
        p.style.removeProperty('background-color');
      }
    }
  });
}

// --- Clear highlights for the OPPOSITE mode so note/issue highlights don't overlap ---
function clearHighlightsForMode(modeBeingActivated: string) {
  document.querySelectorAll('.paranote-highlighted').forEach((p: any) => {
    const hasBgGreen = p.style.getPropertyValue('background-color').includes('52, 168, 83');

    if (modeBeingActivated === 'issue' && hasBgGreen) {
      // Activating issue mode: strip green note highlights
      p.classList.remove('paranote-highlighted');
      p.style.removeProperty('border-left-color');
      p.style.removeProperty('background-color');
    } else if (modeBeingActivated === 'note' && !hasBgGreen) {
      // Activating note mode: strip coloured issue highlights (no green bg)
      p.classList.remove('paranote-highlighted');
      p.style.removeProperty('border-left-color');
      p.style.removeProperty('background-color');
    }
  });
}

// ==========================================
// 3. EXTENSION COMMANDS (The Switchboard)
// ==========================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "START_ADDING_ISSUE") {
    startApp('issue');
    sendResponse({ success: true });
  } else if (request.action === "START_ADDING_NOTE") {
    startApp('note');
    sendResponse({ success: true });
  } else if (request.action === "SHOW_SUMMARY_ISSUE") {
    showNotesOnPage('issue');
    sendResponse({ success: true });
  } else if (request.action === "SHOW_SUMMARY_NOTE") {
    showNotesOnPage('note');
    sendResponse({ success: true });
  } else if (request.action === "STOP_APP") {
    stopApp();
    sendResponse({ success: true });
  }
});

// Utility: Internal cleanup of the adding mode
function hideAddingMode() {
  isAppActive = false;
  document.body.removeEventListener('mouseover', handleMouseOver);
  document.body.removeEventListener('mouseout', handleMouseOut);
  if (activeAddButton) { activeAddButton.remove(); activeAddButton = null; }
  editorComponent.close();
}

// COMMAND: Start Adding Notes
function startApp(mode) {
  if (isAppActive) {
    if (appAddingMode === mode) return; // already active in this mode
    hideAddingMode(); // Hide adding mode before restarting
  } else if (isViewModeActive) {
    hideVisibleNotes(); // Disable view cards, but retain highlights
  }
  // Clear highlights for the opposite mode
  clearHighlightsForMode(mode);
  isAppActive = true;
  appAddingMode = mode;
  console.log("ParaNote: Annotation Mode ON - " + mode);

  // 1. Fetch existing notes for context and apply highlights
  chrome.runtime.sendMessage({ action: "FETCH_NOTES_FOR_URL" }, (response) => {
    if (response && response.success && response.notes.length > 0) {
      loadedNotesData = response.notes.filter(n => mode === 'note' ? n.type === "Note" : n.type !== "Note");
      applyHighlights(loadedNotesData);
    }
  });

  // 2. Attach hover listeners
  document.body.addEventListener('mouseover', handleMouseOver);
  document.body.addEventListener('mouseout', handleMouseOut);
}

function resolveLayout() {
  const hosts = Array.from(document.querySelectorAll('.paranote-display-host'));
  if (hosts.length === 0) return;

  hosts.sort((a, b) => {
    const aY = parseFloat(a.dataset.originalY || a.style.top);
    const bY = parseFloat(b.dataset.originalY || b.style.top);
    return aY - bY;
  });

  let currentY = 0;

  for (let i = 0; i < hosts.length; i++) {
    const host = hosts[i];
    if (host.style.display === 'none') continue;

    const intendedY = parseFloat(host.dataset.originalY || host.style.top);
    if (!host.dataset.originalY) host.dataset.originalY = intendedY;

    const actualY = Math.max(intendedY, currentY);
    host.style.top = `${actualY}px`;
    host.dispatchEvent(new CustomEvent('update-position'));

    const height = host.offsetHeight || 150; // Fallback in case it's not rendered yet
    currentY = actualY + height + 15;
  }
}

window.addEventListener('paranote-layout-changed', () => {
  resolveLayout();
});

let isScrolling = false;
window.addEventListener('scroll', () => {
  if (!isViewModeActive && (!isAppActive || editorComponent.hostElement.style.display !== 'block')) return;
  if (!isScrolling) {
    window.requestAnimationFrame(() => {
      if (isViewModeActive) {
        document.querySelectorAll('.paranote-display-host').forEach(host => {
          host.dispatchEvent(new CustomEvent('update-position'));
        });
        resolveLayout();
      }
      if (isAppActive && editorComponent.hostElement.style.display === 'block') {
        editorComponent.updatePosition();
      }
      isScrolling = false;
    });
    isScrolling = true;
  }
}, { capture: true, passive: true });

// COMMAND: View Notes on Page (Anchored to Paragraphs)
function showNotesOnPage(mode) {
  // If notes are exactly what is currently showing, toggle them off
  if (isViewModeActive && appViewingMode === mode) {
    hideVisibleNotes();
    console.log("ParaNote: Toggled " + mode + " display OFF.");
    return;
  }

  // Vice versa: if adding mode is turned on, disable it so we can view them freely
  if (isAppActive) {
    hideAddingMode();
  }

  hideVisibleNotes();
  isViewModeActive = true;
  appViewingMode = mode;
  // Clear highlights for the opposite mode before showing this type
  clearHighlightsForMode(mode);
  console.log("ParaNote: Displaying all " + mode + "s on page...");

  // Fetch fresh data (in case notes were updated)
  chrome.runtime.sendMessage({ action: "FETCH_NOTES_FOR_URL" }, (response) => {
    if (response && response.success && response.notes.length > 0) {
      loadedNotesData = response.notes.filter(n => mode === 'note' ? n.type === "Note" : n.type !== "Note");
      applyHighlights(loadedNotesData); // Ensure highlights are active

      // Create a lookup map for faster processing
      const notesMap = new Map(loadedNotesData.map(note => [note.hash, note]));

      // Scan the DOM for paragraphs matching the hashes
      document.querySelectorAll('p').forEach(p => {
        const hash = generateTextHash(p.textContent.trim());
        if (notesMap.has(hash)) {
          // WE FOUND A MATCH!
          const noteData = notesMap.get(hash);
          new ParaNoteDisplay(noteData, p);
        }
      });

      setTimeout(() => resolveLayout(), 100);
    }
  });
}

// Utility: Internal cleanup of the note cards
function hideVisibleNotes() {
  isViewModeActive = false;
  document.querySelectorAll('.paranote-display-host').forEach((el: any) => {
    if (el.paranoteDestroy) el.paranoteDestroy();
    else el.remove();
  });
  // Also strip all paragraph highlights so nothing lingers after hiding
  document.querySelectorAll('.paranote-highlighted').forEach((p: any) => {
    p.classList.remove('paranote-highlighted');
    p.style.removeProperty('border-left-color');
    p.style.removeProperty('background-color');
  });
}

// COMMAND: Stop App (Cleanup Everything)
function stopApp() {
  console.log("ParaNote: Shutting down...");

  // 1 & 2. Clean up UI elements (Editor and anchored notes)
  hideAddingMode();
  hideVisibleNotes();

  // 3. Remove Highlights
  document.querySelectorAll('.paranote-highlighted').forEach(p => {
    p.classList.remove('paranote-highlighted');
    p.style.removeProperty('border-left-color');
    p.style.removeProperty('background-color');
  });
}

// Listen for DELETIONS to remove highlights and UI
window.addEventListener('paranote-deleted', (e) => {
  const hash = e.detail.hash;

  // Remove from in-memory array
  loadedNotesData = loadedNotesData.filter(n => n.hash !== hash);

  // Remove highlight
  document.querySelectorAll('p').forEach(p => {
    if (generateTextHash(p.textContent.trim()) === hash) {
      p.classList.remove('paranote-highlighted');
      p.style.removeProperty('border-left-color');
      p.style.removeProperty('background-color');
    }
  });

  if (isViewModeActive) {
    showNotesOnPage();
  }
});

// Listen for newly saved notes to update highlights instantly
window.addEventListener('paranote-saved', (e) => {
  chrome.runtime.sendMessage({ action: "FETCH_NOTES_FOR_URL" }, (response) => {
    if (response && response.success && response.notes.length > 0) {
      loadedNotesData = response.notes.filter(n => appAddingMode === 'note' ? n.type === "Note" : n.type !== "Note");
      applyHighlights(loadedNotesData);
    }
  });
});

// ==========================================
// 4. LabLabee Context Extraction
// ==========================================
function extractCurrentTaskAndSubtask() {
  let activeTask = "Unknown Task";
  let activeSubtask = null;
  let labName = document.title ? document.title.replace(/[^a-zA-Z0-9 -_]/g, '').trim() : "General";

  const headers = document.querySelectorAll('span, h1, h2, h3, h4, h5, div');
  for (const h of headers) {
    if (h.textContent && h.textContent.includes('| Learning Challenges')) {
      const parts = h.textContent.split('|');
      if (parts.length > 0) {
        let rawName = parts[0].replace('<', '');
        // Erase concatenated navigation menu text
        rawName = rawName.replace('DashboardCatalogLabsLearning PathsSandboxesSkill TestsLabLabee AIHelp CenterSettings', '');
        labName = rawName.trim().replace(/[^a-zA-Z0-9 -_]/g, '');
        break;
      }
    }
  }

  const sidebar = document.getElementById('sidebarStyledPaper');
  if (!sidebar) return null; // Not on LabLabee or missing sidebar

  const menuItems = sidebar.querySelectorAll('.MuiMenuItem-root');
  for (const item of menuItems) {
    if (item.style.borderLeft && item.style.borderLeft.includes('rgb(31, 28, 86)')) {
      const textEl = item.querySelector('.MuiTypography-root');
      if (textEl) activeTask = textEl.textContent.trim();
    }
    if (item.style.backgroundColor && item.style.backgroundColor.includes('rgb(238, 238, 238)')) {
      const textEl = item.querySelector('.MuiTypography-root');
      if (textEl) activeSubtask = textEl.textContent.trim();
    }
  }

  return { activeTask, activeSubtask, labName };
}
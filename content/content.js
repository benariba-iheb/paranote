// content/content.js - Integrated On-Page Display Architecture

// ==========================================
// 1. UI COMPONENTS (Shadow DOM)
// ==========================================

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
  "RDP Problem": "#202124"
};

// --- THE EDITOR (For ADDING Notes) ---
// This class manages the input popup.
class ParaNoteEditor {
  constructor() {
    this.hostElement = document.createElement('div');
    this.hostElement.id = 'paranote-editor-host';
    this.hostElement.style.cssText = 'display: none; position: absolute; z-index: 2147483647; pointer-events: auto;';
    this.shadowRoot = this.hostElement.attachShadow({ mode: 'open' });
    this.currentHash = null;
    this.currentScreenshot = null;

    this.shadowRoot.innerHTML = `
      <style>
        .editor-container { background: #fff; border: 1px solid #dadce0; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); width: 300px; padding: 12px; display: flex; flex-direction: column; gap: 8px; font-family: sans-serif; box-sizing: border-box;}
        textarea { width: 100%; height: 80px; border: 1px solid #ccc; border-radius: 4px; padding: 8px; font-size: 14px; box-sizing: border-box; resize: vertical; background: transparent; color: #202124;}
        .preview-container { position: relative; width: 100%; display: none; }
        .preview-img { max-width: 100%; max-height: 120px; border-radius: 4px; object-fit: contain; background: #f1f3f4; border: 1px solid #e8eaed; display: block; margin: 0 auto; }
        .btn-remove-img { position: absolute; top: -8px; right: -8px; background: #ea4335; color: white; border: none; border-radius: 50%; width: 22px; height: 22px; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
        .btn-remove-img:hover { background: #c5221f; }
        .actions { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
        .type-selector-wrapper { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
        select { flex-grow: 1; padding: 6px; border-radius: 4px; border: 1px solid #ccc; font-size: 13px; background: white; color: #202124; cursor: pointer; outline: none; }
        select:focus { border-color: #1a73e8; }
        .color-dot { width: 12px; height: 12px; min-width: 12px; border-radius: 50%; display: inline-block; background-color: #ea4335; box-shadow: 0 1px 2px rgba(0,0,0,0.2); }
        .right-actions { display: flex; gap: 8px; }
        .file-upload-label { font-size: 13px; color: #1a73e8; cursor: pointer; display: flex; align-items: center; gap: 4px; font-weight: 500;}
        .file-upload-label:hover { text-decoration: underline; }
        #image-upload { display: none; }
        button { cursor: pointer; padding: 6px 12px; border: none; border-radius: 4px; font-size: 13px; font-weight: 500;}
        .btn-cancel { background: transparent; color: #5f6368; }
        .btn-cancel:hover { background: rgba(0,0,0,0.05); }
        .btn-save { background: #1a73e8; color: white; }
        .btn-save:hover { background: #1557b0; }
        @media (prefers-color-scheme: dark) {
          .editor-container { background: #202124; border-color: #5f6368; color: #e8eaed;}
          textarea { border-color: #5f6368; color: #e8eaed;}
          .preview-img { background: #303134; border-color: #5f6368; }
          .btn-cancel { color: #80868b; }
          .btn-cancel:hover { background: rgba(255,255,255,0.05); }
          .file-upload-label { color: #8ab4f8; }
        }
      </style>
      <div class="editor-container">
        <div class="type-selector-wrapper">
          <span id="type-color-dot" class="color-dot"></span>
          <select id="note-type-select">
            ${Object.keys(NOTE_TYPES).map(t => `<option value="${t}">${t}</option>`).join('')}
          </select>
        </div>
        <textarea id="note-input" placeholder="Type a note or paste an image from clipboard..."></textarea>
        <div id="preview-wrapper" class="preview-container" style="margin-top: 4px;">
          <img id="preview-img" class="preview-img" alt="Screenshot preview" />
          <button id="btn-remove-img" class="btn-remove-img" title="Remove Image">✕</button>
        </div>
        <div class="actions">
          <label class="file-upload-label" for="image-upload">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
            Attach Image
          </label>
          <input type="file" id="image-upload" accept="image/*" />
          <div class="right-actions">
            <button class="btn-cancel" id="btn-cancel">Cancel</button>
            <button class="btn-save" id="btn-save">Save Note</button>
          </div>
        </div>
      </div>
    `;

    const noteInput = this.shadowRoot.getElementById('note-input');
    noteInput.addEventListener('paste', (e) => {
      const items = e.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (!file) continue;

          const reader = new FileReader();
          reader.onload = (event) => {
            const dataUrl = event.target.result;
            this.currentScreenshot = dataUrl;
            const previewImg = this.shadowRoot.getElementById('preview-img');
            const previewWrapper = this.shadowRoot.getElementById('preview-wrapper');
            previewImg.src = dataUrl;
            previewWrapper.style.display = 'block';
          };
          reader.readAsDataURL(file);
        }
      }
    });

    this.shadowRoot.getElementById('btn-cancel').addEventListener('click', () => this.close());
    this.shadowRoot.getElementById('btn-save').addEventListener('click', () => this.saveNote());
    this.shadowRoot.getElementById('btn-remove-img').addEventListener('click', () => this.removeScreenshot());
    this.shadowRoot.getElementById('image-upload').addEventListener('change', (e) => this.handleImageUpload(e));

    const typeSelect = this.shadowRoot.getElementById('note-type-select');
    const colorDot = this.shadowRoot.getElementById('type-color-dot');
    typeSelect.addEventListener('change', (e) => {
      colorDot.style.backgroundColor = NOTE_TYPES[e.target.value] || "#ea4335";
    });

    document.body.appendChild(this.hostElement);
  }

  updatePosition() {
    if (!this.anchorElement) return;
    const rect = this.anchorElement.getBoundingClientRect();
    const x = window.scrollX + rect.left;
    const y = window.scrollY + rect.bottom + 10;
    this.hostElement.style.left = `${x}px`;
    this.hostElement.style.top = `${y}px`;
  }

  open(hash, existingText = "", screenshotDataUrl = null, type = null, anchorElement = null, mode = "issue") {
    this.currentHash = hash;
    this.currentScreenshot = screenshotDataUrl;
    this.anchorElement = anchorElement;

    this.hostElement.style.display = 'block';
    this.updatePosition();

    const textarea = this.shadowRoot.getElementById('note-input');
    textarea.value = existingText;

    const typeSelect = this.shadowRoot.getElementById('note-type-select');
    const colorDot = this.shadowRoot.getElementById('type-color-dot');

    // Dynamically build dropdown options
    typeSelect.innerHTML = '';
    const availableTypes = Object.keys(NOTE_TYPES).filter(t =>
      mode === 'note' ? t === "Note" : t !== "Note"
    );

    availableTypes.forEach(t => {
      const option = document.createElement('option');
      option.value = t;
      option.textContent = t;
      typeSelect.appendChild(option);
    });

    const wrapper = this.shadowRoot.querySelector('.type-selector-wrapper');
    if (mode === 'note') {
      wrapper.style.display = 'none';
    } else {
      wrapper.style.display = 'flex';
      typeSelect.disabled = availableTypes.length <= 1;
    }

    if (type && availableTypes.includes(type)) {
      typeSelect.value = type;
    } else if (availableTypes.length > 0) {
      typeSelect.selectedIndex = 0; // Default to first available
    }

    colorDot.style.backgroundColor = NOTE_TYPES[typeSelect.value] || "#ea4335";

    const previewWrapper = this.shadowRoot.getElementById('preview-wrapper');
    const previewImg = this.shadowRoot.getElementById('preview-img');
    if (screenshotDataUrl) {
      previewImg.src = screenshotDataUrl;
      previewWrapper.style.display = 'block';
    } else {
      previewImg.src = '';
      previewWrapper.style.display = 'none';
    }

    setTimeout(() => textarea.focus(), 10);
  }

  handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target.result;
      this.currentScreenshot = dataUrl;
      const previewImg = this.shadowRoot.getElementById('preview-img');
      const previewWrapper = this.shadowRoot.getElementById('preview-wrapper');
      previewImg.src = dataUrl;
      previewWrapper.style.display = 'block';
    };
    reader.readAsDataURL(file);
  }

  removeScreenshot() {
    this.currentScreenshot = null;
    const previewWrapper = this.shadowRoot.getElementById('preview-wrapper');
    const previewImg = this.shadowRoot.getElementById('preview-img');
    if (previewWrapper) {
      previewImg.src = '';
      previewWrapper.style.display = 'none';
    }
    const fileInput = this.shadowRoot.getElementById('image-upload');
    if (fileInput) fileInput.value = '';
  }

  close() {
    this.hostElement.style.display = 'none';
    this.currentHash = null;
    this.currentScreenshot = null;
    this.shadowRoot.getElementById('note-input').value = '';

    const previewWrapper = this.shadowRoot.getElementById('preview-wrapper');
    if (previewWrapper) {
      this.shadowRoot.getElementById('preview-img').src = '';
      previewWrapper.style.display = 'none';
    }
    const fileInput = this.shadowRoot.getElementById('image-upload');
    if (fileInput) fileInput.value = '';
  }

  saveNote() {
    const text = this.shadowRoot.getElementById('note-input').value.trim();
    if (!text && !this.currentScreenshot) {
      if (this.currentHash) this.deleteNote();
      else this.close();
      return;
    }

    const selectedType = this.shadowRoot.getElementById('note-type-select').value;
    this.finalizeSave(text, this.currentScreenshot, selectedType);
  }

  deleteNote() {
    chrome.runtime.sendMessage({ action: "DELETE_NOTE", hash: this.currentHash }, (response) => {
      if (response && response.success) {
        this.close();
        window.dispatchEvent(new CustomEvent('paranote-deleted', { detail: { hash: this.currentHash } }));
      }
    });
  }

  finalizeSave(text, screenshotDataUrl, typeDesc) {
    const payload = {
      hash: this.currentHash,
      content: text,
      url: window.location.href,
      timestamp: Date.now(),
      type: typeDesc || "Content Typo",
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

// --- NEW: THE DISPLAY CARD (For VIEWING Notes) ---
// This class creates an immutable note card anchored to a specific paragraph.
class ParaNoteDisplay {
  constructor(noteData, anchorElement) {
    this.anchorElement = anchorElement;
    this.hostElement = document.createElement('div');
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

    this.updatePosition = () => {
      if (!this.anchorElement) return;
      const rect = this.anchorElement.getBoundingClientRect();
      const documentY = window.scrollY + rect.top;
      this.hostElement.dataset.originalY = documentY;
      const x = window.scrollX + rect.right + 15;
      this.hostElement.style.left = `${x}px`;
      if (!this.hostElement.style.top) this.hostElement.style.top = `${documentY}px`;
    };
    this.updatePosition();
    this.hostElement.addEventListener('update-position', this.updatePosition);

    const contentHtml = typeof noteData === 'string' ? noteData : noteData.content;
    const noteType = typeof noteData === 'object' && noteData.type ? noteData.type : "Content Typo";
    const typeColor = NOTE_TYPES[noteType] || "#34a853";

    const screenshotHtml = (typeof noteData === 'object' && noteData.screenshot)
      ? `<img src="${noteData.screenshot}" class="note-screenshot" alt="Paragraph snapshot" />`
      : '';

    const contextHtml = (typeof noteData === 'object' && noteData.taskContext && noteData.taskContext.activeTask)
      ? `<div class="task-context" title="${noteData.taskContext.activeTask}${noteData.taskContext.activeSubtask ? ' / ' + noteData.taskContext.activeSubtask : ''}">${noteData.taskContext.activeSubtask ? noteData.taskContext.activeSubtask : noteData.taskContext.activeTask}</div>`
      : '';

    this.shadowRoot.innerHTML = `
      <style>
        .note-card {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          background: #ffffff;
          border: 1px solid #dadce0;
          border-left: 4px solid ${typeColor};
          border-radius: 6px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          color: #202124;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          position: relative;
        }
        .type-badge {
          align-self: flex-start;
          background-color: ${typeColor}15; /* 15 hex = ~8% opacity */
          color: ${typeColor};
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
          margin: 10px 10px 0 10px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .task-context {
          align-self: flex-start;
          background: #f1f3f4;
          color: #5f6368;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 10px;
          margin: 4px 10px 0 10px;
          font-style: italic;
          display: inline-block;
          max-width: 90%;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .btn-delete-card {
          position: absolute;
          top: 4px;
          right: 4px;
          width: 24px;
          height: 24px;
          border: none;
          background: transparent;
          color: #5f6368;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          opacity: 0;
          transition: opacity 0.2s, background 0.2s;
          z-index: 10;
        }
        .note-card:hover .btn-delete-card {
          opacity: 1;
        }
        .btn-delete-card:hover {
          background: rgba(0,0,0,0.1);
          color: #d93025;
        }
        .content-wrapper {
          padding: 10px;
          overflow: hidden;
          transition: max-height 0.3s ease;
        }
        .content-wrapper.collapsed {
          max-height: 80px;
          mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
          -webkit-mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
        }
        .note-content {
          font-size: 14px;
          line-height: 1.4;
          margin-bottom: 4px;
          word-wrap: break-word;
        }
        .note-screenshot {
          max-width: 100%;
          border-radius: 4px;
          margin-top: 8px;
          border: 1px solid #e8eaed;
          box-sizing: border-box;
          cursor: zoom-in;
        }
        .toggle-btn {
          display: none;
          width: 100%;
          border: none;
          border-top: 1px solid #dadce0;
          background: #f8f9fa;
          color: #5f6368;
          padding: 6px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 500;
          border-radius: 0 0 6px 6px;
        }
        .toggle-btn:hover { background: #f1f3f4; }
        .note-card.is-collapsed .btn-expand { display: block; }
        .note-card.is-expanded .btn-collapse { display: block; }
        
        .overlay {
          display: none;
          position: fixed;
          top: 0; left: 0; width: 100vw; height: 100vh;
          background: rgba(0, 0, 0, 0.8);
          z-index: 2147483647;
          align-items: center;
          justify-content: center;
          cursor: zoom-out;
        }
        .overlay.active {
          display: flex;
        }
        .overlay img {
          max-width: 90vw;
          max-height: 90vh;
          border-radius: 8px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        }
        @media (prefers-color-scheme: dark) {
          .note-card { background: #2a2b2e; border-color: #5f6368; color: #e8eaed; box-shadow: 0 4px 10px rgba(0,0,0,0.3);}
          .note-content { color: #e8eaed;}
          .note-screenshot { border-color: #5f6368; }
          .toggle-btn { background: #303134; border-color: #5f6368; color: #8ab4f8; }
          .toggle-btn:hover { background: #3c4043; }
          .btn-delete-card { color: #9aa0a6; }
          .btn-delete-card:hover { background: rgba(255,255,255,0.1); color: #f28b82; }
        }
      </style>
      <div class="note-card" id="card">
        <button class="btn-delete-card" id="btn-delete" title="Delete Note">✕</button>
        <div class="type-badge">${noteType}</div>
        ${contextHtml}
        <div class="content-wrapper" id="wrapper">
          <div class="note-content">${contentHtml}</div>
          ${screenshotHtml}
        </div>
        <button class="toggle-btn btn-expand" id="btn-expand">▼ Show more</button>
        <button class="toggle-btn btn-collapse" id="btn-collapse">▲ Show less</button>
      </div>
      <div class="overlay" id="overlay">
        ${typeof noteData === 'object' && noteData.screenshot ? `<img src="${noteData.screenshot}">` : ''}
      </div>
    `;

    document.body.appendChild(this.hostElement);

    this.isManuallyExpanded = false;
    this.isCollapsed = false;

    const card = this.shadowRoot.getElementById('card');
    const wrapper = this.shadowRoot.getElementById('wrapper');
    const btnExpand = this.shadowRoot.getElementById('btn-expand');
    const btnCollapse = this.shadowRoot.getElementById('btn-collapse');
    const btnDelete = this.shadowRoot.getElementById('btn-delete');

    if (btnDelete) {
      btnDelete.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm("Delete this note?")) {
          chrome.runtime.sendMessage({ action: "DELETE_NOTE", hash: noteData.hash }, (response) => {
            if (response && response.success) {
              window.dispatchEvent(new CustomEvent('paranote-deleted', { detail: { hash: noteData.hash } }));
            }
          });
        }
      });
    }

    this.collapse = () => {
      if (this.isCollapsed) return;
      this.isCollapsed = true;
      wrapper.classList.add('collapsed');
      card.classList.add('is-collapsed');
      card.classList.remove('is-expanded');
      this.hostElement.style.zIndex = "2147483645";
    };

    this.expand = () => {
      if (!this.isCollapsed) return;
      this.isCollapsed = false;
      wrapper.classList.remove('collapsed');
      card.classList.remove('is-collapsed');
      card.classList.add('is-expanded');
      this.hostElement.style.zIndex = "2147483646";
    };

    const resizeObserver = new ResizeObserver(() => {
      if (this.isManuallyExpanded) return;
      if (wrapper.scrollHeight > 100 && !this.isCollapsed) {
        this.collapse();
      }
      window.dispatchEvent(new CustomEvent('paranote-layout-changed'));
    });
    resizeObserver.observe(card);

    btnExpand.addEventListener('click', () => {
      this.isManuallyExpanded = true;
      this.expand();
    });

    btnCollapse.addEventListener('click', () => {
      this.isManuallyExpanded = false;
      this.collapse();
    });

    const imgElement = this.shadowRoot.querySelector('.note-screenshot');
    if (imgElement) {
      imgElement.onload = () => window.dispatchEvent(new CustomEvent('paranote-layout-changed'));
    }

    if (typeof noteData === 'object' && noteData.screenshot) {
      const overlayEl = this.shadowRoot.getElementById('overlay');

      this.handleEsc = (e) => {
        if (e.key === 'Escape') this.closeOverlay();
      };

      this.closeOverlay = () => {
        overlayEl.classList.remove('active');
        window.removeEventListener('keydown', this.handleEsc);
      };

      imgElement.addEventListener('click', () => {
        overlayEl.classList.add('active');
        window.addEventListener('keydown', this.handleEsc);
      });

      overlayEl.addEventListener('click', () => {
        this.closeOverlay();
      });
    }

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
        window.dispatchEvent(new CustomEvent('paranote-layout-changed'));
      }
    }, { rootMargin: '150px' });

    if (this.anchorElement) {
      this.intersectionObserver.observe(this.anchorElement);
    }

    this.hostElement.paranoteDestroy = () => {
      if (this.intersectionObserver) this.intersectionObserver.disconnect();
      if (resizeObserver) resizeObserver.disconnect();
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

  // 2. Create the button, changing the text if a note already exists
  activeAddButton = document.createElement('button');
  activeAddButton.className = 'paranote-trigger-btn';

  if (existingNote) {
    activeAddButton.innerText = appAddingMode === 'note' ? '✏️ Edit Note' : '✏️ Edit Issue';
  } else {
    activeAddButton.innerText = appAddingMode === 'note' ? '📝 Take Note' : '🐞 Log Issue';
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

    editorComponent.open(textHash, textToLoad, screenshotToUse, typeToUse, paragraph, appAddingMode);
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

// COMMAND: Start Adding Notes
function startApp(mode) {
  if (isAppActive) {
    if (appAddingMode === mode) return; // already active in this mode
    stopApp(); // stop fully before restarting in new mode
  }
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

    const height = host.offsetHeight;
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
  // If notes are already visible, this acts as a refresh/toggle
  hideVisibleNotes();
  isViewModeActive = true;
  appViewingMode = mode;
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
  document.querySelectorAll('.paranote-display-host').forEach(el => {
    if (el.paranoteDestroy) el.paranoteDestroy();
    else el.remove();
  });
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
  // Use the bulletproof database sync pipeline to elegantly rebuild the UI seamlessly
  showNotesOnPage();
});

// ==========================================
// 4. LabLabee Context Extraction
// ==========================================
function extractCurrentTaskAndSubtask() {
  let activeTask = "Unknown Task";
  let activeSubtask = null;

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

  return { activeTask, activeSubtask };
}
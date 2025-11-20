/**
 * feature-toc.js
 * Implements a Table of Contents (TOC).
 * Uses GeminiResizer from feature-resizer.js for drag logic.
 */

// Global State
let tocObserver = null;
let tocScrollDebounce = null;
let currentScrollElement = null;

// Constants
const TOC_CONTAINER_ID = 'gemini-toc-container';
const TOC_CHAT_SCROLLER_SELECTOR = 'infinite-scroller.chat-history';
const TOC_CONVERSATION_BLOCK_SELECTOR = '.conversation-container';
const TOC_PROMPT_SELECTOR = '.query-text';

const TOC_MIN_WIDTH = 200;
const TOC_MAX_WIDTH = 800;
const TOC_DEFAULT_WIDTH = 308; 

// === TOC RESIZER SETUP ===
// Instantiate the shared class
const tocResizer = new GeminiResizer({
    min: TOC_MIN_WIDTH,
    max: TOC_MAX_WIDTH,
    storageKey: 'geminiTOCWidth',
    onUpdate: (width) => {
         // Update CSS Variable directly
         document.documentElement.style.setProperty('--gemini-toc-width', width + 'px');
    }
});

function startTOCDrag(e) {
    // Use the shared class instance
    tocResizer.start(e, document.getElementById(TOC_CONTAINER_ID));
}

// === INITIALIZATION ===

function initTOC() {
  // Inject structure (idempotent internally)
  injectTOCContainer();
  
  // Initialize CSS variable (safe)
  applySavedTOCWidth();
  
  // Only TOC observer remains
  waitForElement(TOC_CHAT_SCROLLER_SELECTOR, (element) => {
      startTOCObserver(element);
  });
}

function waitForElement(selector, callback) {
    const element = document.querySelector(selector);
    if (element) {
        callback(element);
        return;
    }

    // If not found, watch for it.
    // Note: We don't cache this observer because it disconnects itself instantly upon success.
    const observer = new MutationObserver((mutations, obs) => {
        const el = document.querySelector(selector);
        if (el) {
            obs.disconnect();
            callback(el);
        }
    });
    
    // Observe documentElement because body might not exist yet
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });
}

function injectTOCContainer() {
  if (document.getElementById(TOC_CONTAINER_ID)) return;

  const sidenavContainer = document.querySelector('bard-sidenav-container');
  const sidenavContent = document.querySelector('bard-sidenav-content');

  if (sidenavContainer && sidenavContent) {
    const tocContainer = document.createElement('div');
    tocContainer.id = TOC_CONTAINER_ID;
    
    const resizer = document.createElement('div');
    resizer.id = 'gemini-toc-resizer';
    resizer.addEventListener('mousedown', startTOCDrag);
    resizer.addEventListener('dblclick', syncTOCWidthToNav);
    tocContainer.appendChild(resizer);
    
    const header = document.createElement('div');
    header.className = 'gemini-toc-header';
    header.textContent = 'Inhalt';
    tocContainer.appendChild(header);

    const listWrapper = document.createElement('div');
    listWrapper.className = 'mat-mdc-action-list mat-mdc-list-base mdc-list gemini-toc-list';
    listWrapper.setAttribute('role', 'group');
    tocContainer.appendChild(listWrapper);

    sidenavContainer.insertBefore(tocContainer, sidenavContent);
  }
}

function updateTOC() {
  const tocList = document.querySelector(`#${TOC_CONTAINER_ID} .gemini-toc-list`);
  if (!tocList) return;

  const blocks = document.querySelectorAll(TOC_CONVERSATION_BLOCK_SELECTOR);
  
  // Simple Diff: If count matches, assume no change to avoid redraw (optional optimization)
  // For now, we rebuild but assume the loop is fixed.
  
  tocList.innerHTML = '';

  blocks.forEach((block, index) => {
    const promptEl = block.querySelector(TOC_PROMPT_SELECTOR);
    if (!promptEl) return;

    if (!block.id) block.id = `gemini-conversation-block-${index}`;

    const text = promptEl.innerText.trim().replace(/\n+/g, '\n');
    
    const button = document.createElement('button');
    button.className = 'mat-mdc-list-item mdc-list-item mat-ripple side-nav-action-button explicit-gmat-override mat-mdc-list-item-interactive mat-mdc-list-item-single-line mdc-list-item--with-one-line gemini-toc-item';
    
    const contentSpan = document.createElement('span');
    contentSpan.className = 'mdc-list-item__content';
    
    const unscopedSpan = document.createElement('span');
    unscopedSpan.className = 'mat-mdc-list-item-unscoped-content mdc-list-item__primary-text';
    
    const textSpan = document.createElement('span');
    textSpan.className = 'gds-body-m';
    textSpan.textContent = text;
    
    unscopedSpan.appendChild(textSpan);
    contentSpan.appendChild(unscopedSpan);
    
    const focusIndicator = document.createElement('div');
    focusIndicator.className = 'mat-focus-indicator';
    
    button.appendChild(contentSpan);
    button.appendChild(focusIndicator);

    button.addEventListener('click', () => {
      block.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.querySelectorAll('.gemini-toc-item.active').forEach(el => el.classList.remove('active'));
      button.classList.add('active');
    });

    tocList.appendChild(button);
  });
}

// --- OBSERVERS (Strict Idempotency) ---

function startTOCObserver(element) {
    // If we are already observing THIS element, do nothing.
    if (tocObserver && currentScrollElement === element) return;
    if (tocObserver) tocObserver.disconnect();

    currentScrollElement = element;
    tocObserver = new MutationObserver((mutations) => {
      if (tocScrollDebounce) clearTimeout(tocScrollDebounce);
      tocScrollDebounce = setTimeout(() => updateTOC(), 500);
    });
    tocObserver.observe(element, { childList: true, subtree: true });
    setTimeout(() => updateTOC(), 500);
}

// === HELPER LOGIC ===

function applySavedTOCWidth() {
  // Check if currently resizing is done via class on document
  if (document.documentElement.classList.contains('gemini-resizing')) return;
  
  chrome.storage.local.get('geminiTOCWidth', (data) => {
    let savedWidth = TOC_DEFAULT_WIDTH;
    if (data.geminiTOCWidth) {
      savedWidth = parseInt(data.geminiTOCWidth, 10);
      if (savedWidth < TOC_MIN_WIDTH) savedWidth = TOC_MIN_WIDTH;
      if (savedWidth > TOC_MAX_WIDTH) savedWidth = TOC_MAX_WIDTH;
    }
    document.documentElement.style.setProperty('--gemini-toc-width', savedWidth + 'px');
  });
}

function syncTOCWidthToNav(e) {
  e.preventDefault();
  const nav = document.querySelector('bard-sidenav');
  if (nav) {
    const currentNavWidth = nav.getBoundingClientRect().width;
    document.documentElement.style.setProperty('--gemini-toc-width', currentNavWidth + 'px');
    chrome.storage.local.set({ 'geminiTOCWidth': currentNavWidth });
  }
}
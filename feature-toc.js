/**
 * feature-toc.js
 * Implements a Table of Contents (TOC).
 * Uses global flag window.isGeminiModifyingDOM to prevent observer loops.
 */

// Global State
let tocObserver = null;
let tocScrollDebounce = null;
let currentScrollElement = null;
let isTOCOpen = true;

// Constants
const TOC_CONTAINER_ID = 'gemini-toc-container';
const TOC_TOGGLE_BUTTON_ID = 'gemini-toc-toggle-button';
const TOC_CHAT_SCROLLER_SELECTOR = 'infinite-scroller.chat-history';
const TOC_CONVERSATION_BLOCK_SELECTOR = '.conversation-container';
const TOC_PROMPT_SELECTOR = '.query-text';
const SIDEBAR_ACTION_LIST_SELECTOR = 'mat-action-list.desktop-controls';

const TOC_MIN_WIDTH = 200;
const TOC_MAX_WIDTH = 800;
const TOC_DEFAULT_WIDTH = 308; 

// === RESIZER SETUP ===
const tocResizer = new GeminiResizer({
    min: TOC_MIN_WIDTH,
    max: TOC_MAX_WIDTH,
    storageKey: 'geminiTOCWidth',
    onUpdate: (width) => {
         document.documentElement.style.setProperty('--gemini-toc-width', width + 'px');
    }
});

function startTOCDrag(e) {
    tocResizer.start(e, document.getElementById(TOC_CONTAINER_ID));
}

// === INITIALIZATION ===

function initTOC() {
  // Check 1: Already existing?
  if (document.getElementById(TOC_CONTAINER_ID)) {
      // Ensure button is there (soft check)
      if (!document.getElementById(TOC_TOGGLE_BUTTON_ID)) {
          injectSidebarButton();
      }
      updateTOCState(); // Check visual state

      // FIX: Auch wenn der Container existiert, müssen wir prüfen, ob der Observer
      // noch am richtigen Scroller hängt (z.B. nach Navigation zurück zum Chat).
      // Wir suchen den aktuellen Scroller im DOM.
      const scroller = document.querySelector(TOC_CHAT_SCROLLER_SELECTOR);
      
      // Wenn ein Scroller da ist, aber wir ihn noch nicht (oder einen alten) beobachten:
      if (scroller && currentScrollElement !== scroller) {
          // console.log("Gemini TOC: Scroller changed (Navigation detected). Re-attaching observer.");
          startTOCObserver(scroller);
      }

      return;
  }

  // Check 2: Already running?
  if (window.isInitializingTOC) return;
  window.isInitializingTOC = true;

  chrome.storage.local.get('geminiTOCOpen', (data) => {
    if (data.geminiTOCOpen !== undefined) {
      isTOCOpen = data.geminiTOCOpen;
    }
    
    // DOM Modification Block Start
    window.isGeminiModifyingDOM = true;
    try {
        applySavedTOCWidth();
        injectTOCContainer(); 
    } finally {
        window.isGeminiModifyingDOM = false;
    }
    
    // Button injection might be async if list not ready
    injectSidebarButton();
    
    // State update (classes)
    updateTOCState();
    
    // Initial Observer Start (mit Wait, falls Scroller noch lädt)
    waitForElement(TOC_CHAT_SCROLLER_SELECTOR, (element) => {
        startTOCObserver(element);
    });
    
    window.isInitializingTOC = false;
  });
}

function waitForElement(selector, callback) {
    const element = document.querySelector(selector);
    if (element) {
        callback(element);
        return;
    }
    const observer = new MutationObserver((mutations, obs) => {
        const el = document.querySelector(selector);
        if (el) {
            obs.disconnect();
            callback(el);
        }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
}

function injectTOCContainer() {
  if (document.getElementById(TOC_CONTAINER_ID)) return;

  const sidenavContainer = document.querySelector('bard-sidenav-container');
  const sidenavContent = document.querySelector('bard-sidenav-content');

  if (sidenavContainer && sidenavContent) {
    const tocContainer = document.createElement('div');
    tocContainer.id = TOC_CONTAINER_ID;
    
    // Maske für sauberes Clipping
    const mask = document.createElement('div');
    mask.className = 'gemini-toc-mask';
    tocContainer.appendChild(mask);
    
    // Resizer (Geschwister der Maske)
    const resizer = document.createElement('div');
    resizer.id = 'gemini-toc-resizer';
    resizer.className = 'gemini-resizer-handle';
    resizer.addEventListener('mousedown', startTOCDrag);
    resizer.addEventListener('dblclick', syncTOCWidthToNav);
    tocContainer.appendChild(resizer);
    
    // Inhalt in die Maske
    const header = document.createElement('div');
    header.className = 'gemini-toc-header';
    header.textContent = 'Inhalt';
    mask.appendChild(header); 

    const listWrapper = document.createElement('div');
    listWrapper.className = 'mat-mdc-action-list mat-mdc-list-base mdc-list gemini-toc-list';
    listWrapper.setAttribute('role', 'group');
    mask.appendChild(listWrapper);

    sidenavContainer.insertBefore(tocContainer, sidenavContent);
  }
}

function injectSidebarButton() {
  if (document.getElementById(TOC_TOGGLE_BUTTON_ID)) return;

  waitForElement(SIDEBAR_ACTION_LIST_SELECTOR, (actionList) => {
      if (document.getElementById(TOC_TOGGLE_BUTTON_ID)) return;

      window.isGeminiModifyingDOM = true; // Lock Observer
      try {
          const wrapper = document.createElement('side-nav-action-button');
          wrapper.className = 'ia-redesign ng-star-inserted'; 
          
          const buttonHTML = `
            <button id="${TOC_TOGGLE_BUTTON_ID}" class="mat-mdc-list-item mdc-list-item mat-ripple mat-mdc-tooltip-trigger side-nav-action-button explicit-gmat-override mat-mdc-list-item-interactive mdc-list-item--with-leading-icon mat-mdc-list-item-single-line mdc-list-item--with-one-line gemini-toc-sidebar-btn" type="button" aria-label="Inhaltsverzeichnis umschalten">
                <div class="mat-mdc-list-item-icon icon-container explicit-gmat-override mdc-list-item__start">
                    <mat-icon class="mat-icon notranslate gds-icon-l google-symbols mat-ligature-font mat-icon-no-color" aria-hidden="true" data-mat-icon-type="font">${isTOCOpen ? 'chevron_left' : 'chevron_right'}</mat-icon>
                </div>
                <span class="mdc-list-item__content">
                    <span class="mat-mdc-list-item-unscoped-content mdc-list-item__primary-text">Inhaltsverzeichnis</span>
                </span>
                <div class="mat-focus-indicator"></div>
            </button>
          `;
          
          wrapper.innerHTML = buttonHTML;
          const btn = wrapper.querySelector('button');
          btn.addEventListener('click', toggleTOC);
          
          actionList.prepend(wrapper);
      } finally {
          window.isGeminiModifyingDOM = false; // Unlock
      }
  });
}

function toggleTOC(e) {
  // Prevent Default wichtig bei Buttons in Forms/Listen
  if(e) { e.preventDefault(); e.stopPropagation(); }
  
  isTOCOpen = !isTOCOpen;
  chrome.storage.local.set({ 'geminiTOCOpen': isTOCOpen });
  updateTOCState();
}

function updateTOCState() {
    window.isGeminiModifyingDOM = true; // Lock
    try {
        const container = document.getElementById(TOC_CONTAINER_ID);
        const btn = document.getElementById(TOC_TOGGLE_BUTTON_ID);

        if (isTOCOpen) {
            // OPEN
            if (document.body.classList.contains('gemini-toc-closed')) {
                document.body.classList.remove('gemini-toc-closed');
            }
            if (container && container.classList.contains('collapsed')) {
                container.classList.remove('collapsed');
            }
            if (btn) {
                const icon = btn.querySelector('mat-icon');
                if (icon && icon.textContent !== 'chevron_left') icon.textContent = 'chevron_left';
            }
        } else {
            // CLOSED
            if (!document.body.classList.contains('gemini-toc-closed')) {
                document.body.classList.add('gemini-toc-closed');
            }
            if (container && !container.classList.contains('collapsed')) {
                container.classList.add('collapsed');
            }
            if (btn) {
                const icon = btn.querySelector('mat-icon');
                if (icon && icon.textContent !== 'chevron_right') icon.textContent = 'chevron_right';
            }
        }
    } finally {
        window.isGeminiModifyingDOM = false; // Unlock
    }
}

// ... (updateTOC, startTOCObserver, applySavedTOCWidth, syncTOCWidthToNav - UNCHANGED) ...

function updateTOC() {
  const tocList = document.querySelector(`#${TOC_CONTAINER_ID} .gemini-toc-list`);
  if (!tocList) return;

  const blocks = document.querySelectorAll(TOC_CONVERSATION_BLOCK_SELECTOR);
  // Only rebuild if count changed or content different to be super safe, 
  // but here we just assume content update is necessary.
  // No global lock needed here as TOC is internal to our container.
  
  tocList.innerHTML = '';

  blocks.forEach((block, index) => {
    const promptEl = block.querySelector(TOC_PROMPT_SELECTOR);
    if (!promptEl) return;

    if (!block.id) block.id = `gemini-conversation-block-${index}`;
    const text = promptEl.innerText.trim().replace(/\n+/g, '\n');
    
    const button = document.createElement('button');
    button.className = 'gemini-toc-item';
    
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

function startTOCObserver(element) {
    // Check: Are we already observing THIS element?
    if (tocObserver && currentScrollElement === element) return;
    
    // If observing something else (or nothing), disconnect first
    if (tocObserver) tocObserver.disconnect();

    currentScrollElement = element;
    tocObserver = new MutationObserver((mutations) => {
      if (tocScrollDebounce) clearTimeout(tocScrollDebounce);
      tocScrollDebounce = setTimeout(() => updateTOC(), 500);
    });
    tocObserver.observe(element, { childList: true, subtree: true });
    
    // Initial update for this new scroller
    setTimeout(() => updateTOC(), 500);
}

function applySavedTOCWidth() {
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
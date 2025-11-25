/**
 * feature-toc.js
 * Implements a Table of Contents (TOC) with Centered Auto-Scroll-Spy.
 * Reads raw markdown from dataset to prevent formatting loss.
 */

// Global State
let tocObserver = null;
let tocScrollDebounce = null;
let currentScrollElement = null;
let isTOCOpen = true;
let scrollSpyObserver = null;

// Constants
const TOC_CONTAINER_ID = 'gemini-toc-container';
const TOC_TOGGLE_BUTTON_ID = 'gemini-toc-toggle-button';
const TOC_CHAT_SCROLLER_SELECTOR = 'infinite-scroller.chat-history';
const TOC_CONVERSATION_BLOCK_SELECTOR = '.conversation-container';
const TOC_PROMPT_SELECTOR = '.query-text';
const SIDEBAR_ACTION_LIST_SELECTOR = 'mat-action-list.desktop-controls';

const TOC_MIN_WIDTH = 200;
const TOC_MAX_WIDTH = 10000; // Limit removed (effectively)
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
      if (!document.getElementById(TOC_TOGGLE_BUTTON_ID)) {
          injectSidebarButton();
      }
      updateTOCState();

      const scroller = document.querySelector(TOC_CHAT_SCROLLER_SELECTOR);
      if (scroller && currentScrollElement !== scroller) {
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
    // New intelligent double-click handler
    resizer.addEventListener('dblclick', handleTOCResizeDblClick);
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
          // Wiederverwendung der generischen Funktion aus folders-ui.js
          if (typeof createGenericSidebarButton === 'function') {
              const wrapper = createGenericSidebarButton(
                  TOC_TOGGLE_BUTTON_ID,
                  isTOCOpen ? 'chevron_left' : 'chevron_right',
                  'Inhaltsverzeichnis',
                  'gemini-toc-sidebar-btn',
                  toggleTOC
              );
              
              // Button muss nach dem "Neuer Ordner" Button kommen (wenn vorhanden),
              // aber vor den Standard-Buttons.
              // Da injectFolderButton (hoffentlich) prepended oder vor TOC einfügt,
              // können wir TOC einfach an den Anfang der Liste hängen, wenn Folder noch nicht da ist,
              // oder NACH Folder, wenn Folder da ist.
              
              const folderBtn = document.getElementById('new-folder-button');
              if (folderBtn) {
                   // Wenn Folder Button da ist, fügen wir TOC danach ein (Wrapper nach Wrapper)
                   const folderWrapper = folderBtn.closest('side-nav-action-button');
                   if (folderWrapper && folderWrapper.nextSibling) {
                       actionList.insertBefore(wrapper, folderWrapper.nextSibling);
                   } else {
                       actionList.appendChild(wrapper); // Sollte nicht passieren, da History da ist
                   }
              } else {
                  // Kein Folder Button da, wir hängen uns ganz oben hin
                  actionList.prepend(wrapper);
              }
          }
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

function updateTOC() {
  const tocList = document.querySelector(`#${TOC_CONTAINER_ID} .gemini-toc-list`);
  if (!tocList) return;

  // Select blocks, including pending ones (to filter them)
  const blocks = document.querySelectorAll(`${TOC_CONVERSATION_BLOCK_SELECTOR}, pending-request`);
  
  // 1a. Gather current data using the robust text reconstructor
  const currentData = [];
  blocks.forEach((block, index) => {
      // FIX: Skip pending requests
      if (block.tagName.toLowerCase() === 'pending-request') return;

      const promptEl = block.querySelector(TOC_PROMPT_SELECTOR);
      if (promptEl) {
          // Ensure ID is present for stability
          if (!block.id) block.id = `gemini-conversation-block-${index}`;
          
          // FIX: Get RAW Markdown if available (from feature-prompt-markdown.js)
          // fallback to innerText only if attribute missing.
          const rawText = promptEl.getAttribute('data-gemini-raw-markdown') || promptEl.innerText.trim();
          
          currentData.push({
              id: block.id,
              text: rawText,
              block: block
          });
      }
  });

  // 1b. Compare with existing TOC items
  const existingItems = Array.from(tocList.querySelectorAll('.gemini-toc-item'));
  let isSame = (currentData.length === existingItems.length);

  if (isSame) {
      for (let i = 0; i < currentData.length; i++) {
          const storedRawText = existingItems[i].dataset.rawText;
          if (storedRawText !== currentData[i].text) {
              isSame = false;
              break;
          }
      }
  }

  if (isSame) return;

  if (scrollSpyObserver) {
      scrollSpyObserver.disconnect();
      scrollSpyObserver = null;
  }

  tocList.innerHTML = '';

  // Setup ScrollSpy (Trigger at 50% viewport height)
  scrollSpyObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
          if (entry.isIntersecting) {
              setActiveTOCItem(entry.target.id);
          }
      });
  }, {
      root: currentScrollElement,
      rootMargin: '-50% 0px -50% 0px',
      threshold: 0
  });

  currentData.forEach((item) => {
    const button = document.createElement('button');
    button.className = 'gemini-toc-item';
    button.dataset.targetId = item.id;
    // Speichere den rohen Text für effizienten Vergleich beim nächsten Update
    button.dataset.rawText = item.text;
    
    button.style.scrollMarginBlock = '18px';
    
    const contentSpan = document.createElement('span');
    contentSpan.className = 'mdc-list-item__content';
    
    const unscopedSpan = document.createElement('span');
    unscopedSpan.className = 'mat-mdc-list-item-unscoped-content mdc-list-item__primary-text';
    
    // FIX 2: Use the global Markdown parser to render full HTML structure
    if (window.GeminiMarkdown && typeof window.GeminiMarkdown.parse === 'function') {
        const rawLines = item.text.split('\n');
        const nodes = window.GeminiMarkdown.parse(rawLines);
        
        // Wrap in a specific container for TOC styling
        const tocContentWrapper = document.createElement('div');
        tocContentWrapper.className = 'gds-body-m gemini-toc-content-wrapper';
        
        nodes.forEach(node => tocContentWrapper.appendChild(node));
        unscopedSpan.appendChild(tocContentWrapper);
    } else {
        // Fallback if parser not ready
        unscopedSpan.textContent = item.text;
    }
    
    contentSpan.appendChild(unscopedSpan);
    
    const focusIndicator = document.createElement('div');
    focusIndicator.className = 'mat-focus-indicator';
    
    button.appendChild(contentSpan);
    button.appendChild(focusIndicator);

    button.addEventListener('click', () => {
      item.block.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    tocList.appendChild(button);
    scrollSpyObserver.observe(item.block);
  });
}

function setActiveTOCItem(blockId) {
    // Remove active class from currently active item
    const currentActive = document.querySelector('.gemini-toc-item.active');
    
    // Optimization: Don't do anything if the active item hasn't changed
    if (currentActive && currentActive.dataset.targetId === blockId) return;
    
    if (currentActive) currentActive.classList.remove('active');

    // Add active class to new item
    const newActive = document.querySelector(`.gemini-toc-item[data-target-id="${blockId}"]`);
    if (newActive) {
        newActive.classList.add('active');
        // 'nearest' respects 'scrollMarginBlock' set above, ensuring the gap is visible
        newActive.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
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
  // This deprecated function is kept for reference but not used in dblclick anymore.
  // See handleTOCResizeDblClick below.
  e.preventDefault();
  const nav = document.querySelector('bard-sidenav');
  if (nav) {
    const currentNavWidth = nav.getBoundingClientRect().width;
    document.documentElement.style.setProperty('--gemini-toc-width', currentNavWidth + 'px');
    chrome.storage.local.set({ 'geminiTOCWidth': currentNavWidth });
  }
}

/**
 * Intelligent double-click handler.
 * 1. Checks if any element inside the TOC is a code block (which doesn't wrap).
 * 2. If yes -> Expands to fit the widest element (measured by Range to get content width).
 * 3. If no -> Syncs width with the Sidebar.
 */
function handleTOCResizeDblClick(e) {
  e.preventDefault();
  
  const tocContainer = document.getElementById(TOC_CONTAINER_ID);
  if (!tocContainer) return;

  // Target code blocks specifically as they are the primary non-wrapping elements
  const codeContainers = tocContainer.querySelectorAll('.gemini-toc-item .code-container');

  if (codeContainers.length > 0) {
      // Logic A: Expand/Shrink to fit content
      let maxTextWidth = 0;
      
      // Measure actual text content width using Range (ignores container scrolling/clipping)
      codeContainers.forEach(el => {
          const range = document.createRange();
          range.selectNodeContents(el);
          const rect = range.getBoundingClientRect();
          if (rect.width > maxTextWidth) {
              maxTextWidth = rect.width;
          }
      });
      
      // Calculation:
      // Content Text Width
      // + Padding of code container (13px * 2 = 26px)
      // + TOC Item Margins/Offsets calculated in CSS (approx 62px difference between TOC width and Code width)
      let newWidth = maxTextWidth + 26 + 70;

      if (newWidth < TOC_MIN_WIDTH) newWidth = TOC_MIN_WIDTH;
      if (newWidth > TOC_MAX_WIDTH) newWidth = TOC_MAX_WIDTH;
      
      // Apply
      document.documentElement.style.setProperty('--gemini-toc-width', newWidth + 'px');
      chrome.storage.local.set({ 'geminiTOCWidth': newWidth });

  } else {
      // Logic B: Sync with Navigation Sidebar (Original Behavior) if only text (which wraps)
      const nav = document.querySelector('bard-sidenav');
      if (nav) {
        const currentNavWidth = nav.getBoundingClientRect().width;
        document.documentElement.style.setProperty('--gemini-toc-width', currentNavWidth + 'px');
        chrome.storage.local.set({ 'geminiTOCWidth': currentNavWidth });
      }
  }
}
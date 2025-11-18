/**
 * feature-toc.js
 * Implements a Table of Contents (TOC) for the chat.
 * It scans the chat history for prompts and creates a clickable list
 * inserted between the sidebar and the main chat area.
 */

let tocObserver = null;
let tocScrollDebounce = null;
let currentScrollContainer = null; // Tracks the DOM element we are currently observing

// Configuration constants
const TOC_CONTAINER_ID = 'gemini-toc-container';
const CHAT_SCROLLER_SELECTOR = 'infinite-scroller.chat-history';
const CONVERSATION_BLOCK_SELECTOR = '.conversation-container';
const PROMPT_SELECTOR = '.query-text';

/**
 * Initializes the Table of Contents.
 * Called from main.js when the sidebar container is detected.
 */
function initTOC() {
  // 1. Try to inject the container DOM structure
  injectTOCContainer();

  // 2. Note: We do NOT call updateTOC() here directly anymore to prevent 
  //    race conditions or UI freezing during initial load.
  //    The observer below will handle the first population.

  // 3. Start observing the chat for changes (new messages, loading history)
  startTOCObserver();
}

/**
 * Injects the TOC container into the Gemini sidebar layout.
 * It places the TOC between the sidebar (<bard-sidenav>) and the content (<bard-sidenav-content>).
 */
function injectTOCContainer() {
  // Check if the container already exists to prevent duplicates
  if (document.getElementById(TOC_CONTAINER_ID)) return;

  // Target the parent container that holds sidebar and content
  const sidenavContainer = document.querySelector('bard-sidenav-container');
  const sidenavContent = document.querySelector('bard-sidenav-content');

  if (sidenavContainer && sidenavContent) {
    console.log("Gemini TOC: Injecting TOC container between Sidebar and Content.");
    
    // Create the main container div
    const tocContainer = document.createElement('div');
    tocContainer.id = TOC_CONTAINER_ID;
    
    // Create the header "Inhalt"
    const header = document.createElement('div');
    header.className = 'gemini-toc-header';
    header.textContent = 'Inhalt';
    tocContainer.appendChild(header);

    // Create the list wrapper.
    // We use the same class structure as the "New Folder" list wrapper 
    // to inherit potentially useful Material styles, though we override most layout.
    const listWrapper = document.createElement('div');
    listWrapper.className = 'mat-mdc-action-list mat-mdc-list-base mdc-list gemini-toc-list';
    listWrapper.setAttribute('role', 'group');
    tocContainer.appendChild(listWrapper);

    // Insert the TOC container BEFORE the content, creating the column layout
    sidenavContainer.insertBefore(tocContainer, sidenavContent);
    
  } else {
    // If we can't find the container, we can't inject.
    // console.debug("Gemini TOC: Could not find bard-sidenav-container or content.");
  }
}

/**
 * Scans the chat history and updates the TOC list.
 * This creates a button for every user prompt found in the chat.
 */
function updateTOC() {
  const tocList = document.querySelector(`#${TOC_CONTAINER_ID} .gemini-toc-list`);
  if (!tocList) return;

  // Find all conversation blocks in the chat history
  const blocks = document.querySelectorAll(CONVERSATION_BLOCK_SELECTOR);
  
  // Clear the current list to rebuild it
  // (Optimization possible: Diffing instead of clearing, but usually fast enough)
  tocList.innerHTML = '';

  blocks.forEach((block, index) => {
    const promptEl = block.querySelector(PROMPT_SELECTOR);
    // Skip blocks without a prompt (e.g., system messages or loading states)
    if (!promptEl) return;

    // Ensure the target block has an ID so we can scroll to it easily
    if (!block.id) {
      block.id = `gemini-conversation-block-${index}`;
    }

    // Use innerText to preserve newlines from <p> tags,
    // BUT replace multiple consecutive newlines with a single one to avoid large gaps.
    const text = promptEl.innerText.trim().replace(/\n+/g, '\n');
    
    // Create the button element.
    // We use the EXACT class structure of the "New Folder" button to match its style foundation.
    const button = document.createElement('button');
    
    // 'gemini-toc-item' is our custom class for overrides (text wrap, colors).
    button.className = 'mat-mdc-list-item mdc-list-item mat-ripple side-nav-action-button explicit-gmat-override mat-mdc-list-item-interactive mat-mdc-list-item-single-line mdc-list-item--with-one-line gemini-toc-item';
    
    // Inner structure: Content Span > Unscoped Content > Text Span
    // This nesting is required by Google's Material Design CSS.
    const contentSpan = document.createElement('span');
    contentSpan.className = 'mdc-list-item__content';
    
    const unscopedSpan = document.createElement('span');
    unscopedSpan.className = 'mat-mdc-list-item-unscoped-content mdc-list-item__primary-text';
    
    const textSpan = document.createElement('span');
    textSpan.className = 'gds-body-m'; // Inherit font style
    textSpan.textContent = text;
    
    // Assemble the text structure
    unscopedSpan.appendChild(textSpan);
    contentSpan.appendChild(unscopedSpan);
    
    // Focus indicator for accessibility/keyboard nav
    const focusIndicator = document.createElement('div');
    focusIndicator.className = 'mat-focus-indicator';
    
    button.appendChild(contentSpan);
    button.appendChild(focusIndicator);

    // Add Click Handler: Scroll to the conversation block
    button.addEventListener('click', () => {
      block.scrollIntoView({ behavior: 'smooth', block: 'start' });
      
      // Update active state visual
      document.querySelectorAll('.gemini-toc-item.active').forEach(el => el.classList.remove('active'));
      button.classList.add('active');
    });

    tocList.appendChild(button);
  });
}

/**
 * Sets up a MutationObserver on the chat scroll container.
 * This ensures the TOC updates automatically when new messages appear or history loads.
 */
function startTOCObserver() {
  // Query for the CURRENT scroll container in the DOM
  const scrollContainer = document.querySelector(CHAT_SCROLLER_SELECTOR);
  
  // Check if the container has changed since the last observation (New Chat Scenario)
  if (tocObserver && currentScrollContainer !== scrollContainer) {
    console.log("Gemini TOC: Chat container changed/reset. Restarting observer.");
    tocObserver.disconnect();
    tocObserver = null;
    currentScrollContainer = null;
  }

  // If we have a container and no active observer, start one
  if (scrollContainer && !tocObserver) {
    console.log("Gemini TOC: Starting observer on chat history.");
    currentScrollContainer = scrollContainer; // Update reference
    
    tocObserver = new MutationObserver((mutations) => {
      // Use debounce to prevent excessive updates during rapid scrolling or loading
      if (tocScrollDebounce) clearTimeout(tocScrollDebounce);
      tocScrollDebounce = setTimeout(() => {
        updateTOC();
      }, 500);
    });

    // Observe childList (for new message blocks) and subtree (for content changes)
    tocObserver.observe(scrollContainer, { childList: true, subtree: true });
    
    // Trigger one initial update shortly after observing starts to catch existing content
    setTimeout(() => updateTOC(), 1000);
  }
}
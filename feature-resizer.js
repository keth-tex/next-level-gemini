/**
 * feature-resizer.js
 * Handles the Sidebar Resizer functionality AND exports a generic Resizer class.
 * Updates global CSS variables for cross-component positioning.
 */

// === GENERIC RESIZER CLASS (Shared Logic) ===
window.GeminiResizer = class GeminiResizer {
  constructor(config) {
    this.min = config.min || 200;
    this.max = config.max || 800;
    this.storageKey = config.storageKey || null;
    this.onUpdate = config.onUpdate || (() => {});
    
    this.isResizing = false;
    this.target = null;
    this.startX = 0;
    this.startWidth = 0;

    // Bindings for event listeners
    this.handleDrag = this.handleDrag.bind(this);
    this.stopDrag = this.stopDrag.bind(this);
  }

  start(e, targetElement) {
    e.preventDefault();
    this.target = targetElement;
    if (!this.target) return;

    this.startX = e.clientX;
    this.startWidth = this.target.offsetWidth;
    this.isResizing = true;

    document.addEventListener('mousemove', this.handleDrag);
    document.addEventListener('mouseup', this.stopDrag);
    document.documentElement.classList.add('gemini-resizing');
  }

  handleDrag(e) {
    if (!this.isResizing) return;
    const deltaX = e.clientX - this.startX;
    let newWidth = this.startWidth + deltaX;
    
    if (newWidth < this.min) newWidth = this.min;
    if (newWidth > this.max) newWidth = this.max;

    this.onUpdate(newWidth, this.target);
  }

  stopDrag(e) {
    if (this.isResizing && this.target) {
      // Use actual rendered width for saving to be precise
      const finalWidth = this.target.offsetWidth;
      
      if (this.storageKey) {
        chrome.storage.local.set({ [this.storageKey]: finalWidth });
      }
    }
    
    this.isResizing = false;
    this.target = null;
    document.removeEventListener('mousemove', this.handleDrag);
    document.removeEventListener('mouseup', this.stopDrag);
    document.documentElement.classList.remove('gemini-resizing');
  }
};

// === SIDEBAR SPECIFIC CONFIGURATION ===

const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 800;
const SIDEBAR_PADDING_BUFFER = 95;
const DEFAULT_SIDEBAR_WIDTH = 308; 
const RESIZER_STANDARD_DIFF = 236; 

// Central helper to update Sidebar styles AND CSS Variables
function updateSidebarStyle(width, sidebarEl = null) {
  const el = sidebarEl || document.querySelector('bard-sidenav');
  if (!el) return;
  
  // 1. Set Sidebar Width (Local - for Gemini)
  el.style.setProperty('--bard-sidenav-open-width', width + 'px');
  
  // 2. Calculate Diff
  const diff = RESIZER_STANDARD_DIFF + (width - DEFAULT_SIDEBAR_WIDTH);
  
  // 3. Set internal Gemini variable
  el.style.setProperty('--bard-sidenav-open-closed-width-diff', diff + 'px');
  
  // 3. GLOBAL VARIABLES (Fixes Resizer & Switcher Positioning)
  document.documentElement.style.setProperty('--gemini-sidenav-diff', diff + 'px');
  document.documentElement.style.setProperty('--gemini-global-sidebar-width', width + 'px');
}

// Initialize the Resizer for Sidebar
const sidebarResizer = new GeminiResizer({
  min: MIN_SIDEBAR_WIDTH,
  max: MAX_SIDEBAR_WIDTH,
  storageKey: 'geminiSidebarWidth',
  onUpdate: (width, target) => updateSidebarStyle(width, target)
});

// === EXPOSED FUNCTIONS ===

function startDrag(e) {
  // main.js attaches this to the handle, parent is the sidebar
  sidebarResizer.start(e, e.target.parentElement);
}

function applySavedWidth(sidebarEl) {
  if (!sidebarEl) return;
  chrome.storage.local.get('geminiSidebarWidth', (data) => {
    let savedWidth = DEFAULT_SIDEBAR_WIDTH;
    if (data.geminiSidebarWidth) {
      savedWidth = parseInt(data.geminiSidebarWidth, 10);
      if (savedWidth < MIN_SIDEBAR_WIDTH) savedWidth = MIN_SIDEBAR_WIDTH;
      if (savedWidth > MAX_SIDEBAR_WIDTH) savedWidth = MAX_SIDEBAR_WIDTH;
    }
    // Apply immediately
    updateSidebarStyle(savedWidth, sidebarEl);
  });
}

function autoResizeSidebar(e) {
  e.preventDefault();
  const sidebarEl = e.target.parentElement;
  if (!sidebarEl) return;

  const titles = sidebarEl.querySelectorAll('.conversation-title');
  if (titles.length === 0) return;

  // Measure longest title
  const measurementSpan = document.createElement('span');
  const computedStyle = window.getComputedStyle(titles[0]);

  measurementSpan.style.font = `${computedStyle.fontStyle} ${computedStyle.fontWeight} ${computedStyle.fontSize} / ${computedStyle.lineHeight} ${computedStyle.fontFamily}`;
  measurementSpan.style.visibility = 'hidden';
  measurementSpan.style.position = 'absolute';
  measurementSpan.style.left = '-9999px';
  measurementSpan.style.top = '-9999px';
  measurementSpan.style.whiteSpace = 'nowrap';
  document.body.appendChild(measurementSpan);

  let maxTextWidth = 0;
  titles.forEach(title => {
    let text = '';
    // Get direct text node content only
    for (const node of title.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim().length > 0) {
        text = node.nodeValue.trim();
        break;
      }
    }
    if (text) {
      measurementSpan.textContent = text;
      const textWidth = measurementSpan.offsetWidth;
      if (textWidth > maxTextWidth) maxTextWidth = textWidth;
    }
  });
  document.body.removeChild(measurementSpan);

  if (maxTextWidth === 0) return;

  let newWidth = maxTextWidth + SIDEBAR_PADDING_BUFFER;
  if (newWidth < MIN_SIDEBAR_WIDTH) newWidth = MIN_SIDEBAR_WIDTH;
  if (newWidth > MAX_SIDEBAR_WIDTH) newWidth = MAX_SIDEBAR_WIDTH;

  updateSidebarStyle(newWidth, sidebarEl);
  chrome.storage.local.set({ 'geminiSidebarWidth': newWidth });
}
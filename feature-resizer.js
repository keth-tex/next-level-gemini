/**
 * feature-resizer.js
 * Handles the Sidebar Resizer functionality.
 * Includes drag-to-resize and auto-resize on double click.
 */

// === SIDEBAR RESIZER FUNCTIONS ===

const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 800;
const SIDEBAR_PADDING_BUFFER = 95;
const DEFAULT_SIDEBAR_WIDTH = 308; 
const RESIZER_STANDARD_DIFF = 236; // (308 - 68)

let sidebarToResize;
let startWidth;
let startX;

/**
 * Helper function to update sidebar styles AND global variables for CSS.
 */
function updateSidebarStyle(sidebarEl, width) {
  if (!sidebarEl) return;
  
  // 1. Sidebar Width setzen
  sidebarEl.style.setProperty('--bard-sidenav-open-width', width + 'px');
  
  // 2. Diff berechnen
  const diff = RESIZER_STANDARD_DIFF + (width - DEFAULT_SIDEBAR_WIDTH);
  
  // 3. Variable für Gemini intern (auf Element)
  sidebarEl.style.setProperty('--bard-sidenav-open-closed-width-diff', diff + 'px');
  
  // 4. WICHTIG: Variable global setzen für CSS-Positionierung des Switchers
  document.documentElement.style.setProperty('--gemini-sidenav-diff', diff + 'px');
}

function startDrag(e) {
  e.preventDefault();
  sidebarToResize = e.target.parentElement;
  startX = e.clientX;
  startWidth = sidebarToResize.offsetWidth;
  document.addEventListener('mousemove', handleDrag);
  document.addEventListener('mouseup', stopDrag);
  document.documentElement.classList.add('gemini-resizing');
}

function handleDrag(e) {
  if (!sidebarToResize) return;
  const currentX = e.clientX;
  const deltaX = currentX - startX;
  let newWidth = startWidth + deltaX;
  if (newWidth < MIN_SIDEBAR_WIDTH) newWidth = MIN_SIDEBAR_WIDTH;
  if (newWidth > MAX_SIDEBAR_WIDTH) newWidth = MAX_SIDEBAR_WIDTH;
  
  updateSidebarStyle(sidebarToResize, newWidth);
}

function stopDrag() {
  document.removeEventListener('mousemove', handleDrag);
  document.removeEventListener('mouseup', stopDrag);
  document.documentElement.classList.remove('gemini-resizing');
  if (sidebarToResize) {
    const finalWidth = sidebarToResize.offsetWidth;
    chrome.storage.local.set({ 'geminiSidebarWidth': finalWidth });
  }
  sidebarToResize = null;
}

function applySavedWidth(sidebarEl) {
  if (!sidebarEl) return;
  chrome.storage.local.get('geminiSidebarWidth', (data) => {
    if (data.geminiSidebarWidth) {
      let savedWidth = parseInt(data.geminiSidebarWidth, 10);
      if (savedWidth < MIN_SIDEBAR_WIDTH) savedWidth = MIN_SIDEBAR_WIDTH;
      if (savedWidth > MAX_SIDEBAR_WIDTH) savedWidth = MAX_SIDEBAR_WIDTH;
      updateSidebarStyle(sidebarEl, savedWidth);
    }
  });
}

function autoResizeSidebar(e) {
  e.preventDefault();
  const sidebarEl = e.target.parentElement;
  if (!sidebarEl) return;

  const titles = sidebarEl.querySelectorAll('.conversation-title');
  if (titles.length === 0) return;

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

  updateSidebarStyle(sidebarEl, newWidth);
  chrome.storage.local.set({ 'geminiSidebarWidth': newWidth });
}
/**
 * main.js
 * Entry point of the extension.
 * Handles the central MutationObserver to inject components.
 */

// === GLOBAL FLAGS ===
// Wenn true, ignoriert der Observer Änderungen, um Loops zu verhindern.
window.isGeminiModifyingDOM = false;

let mainObserver;

const mainObserverConfig = {
  childList: true,
  subtree: true,
  attributes: false
};

function injectionLogic() {
  // NOTBREMSE: Wenn wir selbst gerade bauen, ignorieren!
  if (window.isGeminiModifyingDOM) return;

  // 1. Export Button Logic
  try {
    const reliableElement = document.querySelector('div[data-test-id="pillbox"]');
    const buttonWrapper = document.getElementById('gemini-tex-export-button-wrapper');
    const mainContainer = reliableElement ? reliableElement.parentElement : null;

    if (reliableElement && mainContainer && !buttonWrapper) {
      // console.log("Gemini Exporter: Pillbox found. Injecting button.");
      const buttonElement = createExportButton();
      mainContainer.prepend(buttonElement);
    }
  } catch (e) {
    console.error("Error injecting export button:", e);
  }

  // 2. Sidebar Resizer Logic
  try {
    const sidebarEl = document.querySelector('bard-sidenav');
    const resizerEl = document.getElementById('gemini-sidebar-resizer');

    if (sidebarEl) {
      const isOpen = sidebarEl.offsetWidth > 100;
      if (isOpen && !resizerEl) {
        // console.log("Gemini Exporter: Sidebar opened. Injecting resizer.");
        const resizer = document.createElement('div');
        resizer.id = 'gemini-sidebar-resizer';
        resizer.className = 'gemini-resizer-handle'; // Shared Class
        
        resizer.addEventListener('mousedown', startDrag);
        resizer.addEventListener('dblclick', autoResizeSidebar);
        
        sidebarEl.appendChild(resizer);
        applySavedWidth(sidebarEl);
      } else if (!isOpen && resizerEl) {
        resizerEl.remove();
      }
    } else if (resizerEl) {
      resizerEl.remove();
    }
  } catch (e) {
    console.error("Error injecting resizer:", e);
  }

  // 3. Folder Button & Logic
  try {
    const conversationContainer = document.querySelector('.conversations-container');
    const loadingContentSpinnerContainer = document.querySelector('.loading-content-spinner-container');

    if (conversationContainer) {
      if (!document.getElementById('new-folder-button-wrapper') && loadingContentSpinnerContainer) {
        loadingContentSpinnerContainer.after(createFolderButton());
      }

      if (!isObservingChats) {
        isObservingChats = true;
        conversationContainer.style.display = 'flex';
        conversationContainer.style.flexDirection = 'column';
        prepareFoldersAndStartSync();

        const bardSidenav = document.querySelector('bard-sidenav');
        if (bardSidenav) {
          bardSidenav.addEventListener('dragenter', (e) => { if (e.dataTransfer.types.includes("text/gemini-chat-id")) e.preventDefault(); });
          bardSidenav.addEventListener('dragover', (e) => { 
              if (e.dataTransfer.types.includes("text/gemini-chat-id")) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } 
          });
          bardSidenav.addEventListener('drop', (e) => { if (e.dataTransfer.types.includes("text/gemini-chat-id")) e.preventDefault(); });
        }
      }

      if (!isInitialSortComplete) {
        if (revealTimer) clearTimeout(revealTimer);
        revealTimer = setTimeout(revealContainer, REVEAL_SETTLE_TIME);
      }
    }
  } catch (e) {
    console.error("Error injecting folder button:", e);
  }

  // 4. Table of Contents (TOC)
  try {
    // Nur feuern, wenn der Container da ist, aber TOC noch fehlt
    if (document.querySelector('bard-sidenav-container') && typeof initTOC === 'function') {
        // initTOC hat intern eigene Checks, daher sicher aufzurufen
        initTOC();
    }
  } catch (e) {
    console.error("Error injecting TOC:", e);
  }
}

// Start Observer
if (document.documentElement) {
  mainObserver = new MutationObserver(injectionLogic);
  mainObserver.observe(document.documentElement, mainObserverConfig);
  injectionLogic();
} else {
  console.error("Gemini Exporter: Could not find document.documentElement.");
}
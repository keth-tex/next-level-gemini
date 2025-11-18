/**
 * main.js
 * Entry point of the extension.
 * Handles the central MutationObserver to inject components (Buttons, Resizer, Folders)
 * into the Gemini DOM as it renders.
 */

// === GLOBAL VARIABLES FOR OBSERVER LOGIC ===
let mainObserver;

const mainObserverConfig = {
  childList: true,
  subtree: true,
  attributes: false
};

// === COMBINED INJECTION LOGIC ===

function injectionLogic() {

  // 1. Export Button Logic
  try {
    const reliableElement = document.querySelector('div[data-test-id="pillbox"]');
    const buttonWrapper = document.getElementById('gemini-tex-export-button-wrapper');
    const mainContainer = reliableElement ? reliableElement.parentElement : null;

    if (reliableElement && mainContainer && !buttonWrapper) {
      // createExportButton is defined in feature-export.js
      console.log("Gemini Exporter: Pillbox found. Injecting button.");
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
        console.log("Gemini Exporter: Sidebar opened. Injecting resizer.");
        const resizer = document.createElement('div');
        resizer.id = 'gemini-sidebar-resizer';
        
        // Event listeners from feature-resizer.js
        resizer.addEventListener('mousedown', startDrag);
        resizer.addEventListener('dblclick', autoResizeSidebar);
        
        sidebarEl.appendChild(resizer);
        applySavedWidth(sidebarEl);
      } else if (!isOpen && resizerEl) {
        console.log("Gemini Exporter: Sidebar closed. Cleaning up resizer.");
        resizerEl.remove();
      }
    } else if (resizerEl) {
      console.log("Gemini Exporter: Sidebar not found. Cleaning up resizer.");
      resizerEl.remove();
    }
  } catch (e) {
    console.error("Error injecting resizer:", e);
  }

  // 3. Folder Button, Folder Headers AND Process Start
  try {
    const conversationContainer = document.querySelector('.conversations-container');
    const loadingContentSpinnerContainer = document.querySelector('.loading-content-spinner-container');

    if (conversationContainer) {
      // Check for the new wrapper ID instead of the button ID
      if (!document.getElementById('new-folder-button-wrapper') && loadingContentSpinnerContainer) {
        console.log("Gemini Exporter: Injecting 'New Folder' button.");
        // createFolderButton is defined in folders-ui.js
        loadingContentSpinnerContainer.after(createFolderButton());
      }

      if (!isObservingChats) {
        isObservingChats = true;

        console.log("Gemini Exporter: Setting container to FLEX and starting observer.");

        conversationContainer.style.display = 'flex';
        conversationContainer.style.flexDirection = 'column';

        // Start the chain: Close folders, render headers, start observer
        // prepareFoldersAndStartSync is defined in feature-folders.js
        prepareFoldersAndStartSync();

        const bardSidenav = document.querySelector('bard-sidenav');

        if (bardSidenav) {
          // --- GAP FIX START ---
          bardSidenav.addEventListener('dragenter', (event) => {
            // Prevent container from becoming an active drop target
            if (event.dataTransfer.types.includes("text/gemini-chat-id")) {
              event.preventDefault();
            }
          });

          bardSidenav.addEventListener('dragover', (event) => {
            // Allow "dragover" only if a chat is being dragged
            if (event.dataTransfer.types.includes("text/gemini-chat-id")) {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }
          });

          bardSidenav.addEventListener('drop', (event) => {
            // Prevent browser navigation on drop in the gap
            if (event.dataTransfer.types.includes("text/gemini-chat-id")) {
              event.preventDefault();
            }
          });
          // --- GAP FIX END ---
        }
      }

      // --- FOUC LOGIC ---
      // This mainObserver run sees *every* mutation (batches, spinner, empty state).
      // While mutations are happening, the reveal timer is reset.
      if (!isInitialSortComplete) {
        if (revealTimer) clearTimeout(revealTimer);

        // Start "settle" timer. If nothing happens for 500ms, reveal content.
        // revealTimer and revealContainer are defined in feature-folders.js
        revealTimer = setTimeout(revealContainer, REVEAL_SETTLE_TIME);
      }
      // --- END FOUC LOGIC ---
    }
  } catch (e) {
    console.error("Error injecting folder button:", e);
  }
}

// Start Observer IMMEDIATELY, without waiting for DOMContentLoaded.
if (document.documentElement) {
  mainObserver = new MutationObserver(injectionLogic);

  // Observe document.documentElement (<html>) because document.body 
  // might not exist at document_start.
  mainObserver.observe(document.documentElement, mainObserverConfig);

  // Perform initial check in case parts are already present
  injectionLogic();
} else {
  console.error("Gemini Exporter: Could not find document.documentElement to start observer.");
}
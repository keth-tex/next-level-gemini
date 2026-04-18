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

// Wartet, bis Google alle Chats von selbst nachgeladen hat
function waitForGoogleLazyLoad() {
  return new Promise((resolve) => {
    let emptyChecks = 0;
    const maxEmptyChecks = 6; // Nach ~1,2 Sekunden ohne Spinner ist die Liste komplett

    const checkInterval = setInterval(() => {
       const spinner = document.querySelector('.loading-history-spinner-container, mat-progress-spinner');
       
       if (spinner) {
           emptyChecks = 0; // Spinner ist aktiv
       } else {
           emptyChecks++; // Spinner nicht gefunden
       }

       if (emptyChecks >= maxEmptyChecks) {
           clearInterval(checkInterval);
           resolve();
       }
    }, 200);
  });
}

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
    
    if (conversationContainer) {
      if (!isObservingChats) {
        isObservingChats = true;
        
        conversationContainer.style.display = 'flex';
        conversationContainer.style.flexDirection = 'column';
        
        const bardSidenav = document.querySelector('bard-sidenav');
        if (bardSidenav) {
          bardSidenav.addEventListener('dragenter', (e) => { if (e.dataTransfer.types.includes("text/gemini-chat-id")) e.preventDefault(); });
          bardSidenav.addEventListener('dragover', (e) => { 
              if (e.dataTransfer.types.includes("text/gemini-chat-id")) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } 
          });
          bardSidenav.addEventListener('drop', (e) => { if (e.dataTransfer.types.includes("text/gemini-chat-id")) e.preventDefault(); });
        }

        // --- Robuster Zwei-Phasen-Ablauf ---
        preloadAllChats().then(async () => {
          try {
              // Phase 1: Ordner initialisieren
              await prepareFoldersAndStartSync();
              
              // Sicherstellen, dass die Sortierung fertig ist
              if (typeof syncFullListOrder === 'function') {
                  await syncFullListOrder();
              }
              
              // Phase 2: Frame-genaues Aufdecken
              // requestAnimationFrame zwingt den Browser, das DOM-Update erst komplett 
              // durchzuführen und zu zeichnen (unsichtbar), bevor das CSS entfernt wird.
              requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                      setTimeout(() => {
                          const fouc = document.getElementById('gemini-folder-fouc-fix');
                          if (fouc) fouc.remove();
                          
                          conversationContainer.style.opacity = '1';
                          conversationContainer.style.pointerEvents = 'auto';
                          
                          if (typeof revealContainer === 'function') {
                              revealContainer();
                          }
                      }, 50); // Zusätzlicher minimaler Puffer für den Repaint
                  });
              });

          } catch (err) {
              console.error("Gemini Exporter: Fehler beim Ordner-Aufbau:", err);
              const fouc = document.getElementById('gemini-folder-fouc-fix');
              if (fouc) fouc.remove();
              conversationContainer.style.opacity = '1';
              conversationContainer.style.pointerEvents = 'auto';
          }
        });
      }
    }
  } catch (e) {
    console.error("Error injecting folder button:", e);
  }

  // 3.5. Database Export Button
  try {
    const conversationContainer = document.querySelector('.conversations-container');
    if (conversationContainer && typeof injectDatabaseExportButton === 'function') {
      injectDatabaseExportButton();
    }
  } catch (e) {
    console.error("Error injecting database export button:", e);
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

// Unabhängiger Observer, der ausschließlich auf Google-Toast-Meldungen (Umbenennen, Pin) lauscht.
const googleToastObserver = new MutationObserver((mutationsList) => {
    for (const mutation of mutationsList) {
        if (mutation.addedNodes.length > 0) {
            mutation.addedNodes.forEach(node => {
                // Nur vollwertige HTML-Elemente (nodeType 1) prüfen
                if (node.nodeType === 1) {
                    
                    // Suchen nach dem spezifischen Angular Material Snack-Bar Container
                    const snackbar = (node.matches && node.matches('mat-snack-bar-container')) 
                                     ? node 
                                     : (node.querySelector ? node.querySelector('mat-snack-bar-container') : null);

                    if (snackbar && snackbar.textContent) {
                        const text = snackbar.textContent.toLowerCase();
                        
                        // Nur reagieren, wenn die Snack-Bar die relevanten Stichworte enthält
                        if (text.includes('umbenannt') || text.includes('renamed') || 
                            text.includes('angepinnt') || text.includes('pinned') || 
                            text.includes('losgelöst') || text.includes('unpinned')) {
                            
                            console.log("Gemini Exporter: Aktion in Snack-Bar erkannt:", text.trim());
                            if (typeof triggerExternalUpdate === 'function') {
                                triggerExternalUpdate();
                            }
                        } else if (text.includes('gelöscht') || text.includes('deleted')) {
                            // Reagiert auf die Bestätigung einer erfolgreichen Löschung
                            console.log("Gemini Exporter: Lösch-Bestätigung in Snack-Bar erkannt:", text.trim());
                            if (typeof executeConfirmedDeletion === 'function') {
                                executeConfirmedDeletion();
                            }
                        }
                    }
                }
            });
        }
    }
});

// Startet den Listener
window.addEventListener('DOMContentLoaded', () => {
    if (document.body) {
        // characterData wird nicht mehr benötigt, childList reicht für hinzugefügte Container
        googleToastObserver.observe(document.body, { childList: true, subtree: true });
    }
});
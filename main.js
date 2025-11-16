// === GLOBALE VARIABLEN FÜR OBSERVER-LOGIK ===
let mainObserver; 

const mainObserverConfig = {
  childList: true,
  subtree: true,
  attributes: false
};

// === KOMBINIERTE INJEKTIONS-LOGIK ===

function injectionLogic() {
  
  // 1. Download-Button-Logik
  try {
    const reliableElement = document.querySelector('div[data-test-id="pillbox"]');
    const buttonWrapper = document.getElementById('gemini-tex-export-button-wrapper');
    const mainContainer = reliableElement ? reliableElement.parentElement : null;
    if (reliableElement && mainContainer && !buttonWrapper) {
      console.log("Gemini Exporter: Pillbox found. Injecting button.");
      const buttonElement = createExportButton(); // Aus feature-export.js
      mainContainer.prepend(buttonElement);
    }
  } catch (e) {
    console.error("Fehler bei Button-Injektion:", e);
  }

  // 2. Sidebar-Resizer-Logik
  try {
    const sidebarEl = document.querySelector('bard-sidenav');
    const resizerEl = document.getElementById('gemini-sidebar-resizer');
    if (sidebarEl) {
      const isOpen = sidebarEl.offsetWidth > 100; 
      if (isOpen && !resizerEl) {
        console.log("Gemini Exporter: Sidebar opened. Injecting resizer.");
        const resizer = document.createElement('div');
        resizer.id = 'gemini-sidebar-resizer';
        resizer.addEventListener('mousedown', startDrag); // Aus feature-resizer.js
        resizer.addEventListener('dblclick', autoResizeSidebar); // Aus feature-resizer.js
        sidebarEl.appendChild(resizer);
        applySavedWidth(sidebarEl); // Aus feature-resizer.js
      } else if (!isOpen && resizerEl) {
        console.log("Gemini Exporter: Sidebar closed. Cleaning up resizer.");
        resizerEl.remove();
      }
    } else if (resizerEl) {
        console.log("Gemini Exporter: Sidebar not found. Cleaning up resizer.");
        resizerEl.remove();
    }
  } catch (e) {
      console.error("Fehler bei Resizer-Injektion:", e);
  }
  
  
// 3. "Neuer Ordner"-Button, Ordner-Header UND Start des Prozesses
  try {
    const conversationContainer = document.querySelector('.conversations-container');
    
    if (conversationContainer) {
      const parent = conversationContainer.parentElement;

      // --- MODIFIZIERUNG HIER ---
      // Prüft auf die neue Wrapper-ID statt auf die Button-ID
      if (!document.getElementById('new-folder-button-wrapper')) {
      // --- ENDE MODIFIZIERUNG ---
        console.log("Gemini Exporter: Injiziere 'Neuer Ordner'-Button.");
        parent.insertBefore(createFolderButton(), conversationContainer);
      }
      
      if (!isObservingChats) { // 'isObservingChats' ist in feature-folders.js
          isObservingChats = true;
          
          console.log("Gemini Exporter: Setze Container auf FLEX und starte Observer.");
          
          conversationContainer.style.display = 'flex';
          conversationContainer.style.flexDirection = 'column';

          prepareFoldersAndStartSync();

        const bardSidenav = document.querySelector('bard-sidenav');

        if (bardSidenav) {
            // --- NEUER GAP-FIX START ---
            bardSidenav.addEventListener('dragenter', (event) => {
                // Verhindert, dass der Container selbst als
                // "aktives" Drop-Ziel erscheint (z.B. Hintergrund ändert)
                if (event.dataTransfer.types.includes("text/gemini-chat-id")) {
                    event.preventDefault();
                }
            });

            bardSidenav.addEventListener('dragover', (event) => {
                // Wir erlauben das "dragover" nur, wenn ein Chat gezogen wird
                if (event.dataTransfer.types.includes("text/gemini-chat-id")) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move"; 
                }
            });

            bardSidenav.addEventListener('drop', (event) => {
                // Verhindern, dass der Browser auf einen Drop in der Lücke
                // reagiert (z.B. als Navigation).
                if (event.dataTransfer.types.includes("text/gemini-chat-id")) {
                    event.preventDefault(); 
                    // Der Drop "verpufft" einfach in der Lücke.
                }
            });
            // --- NEUER GAP-FIX ENDE ---
        }

          // Rendere Header (wird auch versteckt sein)
          // renderInitialFolders(); // Aus feature-folders.js
          
          // Starte den Observer NUR für Chat-Änderungen (Sortierung)
          // chatObserver = new MutationObserver(handleChatListMutations); // 'chatObserver' & 'handleChatListMutations' aus feature-folders.js
          // chatObserver.observe(conversationContainer, chatObserverConfig); // 'chatObserverConfig' aus feature-folders.js

          // --- MODIFIKATION: "FORCE-SCROLL" STARTEN ---
                // Statt eines passiven Timers starten wir jetzt
                // aktiv den Ladevorgang.
                // console.log("Gemini Exporter: Starte 'Force-Scroll', um alle Chats zu laden...");
                // forceLoadAllChats(); // NEUE FUNKTION (aus feature-folders.js)
                // --- ENDE MODIFIKATION ---
          
          // Führe eine erste Synchronisierung aus (sortiert die ersten Elemente, während sie noch unsichtbar sind)
          // triggerDebouncedSync(); // Aus feature-folders.js
      }

      // --- MODIFIZIERTE FOUC-LOGIK ---
      // Dieser mainObserver-Lauf sieht *jede* Mutation (Batches, Spinner, Empty-State).
      // Solange Mutationen stattfinden, wird der Reveal-Timer zurückgesetzt.
      if (!isInitialSortComplete) { // aus feature-folders.js
          if (revealTimer) clearTimeout(revealTimer); // revealTimer aus feature-folders.js
          
          // Starte den "Ruhe"-Timer. Wenn 750ms lang nichts passiert, wird aufgedeckt.
          revealTimer = setTimeout(revealContainer, REVEAL_SETTLE_TIME); // revealContainer & REVEAL_SETTLE_TIME aus feature-folders.js
      }
      // --- ENDE FOUC-LOGIK ---

    }
  } catch(e) {
    console.error("Fehler bei 'Neuer Ordner'-Button-Injektion:", e);
  }
}

// Startet den Observer
window.addEventListener('DOMContentLoaded', (event) => {
    
    if (!document.body) {
        console.error("Gemini Exporter: document.body not found at DOMContentLoaded.");
        return;
    }
    
    mainObserver = new MutationObserver(injectionLogic);
    mainObserver.observe(document.body, mainObserverConfig);
    injectionLogic();
});
// === GLOBALE VARIABLEN NUR FÜR ORDNER-LOGIK ===
let chatObserver;
let isRendering = false;
let isObservingChats = false;
let originalFolderState = new Map(); // <-- NEU: Zwischenspeicher

let revealTimer = null; // NEU: Separater Timer für das Aufdecken
const REVEAL_SETTLE_TIME = 500; // NEU: Längere "Ruhe"-Zeit, um alle Batches abzuwarten

let isInitialSortComplete = false;

const chatObserverConfig = {
    childList: true, 
    subtree: false,
    characterData: false
};

// [Auszug aus feature-folders.js]
async function prepareFoldersAndStartSync() {
    console.log("Gemini Exporter: Setze alle Ordner auf 'isOpen: false'...");

    // 1. Hole die aktuelle Struktur
    let structure = await getFolderStructure();
    
    // 1.5. Speichere den ursprünglichen Zustand
    originalFolderState.clear(); 
    structure.forEach(folder => {
        originalFolderState.set(folder.id, folder.isOpen);
    });
    console.log("Gemini Exporter: Ursprünglicher Ordner-Status zwischengespeichert.");

    // 2. Modifiziere die Daten
    structure.forEach(folder => {
        folder.isOpen = false;
    });

    // 3. Speichere die modifizierte Struktur zurück
    await chrome.storage.local.set({ 'folderStructure': structure });
    
    console.log("Gemini Exporter: 'Close-All' abgeschlossen. Rendere Header & starte Observer...");

    // 4. a. Rendere die (jetzt alle geschlossenen) Header
    renderInitialFolders(); 
    
    // 4. b. Starte den "Live" Observer (Wieder hier)
    const conversationContainer = document.querySelector('.conversations-container');
    if (conversationContainer) {
        chatObserver = new MutationObserver(handleChatListMutations);
        chatObserver.observe(conversationContainer, chatObserverConfig);
    }
    
    // 4. c. Starte die ERSTE "Live" Sortierung
    // (ruft syncFullListOrder direkt statt triggerDebouncedSync)
    console.log("Gemini Exporter: Führe erste Sortierung aus.");
    syncFullListOrder();
}

// === ORDNER-FUNKTIONEN (DATEN) ===

async function getFolderStructure() {
  // --- (Unverändert) ---
  let data = await chrome.storage.local.get('folderStructure');
// ... (Restlicher Code für getFolderStructure) ...
  if (data.folderStructure && Array.isArray(data.folderStructure) && data.folderStructure.find(f => f.isDefault)) {
    return data.folderStructure; 
  }
  console.log("Gemini Exporter: Keine gültige Ordnerstruktur gefunden. Erstelle Standard...");
  const defaultStructure = [
    {
      id: "default-chats",
      name: "Chats",
      chatIds: [], 
      isOpen: true,
      isDefault: true 
    }
  ];
  if (data.folderStructure && Array.isArray(data.folderStructure)) {
      data.folderStructure.forEach(oldFolder => {
        if (oldFolder.id !== "default-chats") {
            oldFolder.isDefault = false; 
            defaultStructure.push(oldFolder);
        }
      });
  }
  await chrome.storage.local.set({ 'folderStructure': defaultStructure });
  return defaultStructure;
}

async function getChatFolderMap() {
  // --- (Unverändert) ---
    const structure = await getFolderStructure();
// ... (Restlicher Code für getChatFolderMap) ...
    const chatFolderMap = new Map();
    let defaultFolderId = 'default-chats';
    for (const folder of structure) {
        if (folder.isDefault) {
            defaultFolderId = folder.id;
        }
        if (Array.isArray(folder.chatIds)) { 
            for (const chatId of folder.chatIds) {
              chatFolderMap.set(chatId, folder.id);
            }
        }
    }
    return { chatFolderMap, defaultFolderId };
}

// === ORDNER-FUNKTIONEN (UI & HANDLER) ===

function createFolderButton() {
    // 1. Erstellt den <mat-action-list> Wrapper
    const listWrapper = document.createElement('mat-action-list');
    listWrapper.id = 'new-folder-button-wrapper'; 
    // HIER IST DER FIX: 'top-action-list' hinzugefügt
    listWrapper.className = 'mat-mdc-action-list mat-mdc-list-base mdc-list top-action-list';
    listWrapper.setAttribute('role', 'group');

    // 2. Erstellt das <button> Element
    const button = document.createElement('button');
    button.id = 'new-folder-button'; 
    button.className = 'mat-mdc-list-item mdc-list-item mat-ripple mat-mdc-tooltip-trigger side-nav-action-button explicit-gmat-override mat-mdc-list-item-interactive mdc-list-item--with-leading-icon mat-mdc-list-item-single-line mdc-list-item--with-one-line new-folder-button';
    button.setAttribute('type', 'button');
    button.setAttribute('aria-label', 'Neuer Ordner');

    // 3. Erstellt den Icon-Container
    const iconContainer = document.createElement('div');
    iconContainer.className = 'mat-mdc-list-item-icon icon-container explicit-gmat-override mdc-list-item__start new-folder-icon';
    
    // 4. Erstellt das <mat-icon> Element
    const icon = document.createElement('mat-icon');
    icon.className = 'mat-icon notranslate gds-icon-l google-symbols mat-ligature-font mat-icon-no-color new-folder-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('data-mat-icon-type', 'font');
    icon.textContent = 'folder'; // <-- Ändern Sie dies bei Bedarf
    
    iconContainer.appendChild(icon);

    // 5. Erstellt die verschachtelten Text-Spans
    const contentSpan = document.createElement('span');
    contentSpan.className = 'mdc-list-item__content';
    
    const unscopedSpan = document.createElement('span');
    unscopedSpan.className = 'mat-mdc-list-item-unscoped-content mdc-list-item__primary-text';
    
    const textSpan = document.createElement('span');
    textSpan.className = 'gds-body-m'; // Die Text-Klasse von "Gems entdecken"
    textSpan.textContent = 'Neuer Ordner';
    
    unscopedSpan.appendChild(textSpan);
    contentSpan.appendChild(unscopedSpan);

    // 6. Erstellt den Fokus-Indikator
    const focusIndicator = document.createElement('div');
    focusIndicator.className = 'mat-focus-indicator';

    // 7. Baut den Button zusammen
    button.appendChild(iconContainer);
    button.appendChild(contentSpan);
    button.appendChild(focusIndicator);
    
    // 8. Fügt den Klick-Listener hinzu
    button.addEventListener('click', handleNewFolderClick);

    // 9. Fügt den Button zum Wrapper hinzu
    listWrapper.appendChild(button);

    // 10. Gibt den gesamten Wrapper zurück
    return listWrapper;
}

function renderSingleFolder(folder, index, totalFolders) {
  // --- (Unverändert) ---
    const header = document.createElement('div');
// ... (Restlicher Code für renderSingleFolder) ...
    header.className = 'folder-header';
    header.dataset.folderId = folder.id;

    let baseOrder = 1000;
    try {
        baseOrder = (parseInt(folder.id.replace(/\D/g,'')) % 1000) || 1000;
    } catch(e) {}
    header.style.order = baseOrder;
    
    header.innerHTML = `
      <mat-icon class="mat-icon notranslate google-symbols mat-ligature-font mat-icon-no-color folder-toggle-icon" aria-hidden="true">chevron_right</mat-icon>
      <span class="folder-name">${folder.name}</span>
      
      <span class="folder-actions">
        ${!folder.isDefault ? `
          <button class="action-btn" data-action="move-up" title="Nach oben" ${index === 0 ? 'disabled style="cursor: pointer;"' : ''}>
            <mat-icon class="mat-icon notranslate google-symbols mat-ligature-font" aria-hidden="true">arrow_upward</mat-icon>
          </button>
          <button class="action-btn" data-action="move-down" title="Nach unten" ${index === totalFolders - 1 ? 'disabled style="cursor: pointer;"' : ''}>
            <mat-icon class="mat-icon notranslate google-symbols mat-ligature-font" aria-hidden="true">arrow_downward</mat-icon>
          </button>
        ` : ''}
        
        <button class="action-btn" data-action="rename" title="Umbenennen">
          <mat-icon class="mat-icon notranslate google-symbols mat-ligature-font" aria-hidden="true">create</mat-icon>
        </button>
        
        ${!folder.isDefault ? `
          <button class="action-btn" data-action="delete" title="Löschen">
            <mat-icon class="mat-icon notranslate google-symbols mat-ligature-font" aria-hidden="true">delete_outline</mat-icon>
          </button>
        ` : ''}
      </span>
    `;
    
    if (folder.isOpen) {
      header.classList.add('is-open');
    }
    
    header.addEventListener('click', (e) => {
        if (e.target.closest('.action-btn')) {
            return;
        }
        toggleFolder(folder.id);
    });

    header.querySelector('.folder-actions').addEventListener('click', (e) => {
        const button = e.target.closest('.action-btn');
        if (!button) return;
        
        e.stopPropagation(); 
        
        const action = button.dataset.action;
        switch (action) {
            case 'move-up':
                handleMoveFolder(folder.id, 'up');
                break;
            case 'move-down':
                handleMoveFolder(folder.id, 'down');
                break;
            case 'rename':
                const nameSpan = header.querySelector('.folder-name');
                activateInlineEdit(nameSpan, folder.id);
                break;
            case 'delete':
                handleDeleteFolder(folder.id);
                break;
        }
    });
    
    header.addEventListener('dragover', handleDragOverFolder);
    header.addEventListener('dragleave', handleDragLeaveFolder);
    header.addEventListener('drop', handleDropOnFolder);
    
    return header;
}

async function handleNewFolderClick() {
  // --- (Modifiziert) ---
    let structure = await getFolderStructure();
// ... (Restlicher Code für handleNewFolderClick) ...
    
    const newFolder = {
      id: `folder-${crypto.randomUUID()}`,
      name: "Neuer Ordner", 
      chatIds: [],
      isOpen: true, 
      isDefault: false
    };
    
    const defaultIndex = structure.findIndex(f => f.isDefault);
    if (defaultIndex > -1) {
        structure.splice(defaultIndex, 0, newFolder);
    } else {
        structure.push(newFolder);
    }
    
    await chrome.storage.local.set({ 'folderStructure': structure });
    console.log(`Gemini Exporter: Ordner '${newFolder.name}' hinzugefügt.`);
    
    // --- FLICKER-FIX ---
    // 1. Manuell den Header rendern
    const container = document.querySelector('.conversations-container');
    if (container) {
        const customFolders = structure.filter(f => !f.isDefault);
        const index = customFolders.findIndex(f => f.id === newFolder.id);
        const newHeaderEl = renderSingleFolder(newFolder, index, customFolders.length);
        container.appendChild(newHeaderEl);
    }
    
    // 2. Sync *sofort* aufrufen (KEIN Debounce, User-Aktion)
    await syncFullListOrder(); 
    
    // 3. Edit-Modus starten
    setTimeout(() => {
        const newHeader = document.querySelector(`.folder-header[data-folder-id="${newFolder.id}"]`);
        if (newHeader) {
            const nameSpan = newHeader.querySelector('.folder-name');
            activateInlineEdit(nameSpan, newFolder.id);
        }
    }, 0);
}

async function toggleFolder(folderId) {
  let structure = await getFolderStructure();
  const folder = structure.find(f => f.id === folderId);
  if (!folder) return;
  
  folder.isOpen = !folder.isOpen;
  await chrome.storage.local.set({ 'folderStructure': structure });

  const folderHeader = document.querySelector(`.folder-header[data-folder-id="${folderId}"]`);
  if (folderHeader) {
      if (folder.isOpen) {
        folderHeader.classList.add('is-open');
      } else {
        folderHeader.classList.remove('is-open');
      }
  }

  const chatsInFolder = document.querySelectorAll(
      `.conversations-container .conversation-items-container[data-folder-id="${folderId}"]`
  );
  
  console.log(`Gemini Exporter: Schalte ${chatsInFolder.length} Chats auf ${folder.isOpen ? 'sichtbar' : 'unsichtbar'}.`);
  
  // === MODIFIZIERTER TEIL (in toggleFolder) ===
  chatsInFolder.forEach(chatEl => {
      
      // 1. STELLE SICHER, DASS ES 'grid' IST
      // Überschreibe den 'display: block'-Stil von Gemini
      // chatEl.style.display = 'grid';
      
      // 2. Schalte die Klasse für die Animation um
      if (folder.isOpen) {
        // Die Klasse entfernen, um die "1fr"-Animation zu starten
        chatEl.classList.remove('chat-item-rolled-up'); 
      } else {
        // Die Klasse hinzufügen, um die "0fr"-Animation zu starten
        chatEl.classList.add('chat-item-rolled-up'); 
      }
    });
  // === ENDE MODIFIKATION ===
}

async function renderInitialFolders() {
  // --- (Modifiziert) ---
  if (isRendering) return;
  isRendering = true;
  if (mainObserver) mainObserver.disconnect(); // WICHTIG: mainObserver ist in main.js
// ... (Restlicher Code für renderInitialFolders) ...
  const structure = await getFolderStructure();
  const conversationContainer = document.querySelector('.conversations-container');
  
  if (!conversationContainer) {
    console.error("Gemini Exporter: Konnte .conversations-container für Header-Injektion nicht finden.");
    isRendering = false;
    if (mainObserver) mainObserver.observe(document.body, mainObserverConfig); // mainObserverConfig ist in main.js
    return;
  }
  
  conversationContainer.querySelectorAll('.folder-header').forEach(h => h.remove());
  
  const customFolders = structure.filter(f => !f.isDefault);
  const defaultFolder = structure.find(f => f.isDefault);
  
  customFolders.forEach((folder, index) => {
    const folderEl = renderSingleFolder(folder, index, customFolders.length);
    conversationContainer.appendChild(folderEl);
  });
  
  if (defaultFolder) {
      const folderEl = renderSingleFolder(defaultFolder, 0, 1);
      conversationContainer.appendChild(folderEl);
  }

  if (mainObserver) mainObserver.observe(document.body, mainObserverConfig);
  isRendering = false;
}

/**
 * --- NEU: Gekapselte Reveal-Funktion ---
 * Diese Funktion wird aufgerufen, NACHDEM sich die Mutationen beruhigt haben.
 */
async function revealContainer() {
    if (isInitialSortComplete) return; // Wurde bereits aufgedeckt

    const container = document.querySelector('.conversations-container');
    if (!container) {
        console.warn("Gemini Exporter: Reveal-Timer abgelaufen, aber Container nicht gefunden.");
        return;
    }

    const hasChats = container.querySelector('.conversation-items-container');
    const isEmpty = document.querySelector('.empty-state-container'); // Globale Prüfung

    // Wir decken nur auf, wenn es auch Inhalt gibt (Chats oder die "Leer"-Nachricht)
    if (hasChats || isEmpty) {
        console.log("Gemini Exporter: Mutations haben sich beruhigt. Führe finalen Sync aus und decke auf.");
        
        // --- ÄNDERUNG START ---
        // 1. Stelle den ursprünglichen 'isOpen'-Status wieder her
        if (originalFolderState.size > 0) {
            console.log("Gemini Exporter: Stelle ursprünglichen Ordner-Status wieder her...");
            let structure = await getFolderStructure();
            let changed = false;
            
            structure.forEach(folder => {
                const originalState = originalFolderState.get(folder.id);
                // Prüfe, ob der gespeicherte Zustand existiert UND
                // ob er sich vom (aktuell 'false') Zustand im Storage unterscheidet.
                if (originalState !== undefined && folder.isOpen !== originalState) {
                    folder.isOpen = originalState;
                    changed = true;
                }
            });
            
            // Speichere nur, wenn es Änderungen gab
            if (changed) {
                await chrome.storage.local.set({ 'folderStructure': structure });
            }
            originalFolderState.clear(); // Speicher leeren
        }
        // --- ÄNDERUNG ENDE ---

        // WICHTIG: Führe die Sortierung ein letztes Mal aus,
        // um den *finalen* Zustand zu sortieren, BEVOR es sichtbar wird.
        await syncFullListOrder(); 

        // --- NEUE REVEAL LOGIK ---

        // 1. Finde und entferne das FOUC-Fix-Stylesheet.
        //    Das entfernt ALLE FOUC-Regeln auf einen Schlag
        //    (für Pins, Spinner, Scrollbar und Container).
        const foucStyle = document.getElementById('gemini-folder-fouc-fix');
        if (foucStyle) {
            foucStyle.remove();
            console.log("Gemini Exporter: FOUC-Stylesheet entfernt.");
        }

        // 2. Setze die Sichtbarkeit des Containers explizit auf 'visible' (inline).
        //    Dies dient als Fallback und überschreibt die (jetzt entfernte)
        //    'visibility: hidden'-Regel aus dem Stylesheet.
        container.style.visibility = 'visible';
        
        // 3. (Optional, aber sauber): Entferne den !important-Scrollbar-Fix 
        //    vom Elternelement als Fallback, falls das Stylesheet-Entfernen fehlschlägt.
        const sidenavContent = document.querySelector('bard-sidenav-content');
        if (sidenavContent) {
            sidenavContent.style.overflow = ''; // Setzt es auf den Standardwert zurück
        }
        // --- ENDE NEUE LOGIK ---

        isInitialSortComplete = true;
        console.log("Gemini Exporter: Liste sortiert und aufgedeckt.");
    } else {
        // Timer ist abgelaufen, aber es gibt nichts zu sehen (sollte nicht passieren)
        console.log("Gemini Exporter: Reveal-Timer abgelaufen, aber weder Chats noch Empty-State gefunden. Warte auf nächste Mutation.");
    }
}

function handleChatListMutations(mutations) {
    // triggerDebouncedSync(); // <-- ALT
    
    // NEU: Rufe die Sortierung sofort auf.
    // Die 'isRendering'-Sperre in syncFullListOrder
    // verhindert Überlappungen.
    syncFullListOrder();
}

async function syncFullListOrder() {
  // --- (Modifiziert) ---
    if (isRendering) return;
    isRendering = true;
// ... (Restlicher Code für syncFullListOrder) ...
    const structure = await getFolderStructure();
    const { chatFolderMap, defaultFolderId } = await getChatFolderMap();

    const container = document.querySelector('.conversations-container');
    if (!container) {
        isRendering = false;
        return;
    }
    const allChatItems = container.querySelectorAll('.conversation-items-container');
    
    const orderCounters = new Map();
    let baseOrder = 0;

    // --- MODIFIZIERT: FLICKER-FIX ---
    // Trenne Ordner, um Button-Status zu aktualisieren
    let customFolders = structure.filter(f => !f.isDefault);
    const defaultFolder = structure.find(f => f.isDefault);
    let sortedStructure = defaultFolder ? [...customFolders, defaultFolder] : customFolders;

    sortedStructure.forEach((folder, index) => {
        baseOrder = (index + 1) * 1000;
        
        const headerEl = container.querySelector(`.folder-header[data-folder-id="${folder.id}"]`);
        if (headerEl) {
            headerEl.style.order = baseOrder;

            // Aktualisiere Button-Status
            if (!folder.isDefault) {
                const upBtn = headerEl.querySelector('[data-action="move-up"]');
                const downBtn = headerEl.querySelector('[data-action="move-down"]');
                // Finde den echten Index innerhalb der customFolders
                const customIndex = customFolders.findIndex(f => f.id === folder.id);
                
                if (upBtn) upBtn.disabled = (customIndex === 0);
                if (downBtn) downBtn.disabled = (customIndex === customFolders.length - 1);
            }
        }
        
        orderCounters.set(folder.id, baseOrder + 1);
    });
    // --- ENDE FLICKER-FIX ---


    allChatItems.forEach(chatEl => {
        let chatId = chatEl.dataset.chatId;
        if (!chatId) {
            const conversationEl = chatEl.querySelector('[data-test-id="conversation"]');
            if (conversationEl && conversationEl.hasAttribute('jslog')) {
                const jslog = conversationEl.getAttribute('jslog');
                const match = jslog.match(/"(c_[a-f0-9]+)"/);
                if (match && match[1]) {
                    chatId = match[1];
                    chatEl.dataset.chatId = chatId;
                }
            }
        }
        if (!chatId) {
            chatEl.style.order = '99999';
            return;
        }
        
        if (!chatEl.hasAttribute('draggable')) {
            chatEl.setAttribute('draggable', 'true');
            chatEl.addEventListener('dragstart', handleDragStartChat);
            chatEl.addEventListener('dragover', handleDragOverChat);
            chatEl.addEventListener('dragleave', handleDragLeaveChat);
            chatEl.addEventListener('drop', handleDropOnChat);
        }

        const folderId = chatFolderMap.get(chatId) || defaultFolderId;
        const folder = structure.find(f => f.id === folderId) || structure.find(f => f.isDefault);

        let order = orderCounters.get(folder.id);
        chatEl.style.order = order;
        
        orderCounters.set(folder.id, order + 1);

        // === KORRIGIERTER BLOCK (ersetzt alles) ===
        
        // 1. ÜBERSCHREIBE DEN INLINE-STYLE VON GEMINI
        // Gemini setzt 'display: block'. Wir überschreiben es mit 'display: grid'.
        // Dies ist der einzige Weg, um die Grid-Animation zu aktivieren.
        // chatEl.style.display = 'grid'; 

        // 2. Setze den initialen Zustand (offen/geschlossen)
        // (Das war bereits korrekt)
        if (folder.isOpen) {
            chatEl.classList.remove('chat-item-rolled-up'); 
        } else {
            chatEl.classList.add('chat-item-rolled-up');
        }
        // === ENDE KORREKTUR ===
        
        chatEl.dataset.folderId = folder.id;
    }); // <-- Ende der allChatItems.forEach

    isRendering = false;
}

// === HANDLER-FUNKTIONEN FÜR ORDNERVERWALTUNG ===

function activateInlineEdit(nameSpan, folderId) {
  // --- (Unverändert) ---
    if (!nameSpan || !folderId || nameSpan.isEditing) return;
// ... (Restlicher Code für activateInlineEdit) ...
    nameSpan.isEditing = true; 
    
    const header = nameSpan.closest('.folder-header');
    const originalName = nameSpan.textContent;
    
    const input = document.createElement('input');
    input.type = 'text';
    input.value = originalName;
    input.className = 'folder-name-input'; 
    
    nameSpan.style.display = 'none';
    header.insertBefore(input, nameSpan.nextSibling);
    input.focus();

    // --- ÄNDERUNG HIER ---
    // Statt input.select(); setzen wir die Einfügemarke ans Ende
    const len = input.value.length;
    input.setSelectionRange(len, len);
    // --- ENDE ÄNDERUNG ---

    const saveChanges = async () => {
        const newName = input.value.trim();
        
        input.removeEventListener('keydown', handleKey);
        input.removeEventListener('blur', saveChanges);

        input.remove();
        nameSpan.style.display = '';
        nameSpan.isEditing = false;
        
        if (newName && newName !== originalName) {
            let structure = await getFolderStructure();
            const folder = structure.find(f => f.id === folderId);
            if (folder) {
                folder.name = newName;
                await chrome.storage.local.set({ 'folderStructure': structure });
                nameSpan.textContent = newName;
            }
        } else {
            nameSpan.textContent = originalName;
        }
    };

    const handleKey = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveChanges();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            input.value = originalName; 
            saveChanges();
        }
    };
    
    input.addEventListener('keydown', handleKey);
    input.addEventListener('blur', saveChanges);
}

async function handleDeleteFolder(folderId) {
  // --- (Modifiziert) ---
    let structure = await getFolderStructure();
// ... (Restlicher Code für handleDeleteFolder) ...
    const folderIndex = structure.findIndex(f => f.id === folderId);
    if (folderIndex === -1 || structure[folderIndex].isDefault) return;
    
    const folder = structure[folderIndex];
    // if (!confirm(`Soll der Ordner "${folder.name}" wirklich gelöscht werden? Alle darin enthaltenen Chats werden in den "Chats"-Ordner verschoben.`)) {
        // return;
    // }

    const defaultFolder = structure.find(f => f.isDefault);
    if (!defaultFolder) {
        console.error("Gemini Exporter: Löschen fehlgeschlagen, kein Default-Ordner gefunden.");
        return;
    }

    defaultFolder.chatIds.unshift(...folder.chatIds);
    structure.splice(folderIndex, 1);
    await chrome.storage.local.set({ 'folderStructure': structure });
    
    // --- FLICKER-FIX ---
    // 1. Manuell den Header entfernen
    const headerEl = document.querySelector(`.folder-header[data-folder-id="${folderId}"]`);
    if (headerEl) headerEl.remove();
    
    // 2. Sync *sofort* aufrufen
    await syncFullListOrder();
    // --- ENDE FLICKER-FIX ---
}

async function handleMoveFolder(folderId, direction) { 
  // --- (Modifiziert) ---
    let structure = await getFolderStructure();
// ... (Restlicher Code für handleMoveFolder) ...
    
    let customFolders = structure.filter(f => !f.isDefault);
    const defaultFolder = structure.find(f => f.isDefault);
    
    const index = customFolders.findIndex(f => f.id === folderId);
    if (index === -1) return; 

    if (direction === 'up' && index > 0) {
        [customFolders[index], customFolders[index - 1]] = [customFolders[index - 1], customFolders[index]];
    } else if (direction === 'down' && index < customFolders.length - 1) {
        [customFolders[index], customFolders[index + 1]] = [customFolders[index + 1], customFolders[index]];
    } else {
        return; 
    }

    const newStructure = defaultFolder ? [...customFolders, defaultFolder] : customFolders;
    await chrome.storage.local.set({ 'folderStructure': newStructure });

    // --- FLICKER-FIX ---
    // 1. Sync *sofort* aufrufen.
    await syncFullListOrder();
    // --- ENDE FLICKER-FIX ---
}

// === DRAG-AND-DROP HANDLER ===

function handleDragStartChat(event) {
  // --- (Unverändert) ---
    const chatEl = event.currentTarget;
// ... (Restlicher Code für handleDragStartChat) ...    

    // --- NEU ---
    // Setzt eine globale Klasse auf das <html>-Element
    document.documentElement.classList.add('gemini-chat-is-dragging');
    // --- ENDE NEU ---

    event.dataTransfer.setData("text/gemini-chat-id", chatEl.dataset.chatId);
    event.dataTransfer.effectAllowed = "move";
    
    chatEl.classList.add('gemini-dragging');
    chatEl.addEventListener('dragend', handleDragEndChat, { once: true });
}

function handleDragEndChat(event) {
    // --- NEU ---
    // Entfernt die globale Klasse, sobald der Drag-Vorgang endet (beim Loslassen)
    document.documentElement.classList.remove('gemini-chat-is-dragging');
    // --- ENDE NEU ---

  // --- (Unverändert) ---
    event.currentTarget.classList.remove('gemini-dragging');
// ... (Restlicher Code für handleDragEndChat) ...
    
    document.querySelectorAll('.folder-header.gemini-drag-over').forEach(el => {
        el.classList.remove('gemini-drag-over');
    });
    document.querySelectorAll('.conversation-items-container.gemini-chat-drag-over').forEach(el => {
        el.classList.remove('gemini-chat-drag-over');
    });
}

function handleDragOverFolder(event) {
  // --- (Unverändert) ---
    if (!event.dataTransfer.types.includes("text/gemini-chat-id")) {
// ... (Restlicher Code für handleDragOverFolder) ...
        return;
    }
    
    event.preventDefault(); 
    event.dataTransfer.dropEffect = "move";
    event.currentTarget.classList.add('gemini-drag-over');
}

function handleDragLeaveFolder(event) {
  // --- (Unverändert) ---
    event.currentTarget.classList.remove('gemini-drag-over');
}

async function handleDropOnFolder(event) {
  // --- (Unverändert) ---
    event.preventDefault();
// ... (Restlicher Code für handleDropOnFolder) ...
    event.currentTarget.classList.remove('gemini-drag-over');
    
    const chatId = event.dataTransfer.getData("text/gemini-chat-id");
    const newFolderId = event.currentTarget.dataset.folderId;
    
    if (!chatId || !newFolderId) {
        console.error("Gemini Exporter: Drop-Fehler, chatId or newFolderId fehlt.");
        return;
    }
    
    await moveChatToFolder(chatId, newFolderId);
}

async function moveChatToFolder(chatId, newFolderId) {
  // --- (Unverändert) ---
    if (!chatId || !newFolderId) return;
// ... (Restlicher Code für moveChatToFolder) ...
    
    let structure = await getFolderStructure();
    let currentFolderId = null;

    structure.forEach(folder => {
        const index = folder.chatIds.indexOf(chatId);
        if (index > -1) {
            currentFolderId = folder.id;
        }
    });

    if (currentFolderId === newFolderId) {
        console.log("Gemini Exporter: Chat ist bereits im Zielordner. Breche Verschiebung ab.");
        return; 
    }

    if(currentFolderId) {
        const oldFolder = structure.find(f => f.id === currentFolderId);
        if (oldFolder) {
            const index = oldFolder.chatIds.indexOf(chatId);
            if (index > -1) {
                oldFolder.chatIds.splice(index, 1);
            }
        }
    }

    const newFolder = structure.find(f => f.id === newFolderId);
    if (newFolder) {
        newFolder.chatIds.unshift(chatId); 
    }

    await chrome.storage.local.set({ 'folderStructure': structure });
    await syncFullListOrder();
}

function handleDragOverChat(event) {
  // --- (Unverändert) ---
    if (!event.dataTransfer.types.includes("text/gemini-chat-id")) {
// ... (Restlicher Code für handleDragOverChat) ...
        return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    
    const draggedChatId = event.dataTransfer.getData("text/gemini-chat-id");
    if (event.currentTarget.dataset.chatId === draggedChatId) {
        return;
    }
    
    event.currentTarget.classList.add('gemini-chat-drag-over');
}

function handleDragLeaveChat(event) {
  // --- (Unverändert) ---
    event.currentTarget.classList.remove('gemini-chat-drag-over');
}

async function handleDropOnChat(event) {
  // --- (Unverändert) ---
    event.preventDefault();
// ... (Restlicher Code für handleDropOnChat) ...
    event.stopPropagation(); 
    event.currentTarget.classList.remove('gemini-chat-drag-over');
    
    const draggedChatId = event.dataTransfer.getData("text/gemini-chat-id");
    const targetChatId = event.currentTarget.dataset.chatId;

    if (!draggedChatId || !targetChatId || draggedChatId === targetChatId) {
        return; 
    }
    
    const { chatFolderMap, defaultFolderId } = await getChatFolderMap();
    const newFolderId = chatFolderMap.get(targetChatId) || defaultFolderId;

    await moveChatToFolder(draggedChatId, newFolderId);
}
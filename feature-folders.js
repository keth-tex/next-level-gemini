/**
 * feature-folders.js
 * Main controller for folder functionality.
 * Connects data, UI, and events.
 */

// === GLOBAL VARIABLES FOR FOLDER LOGIC ===
let chatObserver;
let isRendering = false;
let isObservingChats = false;
let originalFolderState = new Map(); // Temporary storage for state

let revealTimer = null; // Timer for revealing content
const REVEAL_SETTLE_TIME = 500; // Settle time to wait for batches

let isInitialSortComplete = false;

// Konfiguration: Wir achten nur auf Child-List-Changes (Hinzufügen/Entfernen von Chats)
const chatObserverConfig = {
  childList: true,
  subtree: false,
  characterData: false
};

// 20 Farben für ein perfektes 5x4 Raster
const FOLDER_COLORS = [
  '#000000', '#795548', '#FF5722', '#FF9800', '#FFC107', 
  '#F44336', '#E91E63', '#9C27B0', '#673AB7', '#3F51B5', 
  '#2196F3', '#03A9F4', '#00BCD4', '#009688', '#4CAF50', 
  '#8BC34A', '#CDDC39', '#9E9E9E', '#607D8B', '#FFFFFF'  
];

// === INITIALIZATION AND CONTROL ===

/**
 * Phase 1: Asynchrones, ereignisgesteuertes Pre-Loading aller Chats.
 * Nutzt die synchronisierte Datenbank und die Ziel-ID als exakte Abbruchkriterien.
 * Ein Notfall-Timeout dient als absolute Sicherung.
 */
async function preloadAllChats() {
  const structure = await getFolderStructure();
  let expectedChatCount = 0;

  if (Array.isArray(structure)) {
    structure.forEach(folder => {
      if (Array.isArray(folder.chatIds)) {
        expectedChatCount += folder.chatIds.length;
      }
    });
  }

  // Die ID deines ältesten Chats für den sofortigen Abbruch (Targeting)
  const TARGET_OLDEST_CHAT_ID = "c_5fe2ee1128772cab";

  return new Promise((resolve) => {
    // Zielgenauer Selektor, der das Haupt-Chatfenster ausschließt
    const scroller = document.querySelector('.overflow-container infinite-scroller') || 
                     document.querySelector('infinite-scroller:has(.loading-history-spinner-container)') ||
                     document.querySelector('infinite-scroller:has(.conversation-items-container)') ||
                     document.querySelector('bard-sidenav infinite-scroller');
    
    if (!scroller) {
      console.log("Gemini Exporter: infinite-scroller nicht gefunden.");
      resolve();
      return;
    }

    // Overlay an der echten Seitenleiste anbringen
    const progressOverlay = document.createElement('div');
    progressOverlay.id = 'gemini-folder-progress-overlay';
    progressOverlay.style.cssText = `
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      background: var(--gemini-background-color, var(--sys-color-surface, #1e1f20));
      z-index: 9999;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: var(--gemini-text-color, var(--sys-color-on-surface, #e3e3e3));
      font-family: Roboto, Arial, sans-serif;
    `;
    
    const progressBarContainer = document.createElement('div');
    progressBarContainer.style.cssText = `
      width: 80%; max-width: 300px;
      height: 8px;
      background: rgba(255,255,255,0.1);
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 12px;
    `;
    
    const progressBar = document.createElement('div');
    progressBar.style.cssText = `
      width: 0%;
      height: 100%;
      background: #a8c7fa;
      transition: width 0.1s linear;
    `;
    
    const progressText = document.createElement('div');
    progressText.style.fontSize = '14px';
    progressText.innerText = `Lade Chats … (0 / ${expectedChatCount})`;

    progressBarContainer.appendChild(progressBar);
    progressOverlay.appendChild(progressBarContainer);
    progressOverlay.appendChild(progressText);
    
    const sidenav = document.querySelector('bard-sidenav');
    if (sidenav) {
      sidenav.style.position = 'relative';
      sidenav.appendChild(progressOverlay);
    }

    let isScrollingLocked = false; 

    const emergencyResolve = setTimeout(() => {
      finishPreloading("Notfall-Timeout erreicht");
    }, 30000);

    function finishPreloading(reason) {
      clearTimeout(emergencyResolve);
      if (observer) observer.disconnect();
      if (progressOverlay) progressOverlay.remove();
      
      console.log(`Gemini Exporter: Pre-Loading abgeschlossen (${reason}).`);
      scroller.scrollTop = 0; 
      resolve();
    }

    function updateProgress() {
      const currentChats = document.querySelectorAll('.conversation-items-container').length;
      
      if (expectedChatCount > 0) {
        console.log(`expectedChatCount: ${expectedChatCount}`);
        console.log(`currentChats: ${currentChats}`);
        const percentage = Math.min(100, Math.round((currentChats / expectedChatCount) * 100));
        progressBar.style.width = `${percentage}%`;
        progressText.innerText = `Lade Chats … (${currentChats} / ${expectedChatCount})`;
      } else {
        progressText.innerText = `Lade Chats … (${currentChats})`;
      }

      // Abbruchbedingung 2: Gesamte Anzahl aus der Datenbank erreicht
      if (expectedChatCount > 0 && currentChats >= expectedChatCount) {
          finishPreloading("Erwartete Chat-Anzahl erreicht");
          return true;
      }

      // Abbruchbedingung 1: Ziel-Chat über jslog gefunden
      if (document.querySelector(`[jslog*="${TARGET_OLDEST_CHAT_ID}"]`)) {
          finishPreloading(`Ziel-Chat gefunden`);
          return true;
      }

      return false;
    }

    // Neue Hilfsfunktion für gedrosseltes Scrollen (Throttling)
    function triggerNextScroll() {
      if (isScrollingLocked) return;
      isScrollingLocked = true;
      
      // Eine winzige Pause gibt Googles Backend Zeit zum Durchatmen 
      // und verhindert Rate-Limiting-Fehler.
      setTimeout(() => {
        scroller.scrollTop = scroller.scrollHeight;
        isScrollingLocked = false;
      }, 80); 
    }

    const observer = new MutationObserver(() => {
      // Prüft die Abbruchbedingungen
      if (updateProgress()) return;
      // Scrollt weiter, falls noch nicht fertig
      triggerNextScroll();
    });

    observer.observe(scroller, { childList: true, subtree: true });

    if (!updateProgress()) {
      triggerNextScroll();
    }
  });
}

async function prepareFoldersAndStartSync() {
  console.log("Gemini Exporter: Setting all folders to 'isOpen: false'...");

  let structure = await getFolderStructure();

  // Cache original state
  originalFolderState.clear();
  structure.forEach(folder => {
    originalFolderState.set(folder.id, folder.isOpen);
  });

  // Modify data (start closed)
  structure.forEach(folder => {
    folder.isOpen = false;
  });

  await saveFolderStructure(structure);

  // Render headers
  renderInitialFolders();

  // INJECT NEW FOLDER BUTTON (Updated location)
  injectFolderButton();

  // Start Observer
  const conversationContainer = document.querySelector('.conversations-container');
  if (conversationContainer) {
    chatObserver = new MutationObserver(handleChatListMutations);
    chatObserver.observe(conversationContainer, chatObserverConfig);
  }

  // First sort
  syncFullListOrder();
}

/**
 * Injects the "New Folder" button into the desktop controls list.
 * It places it BEFORE the TOC button if it exists, or at the top of the list.
 */
function injectFolderButton() {
  // Wait for the list to appear
  const SIDEBAR_ACTION_LIST_SELECTOR = 'mat-action-list.desktop-controls';
  
  const waitForList = (selector, callback) => {
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
  };

  waitForList(SIDEBAR_ACTION_LIST_SELECTOR, (actionList) => {
     if (document.getElementById('new-folder-button')) return;

     // Lock to prevent mutation loops
     const wasModifying = window.isGeminiModifyingDOM;
     window.isGeminiModifyingDOM = true;

     try {
         if (typeof createFolderButton === 'function') {
             const folderBtnWrapper = createFolderButton(); // Returns side-nav-action-button

             const tocBtn = document.getElementById('gemini-toc-toggle-button');
             if (tocBtn) {
                 // Insert BEFORE the TOC button wrapper
                 const tocWrapper = tocBtn.closest('side-nav-action-button');
                 if (tocWrapper) {
                     actionList.insertBefore(folderBtnWrapper, tocWrapper);
                 } else {
                     actionList.prepend(folderBtnWrapper);
                 }
             } else {
                 // TOC button not there yet, just prepend to top
                 actionList.prepend(folderBtnWrapper);
             }
         }
     } finally {
         window.isGeminiModifyingDOM = wasModifying;
     }
  });
}

// === FOLDER LOGIC (ACTIONS & SYNC) ===

async function handleNewFolderClick() {
  let structure = await getFolderStructure();

  const randomColor = FOLDER_COLORS[Math.floor(Math.random() * FOLDER_COLORS.length)];

  const newFolder = {
    id: `folder-${crypto.randomUUID()}`,
    name: "Neuer Ordner",
    chatIds: [],
    isOpen: true,
    isDefault: false,
    color: randomColor 
  };

  const defaultIndex = structure.findIndex(f => f.isDefault);
  if (defaultIndex > -1) {
    structure.splice(defaultIndex, 0, newFolder);
  } else {
    structure.push(newFolder);
  }

  await saveFolderStructure(structure);

  const container = document.querySelector('.conversations-container');
  if (container) {
    const customFolders = structure.filter(f => !f.isDefault);
    const index = customFolders.findIndex(f => f.id === newFolder.id);
    const newHeaderEl = renderSingleFolder(newFolder, index, customFolders.length);
    
    // NEU: Bereite die Slide-Down Animation vor
    newHeaderEl.classList.add('folder-rolled-up');
    newHeaderEl.dataset.isNew = "true"; // Schützt vor syncFullListOrder
    
    container.appendChild(newHeaderEl);
    
    await syncFullListOrder();

    // NEU: Zwingt den Browser, den unsichtbaren Status zu registrieren (verhindert Flackern)
    void newHeaderEl.offsetHeight;

    // Startet die Aufklapp-Animation und den Bearbeitungsmodus
    newHeaderEl.classList.remove('folder-rolled-up');
    delete newHeaderEl.dataset.isNew;
    
    const nameSpan = newHeaderEl.querySelector('.folder-name');
    activateInlineEdit(nameSpan, newFolder.id, true);
  }
}

async function handleAddSubfolder(parentId) {
  let structure = await getFolderStructure();

  const parentIndex = structure.findIndex(f => f.id === parentId);
  let wasParentClosed = false;
  
  if (parentIndex > -1 && !structure[parentIndex].isOpen) {
    structure[parentIndex].isOpen = true;
    wasParentClosed = true;
  }

  const newSubfolder = {
    id: `folder-${crypto.randomUUID()}`,
    name: "Neuer Unterordner",
    chatIds: [],
    isOpen: true,
    isDefault: false,
    parentId: parentId 
  };

  if (parentIndex > -1) {
    structure.splice(parentIndex + 1, 0, newSubfolder);
  } else {
    structure.push(newSubfolder);
  }

  await saveFolderStructure(structure);
  
  const container = document.querySelector('.conversations-container');
  if (container) {
    const customFolders = structure.filter(f => !f.isDefault);
    const index = customFolders.findIndex(f => f.id === newSubfolder.id);
    const parent = structure.find(p => p.id === parentId);
    const parentColor = parent ? parent.color : null;
    
    const newHeaderEl = renderSingleFolder(newSubfolder, index, customFolders.length, parentColor);
    
    // NEU: Bereite die Slide-Down Animation vor
    newHeaderEl.classList.add('folder-rolled-up');
    newHeaderEl.dataset.isNew = "true";
    
    const parentEl = container.querySelector(`.folder-header[data-folder-id="${parentId}"]`);
    if (parentEl) {
        if (wasParentClosed) {
            parentEl.classList.add('is-open');
            const childItems = document.querySelectorAll(`.conversations-container .conversation-items-container[data-folder-id="${parentId}"], .folder-header.is-subfolder[data-parent-id="${parentId}"]`);
            childItems.forEach(el => {
               el.classList.remove('chat-item-rolled-up');
               el.classList.remove('folder-rolled-up');
            });
        }
        
        const parentOrder = parseInt(parentEl.style.order || "0", 10);
        newHeaderEl.style.order = parentOrder + 1;
        parentEl.after(newHeaderEl);
    } else {
        container.appendChild(newHeaderEl);
    }

    await syncFullListOrder();

    // NEU: Zwingt den Browser, den unsichtbaren Status zu registrieren (verhindert Flackern)
    void newHeaderEl.offsetHeight;

    // Startet die Aufklapp-Animation und den Bearbeitungsmodus
    newHeaderEl.classList.remove('folder-rolled-up');
    delete newHeaderEl.dataset.isNew;
    
    const nameSpan = newHeaderEl.querySelector('.folder-name');
    activateInlineEdit(nameSpan, newSubfolder.id, true);
  }
}

async function toggleFolder(folderId) {
  let structure = await getFolderStructure();
  const folder = structure.find(f => f.id === folderId);
  if (!folder) return;

  folder.isOpen = !folder.isOpen;
  await saveFolderStructure(structure);

  const folderHeader = document.querySelector(`.folder-header[data-folder-id="${folderId}"]`);
  if (folderHeader) {
    if (folder.isOpen) folderHeader.classList.add('is-open');
    else folderHeader.classList.remove('is-open');
  }

  const chatsInFolder = document.querySelectorAll(
    `.conversations-container .conversation-items-container[data-folder-id="${folderId}"]`
  );

  chatsInFolder.forEach(chatEl => {
    if (folder.isOpen) chatEl.classList.remove('chat-item-rolled-up');
    else chatEl.classList.add('chat-item-rolled-up');
  });

  // Unterordner und deren Chats ebenfalls mit ein-/ausblenden
  const subfolderHeaders = document.querySelectorAll(`.folder-header.is-subfolder[data-parent-id="${folderId}"]`);
  
  subfolderHeaders.forEach(subHeader => {
      const subId = subHeader.dataset.folderId;
      const subFolderData = structure.find(f => f.id === subId);
      
      if (folder.isOpen) {
          subHeader.classList.remove('folder-rolled-up'); // NEU: Animation entfernen
          if (subFolderData && subFolderData.isOpen) {
              const subChats = document.querySelectorAll(`.conversations-container .conversation-items-container[data-folder-id="${subId}"]`);
              subChats.forEach(c => c.classList.remove('chat-item-rolled-up'));
          }
      } else {
          subHeader.classList.add('folder-rolled-up'); // NEU: Animation hinzufügen
          const subChats = document.querySelectorAll(`.conversations-container .conversation-items-container[data-folder-id="${subId}"]`);
          subChats.forEach(c => c.classList.add('chat-item-rolled-up'));
      }
  });
}

async function renderInitialFolders() {
  if (isRendering) return;
  isRendering = true;
  
  // Falls mainObserver existiert (aus main.js), pausieren wir ihn
  if (typeof mainObserver !== 'undefined' && mainObserver) mainObserver.disconnect(); 

  const structure = await getFolderStructure();
  const conversationContainer = document.querySelector('.conversations-container');

  if (!conversationContainer) {
    isRendering = false;
    if (typeof mainObserver !== 'undefined' && mainObserver) mainObserver.observe(document.body, mainObserverConfig);
    return;
  }

  // Alte Header aufräumen
  conversationContainer.querySelectorAll('.folder-header').forEach(h => h.remove());

  const customFolders = structure.filter(f => !f.isDefault);
  const defaultFolder = structure.find(f => f.isDefault);

  // Ordner neu rendern
  customFolders.forEach((folder, index) => {
    let parentColor = null;
    
    // Wenn es ein Unterordner ist, Farbe des Hauptordners ermitteln
    if (folder.parentId) {
      const parent = structure.find(p => p.id === folder.parentId);
      if (parent) {
        parentColor = parent.color;
      }
    }
    
    // Die parentColor wird als 4. Argument übergeben
    const folderEl = renderSingleFolder(folder, index, customFolders.length, parentColor);
    conversationContainer.appendChild(folderEl);
  });

  if (defaultFolder) {
    const folderEl = renderSingleFolder(defaultFolder, 0, 1);
    conversationContainer.appendChild(folderEl);
  }

  if (typeof mainObserver !== 'undefined' && mainObserver) mainObserver.observe(document.body, mainObserverConfig);
  isRendering = false;
}

/**
 * Encapsulated Reveal Function
 * Called after mutations have settled.
 */
async function revealContainer() {
  if (isInitialSortComplete) return; // Already revealed

  const container = document.querySelector('.conversations-container');
  if (!container) return;

  const hasChats = container.querySelector('.conversation-items-container');
  const isEmpty = document.querySelector('.empty-state-container'); // Global check

  // Reveal only if there is content (chats or empty message)
  if (hasChats || isEmpty) {
    if (originalFolderState.size > 0) {
      let structure = await getFolderStructure();
      let changed = false;

      structure.forEach(folder => {
        const originalState = originalFolderState.get(folder.id);
        if (originalState !== undefined && folder.isOpen !== originalState) {
          folder.isOpen = originalState;
          changed = true;
        }
      });

      if (changed) {
        await saveFolderStructure(structure);
      }
      originalFolderState.clear();
    }

    await syncFullListOrder();

    const foucStyle = document.getElementById('gemini-folder-fouc-fix');
    if (foucStyle) foucStyle.remove();

    container.style.visibility = 'visible';

    const sidenavContent = document.querySelector('bard-sidenav-content');
    if (sidenavContent) sidenavContent.style.overflow = '';

    isInitialSortComplete = true;
  }
}

function handleChatListMutations(mutations) {
  // WICHTIG!
  // Wenn gerade ein Drag-Vorgang läuft, ignorieren wir alle Änderungen von Gemini.
  // Das verhindert, dass uns die Liste unter dem Mauszeiger "weg-sortiert" wird,
  // was zum Absturz des Drag-Events führt.
  if (document.documentElement.classList.contains('gemini-chat-is-dragging')) {
      // console.log("Gemini Exporter: Mutation ignored during drag.");
      return;
  }
  syncFullListOrder();
}

async function syncFullListOrder() {
  if (isRendering) return;
  isRendering = true;

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
  let dbNeedsUpdate = false; 

  let customFolders = structure.filter(f => !f.isDefault);
  const defaultFolder = structure.find(f => f.isDefault);
  let sortedStructure = defaultFolder ? [...customFolders, defaultFolder] : customFolders;

  sortedStructure.forEach((folder, index) => {
    baseOrder = (index + 1) * 1000;

    const headerEl = container.querySelector(`.folder-header[data-folder-id="${folder.id}"]`);
    if (headerEl) {
      headerEl.style.order = baseOrder;

      if (folder.isOpen) {
        headerEl.classList.add('is-open');
      } else {
        headerEl.classList.remove('is-open');
      }

      // 1. Initialer Zuklapp-Status für Unterordner 
      // (NEU: Überspringt Elemente, die gerade per Animation einfliegen)
      if (folder.parentId && !headerEl.dataset.isNew) {
          const parent = structure.find(p => p.id === folder.parentId);
          if (parent && !parent.isOpen) {
              headerEl.classList.add('folder-rolled-up');
          } else {
              headerEl.classList.remove('folder-rolled-up');
          }
      }

      // 2. NEU: Deaktivieren der Pfeile basierend auf der Position
      if (!folder.isDefault) {
        const upBtn = headerEl.querySelector('[data-action="move-up"]');
        const downBtn = headerEl.querySelector('[data-action="move-down"]');
        
        if (folder.parentId) {
            // Logik für Unterordner
            const siblings = customFolders.filter(f => f.parentId === folder.parentId);
            const subIndex = siblings.findIndex(f => f.id === folder.id);
            if (upBtn) upBtn.disabled = (subIndex === 0);
            if (downBtn) downBtn.disabled = (subIndex === siblings.length - 1);
        } else {
            // Logik für Hauptordner
            const mainFolders = customFolders.filter(f => !f.parentId);
            const mainIndex = mainFolders.findIndex(f => f.id === folder.id);
            if (upBtn) upBtn.disabled = (mainIndex === 0);
            if (downBtn) downBtn.disabled = (mainIndex === mainFolders.length - 1);
        }
      }
    }

    orderCounters.set(folder.id, baseOrder + 1);
  });

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

    if (syncedDeletedChats.includes(chatId)) {
        chatEl.style.transition = 'all 0.3s ease-out';
        chatEl.style.minHeight = '0px';
        chatEl.style.height = '0px';
        chatEl.style.margin = '0px';
        chatEl.style.padding = '0px';
        chatEl.style.opacity = '0';
        chatEl.style.overflow = 'hidden';
        chatEl.style.border = 'none';
        
        setTimeout(() => { chatEl.remove(); }, 300);
        return;
    }

    let folderId = chatFolderMap.get(chatId);

    if (!folderId) {
      folderId = defaultFolderId;
      if (defaultFolder) {
        defaultFolder.chatIds.unshift(chatId);
        chatFolderMap.set(chatId, defaultFolderId);
        if (typeof triggerExternalUpdate === 'function') {
            triggerExternalUpdate();
        }
        dbNeedsUpdate = true;
      }
    }

    const folder = structure.find(f => f.id === folderId) || defaultFolder;

    if (!folder) {
        chatEl.style.order = '99999';
        return;
    }

    let order = orderCounters.get(folder.id);
    chatEl.style.order = order;
    orderCounters.set(folder.id, order + 1);

    // NEU: Initialer Status für Chats unter Berücksichtigung des Hauptordners
    const isFolderOpen = folder.isOpen;
    let isParentOpen = true;
    
    if (folder.parentId) {
        const parent = structure.find(p => p.id === folder.parentId);
        if (parent && !parent.isOpen) isParentOpen = false;
    }
    
    // Nur sichtbar, wenn der eigene Ordner UND (falls existent) der Hauptordner offen sind
    if (isFolderOpen && isParentOpen) {
      chatEl.classList.remove('chat-item-rolled-up');
    } else {
      chatEl.classList.add('chat-item-rolled-up');
    }

    chatEl.dataset.folderId = folder.id;
  });

  if (dbNeedsUpdate) {
    await saveFolderStructure(structure);
  }

  isRendering = false;
}

async function handleDeleteFolder(folderId) {
  let structure = await getFolderStructure();
  const folderIndex = structure.findIndex(f => f.id === folderId);
  if (folderIndex === -1 || structure[folderIndex].isDefault) return;

  const folder = structure[folderIndex];

  // NEU: Wenn es ein Unterordner ist, lade Chats in den Hauptordner
  if (folder.parentId) {
      const parentFolder = structure.find(f => f.id === folder.parentId);
      if (parentFolder) {
          parentFolder.chatIds.unshift(...folder.chatIds);
      } else {
          const defaultFolder = structure.find(f => f.isDefault);
          if (defaultFolder) defaultFolder.chatIds.unshift(...folder.chatIds);
      }
  } else {
      // Wenn es ein Hauptordner ist, lade Chats in Standard-Ordner
      const defaultFolder = structure.find(f => f.isDefault);
      if (defaultFolder) defaultFolder.chatIds.unshift(...folder.chatIds);
      
      // Optional: Löscht automatisch alle Unterordner, wenn der Hauptordner gelöscht wird
      structure = structure.filter(f => f.parentId !== folderId);
  }

  // Ordner aus der DB entfernen
  const updatedFolderIndex = structure.findIndex(f => f.id === folderId);
  if(updatedFolderIndex !== -1) {
      structure.splice(updatedFolderIndex, 1);
  }
  
  await saveFolderStructure(structure);

  const headerEl = document.querySelector(`.folder-header[data-folder-id="${folderId}"]`);
  if (headerEl) headerEl.remove();

  await syncFullListOrder();
}

async function handleMoveFolder(folderId, direction) {
  let structure = await getFolderStructure();

  const defaultFolder = structure.find(f => f.isDefault);
  let mainFolders = structure.filter(f => !f.parentId && !f.isDefault);
  
  const targetFolder = structure.find(f => f.id === folderId);
  if (!targetFolder) return;

  if (targetFolder.parentId) {
      // Unterordner innerhalb der Geschwister verschieben
      let siblings = structure.filter(f => f.parentId === targetFolder.parentId);
      const idx = siblings.findIndex(f => f.id === folderId);
      
      if (direction === 'up' && idx > 0) {
          [siblings[idx], siblings[idx - 1]] = [siblings[idx - 1], siblings[idx]];
      } else if (direction === 'down' && idx < siblings.length - 1) {
          [siblings[idx], siblings[idx + 1]] = [siblings[idx + 1], siblings[idx]];
      } else {
          return;
      }
      
      // Struktur basierend auf der neuen Reihenfolge strikt gruppiert aufbauen
      let newStructure = [];
      mainFolders.forEach(main => {
          newStructure.push(main);
          if (main.id === targetFolder.parentId) {
              newStructure.push(...siblings); 
          } else {
              newStructure.push(...structure.filter(f => f.parentId === main.id));
          }
      });
      if (defaultFolder) newStructure.push(defaultFolder);
      await saveFolderStructure(newStructure);
      
  } else {
      // Hauptordner verschieben
      const idx = mainFolders.findIndex(f => f.id === folderId);
      
      if (direction === 'up' && idx > 0) {
          [mainFolders[idx], mainFolders[idx - 1]] = [mainFolders[idx - 1], mainFolders[idx]];
      } else if (direction === 'down' && idx < mainFolders.length - 1) {
          [mainFolders[idx], mainFolders[idx + 1]] = [mainFolders[idx + 1], mainFolders[idx]];
      } else {
          return;
      }
      
      // Struktur neu zusammensetzen: Unterordner reisen automatisch mit ihrem Hauptordner mit!
      let newStructure = [];
      mainFolders.forEach(main => {
          newStructure.push(main);
          newStructure.push(...structure.filter(f => f.parentId === main.id)); 
      });
      if (defaultFolder) newStructure.push(defaultFolder);
      await saveFolderStructure(newStructure);
  }

  await syncFullListOrder();
}

async function moveChatToFolder(chatId, newFolderId) {
  if (!chatId || !newFolderId) return;

  let structure = await getFolderStructure();
  let currentFolderId = null;

  structure.forEach(folder => {
    const index = folder.chatIds.indexOf(chatId);
    if (index > -1) {
      currentFolderId = folder.id;
    }
  });

  if (currentFolderId === newFolderId) return;

  if (currentFolderId) {
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

  await saveFolderStructure(structure);
  await syncFullListOrder();
}

/**
 * Entfernt die ID eines gelöschten Chats aus dem jeweiligen Ordner.
 */
async function removeDeletedChatFromDB(chatId) {
  let structure = await getFolderStructure();
  let dbChanged = false;

  structure.forEach(folder => {
      if (Array.isArray(folder.chatIds)) {
          const index = folder.chatIds.indexOf(chatId);
          if (index > -1) {
              folder.chatIds.splice(index, 1);
              dbChanged = true;
          }
      }
  });

  if (dbChanged) {
      syncedDeletedChats.push(chatId);
      if (syncedDeletedChats.length > 50) {
          syncedDeletedChats.shift();
      }

      await saveFolderStructure(structure);
      console.log(`Gemini Exporter: Gelöschter Chat ${chatId} aus der Datenbank entfernt.`);
  }
}

// === DELETION LISTENER ===
// Merkt sich die ID des Chats, der gelöscht werden soll
window.pendingGeminiDeleteId = null;

// Lauscht auf Klicks auf den Bestätigungs-Button beim Löschen eines Chats
document.addEventListener('click', (event) => {
  // Prüfen, ob der Klick auf oder in dem gesuchten Button stattfand
  const confirmBtn = event.target.closest('button[data-test-id="confirm-button"]');
  if (!confirmBtn) return;

  const jslog = confirmBtn.getAttribute('jslog');
  if (!jslog) return;

  // Die Chat-ID aus dem jslog-String extrahieren
  const match = jslog.match(/"(c_[a-f0-9]+)"/);
  if (match && match[1]) {
    window.pendingGeminiDeleteId = match[1];
    console.log(`Gemini Exporter: Lösch-Auftrag für Chat ${window.pendingGeminiDeleteId} registriert. Warte auf Server-Bestätigung...`);
  }
});

// Wird von main.js aufgerufen, sobald der Google-Toast die Löschung bestätigt
async function executeConfirmedDeletion() {
  if (window.pendingGeminiDeleteId) {
    console.log(`Gemini Exporter: Löschen von Server bestätigt. Datenbank wird aktualisiert.`);
    await removeDeletedChatFromDB(window.pendingGeminiDeleteId);
    window.pendingGeminiDeleteId = null;
  }
}
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

// === INITIALIZATION AND CONTROL ===

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

  await chrome.storage.local.set({ 'folderStructure': structure });

  // Render headers
  renderInitialFolders();

  // Start Observer
  const conversationContainer = document.querySelector('.conversations-container');
  if (conversationContainer) {
    chatObserver = new MutationObserver(handleChatListMutations);
    chatObserver.observe(conversationContainer, chatObserverConfig);
  }

  // First sort
  syncFullListOrder();
}

// === FOLDER LOGIC (ACTIONS & SYNC) ===

async function handleNewFolderClick() {
  let structure = await getFolderStructure();

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

  // Manual render to avoid flicker
  const container = document.querySelector('.conversations-container');
  if (container) {
    const customFolders = structure.filter(f => !f.isDefault);
    const index = customFolders.findIndex(f => f.id === newFolder.id);
    const newHeaderEl = renderSingleFolder(newFolder, index, customFolders.length);
    container.appendChild(newHeaderEl);
  }

  await syncFullListOrder();

  // Start edit mode
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

  chatsInFolder.forEach(chatEl => {
    // Toggle animation class
    if (folder.isOpen) {
      // Remove class to start "1fr" animation
      chatEl.classList.remove('chat-item-rolled-up');
    } else {
      // Add class to start "0fr" animation
      chatEl.classList.add('chat-item-rolled-up');
    }
  });
}

async function renderInitialFolders() {
  if (isRendering) return;
  isRendering = true;
  if (mainObserver) mainObserver.disconnect(); // Important: mainObserver is in main.js

  const structure = await getFolderStructure();
  const conversationContainer = document.querySelector('.conversations-container');

  if (!conversationContainer) {
    isRendering = false;
    if (mainObserver) mainObserver.observe(document.body, mainObserverConfig); // mainObserverConfig is in main.js
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
        await chrome.storage.local.set({ 'folderStructure': structure });
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

  // --- FLICKER FIX ---
  // Separate folders to update button status
  let customFolders = structure.filter(f => !f.isDefault);
  const defaultFolder = structure.find(f => f.isDefault);
  let sortedStructure = defaultFolder ? [...customFolders, defaultFolder] : customFolders;

  sortedStructure.forEach((folder, index) => {
    baseOrder = (index + 1) * 1000;

    const headerEl = container.querySelector(`.folder-header[data-folder-id="${folder.id}"]`);
    if (headerEl) {
      headerEl.style.order = baseOrder;

      // Set 'is-open' status for icon based on restored data
      if (folder.isOpen) {
        headerEl.classList.add('is-open');
      } else {
        headerEl.classList.remove('is-open');
      }

      // Update button status
      if (!folder.isDefault) {
        const upBtn = headerEl.querySelector('[data-action="move-up"]');
        const downBtn = headerEl.querySelector('[data-action="move-down"]');
        const customIndex = customFolders.findIndex(f => f.id === folder.id);

        if (upBtn) upBtn.disabled = (customIndex === 0);
        if (downBtn) downBtn.disabled = (customIndex === customFolders.length - 1);
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

    const folderId = chatFolderMap.get(chatId) || defaultFolderId;
    const folder = structure.find(f => f.id === folderId) || structure.find(f => f.isDefault);

    let order = orderCounters.get(folder.id);
    chatEl.style.order = order;

    orderCounters.set(folder.id, order + 1);

    // Set initial state (open/closed)
    if (folder.isOpen) {
      chatEl.classList.remove('chat-item-rolled-up');
    } else {
      chatEl.classList.add('chat-item-rolled-up');
    }

    chatEl.dataset.folderId = folder.id;
  });

  isRendering = false;
}

async function handleDeleteFolder(folderId) {
  let structure = await getFolderStructure();
  const folderIndex = structure.findIndex(f => f.id === folderId);
  if (folderIndex === -1 || structure[folderIndex].isDefault) return;

  const folder = structure[folderIndex];

  const defaultFolder = structure.find(f => f.isDefault);
  if (!defaultFolder) return;

  defaultFolder.chatIds.unshift(...folder.chatIds);
  structure.splice(folderIndex, 1);
  await chrome.storage.local.set({ 'folderStructure': structure });

  // --- FLICKER FIX ---
  // 1. Manually remove header
  const headerEl = document.querySelector(`.folder-header[data-folder-id="${folderId}"]`);
  if (headerEl) headerEl.remove();

  // 2. Sync *immediately*
  await syncFullListOrder();
}

async function handleMoveFolder(folderId, direction) {
  let structure = await getFolderStructure();

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

  // --- FLICKER FIX ---
  // 1. Sync *immediately*
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

  await chrome.storage.local.set({ 'folderStructure': structure });
  await syncFullListOrder();
}
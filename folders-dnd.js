/**
 * folders-dnd.js
 * Handles Drag and Drop events for chats and folders.
 * Includes safeguards against browser drag-state freezing.
 */

// === HELPER: GLOBAL RESET ===
/**
 * Resets all visual and logical drag states.
 * Essential to prevent the browser from getting stuck in "Drag Mode".
 */
function resetDnDState() {
  // 1. Global status (releases pointer events)
  document.documentElement.classList.remove('gemini-chat-is-dragging');

  // 2. Remove visual classes from chat items
  document.querySelectorAll('.gemini-dragging').forEach(el => {
    el.classList.remove('gemini-dragging');
    // Re-enable animations
    el.classList.remove('gemini-dnd-no-transition');
    el.querySelectorAll('.gemini-dnd-no-transition').forEach(child => {
        child.classList.remove('gemini-dnd-no-transition');
    });
  });

  // 3. Remove drop zone highlights
  document.querySelectorAll('.gemini-drag-over').forEach(el => {
    el.classList.remove('gemini-drag-over');
  });
  document.querySelectorAll('.gemini-chat-drag-over').forEach(el => {
    el.classList.remove('gemini-chat-drag-over');
  });
}

// === DRAG-AND-DROP HANDLER ===

function handleDragStartChat(event) {
  const chatEl = event.currentTarget;

  // Verhindert, dass übergeordnete Google-Listener das Event abfangen und abbrechen
  event.stopPropagation();

  event.dataTransfer.setData("text/gemini-chat-id", chatEl.dataset.chatId);
  event.dataTransfer.effectAllowed = "move";

  // Exakte Maße und Klick-Position des Originals berechnen
  const rect = chatEl.getBoundingClientRect();
  const offsetX = event.clientX - rect.left;
  const offsetY = event.clientY - rect.top;

  // Wir bauen ein sauberes, unabhängiges Ghost-Image auf
  const dragGhost = document.createElement('div');
  const titleEl = chatEl.querySelector('.title-text');
  dragGhost.textContent = titleEl ? titleEl.textContent.trim() : "Chat";
  
  // Zwingend erforderlich: Die exakten Maße des Originals festnageln.
  // Wir rendern das Ghost-Image per 'fixed' exakt hinter dem Original, 
  // um Viewport-Clipping-Bugs beim Screenshot zu vermeiden.
  dragGhost.style.cssText = `
    position: fixed;
    top: ${rect.top}px;
    left: ${rect.left}px;
    width: ${rect.width}px;
    height: ${rect.height}px;
    background: var(--gem-sys-color--surface, #1e1f20);
    color: var(--gem-sys-color--on-surface, #e3e3e3);
    border-radius: 8px;
    display: flex;
    align-items: center;
    padding: 0 16px;
    box-sizing: border-box;
    font-family: 'Google Sans', Arial, sans-serif;
    font-size: 14px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    z-index: -9999; /* Unsichtbar im Hintergrund */
    pointer-events: none;
  `;
  
  document.body.appendChild(dragGhost);
  
  if (event.dataTransfer.setDragImage) {
      event.dataTransfer.setDragImage(dragGhost, offsetX, offsetY);
  }

  // Aufräumen nach dem Screenshot durch den Browser
  setTimeout(() => {
      if (dragGhost.parentNode) {
          dragGhost.parentNode.removeChild(dragGhost);
      }
  }, 50);
  // --------------------------------------------------

  // Verzögerung der DOM-Manipulationen via setTimeout (0ms)
  setTimeout(() => {
    // Disable animations to prevent glitches
    chatEl.classList.add('gemini-dnd-no-transition');
    chatEl.querySelectorAll('*').forEach(child => {
      child.classList.add('gemini-dnd-no-transition');
    });

    // Global Lock (prevents updates in feature-folders.js)
    document.documentElement.classList.add('gemini-chat-is-dragging');
    chatEl.classList.add('gemini-dragging');
  }, 0);
  
  // Safety Net: Listen on global document in case element is removed
  chatEl.addEventListener('dragend', handleDragEndChat, { once: true });
  document.addEventListener('dragend', handleGlobalDragEnd, { once: true });
}

function handleGlobalDragEnd(event) {
    // Catch cases where source element was destroyed
    resetDnDState();
    // Ensure list is up-to-date after drag (catches up on ignored mutations)
    if (typeof syncFullListOrder === 'function') syncFullListOrder();
}

function handleDragEndChat(event) {
  resetDnDState();
  if (typeof syncFullListOrder === 'function') syncFullListOrder();
}

function handleDragOverFolder(event) {
  if (!event.dataTransfer.types.includes("text/gemini-chat-id")) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  event.currentTarget.classList.add('gemini-drag-over');
}

function handleDragLeaveFolder(event) {
  event.currentTarget.classList.remove('gemini-drag-over');
}

async function handleDropOnFolder(event) {
  event.preventDefault();
  event.stopPropagation();

  const folderHeaderEl = event.currentTarget;
  
  // Visuelles Feedback sofort entfernen
  folderHeaderEl.classList.remove('gemini-drag-over');

  let chatId = event.dataTransfer.getData("text/gemini-chat-id");
  const newFolderId = folderHeaderEl.dataset.folderId;

  // FALLBACK für neues DOM
  if (!chatId) { // bzw. !draggedChatId
      const urlData = event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain");
      if (urlData && urlData.includes('/app/')) {
          const parts = urlData.split('/');
          chatId = 'c_' + parts[parts.length - 1].split('?')[0];
      }
  }

  if (!chatId || !newFolderId) {
    console.warn("Gemini Exporter: Drop incomplete. Cleaning up.");
    resetDnDState();
    return;
  }

  // 1. Visual Optimization: Hide chat immediately if target folder is closed
  const chatEl = document.querySelector(`${GeminiDOM.conversationItemsContainer}[data-chat-id="${chatId}"]`);
  const isTargetFolderClosed = !folderHeaderEl.classList.contains('is-open');

  if (chatEl && isTargetFolderClosed) {
    // Instant hide (animations are still disabled via gemini-dnd-no-transition)
    chatEl.classList.add('chat-item-rolled-up');
  }

  // 2. Logic
  try {
      await moveChatToFolder(chatId, newFolderId);
  } catch (e) {
      console.error("Drop failed:", e);
  } finally {
      // 3. Cleanup and Re-Sync
      resetDnDState();
      // Ensure list is perfectly synced
      if (typeof syncFullListOrder === 'function') syncFullListOrder();
  }
}

function handleDragOverChat(event) {
  if (!event.dataTransfer.types.includes("text/gemini-chat-id")) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";

  const draggedChatId = event.dataTransfer.getData("text/gemini-chat-id");
  if (event.currentTarget.dataset.chatId === draggedChatId) return;

  event.currentTarget.classList.add('gemini-chat-drag-over');
}

function handleDragLeaveChat(event) {
  event.currentTarget.classList.remove('gemini-chat-drag-over');
}

async function handleDropOnChat(event) {
  event.preventDefault();
  event.stopPropagation();
  
  // Visuelles Feedback entfernen
  event.currentTarget.classList.remove('gemini-chat-drag-over');

  let draggedChatId = event.dataTransfer.getData("text/gemini-chat-id");
  const targetChatId = event.currentTarget.dataset.chatId;

  // FALLBACK für neues DOM
  if (!draggedChatId) {
      const urlData = event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain");
      if (urlData && urlData.includes('/app/')) {
          const parts = urlData.split('/');
          draggedChatId = parts[parts.length - 1].split('?')[0];
      }
  }

  if (!draggedChatId || !targetChatId || draggedChatId === targetChatId) {
    resetDnDState(); // Aufräumen bei Abbruch
    return;
  }

  try {
      const { chatFolderMap, defaultFolderId } = await getChatFolderMap();
      const newFolderId = chatFolderMap.get(targetChatId) || defaultFolderId;
      await moveChatToFolder(draggedChatId, newFolderId);
  } catch (e) {
      console.error("Drop on Chat failed:", e);
  } finally {
      resetDnDState();
      if (typeof syncFullListOrder === 'function') syncFullListOrder();
  }
}
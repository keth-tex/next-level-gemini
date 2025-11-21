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

  // Disable animations to prevent glitches
  chatEl.classList.add('gemini-dnd-no-transition');
  chatEl.querySelectorAll('*').forEach(child => {
    child.classList.add('gemini-dnd-no-transition');
  });

  // Global Lock (prevents updates in feature-folders.js)
  document.documentElement.classList.add('gemini-chat-is-dragging');

  event.dataTransfer.setData("text/gemini-chat-id", chatEl.dataset.chatId);
  event.dataTransfer.effectAllowed = "move";

  chatEl.classList.add('gemini-dragging');
  
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

  const chatId = event.dataTransfer.getData("text/gemini-chat-id");
  const newFolderId = folderHeaderEl.dataset.folderId;

  if (!chatId || !newFolderId) {
    console.warn("Gemini Exporter: Drop incomplete. Cleaning up.");
    resetDnDState();
    return;
  }

  // 1. Visual Optimization: Hide chat immediately if target folder is closed
  const chatEl = document.querySelector(`.conversation-items-container[data-chat-id="${chatId}"]`);
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

  const draggedChatId = event.dataTransfer.getData("text/gemini-chat-id");
  const targetChatId = event.currentTarget.dataset.chatId;

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
/**
 * folders-dnd.js
 * Handles Drag and Drop events for chats and folders.
 */

// === DRAG-AND-DROP HANDLER ===

function handleDragStartChat(event) {
  const chatEl = event.currentTarget;

  // Disable animations to prevent "flash" glitch
  chatEl.classList.add('gemini-dnd-no-transition');
  chatEl.querySelectorAll('*').forEach(child => {
    child.classList.add('gemini-dnd-no-transition');
  });

  document.documentElement.classList.add('gemini-chat-is-dragging');

  event.dataTransfer.setData("text/gemini-chat-id", chatEl.dataset.chatId);
  event.dataTransfer.effectAllowed = "move";

  chatEl.classList.add('gemini-dragging');
  chatEl.addEventListener('dragend', handleDragEndChat, { once: true });
}

function handleDragEndChat(event) {
  // Remove global class
  document.documentElement.classList.remove('gemini-chat-is-dragging');

  // Clean up dragged element
  const chatEl = event.currentTarget;
  if (chatEl) {
    chatEl.classList.remove('gemini-dragging');

    // Re-enable animations
    chatEl.classList.remove('gemini-dnd-no-transition');
    chatEl.querySelectorAll('*').forEach(child => {
      child.classList.remove('gemini-dnd-no-transition');
    });
  }

  // Remove all drop highlights
  document.querySelectorAll('.folder-header.gemini-drag-over').forEach(el => {
    el.classList.remove('gemini-drag-over');
  });
  document.querySelectorAll('.conversation-items-container.gemini-chat-drag-over').forEach(el => {
    el.classList.remove('gemini-chat-drag-over');
  });
}

function handleDragOverFolder(event) {
  if (!event.dataTransfer.types.includes("text/gemini-chat-id")) {
    return;
  }

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

  const folderHeaderEl = event.currentTarget; // The folder header we are dropping onto
  folderHeaderEl.classList.remove('gemini-drag-over');

  const chatId = event.dataTransfer.getData("text/gemini-chat-id");
  const newFolderId = folderHeaderEl.dataset.folderId;

  if (!chatId || !newFolderId) {
    console.error("Gemini Exporter: Drop error, chatId or newFolderId missing.");
    return;
  }

  // Fix: Apply status immediately before await to prevent glitch
  // 1. Find the chat element we are dragging
  const chatEl = document.querySelector(`.conversation-items-container[data-chat-id="${chatId}"]`);

  // 2. Check if target folder is closed
  const isTargetFolderClosed = !folderHeaderEl.classList.contains('is-open');

  // 3. If yes, apply 'rolled-up' immediately
  if (chatEl && isTargetFolderClosed) {
    console.log("Gemini Exporter: Applying 'rolled-up' preemptively.");
    chatEl.classList.add('chat-item-rolled-up');
  }

  // 4. Start normal save/sort logic
  await moveChatToFolder(chatId, newFolderId);
}

function handleDragOverChat(event) {
  if (!event.dataTransfer.types.includes("text/gemini-chat-id")) {
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
  event.currentTarget.classList.remove('gemini-chat-drag-over');
}

async function handleDropOnChat(event) {
  event.preventDefault();
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
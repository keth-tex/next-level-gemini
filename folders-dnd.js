/**
 * folders-dnd.js
 * Handles Drag and Drop events for chats and folders.
 */

// === HELPER: GLOBAL RESET ===
/**
 * Setzt alle visuellen und logischen Zustände des Drag & Drop zurück.
 * Entfernt CSS-Klassen, die Animationen blockieren oder Drag-Status anzeigen.
 */
function resetDnDState() {
  // 1. Globalen Status entfernen (gibt Pointer-Events/Zwischenablage wieder frei)
  document.documentElement.classList.remove('gemini-chat-is-dragging');

  // 2. Visuelle Klassen von Chats entfernen
  document.querySelectorAll('.gemini-dragging').forEach(el => {
    el.classList.remove('gemini-dragging');
    // Animationen wieder aktivieren
    el.classList.remove('gemini-dnd-no-transition');
    el.querySelectorAll('.gemini-dnd-no-transition').forEach(child => {
        child.classList.remove('gemini-dnd-no-transition');
    });
  });

  // 3. Drop-Zonen Highlights entfernen
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

  // Disable animations to prevent "flash" glitch
  chatEl.classList.add('gemini-dnd-no-transition');
  chatEl.querySelectorAll('*').forEach(child => {
    child.classList.add('gemini-dnd-no-transition');
  });

  // Globaler Status (sperrt u.a. Pointer-Events auf Kindern)
  document.documentElement.classList.add('gemini-chat-is-dragging');

  event.dataTransfer.setData("text/gemini-chat-id", chatEl.dataset.chatId);
  event.dataTransfer.effectAllowed = "move";

  chatEl.classList.add('gemini-dragging');
  
  // Sicherheitsnetz: Listener am Element UND global am Document registrieren.
  // Falls 'chatEl' während des Drags aus dem DOM fliegt (Re-Render),
  // fängt 'document' das 'dragend' Event trotzdem ab und verhindert Hänger.
  chatEl.addEventListener('dragend', handleDragEndChat, { once: true });
  document.addEventListener('dragend', handleGlobalDragEnd, { once: true });
}

function handleGlobalDragEnd(event) {
    // Fängt Fälle ab, wo das Ursprungselement zerstört wurde
    resetDnDState();
}

function handleDragEndChat(event) {
  resetDnDState();
}

function handleDragOverFolder(event) {
  // Nur reagieren, wenn es wirklich ein Chat ist
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

  const folderHeaderEl = event.currentTarget;
  
  // Visuelles Feedback sofort entfernen
  folderHeaderEl.classList.remove('gemini-drag-over');

  const chatId = event.dataTransfer.getData("text/gemini-chat-id");
  const newFolderId = folderHeaderEl.dataset.folderId;

  if (!chatId || !newFolderId) {
    console.warn("Gemini Exporter: Drop incomplete - chatId or newFolderId missing.");
    resetDnDState(); // Aufräumen bei Abbruch
    return;
  }

  // 1. Visuelle Optimierung: Chat sofort ausblenden, wenn Zielordner zu ist.
  // WICHTIG: Dies muss passieren, BEVOR resetDnDState() aufgerufen wird,
  // damit die Animationen noch deaktiviert sind (Instant-Hide).
  const chatEl = document.querySelector(`.conversation-items-container[data-chat-id="${chatId}"]`);
  const isTargetFolderClosed = !folderHeaderEl.classList.contains('is-open');

  if (chatEl && isTargetFolderClosed) {
    // Da 'gemini-dnd-no-transition' noch aktiv ist, geschieht dies ohne Animation (kein Aufblitzen)
    chatEl.classList.add('chat-item-rolled-up');
  }

  // 2. Logische Verschiebung
  // In try/finally, damit resetDnDState IMMER läuft, auch bei Fehlern
  try {
      await moveChatToFolder(chatId, newFolderId);
  } finally {
      // 3. Aufräumen (Animationen wieder aktivieren)
      // Erst jetzt, nachdem alles erledigt ist.
      resetDnDState();
  }
}

function handleDragOverChat(event) {
  if (!event.dataTransfer.types.includes("text/gemini-chat-id")) {
    return;
  }
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";

  const draggedChatId = event.dataTransfer.getData("text/gemini-chat-id");
  // Verhindern, dass man auf sich selbst droppt (visuell)
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
  } finally {
      resetDnDState();
  }
}
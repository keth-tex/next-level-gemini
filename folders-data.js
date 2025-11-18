/**
 * folders-data.js
 * Handles data retrieval and structure management for folders.
 */

// === FOLDER DATA FUNCTIONS ===

async function getFolderStructure() {
  // Retrieve data from local storage
  let data = await chrome.storage.local.get('folderStructure');

  if (data.folderStructure && Array.isArray(data.folderStructure) && data.folderStructure.find(f => f.isDefault)) {
    return data.folderStructure;
  }

  console.log("Gemini Exporter: No valid folder structure found. Creating default...");
  const defaultStructure = [
    {
      id: "default-chats",
      name: "Chats",
      chatIds: [],
      isOpen: true,
      isDefault: true
    }
  ];

  // Migration of old data if necessary
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
  const structure = await getFolderStructure();
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
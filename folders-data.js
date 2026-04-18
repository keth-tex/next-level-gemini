/**
 * folders-data.js
 * Handles data retrieval and structure management for folders.
 */

// --- Sperre für gleichzeitige Zugriffe beim Start ---
let folderStructureCachePromise = null;

// --- Variablen für den Sync-Wächter ---
let isLocalSaveInProgress = false;
let localSaveTimeout = null;

let syncedDeletedChats = [];

/**
 * Speichert NUR den lokalen Aufklapp-Status der Ordner.
 * Verursacht keinen Cloud-Traffic und verhindert das versehentliche
 * Überschreiben von Cloud-Daten beim Neuladen der Seite.
 */
async function saveLocalFolderStates(structure) {
    const localFolderStates = {};
    structure.forEach(folder => {
        localFolderStates[folder.id] = folder.isOpen;
    });
    return new Promise((resolve) => {
        chrome.storage.local.set({ 'gemini_folder_states': localFolderStates }, resolve);
    });
}

// === ZUVERLÄSSIGE SPEICHERUNG (Ohne fehleranfälliges Diffing) ===
async function saveFolderStructure(structure) {
    isLocalSaveInProgress = true;
    if (localSaveTimeout) clearTimeout(localSaveTimeout);

    const syncData = {};
    const folderMetadataList = [];
    const localFolderStates = {}; 
    const activeFolderIds = new Set(); 

    // 1. Daten strikt aufbauen
    structure.forEach(folder => {
        activeFolderIds.add(folder.id); 

        folderMetadataList.push({
            id: folder.id,
            name: folder.name || folder.title || "Ordner",
            color: folder.color,
            isDefault: folder.isDefault,
            parentId: folder.parentId
        });

        syncData[`folder_${folder.id}`] = folder.chatIds || [];
        localFolderStates[folder.id] = folder.isOpen; 
    });

    syncData['gemini_folder_metadata'] = folderMetadataList;
    syncData['gemini_deleted_chats'] = syncedDeletedChats;

    // 2. Cloud Update erzwingen
    await new Promise((resolve) => {
        chrome.storage.sync.set(syncData, () => resolve());
    });

    // 3. Verwaiste Ordner hart aus der Cloud löschen (Fix für den Lösch-Bug)
    await new Promise((resolve) => {
        chrome.storage.sync.get(null, (items) => {
            const keysToRemove = [];
            for (let key in items) {
                if (key.startsWith('folder_')) {
                    const folderId = key.replace('folder_', '');
                    if (!activeFolderIds.has(folderId)) {
                        keysToRemove.push(key);
                    }
                }
            }
            
            if (keysToRemove.length > 0) {
                chrome.storage.sync.remove(keysToRemove, () => resolve());
            } else {
                resolve();
            }
        });
    });

    // 4. Lokalen Status speichern
    await new Promise((resolve) => {
        chrome.storage.local.set({ 'gemini_folder_states': localFolderStates }, () => resolve());
    });
    
    // 5. Sperre sicher aufheben
    localSaveTimeout = setTimeout(() => { 
        isLocalSaveInProgress = false; 
    }, 1000);
    
    return Promise.resolve();
}

// === WÄCHTER FÜR LIVE-UPDATES ===
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && !isLocalSaveInProgress) {
        
        // Banner-Logik OHNE das restliche Skript zu blockieren (kein hartes 'return' mehr!)
        if (changes.gemini_remote_update_trigger) {
            const triggerTime = changes.gemini_remote_update_trigger.newValue;
            if (triggerTime && triggerTime > scriptInitTime) {
                showExternalUpdateBanner();
            }
        }

        // Hartes Prüfen, ob Ordner oder Chats verändert (oder gelöscht) wurden
        let structureChanged = false;
        for (let key in changes) {
            if (key.startsWith('folder_') || key === 'gemini_folder_metadata') {
                structureChanged = true;
                break;
            }
        }

        if (structureChanged) {
            console.log("Gemini Exporter: Cloud-Änderung erkannt. UI wird synchronisiert.");
            renderInitialFolders().then(() => {
                syncFullListOrder();
            });
        }
    }
});

/**
 * Liest die Struktur aus der Cloud und verheiratet sie mit dem lokalen Aufklapp-Status.
 */
async function getFolderStructure() {
    if (folderStructureCachePromise) {
        return folderStructureCachePromise;
    }

    folderStructureCachePromise = new Promise((resolve) => {
        // Wir fragen Sync UND Local gleichzeitig ab
        chrome.storage.sync.get(null, async (syncItems) => {
            chrome.storage.local.get('gemini_folder_states', async (localItems) => {
                
                const localStates = localItems.gemini_folder_states || {};

                syncedDeletedChats = syncItems['gemini_deleted_chats'] || [];

                if (syncItems['gemini_folder_metadata'] && syncItems['gemini_folder_metadata'].length > 0) {
                    const structure = [];
                    const metadataList = syncItems['gemini_folder_metadata'];
                    
                    metadataList.forEach(meta => {
                        const chatIds = syncItems[`folder_${meta.id}`] || [];
                        
                        // Fällt auf true zurück, falls der Ordner neu ist oder kein lokaler Status existiert
                        const isFolderOpen = localStates[meta.id] !== undefined ? localStates[meta.id] : true;

                        structure.push({
                            ...meta,
                            chatIds: chatIds,
                            isOpen: isFolderOpen
                        });
                    });
                    resolve(structure);
                } else {
                    console.log("Gemini Exporter: Erstelle neue Standard-Struktur im Sync-Speicher...");
                    const structure = [
                        { id: "default-chats", name: "Chats", chatIds: [], isOpen: true, isDefault: true }
                    ];
                    await saveFolderStructure(structure); 
                    resolve(structure);
                }
            });
        });
    });

    const result = await folderStructureCachePromise;
    folderStructureCachePromise = null; 
    return result;
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

/**
 * Blendet ein unaufdringliches Banner ein, das den Nutzer über externe 
 * Änderungen informiert und einen Neu-Laden-Button anbietet.
 */
function showExternalUpdateBanner() {
    // Verhindern, dass das Banner mehrfach auftaucht
    if (document.getElementById('gemini-update-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'gemini-update-banner';
    banner.style.cssText = `
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        background-color: var(--sys-color-primary, #a8c7fa);
        color: var(--sys-color-on-primary, #041e49);
        padding: 12px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        gap: 16px;
        z-index: 10000;
        font-family: Roboto, Arial, sans-serif;
        font-size: 14px;
        animation: slideUp 0.3s ease-out;
    `;

    // Keyframe-Animation per JS injizieren, falls noch nicht vorhanden
    if (!document.getElementById('gemini-update-styles')) {
        const style = document.createElement('style');
        style.id = 'gemini-update-styles';
        style.textContent = `
            @keyframes slideUp {
                from { bottom: -50px; opacity: 0; }
                to { bottom: 24px; opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }

    const text = document.createElement('span');
    text.innerText = "Neue Daten verfügbar";

    const reloadBtn = document.createElement('button');
    reloadBtn.innerText = "Seite neu laden";
    reloadBtn.style.cssText = `
        background: var(--sys-color-on-primary, #041e49);
        color: var(--sys-color-primary, #a8c7fa);
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
    `;
    
    reloadBtn.addEventListener('click', () => {
        window.location.reload();
    });

    const closeBtn = document.createElement('button');
    closeBtn.innerText = "✕";
    closeBtn.style.cssText = `
        background: transparent;
        color: inherit;
        border: none;
        font-size: 16px;
        cursor: pointer;
        padding: 4px;
        opacity: 0.7;
    `;
    
    closeBtn.addEventListener('click', () => {
        banner.remove();
    });

    banner.appendChild(text);
    banner.appendChild(reloadBtn);
    banner.appendChild(closeBtn);
    
    document.body.appendChild(banner);
}

// NEU: Startzeitpunkt des Skripts merken.
// Signale, die älter sind als dieser Zeitpunkt, werden beim Neuladen ignoriert.
const scriptInitTime = Date.now();

/**
 * Setzt den Zeitstempel in der Cloud.
 * NEU: Setzt das lokale Flag, damit wir unser eigenes Signal ignorieren!
 */
function triggerExternalUpdate() {
    isLocalSaveInProgress = true;
    if (localSaveTimeout) clearTimeout(localSaveTimeout);

    chrome.storage.sync.set({ 'gemini_remote_update_trigger': Date.now() }, () => {
        localSaveTimeout = setTimeout(() => { isLocalSaveInProgress = false; }, 1000);
    });
}

/**
 * Exportiert die gesamten Datenbanken sowie eine Mapping-Tabelle
 * für Chat-IDs zu Chat-Titeln und Folder-IDs zu Folder-Namen.
 */
async function handleExportDatabase() {
    // 1. Daten aus beiden Speichern abrufen
    const syncData = await new Promise(resolve => chrome.storage.sync.get(null, resolve));
    const localData = await new Promise(resolve => chrome.storage.local.get('gemini_folder_states', resolve));

    // 2. Mapping-Tabellen vorbereiten
    const mapping = {
        folders: {},
        chats: {}
    };

    // 3. Ordner-Mapping aus den Metadaten auslesen
    if (syncData.gemini_folder_metadata) {
        syncData.gemini_folder_metadata.forEach(folder => {
            mapping.folders[folder.id] = folder.name;
        });
    }

    // 4. Chat-Mapping aus dem DOM extrahieren
    // Da das Skript beim Start alle Chats vorlädt, sind diese im DOM (auch wenn sie zugeklappt sind).
    const chatElements = document.querySelectorAll('.conversation-items-container');
    chatElements.forEach(chatEl => {
        const chatId = chatEl.dataset.chatId;
        const titleEl = chatEl.querySelector('.conversation-title');
        if (chatId && titleEl) {
            mapping.chats[chatId] = titleEl.textContent.trim();
        }
    });

    // 5. Export-Objekt zusammenbauen
    const exportObject = {
        exportDate: new Date().toISOString(),
        mapping: mapping,
        storage: {
            sync: syncData,
            local: localData
        }
    };

    // 6. JSON-Datei generieren und Download anstoßen
    const jsonString = JSON.stringify(exportObject, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const downloadAnchor = document.createElement('a');
    downloadAnchor.href = url;
    downloadAnchor.download = `gemini-database-export-${new Date().toISOString().split('T')[0]}.json`;
    
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    
    // Aufräumen
    setTimeout(() => {
        document.body.removeChild(downloadAnchor);
        URL.revokeObjectURL(url);
    }, 100);
}
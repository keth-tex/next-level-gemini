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
 * Speichert Strukturdaten im Sync-Speicher und den Aufklapp-Status (isOpen) lokal.
 * Wartet strikt auf die Rückmeldung der Cloud, bevor das Schutz-Flag freigegeben wird.
 */
async function saveFolderStructure(structure) {
    // 1. Flag setzen: Wir speichern gerade selbst! Timer abbrechen.
    isLocalSaveInProgress = true;
    if (localSaveTimeout) clearTimeout(localSaveTimeout);

    const syncData = {};
    const folderMetadataList = [];
    const localFolderStates = {}; 

    structure.forEach(folder => {
        folderMetadataList.push({
            id: folder.id,
            name: folder.name || folder.title || "Ordner",
            color: folder.color,
            isDefault: folder.isDefault
        });

        syncData[`folder_${folder.id}`] = folder.chatIds || [];
        localFolderStates[folder.id] = folder.isOpen; 
    });

    syncData['gemini_folder_metadata'] = folderMetadataList;

    syncData['gemini_deleted_chats'] = syncedDeletedChats;

    // 2. WARTEN, bis die Cloud-Speicherung (Sync) wirklich abgeschlossen ist
    await new Promise((resolve) => {
        chrome.storage.sync.set(syncData, () => {
            if (chrome.runtime.lastError) {
                console.error("Gemini Exporter Sync Fehler:", chrome.runtime.lastError.message);
            }
            resolve();
        });
    });

    // 3. WARTEN, bis die lokale Speicherung abgeschlossen ist
    await new Promise((resolve) => {
        chrome.storage.local.set({ 'gemini_folder_states': localFolderStates }, () => {
            resolve();
        });
    });
    
    // 4. ERST JETZT den Timer starten!
    // Puffer auf 1000ms erhöht, um das Echo sicher abzufangen.
    localSaveTimeout = setTimeout(() => { 
        isLocalSaveInProgress = false; 
    }, 1000);
    
    return Promise.resolve();
}

/**
 * Der automatische Wächter für externe Änderungen.
 */
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && !isLocalSaveInProgress) {
        
        // NEU: Zeitstempel-Abgleich. Nur neuere Signale aktivieren das Banner.
        if (changes.gemini_remote_update_trigger) {
            const triggerTime = changes.gemini_remote_update_trigger.newValue;
            if (triggerTime && triggerTime > scriptInitTime) {
                console.log("Gemini Exporter: Elementare externe Änderung erkannt. Zeige Banner.");
                showExternalUpdateBanner();
                return; 
            }
        }

        let structureChanged = false;
        for (let key in changes) {
            if (key.startsWith('folder_') || key === 'gemini_folder_metadata') {
                structureChanged = true;
                break;
            }
        }

        if (structureChanged) {
            console.log("Gemini Exporter: Externe Cloud-Änderung erkannt! Aktualisiere UI...");
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
/**
 * feature-archive.js
 * Handhabt das Archivieren, Rendern und Laden von lokalen Chats.
 */

// Globaler Listener: Stellt die normale Chat-Ansicht wieder her, 
// wenn in der Seitenleiste ein nativer Chat angeklickt wird.
document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="/app/"]');
    if (link) {
        const listItem = link.closest('gem-nav-list-item');
        // Wenn es KEIN archivierter Chat ist -> Original-Ansicht wiederherstellen
        if (listItem && !listItem.classList.contains('gemini-archived-chat-item')) {
            
            // Aktiven Status von archivierten Chats entfernen
            document.querySelectorAll('.gemini-archived-chat-item.is-active, .gemini-archived-chat-item a.is-active').forEach(el => {
                el.classList.remove('is-active', 'mdc-list-item--activated');
            });
            
            // Typografie der archivierten Chats auf Standard zurücksetzen
            document.querySelectorAll('.gemini-archived-chat-item .gds-emphasized-body-s').forEach(titleSpan => {
                titleSpan.classList.remove('gds-emphasized-body-s');
                titleSpan.classList.add('gds-body-s');
            });

            restoreNativeChatView();
        }
    }
}, true); // Capturing Phase, damit wir es sofort mitbekommen

window.addEventListener('popstate', restoreNativeChatView);


// --- 1. ARCHIVIERUNGS-LOGIK ---

async function handleArchiveClick(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }

    const activeLink = document.querySelector('gem-nav-list-item > a.is-active');
    if (!activeLink) {
        console.warn("Archivierung abgebrochen: Kein aktiver Chat gefunden.");
        return;
    }

    const titleSpan = activeLink.querySelector('.title-text');
    const title = titleSpan ? titleSpan.textContent.trim() : "Archivierter Chat";

    const chatWindow = document.querySelector('chat-window');
    if (!chatWindow) {
        console.warn("Archivierung abgebrochen: Element 'chat-window' nicht gefunden.");
        return;
    }

    // DOM klonen
    const clone = chatWindow.cloneNode(true);

    // 1. Kaputte/unnötige interaktive Elemente entfernen
    const elementsToRemove = clone.querySelectorAll([
        '.file-preview-container',
        '.response-container-footer',
        '.code-block-decoration > .buttons',
        '.user-query-container > .luminous-actions-container',
        '.user-query-bubble-with-background > .luminous-toggle-container',
        'input-container',
        'input-area-v2'
    ].join(', '));
    
    elementsToRemove.forEach(el => el.remove());

    // 2. Zustand der User-Queries auf 'expanded' erzwingen
    clone.querySelectorAll('.query-text.collapsed').forEach(el => {
        el.classList.remove('collapsed');
    });
    
    clone.querySelectorAll('.user-query-bubble-with-background').forEach(el => {
        el.classList.add('luminous-expanded');
        if (el.getAttribute('data-test-id') === 'luminous-collapsed-bubble') {
            el.setAttribute('data-test-id', 'luminous-expanded-bubble');
        }
    });

    const htmlContent = clone.innerHTML;
    const archiveId = 'a_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);

    // HTML in den lokalen Speicher schreiben
    await new Promise(resolve => chrome.storage.local.set({ [`gemini_archive_data_${archiveId}`]: htmlContent }, resolve));

    // Metadaten-Index aktualisieren
    const data = await new Promise(resolve => chrome.storage.local.get(['gemini_archive_index'], resolve));
    const index = data.gemini_archive_index || [];
    index.push({ id: archiveId, title: title, timestamp: Date.now() });
    await new Promise(resolve => chrome.storage.local.set({ gemini_archive_index: index }, resolve));

    // Ziel-Ordner ermitteln
    const currentChatId = activeLink.closest('gem-nav-list-item').dataset.chatId;
    const { chatFolderMap, defaultFolderId } = await getChatFolderMap();
    const targetFolderId = chatFolderMap.get(currentChatId) || defaultFolderId;

    // Archiv-ID an die Ordnerstruktur anhängen
    let structure = await getFolderStructure();
    const targetFolder = structure.find(f => f.id === targetFolderId);
    if (targetFolder) {
        targetFolder.chatIds.push(archiveId);
        await saveFolderStructure(structure);
    }

    // UI aktualisieren
    await injectArchivedChatsIntoDOM();
    if (typeof syncFullListOrder === 'function') syncFullListOrder();
    
    alert(`Chat "${title}" wurde erfolgreich lokal archiviert!`);
}


// --- 2. RENDER-LOGIK FÜR DIE SEITENLEISTE ---

async function injectArchivedChatsIntoDOM() {
    const data = await new Promise(resolve => chrome.storage.local.get(['gemini_archive_index'], resolve));
    const index = data.gemini_archive_index || [];
    const container = document.querySelector(GeminiDOM.conversationsContainer);
    
    if (!container) return;

    index.forEach(archiveItem => {
        if (document.querySelector(`gem-nav-list-item[data-chat-id="${archiveItem.id}"]`)) return;

        const li = document.createElement('gem-nav-list-item');
        li.className = "ng-star-inserted has-hovered-trailing-content gemini-archived-chat-item";
        
        // WICHTIG: Diese Attribute sorgen dafür, dass syncFullListOrder greift!
        li.dataset.testId = "conversation"; 
        li.dataset.chatId = archiveItem.id;
        // Drag-Attribute lässt syncFullListOrder automatisch setzen!
        
        li.innerHTML = `
            <a mat-list-item="" class="mat-mdc-list-item mdc-list-item mat-mdc-tooltip-trigger gem-nav-list-item gmat-override mat-mdc-list-item-interactive mdc-list-item--with-trailing-meta lm-enabled mat-mdc-list-item-single-line mdc-list-item--with-one-line ng-star-inserted" aria-label="${archiveItem.title}" tabindex="0" draggable="false">
                <span class="mdc-list-item__content">
                    <span class="mat-mdc-list-item-unscoped-content mdc-list-item__primary-text">
                        <span class="label-and-badge ng-star-inserted">
                            <span class="title-text gds-body-s">${archiveItem.title}</span>
                        </span>
                    </span>
                </span>
                <div class="mat-focus-indicator"></div>
            </a>
            <span class="folder-actions archive-actions">
                <div class="archive-status-icon">
                    <mat-icon class="mat-icon notranslate lm-icon-m lumi-symbols mat-ligature-font mat-icon-no-color ng-star-inserted" aria-hidden="true" data-mat-icon-name="drive" data-mat-icon-namespace="lumi-symbols">drive</mat-icon>
                </div>
                <button class="action-btn edit-btn" title="Umbenennen">
                    <mat-icon class="mat-icon notranslate google-symbols mat-ligature-font" aria-hidden="true">create</mat-icon>
                </button>
                <button class="action-btn delete-btn" title="Löschen">
                    <mat-icon class="mat-icon notranslate google-symbols mat-ligature-font" aria-hidden="true">delete_outline</mat-icon>
                </button>
            </span>
        `;

        const linkEl = li.querySelector('a');
        linkEl.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // 1. Aktiven Status beim zuvor ausgewählten Chat restlos entfernen
            document.querySelectorAll('gem-nav-list-item.is-active, gem-nav-list-item a.is-active').forEach(el => {
                el.classList.remove('is-active', 'mdc-list-item--activated');
            });
            
            // Typografie des zuvor ausgewählten Chats auf Standard zurücksetzen
            document.querySelectorAll('gem-nav-list-item .gds-emphasized-body-s').forEach(titleSpan => {
                titleSpan.classList.remove('gds-emphasized-body-s');
                titleSpan.classList.add('gds-body-s');
            });
            
            // 2. Geklickten Archiv-Chat selektieren
            linkEl.classList.add('is-active', 'mdc-list-item--activated');
            
            // Typografie des geklickten Archiv-Chats anpassen
            const activeTitleSpan = linkEl.querySelector('.title-text');
            if (activeTitleSpan) {
                activeTitleSpan.classList.remove('gds-body-s');
                activeTitleSpan.classList.add('gds-emphasized-body-s');
            }
            
            loadArchivedChatView(archiveItem.id);
        });

        li.querySelector('.edit-btn').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            renameArchivedChat(archiveItem.id, li.querySelector('.title-text'), li);
        });

        li.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            deleteArchivedChat(archiveItem.id, li);
        });

        container.appendChild(li);
    });
}


// --- 3. LADE-LOGIK FÜR DIE ANSICHT (Zerstörungsfrei) ---

async function loadArchivedChatView(archiveId) {
    const data = await new Promise(resolve => chrome.storage.local.get([`gemini_archive_data_${archiveId}`], resolve));
    const html = data[`gemini_archive_data_${archiveId}`];
    
    if (!html) return;

    const chatWindow = document.querySelector('chat-window');
    if (chatWindow) {
        // Zustand global auf body setzen (wichtig für CSS-Weichen)
        document.body.classList.add('gemini-is-archive-view');

        Array.from(chatWindow.children).forEach(child => {
            if (child.id !== 'gemini-archive-viewer') {
                child.style.display = 'none';
                child.classList.add('gemini-native-hidden');
            }
        });

        let viewer = document.getElementById('gemini-archive-viewer');
        if (!viewer) {
            viewer = document.createElement('div');
            viewer.id = 'gemini-archive-viewer';
            viewer.style.width = '100%';
            viewer.style.height = '100%';
            viewer.style.overflowY = 'auto';
            chatWindow.appendChild(viewer);
        }

        viewer.innerHTML = html;
        viewer.style.display = 'block';
        
        const globalInputContainer = document.querySelector('input-container, input-area-v2');
        if (globalInputContainer) {
            globalInputContainer.style.display = 'none';
            globalInputContainer.classList.add('gemini-native-hidden');
        }
    }
}

function restoreNativeChatView() {
    // Zustand wieder entfernen
    document.body.classList.remove('gemini-is-archive-view');

    const viewer = document.getElementById('gemini-archive-viewer');
    if (viewer) {
        viewer.style.display = 'none';
        viewer.innerHTML = '';
    }

    const hiddenElements = document.querySelectorAll('.gemini-native-hidden');
    hiddenElements.forEach(el => {
        el.style.display = '';
        el.classList.remove('gemini-native-hidden');
    });
}


// --- 4. VERWALTUNGS-FUNKTIONEN (Inline Edit & Delete) ---

async function renameArchivedChat(archiveId, titleSpan, listItemEl) {
    if (titleSpan.isEditing) return;
    titleSpan.isEditing = true;
    
    const originalName = titleSpan.textContent;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = originalName;
    input.className = 'folder-name-input'; // Nutzt die CSS-Klasse der Ordner
    input.style.fieldSizing = 'content';
    input.style.minWidth = '1ch';
    
    titleSpan.style.display = 'none';
    titleSpan.after(input);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    
    listItemEl.classList.add('is-editing');

    const saveChanges = async () => {
        const newName = input.value.trim();
        const finalName = (newName && newName !== originalName) ? newName : originalName;
        titleSpan.textContent = finalName;
        
        input.removeEventListener('keydown', handleKey);
        document.removeEventListener('mousedown', handleOutsideClick);
        input.remove();
        titleSpan.style.display = '';
        titleSpan.isEditing = false;
        listItemEl.classList.remove('is-editing');

        if (finalName !== originalName) {
            const data = await new Promise(resolve => chrome.storage.local.get(['gemini_archive_index'], resolve));
            const index = data.gemini_archive_index || [];
            const item = index.find(i => i.id === archiveId);
            if (item) {
                item.title = finalName;
                await new Promise(resolve => chrome.storage.local.set({ gemini_archive_index: index }, resolve));
            }
        }
    };

    const handleOutsideClick = (e) => {
        if (!listItemEl.contains(e.target)) saveChanges();
    };
    setTimeout(() => document.addEventListener('mousedown', handleOutsideClick), 10);

    const handleKey = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); saveChanges(); }
        else if (e.key === 'Escape') { e.preventDefault(); input.value = originalName; saveChanges(); }
    };
    input.addEventListener('keydown', handleKey);
}

async function deleteArchivedChat(archiveId, listItemEl) {
    if (!confirm("Diesen archivierten Chat unwiderruflich löschen?")) return;

    const data = await new Promise(resolve => chrome.storage.local.get(['gemini_archive_index'], resolve));
    let index = data.gemini_archive_index || [];
    index = index.filter(i => i.id !== archiveId);
    await new Promise(resolve => chrome.storage.local.set({ gemini_archive_index: index }, resolve));

    await new Promise(resolve => chrome.storage.local.remove([`gemini_archive_data_${archiveId}`], resolve));

    let structure = await getFolderStructure();
    structure.forEach(folder => {
        if (Array.isArray(folder.chatIds)) {
            const idx = folder.chatIds.indexOf(archiveId);
            if (idx > -1) folder.chatIds.splice(idx, 1);
        }
    });
    await saveFolderStructure(structure);

    listItemEl.remove();
}
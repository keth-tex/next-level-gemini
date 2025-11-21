/**
 * folders-ui.js
 * Handles HTML element creation and specific UI interactions like inline editing.
 */

// === UI GENERATION FUNCTIONS ===

/**
 * Erstellt einen generischen Button für die Sidebar mit exakt der Struktur,
 * die Gemini (und der TOC-Button) verwendet.
 * * Struktur:
 * <side-nav-action-button>
 * <button>
 * <icon-container><icon/></icon-container>
 * <content><span>Label</span></content>
 * <focus-indicator/>
 * </button>
 * </side-nav-action-button>
 */
function createGenericSidebarButton(id, iconName, label, extraClasses = '', onClick = null) {
  // 1. Wrapper Component
  const wrapper = document.createElement('side-nav-action-button');
  wrapper.className = 'ia-redesign ng-star-inserted';

  // 2. Button Element
  const button = document.createElement('button');
  button.id = id;
  // Exakte Klassen-Liste wie beim TOC Button
  button.className = `mat-mdc-list-item mdc-list-item mat-ripple mat-mdc-tooltip-trigger side-nav-action-button explicit-gmat-override mat-mdc-list-item-interactive mdc-list-item--with-leading-icon mat-mdc-list-item-single-line mdc-list-item--with-one-line ${extraClasses}`;
  button.setAttribute('type', 'button');
  button.setAttribute('aria-label', label);

  // 3. Icon Container
  const iconContainer = document.createElement('div');
  iconContainer.className = 'mat-mdc-list-item-icon icon-container explicit-gmat-override mdc-list-item__start';

  // 4. Icon
  const icon = document.createElement('mat-icon');
  icon.className = 'mat-icon notranslate gds-icon-l google-symbols mat-ligature-font mat-icon-no-color';
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('data-mat-icon-type', 'font');
  icon.textContent = iconName;

  iconContainer.appendChild(icon);

  // 5. Content / Label
  const contentSpan = document.createElement('span');
  contentSpan.className = 'mdc-list-item__content';

  const unscopedSpan = document.createElement('span');
  unscopedSpan.className = 'mat-mdc-list-item-unscoped-content mdc-list-item__primary-text';
  unscopedSpan.textContent = label;

  contentSpan.appendChild(unscopedSpan);

  // 6. Focus Indicator
  const focusIndicator = document.createElement('div');
  focusIndicator.className = 'mat-focus-indicator';

  // Assemble Button
  button.appendChild(iconContainer);
  button.appendChild(contentSpan);
  button.appendChild(focusIndicator);

  // Add Listener
  if (onClick) {
    button.addEventListener('click', onClick);
  }

  // Assemble Wrapper
  wrapper.appendChild(button);

  return wrapper;
}

function createFolderButton() {
  // Nutzt nun die generische Funktion, gibt aber den Wrapper zurück
  // ID: new-folder-button
  // Icon: folder
  // Label: Neuer Ordner
  // Extra Class: new-folder-button (für CSS styling hook)
  return createGenericSidebarButton(
    'new-folder-button',
    'folder',
    'Neuer Ordner',
    'new-folder-button',
    handleNewFolderClick
  );
}

function renderSingleFolder(folder, index, totalFolders) {
  const header = document.createElement('div');
  header.className = 'folder-header';
  header.dataset.folderId = folder.id;

  let baseOrder = 1000;
  try {
    baseOrder = (parseInt(folder.id.replace(/\D/g, '')) % 1000) || 1000;
  } catch (e) {}
  header.style.order = baseOrder;

  header.innerHTML = `
      <mat-icon class="mat-icon notranslate google-symbols mat-ligature-font mat-icon-no-color folder-toggle-icon" aria-hidden="true">chevron_right</mat-icon>
      <span class="folder-name">${folder.name}</span>
      
      <span class="folder-actions">
        ${!folder.isDefault ? `
          <button class="action-btn" data-action="move-up" title="Nach oben" ${index === 0 ? 'disabled style="cursor: pointer;"' : ''}>
            <mat-icon class="mat-icon notranslate google-symbols mat-ligature-font" aria-hidden="true">arrow_upward</mat-icon>
          </button>
          <button class="action-btn" data-action="move-down" title="Nach unten" ${index === totalFolders - 1 ? 'disabled style="cursor: pointer;"' : ''}>
            <mat-icon class="mat-icon notranslate google-symbols mat-ligature-font" aria-hidden="true">arrow_downward</mat-icon>
          </button>
        ` : ''}
        
        <button class="action-btn" data-action="rename" title="Umbenennen">
          <mat-icon class="mat-icon notranslate google-symbols mat-ligature-font" aria-hidden="true">create</mat-icon>
        </button>
        
        ${!folder.isDefault ? `
          <button class="action-btn" data-action="delete" title="Löschen">
            <mat-icon class="mat-icon notranslate google-symbols mat-ligature-font" aria-hidden="true">delete_outline</mat-icon>
          </button>
        ` : ''}
      </span>
    `;

  if (folder.isOpen) {
    header.classList.add('is-open');
  }

  header.addEventListener('click', (e) => {
    if (e.target.closest('.action-btn')) {
      return;
    }
    toggleFolder(folder.id);
  });

  header.querySelector('.folder-actions').addEventListener('click', (e) => {
    const button = e.target.closest('.action-btn');
    if (!button) return;

    e.stopPropagation();

    const action = button.dataset.action;
    switch (action) {
      case 'move-up':
        handleMoveFolder(folder.id, 'up');
        break;
      case 'move-down':
        handleMoveFolder(folder.id, 'down');
        break;
      case 'rename':
        const nameSpan = header.querySelector('.folder-name');
        activateInlineEdit(nameSpan, folder.id);
        break;
      case 'delete':
        handleDeleteFolder(folder.id);
        break;
    }
  });

  header.addEventListener('dragover', handleDragOverFolder);
  header.addEventListener('dragleave', handleDragLeaveFolder);
  header.addEventListener('drop', handleDropOnFolder);

  return header;
}

function activateInlineEdit(nameSpan, folderId) {
  if (!nameSpan || !folderId || nameSpan.isEditing) return;

  nameSpan.isEditing = true;

  const header = nameSpan.closest('.folder-header');
  const originalName = nameSpan.textContent;

  const input = document.createElement('input');
  input.type = 'text';
  input.value = originalName;
  input.className = 'folder-name-input';

  nameSpan.style.display = 'none';
  header.insertBefore(input, nameSpan.nextSibling);
  input.focus();

  // Modification: Set caret to end instead of selecting all
  const len = input.value.length;
  input.setSelectionRange(len, len);

  const saveChanges = async () => {
    const newName = input.value.trim();

    input.removeEventListener('keydown', handleKey);
    input.removeEventListener('blur', saveChanges);

    input.remove();
    nameSpan.style.display = '';
    nameSpan.isEditing = false;

    if (newName && newName !== originalName) {
      let structure = await getFolderStructure();
      const folder = structure.find(f => f.id === folderId);
      if (folder) {
        folder.name = newName;
        await chrome.storage.local.set({ 'folderStructure': structure });
        nameSpan.textContent = newName;
      }
    } else {
      nameSpan.textContent = originalName;
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveChanges();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      input.value = originalName;
      saveChanges();
    }
  };

  input.addEventListener('keydown', handleKey);
  input.addEventListener('blur', saveChanges);
}
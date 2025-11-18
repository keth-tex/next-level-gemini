/**
 * folders-ui.js
 * Handles HTML element creation and specific UI interactions like inline editing.
 */

// === UI GENERATION FUNCTIONS ===

function createFolderButton() {
  // 1. Create the <mat-action-list> wrapper
  const listWrapper = document.createElement('mat-action-list');
  listWrapper.id = 'new-folder-button-wrapper';
  // FIX: Added 'top-action-list'
  listWrapper.className = 'mat-mdc-action-list mat-mdc-list-base mdc-list top-action-list';
  listWrapper.setAttribute('role', 'group');

  // 2. Create the <button> element
  const button = document.createElement('button');
  button.id = 'new-folder-button';
  button.className = 'mat-mdc-list-item mdc-list-item mat-ripple mat-mdc-tooltip-trigger side-nav-action-button explicit-gmat-override mat-mdc-list-item-interactive mdc-list-item--with-leading-icon mat-mdc-list-item-single-line mdc-list-item--with-one-line new-folder-button';
  button.setAttribute('type', 'button');
  button.setAttribute('aria-label', 'Neuer Ordner');

  // 3. Create the icon container
  const iconContainer = document.createElement('div');
  iconContainer.className = 'mat-mdc-list-item-icon icon-container explicit-gmat-override mdc-list-item__start new-folder-icon';

  // 4. Create the <mat-icon> element
  const icon = document.createElement('mat-icon');
  icon.className = 'mat-icon notranslate gds-icon-l google-symbols mat-ligature-font mat-icon-no-color new-folder-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('data-mat-icon-type', 'font');
  icon.textContent = 'folder';

  iconContainer.appendChild(icon);

  // 5. Create the nested text spans
  const contentSpan = document.createElement('span');
  contentSpan.className = 'mdc-list-item__content';

  const unscopedSpan = document.createElement('span');
  unscopedSpan.className = 'mat-mdc-list-item-unscoped-content mdc-list-item__primary-text';

  const textSpan = document.createElement('span');
  textSpan.className = 'gds-body-m'; // Uses the text class from "Discover Gems"
  textSpan.textContent = 'Neuer Ordner';

  unscopedSpan.appendChild(textSpan);
  contentSpan.appendChild(unscopedSpan);

  // 6. Create the focus indicator
  const focusIndicator = document.createElement('div');
  focusIndicator.className = 'mat-focus-indicator';

  // 7. Assemble the button
  button.appendChild(iconContainer);
  button.appendChild(contentSpan);
  button.appendChild(focusIndicator);

  // 8. Add click listener
  button.addEventListener('click', handleNewFolderClick);

  // 9. Add button to wrapper
  listWrapper.appendChild(button);

  // 10. Return the complete wrapper
  return listWrapper;
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
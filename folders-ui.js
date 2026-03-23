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

function renderSingleFolder(folder, index, totalFolders, parentColor = null) {
  const header = document.createElement('div');
  const isSubfolder = folder.parentId != null;
  
  header.className = isSubfolder ? 'folder-header is-subfolder' : 'folder-header';
  header.dataset.folderId = folder.id;
  
  if (isSubfolder) {
      header.dataset.parentId = folder.parentId; 
  }
  
  const effectiveColor = isSubfolder ? (parentColor || '#a8c7fa') : (folder.color || '#a8c7fa');
  header.dataset.folderColor = effectiveColor;
  
  if (isSubfolder) {
      header.style.setProperty('border-left', `4px solid ${effectiveColor}`, 'important');
  }

  let baseOrder = 1000;
  try {
    baseOrder = (parseInt(folder.id.replace(/\D/g, '')) % 1000) || 1000;
  } catch (e) {}
  header.style.order = baseOrder;

  const iconColorStyle = effectiveColor ? `color: ${effectiveColor} !important;` : '';

  header.innerHTML = `
      <mat-icon class="mat-icon notranslate google-symbols mat-ligature-font mat-icon-no-color folder-toggle-icon" aria-hidden="true">chevron_right</mat-icon>
      
      <mat-icon class="mat-icon notranslate google-symbols mat-ligature-font folder-icon" aria-hidden="true" style="${iconColorStyle}">folder</mat-icon>
      
      <span class="folder-name">${folder.name}</span>
      
      <button class="menu-toggle-btn" title="Optionen">
        <mat-icon class="mat-icon notranslate google-symbols mat-ligature-font" aria-hidden="true">more_vert</mat-icon>
      </button>
      
      <span class="folder-actions">
        ${!folder.isDefault && !isSubfolder ? `
          <button class="action-btn" data-action="add-subfolder" title="Unterordner erstellen">
            <mat-icon class="mat-icon notranslate google-symbols mat-ligature-font" aria-hidden="true">add</mat-icon>
          </button>
        ` : ''}
        
        ${!folder.isDefault ? `
          <button class="action-btn" data-action="move-up" title="Nach oben" ${index === 0 ? 'disabled' : ''}>
            <mat-icon class="mat-icon notranslate google-symbols mat-ligature-font" aria-hidden="true">arrow_upward</mat-icon>
          </button>
          <button class="action-btn" data-action="move-down" title="Nach unten" ${index === totalFolders - 1 ? 'disabled' : ''}>
            <mat-icon class="mat-icon notranslate google-symbols mat-ligature-font" aria-hidden="true">arrow_downward</mat-icon>
          </button>
        ` : ''}
        
        <button class="action-btn" data-action="rename" title="Bearbeiten">
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

  // Klick auf den Header (Aufklappen/Zuklappen des Ordners)
  header.addEventListener('click', (e) => {
    // Ignoriere Klicks, wenn sie auf dem Menü oder den Buttons stattfinden
    if (e.target.closest('.action-btn') || e.target.closest('.menu-toggle-btn') || e.target.closest('.folder-actions')) return;
    toggleFolder(folder.id);
  });

  // NEU: Klick auf den Drei-Punkte-Button (Dropdown öffnen/schließen)
  const toggleBtn = header.querySelector('.menu-toggle-btn');
  if (toggleBtn) {
      toggleBtn.addEventListener('click', (e) => {
          e.stopPropagation(); // Verhindert, dass sich der Ordner beim Klicken versehentlich mit öffnet
          
          // Schließe eventuell andere, noch offene Menüs in der Liste
          document.querySelectorAll('.folder-header.menu-open').forEach(h => {
              if (h !== header) h.classList.remove('menu-open');
          });
          
          // Öffnet/Schließt das Menü des aktuellen Ordners
          header.classList.toggle('menu-open');
      });
  }

  // Klick auf eine Aktion im Dropdown-Menü
  header.querySelector('.folder-actions').addEventListener('click', (e) => {
    const button = e.target.closest('.action-btn');
    if (!button || button.disabled) return;

    e.stopPropagation();

    // Menü nach der Aktion sofort wieder schließen
    header.classList.remove('menu-open');

    const action = button.dataset.action;
    switch (action) {
      case 'add-subfolder': handleAddSubfolder(folder.id); break;
      case 'move-up': handleMoveFolder(folder.id, 'up'); break;
      case 'move-down': handleMoveFolder(folder.id, 'down'); break;
      case 'rename': 
        const nameSpan = header.querySelector('.folder-name');
        activateInlineEdit(nameSpan, folder.id);
        break;
      case 'delete': handleDeleteFolder(folder.id); break;
    }
  });

  if (typeof handleDragOverFolder !== 'undefined') {
    header.addEventListener('dragover', handleDragOverFolder);
    header.addEventListener('dragleave', handleDragLeaveFolder);
    header.addEventListener('drop', handleDropOnFolder);
  }

  return header;
}


function activateInlineEdit(nameSpan, folderId) {
  if (!nameSpan || !folderId || nameSpan.isEditing) return;

  nameSpan.isEditing = true;

  const header = nameSpan.closest('.folder-header');
  header.classList.add('is-editing'); 
  
  const originalName = nameSpan.textContent;
  let currentColor = header.dataset.folderColor || '#a8c7fa';
  
  // NEU: Prüfen, ob wir uns in einem Unterordner befinden
  const isSubfolder = header.classList.contains('is-subfolder'); 

  const input = document.createElement('input');
  input.type = 'text';
  input.value = originalName;
  input.className = 'folder-name-input';

  let pickerContainer = null;

  // NEU: Color-Picker NUR generieren, wenn es sich um einen Hauptordner handelt
  if (!isSubfolder) {
      pickerContainer = document.createElement('div');
      pickerContainer.className = 'folder-color-picker-popup';
      pickerContainer.addEventListener('mousedown', e => e.stopPropagation());
      pickerContainer.addEventListener('click', e => e.stopPropagation());

      const updateUIColors = (color) => {
        const icon = header.querySelector('.folder-icon');
        if (icon) icon.style.setProperty('color', color, 'important');
        const innerCircle = pickerContainer.querySelector('.custom-color-inner');
        if (innerCircle) innerCircle.style.backgroundColor = color;
      };

      const updatePickerSelection = (color) => {
        pickerContainer.querySelectorAll('.color-swatch').forEach(s => {
          if (color && s.dataset.color.toLowerCase() === color.toLowerCase()) {
            s.classList.add('selected');
          } else {
            s.classList.remove('selected');
          }
        });
      };

      const swatchesContainer = document.createElement('div');
      swatchesContainer.className = 'folder-color-swatches';

      FOLDER_COLORS.forEach(color => {
         const swatch = document.createElement('div');
         swatch.className = 'color-swatch';
         swatch.style.backgroundColor = color;
         swatch.dataset.color = color;
         if (color.toLowerCase() === currentColor.toLowerCase()) swatch.classList.add('selected');
         
         swatch.addEventListener('mousedown', (e) => {
             e.preventDefault(); 
             e.stopPropagation();
             currentColor = color;
             updatePickerSelection(color);
             updateUIColors(currentColor);
         });
         swatchesContainer.appendChild(swatch);
      });
      
      pickerContainer.appendChild(swatchesContainer);

      const separator = document.createElement('hr');
      separator.className = 'color-picker-separator';
      pickerContainer.appendChild(separator);

      const customSection = document.createElement('div');
      customSection.className = 'custom-color-section';

      const customLabel = document.createElement('div');
      customLabel.className = 'custom-color-label';
      customLabel.textContent = 'Eigene Farbe:';
      customSection.appendChild(customLabel);

      const customInputWrapper = document.createElement('div');
      customInputWrapper.className = 'custom-color-wrapper';
      
      const customInner = document.createElement('div');
      customInner.className = 'custom-color-inner';
      customInner.style.backgroundColor = currentColor; 
      customInputWrapper.appendChild(customInner);

      const customInput = document.createElement('input');
      customInput.type = 'color';
      customInput.value = currentColor;
      
      customInput.addEventListener('input', (e) => {
          currentColor = e.target.value;
          updatePickerSelection(null); 
          updateUIColors(currentColor);
      });
      
      customInputWrapper.appendChild(customInput);
      customSection.appendChild(customInputWrapper);
      pickerContainer.appendChild(customSection);
  }

  nameSpan.style.display = 'none';
  header.insertBefore(input, nameSpan.nextSibling);
  if (pickerContainer) header.appendChild(pickerContainer); 
  
  input.focus();
  const len = input.value.length;
  input.setSelectionRange(len, len);

  const saveChanges = async () => {
    const newName = input.value.trim();

    input.removeEventListener('keydown', handleKey);
    document.removeEventListener('mousedown', handleOutsideClick);

    input.remove();
    if (pickerContainer) pickerContainer.remove(); 
    nameSpan.style.display = '';
    nameSpan.isEditing = false;
    
    header.classList.remove('is-editing');

    let structure = await getFolderStructure();
    const folder = structure.find(f => f.id === folderId);
    let hasChanges = false;
    
    if (folder) {
        if (newName && newName !== originalName) {
            folder.name = newName;
            nameSpan.textContent = newName;
            hasChanges = true;
        } else {
            nameSpan.textContent = originalName;
        }
        
        // Farbe nur speichern, wenn wir im Hauptordner sind
        if (!isSubfolder && currentColor !== header.dataset.folderColor) {
            folder.color = currentColor;
            header.dataset.folderColor = currentColor;
            const icon = header.querySelector('.folder-icon');
            if (icon) icon.style.setProperty('color', currentColor, 'important');
            hasChanges = true;
        }

        if (hasChanges) {
            await saveFolderStructure(structure);
            await renderInitialFolders();
            await syncFullListOrder();
        }
    }
  };

  const handleOutsideClick = (e) => {
      if (!header.contains(e.target)) {
          saveChanges();
      }
  };
  
  setTimeout(() => document.addEventListener('mousedown', handleOutsideClick), 10);

  const handleKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveChanges();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      input.value = originalName;
      if (!isSubfolder) {
          currentColor = header.dataset.folderColor; 
          const icon = header.querySelector('.folder-icon');
          if (icon) icon.style.setProperty('color', currentColor, 'important');
      }
      saveChanges();
    }
  };

  input.addEventListener('keydown', handleKey);
}

// --- NEU: Globaler Event-Listener zum Schließen des Dropdown-Menüs ---
if (!window.hasFolderMenuListener) {
    document.addEventListener('click', (e) => {
        // Wenn der Klick weder auf einem Menü noch auf einem Drei-Punkte-Button stattfand...
        if (!e.target.closest('.folder-actions') && !e.target.closest('.menu-toggle-btn')) {
            // ...alle offenen Menüs schließen.
            document.querySelectorAll('.folder-header.menu-open').forEach(h => {
                h.classList.remove('menu-open');
            });
        }
    });
    window.hasFolderMenuListener = true;
}
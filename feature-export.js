/**
 * feature-export.js
 * Handles the conversion of chat content to LaTeX and the Export Button logic.
 * Correctly identifies Gemini code blocks structure to handle nesting and language labels.
 */

// === TURNDOWN SETUP ===

const turndownService = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '*',
  codeBlockStyle: 'fenced',
  paragraphStyle: 'block'
});

turndownService.addRule('p', {
  filter: 'p',
  replacement: function(content) {
    return content + '\n';
  }
});

turndownService.use(turndownPluginGfm.gfm);

turndownService.addRule('geminiCodeBlock', {
  filter: function(node) {
    // 1. Must be a DIV
    if (node.nodeName !== 'DIV') return false;

    // 2. Check for DIRECT child with class 'code-block-decoration'.
    // This is the specific header containing "CSS", "Python", etc.
    // By checking only direct children, we avoid matching parent containers like <li>.
    let hasDirectDecoration = false;
    for (let i = 0; i < node.children.length; i++) {
      if (node.children[i].classList.contains('code-block-decoration')) {
        hasDirectDecoration = true;
        break;
      }
    }
    
    // If it doesn't have the decoration directly, it's not the wrapper we want.
    if (!hasDirectDecoration) return false;

    // 3. It must also contain the code container (somewhere inside)
    return !!node.querySelector('.code-container');
  },
  replacement: function(content, node) {
    // Retrieve the Label (e.g., "CSS")
    const labelNode = node.querySelector('.code-block-decoration');
    // Retrieve the Code content
    const codeNode = node.querySelector('.code-container');
    
    if (!codeNode) return '';
    
    // Clean up label text (remove "Copy code" button text if caught)
    // Usually the label is in a span or just text text node, but let's be safe.
    // Based on your HTML: <span class="...">CSS</span>
    let label = 'Code';
    if (labelNode) {
        // Get the text of the first span or just the node text, ignoring buttons
        const span = labelNode.querySelector('span');
        if (span) {
            label = span.textContent.trim();
        } else {
            // Fallback: Text content of decoration div, excluding button text if possible
            // But simple textContent is usually enough if structure is clean
            label = labelNode.firstChild.textContent.trim(); 
        }
    }

    let shorthand = label.toLowerCase();
    if (shorthand === 'code' || shorthand === '' || shorthand === 'code-snippet') {
      shorthand = 'text';
    }
    
    const rawCode = codeNode.textContent.replace(/\u00A0/g, ' ');
    const metadata = JSON.stringify({
      shorthand: shorthand,
      label: label
    });
    
    // The newlines here ensure Turndown treats this as a distinct block
    return `\n\n\`\`\`gemini-internal-code\n${metadata}\n${rawCode}\n\`\`\`\n\n`;
  }
});

turndownService.addRule('inlineMath', {
  filter: function(node) {
    return (
      node.nodeName === 'SPAN' &&
      node.classList.contains('math-inline') &&
      node.hasAttribute('data-math')
    );
  },
  replacement: function(content, node) {
    const rawMath = node.getAttribute('data-math');
    return 'IMATH' + rawMath + 'IMATH';
  }
});

// === EXPORT LOGIC ===

function scrapeAndSendConversation(event) {
  event.preventDefault();
  event.stopPropagation();
  console.log("Gemini LaTeX Export started...");
  const conversation = [];
  const promptSelector = '.query-text';
  const answerSelector = '.markdown-main-panel';
  const blocks = document.querySelectorAll('.conversation-container');

  if (blocks.length === 0) {
    console.error("Error: Could not find conversation blocks (e.g. '.conversation-container'). Check selectors.");
    return;
  }

  for (const block of blocks) {
    const promptEl = block.querySelector(promptSelector);
    const answerEl = block.querySelector(answerSelector);
    if (promptEl && answerEl) {
      const promptHtml = promptEl.innerHTML;
      const promptText = turndownService.turndown(promptHtml);
      const answerElClone = answerEl.cloneNode(true);
      
      // Remove elements that shouldn't be in the export
      const unwantedElements = answerElClone.querySelectorAll('.hide-from-message-actions');
      unwantedElements.forEach(el => el.remove());
      
      const answerHtml = answerElClone.innerHTML;
      const answerMd = turndownService.turndown(answerHtml);
      
      conversation.push({
        prompt: promptText,
        answer_md: answerMd
      });
    }
  }

  if (conversation.length > 0) {
    chrome.runtime.sendMessage({
      type: "exportConversation",
      data: conversation
    });
    console.log(`Exporting ${conversation.length} prompt/answer pairs...`);
  } else {
    console.error("Could not find valid prompt/answer pairs to export.");
  }
}

function createExportButton() {
  const newButton = document.createElement('button');
  newButton.id = 'gemini-tex-export-button';
  newButton.className = "mdc-icon-button mat-mdc-icon-button mat-mdc-button-base mat-unthemed";
  newButton.setAttribute('aria-label', 'Download als TeX-Datei');

  const newIcon = document.createElement('mat-icon');
  newIcon.className = "mat-icon notranslate google-symbols mat-ligature-font mat-icon-no-color";
  newIcon.setAttribute('role', 'img');
  newIcon.setAttribute('aria-hidden', 'true');
  newIcon.setAttribute('fonticon', 'file_download');
  newIcon.textContent = 'file_download';

  const spanPersistentRipple = document.createElement('span');
  spanPersistentRipple.className = "mat-mdc-button-persistent-ripple mdc-icon-button__ripple";

  const spanRipple = document.createElement('span');
  spanRipple.className = "mat-ripple mat-mdc-button-ripple";

  const spanFocus = document.createElement('span');
  spanFocus.className = "mat-focus-indicator";

  const spanTouch = document.createElement('span');
  spanTouch.className = "mat-mdc-button-touch-target";

  newButton.appendChild(spanPersistentRipple);
  newButton.appendChild(newIcon);
  newButton.appendChild(spanFocus);
  newButton.appendChild(spanTouch);
  newButton.appendChild(spanRipple);

  newButton.addEventListener('click', scrapeAndSendConversation);

  const newTooltip = document.createElement('span');
  newTooltip.className = 'gemini-tex-tooltip';
  newTooltip.textContent = 'Download als TeX-Datei';

  const newWrapperDiv = document.createElement('div');
  newWrapperDiv.id = 'gemini-tex-export-button-wrapper';
  newWrapperDiv.className = "buttons-container ng-star-inserted";
  newWrapperDiv.appendChild(newButton);
  newWrapperDiv.appendChild(newTooltip);

  return newWrapperDiv;
}
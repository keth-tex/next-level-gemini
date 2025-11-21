/**
 * feature-inline-code.js
 * Renders inline code in user prompts (surrounded by backticks) as HTML <code> elements.
 * Robust initialization for "document_start".
 */

const INLINE_CODE_PROCESSED_ATTR = 'data-gemini-inline-code-processed';

function renderInlineCodeInPrompts() {
  // Suche nach Prompt-Zeilen, die noch nicht verarbeitet wurden
  const queryLines = document.querySelectorAll(`.query-text-line:not([${INLINE_CODE_PROCESSED_ATTR}])`);

  queryLines.forEach(line => {
    // Markiere sofort als verarbeitet
    line.setAttribute(INLINE_CODE_PROCESSED_ATTR, 'true');

    // TreeWalker nutzen, um nur Text-Nodes zu finden (verhindert Zerstörung von HTML)
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT, null, false);
    let node;
    const nodesToReplace = [];

    while (node = walker.nextNode()) {
      if (node.nodeValue && node.nodeValue.includes('`')) {
        nodesToReplace.push(node);
      }
    }

    // Ersetzungen durchführen
    nodesToReplace.forEach(textNode => {
      const fragment = document.createDocumentFragment();
      // Regex splittet bei Backticks, behält die Backticks aber in der Capture Group
      const parts = textNode.nodeValue.split(/(`[^`]+`)/g);

      parts.forEach(part => {
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
          // Es ist Code: Erstelle <code> Element
          const codeEl = document.createElement('code');
          codeEl.className = 'gemini-prompt-inline-code';
          codeEl.textContent = part.slice(1, -1); // Backticks entfernen
          fragment.appendChild(codeEl);
        } else {
          // Normaler Text
          fragment.appendChild(document.createTextNode(part));
        }
      });

      textNode.parentNode.replaceChild(fragment, textNode);
    });
  });
}

// Observer starten
function startPromptObserver() {
  // Initialer Durchlauf (falls schon was da ist)
  renderInlineCodeInPrompts();

  const promptObserver = new MutationObserver((mutations) => {
    // Performance: Nur reagieren, wenn Nodes hinzugefügt wurden
    let shouldScan = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        shouldScan = true;
        break;
      }
    }
    
    if (shouldScan) {
      renderInlineCodeInPrompts();
    }
  });

  // Beobachte den Body auf Änderungen
  promptObserver.observe(document.body, { childList: true, subtree: true });
}

// Initialisierung: Sicherstellen, dass document.body existiert
if (document.body) {
  startPromptObserver();
} else {
  // Falls Skript vor dem Body lädt (run_at: document_start)
  document.addEventListener('DOMContentLoaded', startPromptObserver);
}
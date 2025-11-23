/**
 * feature-prompt-markdown.js
 * Parses Markdown syntax in user prompts and renders it as HTML.
 * Handles: Headers, Lists, Bold/Italic, Links, Horizontal Rules, Inline Code.
 * Uses hyphenated placeholders to strictly avoid conflict with italic/bold parsing (underscores).
 */

const MARKDOWN_PROCESSED_ATTR = 'data-gemini-markdown-processed';

function renderMarkdownInPrompts() {
  // Finde alle Prompt-Container, die noch nicht verarbeitet wurden.
  // .query-text ist der Container, der die Textzeilen (<p class="query-text-line">) enthält.
  const queryContainers = document.querySelectorAll(`.query-text:not([${MARKDOWN_PROCESSED_ATTR}])`);

  queryContainers.forEach(container => {
    container.setAttribute(MARKDOWN_PROCESSED_ATTR, 'true');

    // Hole alle Zeilen (meist <p> Tags)
    const lines = Array.from(container.querySelectorAll('.query-text-line'));
    if (lines.length === 0 && container.textContent.trim().length > 0) {
        // Fallback, falls keine query-text-line Struktur da ist (selten)
        lines.push(container); 
    }
    if (lines.length === 0) return;

    // Extrahiere den reinen Text Zeile für Zeile
    const rawLines = lines.map(line => line.textContent);
    
    // Parse Markdown und erstelle neue DOM-Knoten
    const newNodes = parseMarkdownToNodes(rawLines);

    // Leere den Container und füge die neue Struktur ein
    container.innerHTML = '';
    newNodes.forEach(node => container.appendChild(node));
  });
}

function parseMarkdownToNodes(lines) {
  const nodes = [];
  let listStack = []; 
  let listType = null; // 'ul' oder 'ol'

  // Hilfsfunktion: Schließt eine offene Liste und fügt sie den Nodes hinzu
  const flushList = () => {
    if (listStack.length === 0) return;
    
    const listEl = document.createElement(listType);
    listEl.className = 'gemini-prompt-list'; // CSS Hook
    
    listStack.forEach(liContent => {
      const li = document.createElement('li');
      const p = document.createElement('p');
      p.innerHTML = parseInline(liContent);
      li.appendChild(p);
      listEl.appendChild(li);
    });
    
    nodes.push(listEl);
    
    // Reset
    listStack = [];
    listType = null;
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    // 1. Horizontale Linie (--- oder ***)
    if (trimmed.match(/^(\*{3,}|-{3,})$/)) {
      flushList();
      const hr = document.createElement('hr');
      hr.className = 'gemini-prompt-hr';
      nodes.push(hr);
      return;
    }

    // 2. Überschriften (# bis ######)
    const headerMatch = trimmed.match(/^(#{1,6})\s+(.*)/);
    if (headerMatch) {
      flushList();
      const level = headerMatch[1].length;
      const text = headerMatch[2];
      const hTag = document.createElement('h' + level);
      hTag.className = `gemini-prompt-header gemini-h${level}`;
      hTag.innerHTML = parseInline(text);
      nodes.push(hTag);
      return;
    }

    // 3. Listen
    // Unordered (-, *)
    const ulMatch = line.match(/^\s*[-*]\s+(.*)/);
    // Ordered (1., 2.)
    const olMatch = line.match(/^\s*\d+\.\s+(.*)/);

    if (ulMatch || olMatch) {
      const currentType = ulMatch ? 'ul' : 'ol';
      const content = ulMatch ? ulMatch[1] : olMatch[1];

      // Falls sich der Listentyp ändert (z.B. von ul zu ol), alte Liste schließen
      if (listType && listType !== currentType) {
        flushList(); 
      }
      
      listType = currentType;
      listStack.push(content);
      return;
    }

    // 4. Paragraph OR Empty Line
    flushList();
    
    if (trimmed.length === 0) {
        // Replace empty line with Horizontal Rule
        const hr = document.createElement('hr');
        hr.className = 'gemini-prompt-hr';
        nodes.push(hr);
    } else {
        const p = document.createElement('p');
        p.className = 'query-text-line';
        p.innerHTML = parseInline(line);
        nodes.push(p);
    }
  });

  // Am Ende noch offene Listen schließen
  flushList();
  
  return nodes;
}

/**
 * Verarbeitet Inline-Formatierungen: Code, Bold, Italic, Links
 */
function parseInline(text) {
  // HTML Escaping (Basic) um Injection zu verhindern, da wir innerHTML nutzen
  let out = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // 1. Inline Code (Backticks) - Zuerst verarbeiten und schützen!
  const codeSegments = [];
  
  // 1. Inline Code: Use placeholder WITHOUT underscores to prevent italic interference
  out = out.replace(/(`[^`]+`)/g, (match) => {
    codeSegments.push(match);
    // Using dashes ensuring no * or _ exists in the placeholder
    return `%%%GEMINI-INLINE-CODE-${codeSegments.length - 1}%%%`;
  });

  // 2. Links
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="gemini-prompt-link">$1</a>');

  // 3. Bold
  out = out.replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>');

  // 4. Italic
  out = out.replace(/(\*|_)(.*?)\1/g, '<em>$2</em>');

  // Restore Code
  out = out.replace(/%%%GEMINI-INLINE-CODE-(\d+)%%%/g, (match, idx) => {
    const raw = codeSegments[idx];
    const content = raw.slice(1, -1); // Backticks entfernen
    return `<code class="gemini-prompt-inline-code">${content}</code>`;
  });

  return out;
}

// Observer starten
function startPromptMarkdownObserver() {
  renderMarkdownInPrompts(); // Initial
  
  const observer = new MutationObserver((mutations) => {
    let shouldScan = false;
    for (const m of mutations) {
      if (m.addedNodes.length > 0) {
        shouldScan = true;
        break;
      }
    }
    if (shouldScan) renderMarkdownInPrompts();
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
}

// Init
if (document.body) {
  startPromptMarkdownObserver();
} else {
  document.addEventListener('DOMContentLoaded', startPromptMarkdownObserver);
}
/**
 * feature-prompt-markdown.js
 * Parses Markdown syntax in user prompts and renders it as HTML.
 * Handles: Headers, Lists, Bold/Italic, Links, Horizontal Rules, Inline Code AND Code Blocks.
 * Smart Pre-Processing order. Masks inline code BEFORE detecting multi-line blocks 
 * to prevent false positives across multiple lines.
 */

const MARKDOWN_PROCESSED_ATTR = 'data-gemini-markdown-processed';
// This constant was missing in the previous version, causing the crash
const RAW_MARKDOWN_ATTR = 'data-gemini-raw-markdown';

// EXPORT GLOBALLY (Must run before TOC script)
window.GeminiMarkdown = {
    parse: parseMarkdownToNodes,
    parseInline: parseInline
};

function renderMarkdownInPrompts() {
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

    // 1. Normalize Text
    let rawText = lines.map(line => line.innerText.trimEnd()).join('\n');

    // 2. PRE-PROCESS: LOGICAL ORDER FIX
    // Step A: Mask standard inline code (single line) first.
    // This prevents the multi-line regex from falsely matching the space BETWEEN 
    // two inline code snippets on different lines.
    const inlinePlaceholders = [];
    rawText = rawText.replace(/(?<!`)`([^`\n]+)`(?!`)/g, (match) => {
        inlinePlaceholders.push(match);
        return `%%%PRE-INLINE-${inlinePlaceholders.length - 1}%%%`;
    });

    // Step B: Convert multi-line single-backtick blocks to triple-backtick blocks.
    // Now safe to run, as single-line instances are hidden.
    rawText = rawText.replace(/(?<!`)`([^`]*?\n[^`]*?)`(?!`)/g, (match, content) => {
        return `\n\`\`\`\n${content}\n\`\`\`\n`;
    });
    
    // Step C: Restore inline code
    rawText = rawText.replace(/%%%PRE-INLINE-(\d+)%%%/g, (match, index) => {
        return inlinePlaceholders[parseInt(index, 10)];
    });
    
    // Save for TOC
    container.setAttribute(RAW_MARKDOWN_ATTR, rawText);

    // 3. Parse
    const rawLines = rawText.split('\n');
    const newNodes = parseMarkdownToNodes(rawLines);

    // 4. Render
    container.innerHTML = '';
    newNodes.forEach(node => container.appendChild(node));
  });
}

function parseMarkdownToNodes(lines) {
  const nodes = [];
  
  // Buffers
  let listStack = []; 
  let listType = null;
  // Note: No paragraphBuffer needed for Hard Line Breaks
  
  // Code Block State
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockContent = [];

  // --- FLUSH FUNCTIONS ---

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

  const flushCodeBlock = () => {
      // 1. Outer Container: .code-block
      const wrapper = document.createElement('div');
      wrapper.className = 'code-block';

      // 2. Header: .code-block-decoration
      const header = document.createElement('div');
      header.className = 'code-block-decoration header-formatted gds-title-s';
      
      // Language Label
      const langSpan = document.createElement('span');
      langSpan.textContent = codeBlockLang.trim() || 'Code';
      header.appendChild(langSpan);
      
      // (Optional: Buttons container could go here, skipped for now as strictly display logic)
      
      wrapper.appendChild(header);

      // 3. Body: .formatted-code-block-internal-container -> .animated-opacity -> pre -> code
      const internalContainer = document.createElement('div');
      internalContainer.className = 'formatted-code-block-internal-container';
      
      const animatedWrapper = document.createElement('div');
      animatedWrapper.className = 'animated-opacity';

      const pre = document.createElement('pre');
      
      const code = document.createElement('code');
      code.className = 'code-container formatted';
      // Optional: Add language class for syntax highlighters if needed later
      if (codeBlockLang) {
          code.classList.add(`language-${codeBlockLang.toLowerCase()}`);
      }
      
      // SAFE CONTENT: textContent escapes HTML entities automatically
      code.textContent = codeBlockContent.join('\n');
      
      // ROBUST HIGHLIGHTING CALL
      // Checks for both modern (highlightElement) and legacy (highlightBlock) APIs
      if (typeof hljs !== 'undefined') {
          try {
              if (typeof hljs.highlightElement === 'function') {
                  hljs.highlightElement(code);
              } else if (typeof hljs.highlightBlock === 'function') {
                  hljs.highlightBlock(code);
              } else {
                  console.warn('Gemini Extension: No suitable highlighting function found in hljs.');
              }
          } catch (e) {
              console.warn('Gemini Extension: Highlighting failed', e);
          }
      }
      
      pre.appendChild(code);
      animatedWrapper.appendChild(pre);
      internalContainer.appendChild(animatedWrapper);
      wrapper.appendChild(internalContainer);
      
      nodes.push(wrapper);
      
      // Reset
      codeBlockContent = [];
      codeBlockLang = '';
  };

  // --- MAIN LOOP ---

  lines.forEach((line, index) => {
    // FIX: Trim only end to preserve indentation for code blocks if needed, 
    // but for detection we need trimmed start.
    const trimmed = line.trim();

    // 1. Code Blocks
    if (line.trimEnd().startsWith('```')) {
        if (inCodeBlock) {
            inCodeBlock = false;
            flushCodeBlock();
            return;
        } else {
            flushList(); 
            inCodeBlock = true;
            codeBlockLang = line.trimEnd().substring(3).trim();
            return;
        }
    }

    // If inside code block, collect lines strictly (no parsing)
    if (inCodeBlock) {
        codeBlockContent.push(line);
        return;
    }

    // 2. Horizontal Rule (Explicit only)
    if (trimmed.match(/^(\*{3,}|-{3,})$/)) {
        flushList();
        const hr = document.createElement('hr');
        hr.className = 'gemini-prompt-hr';
        nodes.push(hr);
        return;
    }

    // 3. Headers (#)
    const headerMatch = trimmed.match(/^(#{1,6})\s+(.*)/);
    if (headerMatch) {
        flushList();
        const level = headerMatch[1].length;
        const text = headerMatch[2];
        const hTag = document.createElement('h' + level);
        hTag.className = `gemini-h${level}`;
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

    // 5. Text Lines & Empty Lines
    flushList(); // Close any open list
    
    const p = document.createElement('p');
    p.className = 'query-text-line';

    p.innerHTML = parseInline(line);
    nodes.push(p);
  });

  // Cleanup
  flushList();
  if (inCodeBlock) flushCodeBlock();
  
  return nodes;
}

/**
 * Parses inline markdown with a robust masking strategy to prevent recursion issues.
 * Order: Escape HTML -> Mask Code -> Mask Links/URLs -> Parse Bold/Italic -> Unmask.
 */
function parseInline(text) {
  // 1. Escape HTML to prevent XSS and confusion
  let out = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const protectedSegments = [];
  
  // Helper to mask content
  const mask = (content) => {
      protectedSegments.push(content);
      return `%%%GEMINI-PROTECTED-${protectedSegments.length - 1}%%%`;
  };

  // 2. Mask Inline Code (Backticks)
  // We do this first so backticks inside links don't break things (though rare)
  out = out.replace(/(`[^`]+`)/g, (match) => {
    const content = match.slice(1, -1);
    const html = `<code class="gemini-prompt-inline-code">${content}</code>`;
    return mask(html);
  });

  // 3. Mask Markdown Links [Text](Url)
  // We parse them to HTML <a> tags and then immediately mask the whole tag.
  // This prevents underscores in the URL/attributes from triggering italic parsing.
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, linkText, url) => {
      const html = `<a href="${url}" target="_blank" rel="noopener noreferrer" class="gemini-prompt-link">${linkText}</a>`;
      return mask(html);
  });

  // 4. Mask Raw URLs (that weren't captured by MD links)
  // This prevents "[http://example.com/file_name](http://example.com/file_name)" from becoming "[http://example.com/file](http://example.com/file)<em>name"
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  out = out.replace(urlRegex, (match) => {
      const html = `<a href="${match}" target="_blank" rel="noopener noreferrer" class="gemini-prompt-link">${match}</a>`;
      return mask(html);
  });

  // 5. Parse Formatting (Bold / Italic)
  // Since links and code are masked as %%%...%%% (no * or _), they are safe now.
  
  // Bold (** or __)
  out = out.replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>');

  // Italic (* or _)
  out = out.replace(/(\*|_)(.*?)\1/g, '<em>$2</em>');

  // 6. Unmask
  out = out.replace(/%%%GEMINI-PROTECTED-(\d+)%%%/g, (match, idx) => {
    return protectedSegments[idx];
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
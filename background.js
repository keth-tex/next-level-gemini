/**
 * background.js
 * Handles background tasks, specifically the conversion of conversation data
 * to LaTeX and triggering the file download.
 * Refactored Markdown parser to apply full block-level formatting (Lists, Headers, Tables) 
 * to BOTH the Prompt and the Answer.
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "exportConversation") {
    processAndDownload(request.data);
  }
});

function processAndDownload(conversation) {
  const preamble = `\n\\documentclass[ngerman]{lua-gemini}\n\n\\begin{document}\n\n`;
  const footer = `\n\n\\end{document}\n`;
  let finalTex = preamble;

  try {
    for (const pair of conversation) {
      // Separator matching the one used in split below
      const md_chunk = pair.prompt + "\n===\n" + pair.answer_md;
      const latex_chunk = parse_markdown_chunk(md_chunk);
      finalTex += latex_chunk + '\n\n';
    }

    finalTex = finalTex.replace(/\n{3,}/g, '\n\n');
    finalTex = finalTex.trim();
    finalTex += footer;

    const url = 'data:application/x-tex;charset=utf-8,' + encodeURIComponent(finalTex);
    chrome.downloads.download({
      url: url,
      filename: "gemini-export.tex",
      saveAs: true
    });
  } catch (e) {
    console.error("Error parsing or creating the LaTeX file:", e);
  }
}

function process_inline(text) {
  let text_neu = text.replace(/\u00A0/g, ' ');

  const BOLD_PH_START = 'B892357268218B';
  const BOLD_PH_END = 'B892357268218E';
  const ITALIC_PH_START = 'I135630473663I';
  const ITALIC_PH_END = 'I135630473663E';
  const LINK_PH_START = 'L849823L';
  const LINK_PH_MID = 'M849823M';
  const LINK_PH_END = 'E849823E';

  // Replace links and styles with placeholders
  text_neu = text_neu.replace(/\[(.*?)\]\((.*?)\)/g, `${LINK_PH_START}$1${LINK_PH_MID}$2${LINK_PH_END}`);
  text_neu = text_neu.replace(/(?<!\\)\*\*(?!\s)(.*?)(?<!\s)\*\*/g, `${BOLD_PH_START}$1${BOLD_PH_END}`);
  text_neu = text_neu.replace(/(?<!\\)__(?!\s)(.*?)(?<!\s)__/g, `${BOLD_PH_START}$1${BOLD_PH_END}`);
  text_neu = text_neu.replace(/(?<!\\)\*(?!\s)(.*?)(?<!\s)\*/g, `${ITALIC_PH_START}$1${ITALIC_PH_END}`);
  text_neu = text_neu.replace(/(?<!\\)_(?!\s)(.*?)(?<!\s)_/g, `${ITALIC_PH_START}$1${ITALIC_PH_END}`);

  // Escape LaTeX special characters
  text_neu = text_neu.replace(/\\`/g, '`');
  text_neu = text_neu.replace(/\\\*/g, '*');
  text_neu = text_neu.replace(/\\_/g, '_');
  text_neu = text_neu.replace(/\\-/g, '-');
  text_neu = text_neu.replace(/\\\./g, '.');
  text_neu = text_neu.replace(/\\/g, 'TEXTBACKSLASH');
  text_neu = text_neu.replace(/&/g, '\\&');
  text_neu = text_neu.replace(/%/g, '\\%');
  text_neu = text_neu.replace(/\$/g, '\\$');
  text_neu = text_neu.replace(/#/g, '\\#');
  text_neu = text_neu.replace(/_/g, '\\_');
  text_neu = text_neu.replace(/{/g, '\\{');
  text_neu = text_neu.replace(/}/g, '\\}');
  text_neu = text_neu.replace(/TEXTBACKSLASH/g, '\\textbackslash{}');
  text_neu = text_neu.replace(/~/g, '\\textasciitilde{}');
  text_neu = text_neu.replace(/\^/g, '\\textasciicircum{}');

  // Specific German typography replacements
  text_neu = text_neu.replace(/z\. B\./g, 'z.\\,B.');
  text_neu = text_neu.replace(/d\. h\./g, 'd.\\,h.');
  text_neu = text_neu.replace(/m\. E\./g, 'm.\\,E.');
  text_neu = text_neu.replace(/d\. i\./g, 'd.\\,i.');
  text_neu = text_neu.replace(/u\. a\./g, 'u.\\,a.');
  text_neu = text_neu.replace(/(\d+)\s*[–-]\s*(\d+)/g, '\\fromto{$1}{$2}');
  text_neu = text_neu.replace(/-/g, '\\h{}');
  // ASCII Quotes
  text_neu = text_neu.replace(/"(.*?)"/g, '»$1«');
  // NEW: German Quotes
  text_neu = text_neu.replace(/„(.*?)“/g, '»$1«');
  
  text_neu = text_neu.replace(/\.\.\./g, '…');

  // Handle Emojis
  try {
    const emoji_regex = /[\u{2600}-\u{27BF}\u{1F300}-\u{1F64F}\u{1F680}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu;
    text_neu = text_neu.replace(emoji_regex, '\\iconfont{$&}');
  } catch (e) {}

  // Restore bold and italic from placeholders
  const boldRegex = new RegExp(BOLD_PH_START + '(.*?)' + BOLD_PH_END, 'g');
  const italicRegex = new RegExp(ITALIC_PH_START + '(.*?)' + ITALIC_PH_END, 'g');
  text_neu = text_neu.replace(boldRegex, '\\textbf{$1}');
  text_neu = text_neu.replace(italicRegex, '\\textit{$1}');

  // Restore links
  const linkRegex = new RegExp(LINK_PH_START + '(.*?)' + LINK_PH_MID + '(.*?)' + LINK_PH_END, 'g');
  text_neu = text_neu.replace(linkRegex, '\\weblink{$1}{$2}');

  return text_neu;
}

function apply_latex_spacing(lines) {
  let final_spaced_lines = [];
  let env_level = 0;
  let in_code = false;
  const list_table_envs = ['itemize', 'enumerate', 'tabularx'];

  for (let j = 0; j < lines.length; j++) {
    const line = lines[j];
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      if (final_spaced_lines.length > 0 && final_spaced_lines[final_spaced_lines.length - 1].trim().length !== 0) {
        final_spaced_lines.push('');
      }
      continue;
    }

    if (trimmed.startsWith('\\begin{code}')) {
      in_code = true;
      final_spaced_lines.push(line);
      continue;
    }

    if (trimmed.startsWith('\\end{code}')) {
      in_code = false;
      final_spaced_lines.push(line);
    } else if (in_code) {
      final_spaced_lines.push(line);
      continue;
    } else {
      final_spaced_lines.push(line);
    }

    if (trimmed.startsWith('\\begin{')) {
      continue;
    }

    const is_list_table_begin = list_table_envs.some(env => trimmed.startsWith(`\\begin{${env}`));
    const is_list_table_end = list_table_envs.some(env => trimmed.startsWith(`\\end{${env}`));

    if (is_list_table_begin) env_level++;
    if (is_list_table_end) {
      env_level--;
      if (env_level > 0) continue;
    } else if (env_level > 0) {
      continue;
    }

    if (j + 1 >= lines.length) continue;
    const next_trimmed = lines[j + 1].trim();
    if (next_trimmed.length === 0) continue;
    if (next_trimmed.startsWith('\\end{')) continue;

    final_spaced_lines.push('');
  }
  return final_spaced_lines;
}

/**
 * Main parsing function.
 * Prepares code blocks and splits content into Prompt and Answer.
 */
function parse_markdown_chunk(md_text) {
  const codeBlocks = [];
  const inlineCode = [];
  const inlineMath = [];

  // Pre-processing escapes
  md_text = md_text.replace(/\\`/g, '`');
  md_text = md_text.replace(/\\\*/g, '*');
  md_text = md_text.replace(/\\_/g, '_');
  md_text = md_text.replace(/\\-/g, '-');
  md_text = md_text.replace(/\\\./g, '.');
  md_text = md_text.replace(/\u00A0/g, ' ');

  // Parse Internal Code Blocks
  // Regex allows whitespace/indentation. Dedent logic strips it from content.
  md_text = md_text.replace(
    /^(\s*)```gemini-internal-code\s*\n[ \t]*({.*?})[ \t]*\n([\s\S]*?)\n^\s*```/gm,
    (match, indent, metadataJson, code) => {
      try {
        const metadata = JSON.parse(metadataJson);
        
        // Dedent logic
        const lines = code.split('\n');
        const dedentedCode = lines.map(line => {
            // Only strip if the line actually starts with the indent.
            if (line.startsWith(indent)) {
                return line.substring(indent.length);
            }
            return line;
        }).join('\n');

        codeBlocks.push({
          shorthand: metadata.shorthand,
          label: metadata.label,
          code: dedentedCode.trimEnd()
        });
        
        // We use the indent here to place the placeholder correctly in the structure
        return `\n${indent}CBLOCK${codeBlocks.length - 1}CBLOCK\n`;
      } catch (e) {
        return '\n[Code block parsing error]\n';
      }
    }
  );

  // Parse Standard Code Blocks
  // Regex captures leading indentation into group 1
  md_text = md_text.replace(
    /^(\s*)```([^\n]*)(\n)([\s\S]*?)^\s*```\s*$/gm,
    (match, indent, lang, newline, code) => {
      const trimmedLang = lang.trim();
      const shorthand = trimmedLang.toLowerCase() || 'text';
      const label = trimmedLang || 'Code';
      codeBlocks.push({
        shorthand: shorthand,
        label: label,
        code: code.trimEnd()
      });
      // Preserve indentation before the placeholder
      return `\n${indent}CBLOCK${codeBlocks.length - 1}CBLOCK\n`;
    }
  );

  // Capture Inline Math
  md_text = md_text.replace(
    /IMATH(.*?)IMATH/g,
    (match, math) => {
      inlineMath.push(math);
      return `IMATH${inlineMath.length - 1}IMATH`;
    }
  );

  // Capture Inline Code
  md_text = md_text.replace(
    /(?<!`)`([^`\n]+?)`(?!`)/g,
    (match, code) => {
      inlineCode.push(code);
      return `ICODE${inlineCode.length - 1}ICODE`;
    }
  );

  let prompt_latex = "";
  let answer_latex = "";

  const parts = md_text.split(/\n===+\n/, 2);

  if (parts.length === 2) {
    // Prompt Processing (NOW USES FULL PARSER)
    const prompt_lines = parts[0].trim().split('\n');
    const processed_prompt = convert_md_lines_to_latex(prompt_lines, codeBlocks);
    const spaced_prompt = apply_latex_spacing(processed_prompt);
    
    prompt_latex = (
      `\\addvspace{3\\baselineskip}\n\n` +
      `\\begin{bgbox}\n` +
      `${spaced_prompt.join('\n')}\n` +
      `\\end{bgbox}\n\n` +
      `\\addvspace{\\baselineskip}\n\n` +
      `\\relpospar[scale=0.95][-1.05cm,-.3cm]{gemini}\n`
    );

    // Answer Processing
    const answer_lines = parts[1].split('\n');
    const processed_answer = convert_md_lines_to_latex(answer_lines, codeBlocks);
    const spaced_answer = apply_latex_spacing(processed_answer);
    answer_latex = spaced_answer.join('\n');

  } else {
    // No prompt separator found, treat all as answer
    const answer_lines = md_text.split('\n');
    const processed_answer = convert_md_lines_to_latex(answer_lines, codeBlocks);
    const spaced_answer = apply_latex_spacing(processed_answer);
    answer_latex = spaced_answer.join('\n');
  }

  let full_latex = prompt_latex + answer_latex;

  // Post-Processing
  full_latex = full_latex.replace(/IMATH(\d+)IMATH/g, (match, index) => {
    return `$${inlineMath[index]}$`;
  });

  function applyStickyBrackets(str) {
      str = str.replace(/([(\[]|\\\{)(ICODE\d+ICODE)/g, '$1\\penalty10000 $2');
      str = str.replace(/(ICODE\d+ICODE)([)\]]|\\\})/g, '$1\\penalty10000 $2');
      return str;
  }
  full_latex = applyStickyBrackets(full_latex);

  const replacementCallback = (inlineCode) => (match, index) => {
    const code = inlineCode[index];
    if (typeof code === 'undefined') return match;
    return `\\begin{hcH}\\mintinline{text}{${code}}\\end{hcH}`;
  };
  full_latex = full_latex.replace(/ICODE(\d+)ICODE/g, replacementCallback(inlineCode));

  // Fallback expansion for CBLOCKs that ended up inline (rare edge case)
  full_latex = full_latex.replace(/CBLOCK(\d+)CBLOCK/g, (match, index) => {
      const block = codeBlocks[parseInt(index, 10)];
      if (!block) return '';
      return `\n\\begin{code}{${block.shorthand}}{${block.label}}\n${block.code}\n\\end{code}\n`;
  });

  // Cleanup newlines
  full_latex = full_latex.replace(/\n{3,}/g, '\n\n');

  return full_latex;
}

/**
 * Core function to convert Markdown lines to LaTeX.
 * Handles Lists, Headers, Tables, HRs, and Code Blocks.
 */
function convert_md_lines_to_latex(lines, codeBlocks) {
  let latex_lines = [];
  let list_stack = [];
  let in_table = false;
  let table_align = [];
  let i = 0;

  while (i < lines.length) {
    let line = lines[i];
    
    // STRICT CHECK: Line MUST match format "^(indent)CBLOCK(id)CBLOCK$".
    const codeBlockMatch = line.match(/^(\s*)CBLOCK(\d+)CBLOCK\s*$/);

    if (codeBlockMatch) {
      // Determine Indentation of the Code Block Line
      const line_indent = codeBlockMatch[1].length;
      let current_stack_indent = list_stack.length > 0 ? list_stack[list_stack.length - 1].indent : -1;

      // Close list ONLY if code block is LESS indented (or equal) than current item
      while (list_stack.length > 0 && line_indent <= current_stack_indent) {
        latex_lines.push(`\\end{${list_stack.pop().type}}`);
        current_stack_indent = list_stack.length > 0 ? list_stack[list_stack.length - 1].indent : -1;
      }

      const index = parseInt(codeBlockMatch[2], 10); // Group 2 because Group 1 is indent
      const block = codeBlocks[index];
      latex_lines.push('\\vspace{.25\\baselineskip}');
      latex_lines.push(`\\begin{code}{${block.shorthand}}{${block.label}}`);
      const codeLines = block.code.split('\n');
      for (const codeLine of codeLines) {
        latex_lines.push(codeLine);
      }
      latex_lines.push(`\\end{code}`);
      latex_lines.push('\\vspace{.5\\baselineskip}');
      i++;
      continue;
    }

    if (line.match(/^\s*$/)) {
      if (list_stack.length == 0) {
        latex_lines.push('');
      }
      i++;
      continue;
    }

    // List Handling
    const item_match = line.match(/^(\s*)[\*\-]\s+(?!(\s*\*){2,}\s*$)(.*)/);
    const enum_match = line.match(/^(\s*)(\d+)\.\s+(.*)/);
    const list_match = item_match || enum_match;
    const line_indent_match = line.match(/^(\s*)/);
    const line_indent = line_indent_match[1].length;
    let current_stack_indent = list_stack.length > 0 ? list_stack[list_stack.length - 1].indent : -1;

    if (list_match) {
      const type = item_match ? 'itemize' : 'enumerate';
      const indent_len = list_match[1].length;
      const content = item_match ? item_match[3] : enum_match[3];

      while (indent_len < current_stack_indent) {
        latex_lines.push(`\\end{${list_stack.pop().type}}`);
        current_stack_indent = list_stack.length > 0 ? list_stack[list_stack.length - 1].indent : -1;
      }

      if (indent_len > current_stack_indent) {
        latex_lines.push(`\\begin{${type}}`);
        list_stack.push({
          type: type,
          indent: indent_len
        });
      } else if (indent_len === current_stack_indent && list_stack[list_stack.length - 1].type !== type) {
        latex_lines.push(`\\end{${list_stack.pop().type}}`);
        latex_lines.push(`\\begin{${type}}`);
        list_stack.push({
          type: type,
          indent: indent_len
        });
      }
      latex_lines.push(`  \\item ${process_inline(content)}`);
      i++;
      continue;
    }

    if (list_stack.length > 0) {
      if (line_indent <= current_stack_indent) {
        while (list_stack.length > 0 && list_stack[list_stack.length - 1].indent >= line_indent) {
          latex_lines.push(`\\end{${list_stack.pop().type}}`);
        }
      } else {
        latex_lines.push(process_inline(line.trim()));
        i++;
        continue;
      }
    }

    // Table Handling
    const table_match = line.match(/^\s*\|(.*)\|\s*$/);
    if (in_table && !table_match) {
      latex_lines.push('\\hline');
      latex_lines.push('\\end{tabularx}');
      latex_lines.push('\\addvspace{\\baselineskip}');
      in_table = false;
    }

    // Skip horizontal rules (*** or ___)
    if (line.match(/^\s*([*_])(\s*\1){2,}\s*$/)) {
      i++;
      continue;
    }

    // Header Handling
    const header_match = line.match(/^\s*(#+)\s+(.*)/);
    if (header_match) {
      const level = header_match[1].length;
      const title_raw = header_match[2];
      const title_processed = process_inline(title_raw);
      const title_final = title_processed.replace(
        /^([\d\.]+|[a-zA-Z]\)|[IVXLCDM]+\.|[ivxlcdm]+\.)\s+/,
        '$1\\hs '
      );
      if (level === 1) latex_lines.push(`\\chapter[nonumber=true]{${title_final}}`);
      else if (level === 2) latex_lines.push(`\\section[nonumber=true]{${title_final}}`);
      else if (level === 3) latex_lines.push(`\\subsection[nonumber=true]{${title_final}}`);
      else if (level === 4) latex_lines.push(`\\subsubsection[nonumber=true]{${title_final}}`);
      else if (level === 5) latex_lines.push(`\\paragraph[nonumber=true]{${title_final}}`);
      else if (level === 6) latex_lines.push(`\\subparagraph[nonumber=true]{${title_final}}`);
      i++;
      continue;
    }

    // Table Content
    if (table_match) {
      const cells_raw = table_match[1].split('|');
      const cells = cells_raw.map(cell => process_inline(cell.trim()));
      if (!in_table) {
        if (i + 1 < lines.length) {
          const next_line = lines[i + 1];
          const align_match = next_line.match(/^\s*\|([\-:\s|]+)\|\s*$/);
          if (align_match) {
            in_table = true;
            const align_str = align_match[1];
            const align_parts = align_str.split('|').map(a => a.trim());
            table_align = [];
            for (const part of align_parts) {
              if (part.startsWith(':') && part.endsWith(':')) table_align.push('>{\\centering\\arraybackslash}X');
              else if (part.startsWith(':')) table_align.push('>{\\raggedright\\arraybackslash}X');
              else if (part.endsWith(':')) table_align.push('>{\\raggedleft\\arraybackslash}X');
              else table_align.push('>{\\raggedright\\arraybackslash}X');
            }
            const col_def = table_align.join(' | ');
            latex_lines.push(`\\begin{tabularx}{\\textwidth}{ ${col_def} }`);
            latex_lines.push('\\hline');
            latex_lines.push(cells.join(' & ') + ' \\\\');
            latex_lines.push('\\hline');
            i += 2;
            continue;
          }
        }
      } else {
        latex_lines.push(cells.join(' & ') + ' \\\\');
        i++;
        continue;
      }
    }

    // Setext Header Handling
    if (i + 1 < lines.length) {
      const next_line = lines[i + 1];
      const setext_match = next_line.match(/^\s*(-{3,}|={3,})\s*$/);
      if (setext_match) {
        const level = (setext_match[1].startsWith('=')) ? 1 : 2;
        const title_raw = line;
        const title_processed = process_inline(title_raw);
        const title_final = title_processed.replace(
          /^([\d\.]+|[a-zA-Z]\)|[IVXLCDM]+\.|[ivxlcdm]+\.)\s+/,
          '$1\\hs '
        );
        if (level <= 2) latex_lines.push(`\\section[nonumber=true]{${title_final}}`);
        i += 2;
        continue;
      }
    }

    latex_lines.push(process_inline(line));
    i++;
    continue;
  }

  while (list_stack.length > 0) {
    latex_lines.push(`\\end{${list_stack.pop().type}}`);
  }

  if (in_table) {
    latex_lines.push('\\hline');
    latex_lines.push('\\end{tabularx}');
    latex_lines.push('\\addvspace{\\baselineskip}');
  }
  
  return latex_lines;
}
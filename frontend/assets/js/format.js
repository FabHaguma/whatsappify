// The editor is the source of truth. Only plain text goes onto the clipboard.
const listTags = new Set(['UL', 'OL']);
const blockTags = new Set(['P', 'DIV', 'BLOCKQUOTE', 'H1', 'H2', 'H3']);

function escapeMarkdown(text) {
  return text.replace(/([\\`*_[\]<>~|])/g, '\\$1').replace(/^(\s*)(#{1,6}|[-+]|\d+\.)(?= )/gm,
    (_, space, marker) => space + (/^\d/.test(marker) ? marker.replace('.', '\\.') : '\\' + marker))
    .replace(/\n/g, '  \n');
}

function marked(text, marker) {
  // Keep whitespace outside markers; WhatsApp needs markers next to a word.
  return text.split('\n').map(line => line.replace(/^(\s*)(.*?)(\s*)$/, (_, before, content, after) => content ? `${before}${marker}${content}${marker}${after}` : line)).join('\n');
}

function children(node, format) {
  return Array.from(node.childNodes).reduce((output, child) => {
    let next = render(child, format);
    if (output.endsWith('\n') && next.startsWith('\n')) next = next.replace(/^\n+/, '');
    return output + next;
  }, '');
}

function renderList(list, format, depth = 0) {
  // Native browser indentation can create a nested list beside its parent LI.
  const items = Array.from(list.children).filter(node => node.tagName === 'LI' || listTags.has(node.tagName));
  let number = Number(list.getAttribute('start')) || 1;
  return items.map(item => {
    if (listTags.has(item.tagName)) return renderList(item, format, depth + 1);
    const explicitNumber = item.getAttribute('value');
    if (explicitNumber !== null) number = Number(explicitNumber);
    const marker = list.tagName === 'OL' ? `${number++}. ` : format === 'whatsapp' && depth > 0 ? '• ' : '- ';
    const indent = '    '.repeat(depth);
    const continuation = indent + ' '.repeat(marker.length);
    let content = '';
    const nested = [];
    for (const child of item.childNodes) {
      if (listTags.has(child.tagName)) nested.push(renderList(child, format, depth + 1));
      else content += render(child, format);
    }
    content = content.trim();
    const lines = content.split('\n');
    const first = indent + marker + (lines.shift() || '');
    const rest = lines.map(line => line ? continuation + line : '').join('\n');
    return [first, rest, ...nested].filter(Boolean).join('\n');
  }).join('\n');
}

function render(node, format) {
  if (node.nodeType === 3) {
    const text = node.textContent.replace(/\u00a0/g, ' ');
    return format === 'markdown' ? escapeMarkdown(text) : text;
  }
  if (node.nodeType !== 1) return '';
  const tag = node.tagName;
  if (['SCRIPT', 'STYLE', 'IFRAME', 'IMG'].includes(tag)) return '';
  if (tag === 'BR') return format === 'markdown' ? '  \n' : '\n';
  if (listTags.has(tag)) return '\n' + renderList(node, format) + '\n\n';
  const content = children(node, format);
  if (['B', 'STRONG'].includes(tag)) return marked(content, format === 'markdown' ? '**' : '*');
  if (['I', 'EM'].includes(tag)) return marked(content, '_');
  if (['S', 'STRIKE', 'DEL'].includes(tag)) return marked(content, format === 'markdown' ? '~~' : '~');
  if (blockTags.has(tag)) {
    if (!node.textContent.trim() && !node.querySelector('ul, ol')) return '\n';
    return content + (tag === 'DIV' ? '\n' : '\n\n');
  }
  return content;
}

export function serialize(editor, format = 'markdown') {
  if (!['markdown', 'whatsapp'].includes(format)) throw new Error('Unknown copy format');
  return children(editor, format).replace(/^\n+/, '').trimEnd();
}

import { serialize } from './format.js';

const editor = document.querySelector('#editor');
const toolbar = document.querySelector('.toolbar');
const status = document.querySelector('#draft-status');
const wordCount = document.querySelector('#word-count');
const exampleButton = document.querySelector('#load-example');
const copyButtons = [document.querySelector('#copy-markdown'), document.querySelector('#copy-whatsapp')];
const storageKey = 'whatsappify.draft.v1';
let savedRange = null;
let saveTimer;
let toastTimer;
let storageAvailable = true;
let editing = false;
let historyIndex = 0;
let history = [];
let lastEditType = '';
let lastEditAt = 0;

const example = '<p><b>Weekly update</b></p><p>A quick look at this week’s progress.</p><ul><li><b>Completed</b><ul><li>Finished the report layout</li><li>Shared the first draft for review</li></ul></li><li><b>Next steps</b><ul><li>Collect feedback and make the final edits</li></ul></li></ul><p><i>Ready for your feedback.</i></p>';

// Drafts are local. Whitelist restored markup rather than trusting stored HTML.
function cleanDraft(html) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const allowed = new Set(['P', 'DIV', 'BR', 'B', 'STRONG', 'I', 'EM', 'S', 'STRIKE', 'UL', 'OL', 'LI']);
  function clean(node) {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent);
    if (node.nodeType !== Node.ELEMENT_NODE || ['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'SVG'].includes(node.tagName)) return document.createDocumentFragment();
    const result = allowed.has(node.tagName) ? document.createElement(node.tagName.toLowerCase()) : document.createDocumentFragment();
    for (const child of node.childNodes) result.append(clean(child));
    return result;
  }
  const result = document.createElement('div');
  for (const child of parsed.body.childNodes) result.append(clean(child));
  return result.innerHTML || '<p><br></p>';
}

try {
  const draft = localStorage.getItem(storageKey);
  if (draft !== null) editor.innerHTML = cleanDraft(draft);
} catch { storageAvailable = false; }

// Use browser commands for selections, lists, and inline formatting.
document.execCommand('defaultParagraphSeparator', false, 'p');
document.execCommand('styleWithCSS', false, false);
history.push({ html: editor.innerHTML, selection: null });

function selectionSnapshot() {
  const selection = window.getSelection();
  if (!selection.rangeCount || !editor.contains(selection.anchorNode) || !editor.contains(selection.focusNode)) return null;
  function pathFor(node) {
    const path = [];
    while (node !== editor) {
      path.unshift(Array.prototype.indexOf.call(node.parentNode.childNodes, node));
      node = node.parentNode;
    }
    return path;
  }
  return { anchor: pathFor(selection.anchorNode), anchorOffset: selection.anchorOffset, focus: pathFor(selection.focusNode), focusOffset: selection.focusOffset };
}

function captureBeforeEdit() {
  const selection = selectionSnapshot();
  if (JSON.stringify(selection) !== JSON.stringify(history[historyIndex].selection)) lastEditType = '';
  history[historyIndex].selection = selection;
}

function recordHistory(kind) {
  const entry = { html: editor.innerHTML, selection: selectionSnapshot() };
  if (entry.html === history[historyIndex].html) {
    history[historyIndex].selection = entry.selection;
    return;
  }
  const now = Date.now();
  const grouping = ['insertText', 'insertCompositionText', 'deleteContentBackward', 'deleteContentForward'].includes(kind);
  if (grouping && kind === lastEditType && now - lastEditAt < 700 && historyIndex > 0 && historyIndex === history.length - 1) {
    history[historyIndex] = entry;
  } else {
    history = history.slice(0, historyIndex + 1);
    history.push(entry);
    if (history.length > 100) history.shift();
    historyIndex = history.length - 1;
  }
  lastEditAt = now;
  lastEditType = kind;
}

function moveHistory(direction) {
  const next = historyIndex + direction;
  if (next < 0 || next >= history.length) return;
  historyIndex = next;
  const entry = history[historyIndex];
  editor.innerHTML = entry.html;
  // Parsing browser-generated list markup can normalize its surrounding blocks.
  entry.html = editor.innerHTML;
  savedRange = null;
  restoreSelection();
  if (entry.selection) {
    try {
      const find = path => path.reduce((node, index) => node.childNodes[index], editor);
      window.getSelection().setBaseAndExtent(find(entry.selection.anchor), entry.selection.anchorOffset, find(entry.selection.focus), entry.selection.focusOffset);
    } catch { /* A missing caret position falls back to the end of the draft. */ }
  }
  lastEditType = '';
  refresh();
}

function edit(action) {
  captureBeforeEdit();
  editing = true;
  try { action(); } finally { editing = false; }
  refresh();
}

function rememberSelection() {
  const selection = window.getSelection();
  if (selection.rangeCount && editor.contains(selection.anchorNode) && editor.contains(selection.focusNode)) {
    savedRange = selection.getRangeAt(0).cloneRange();
  }
}

function restoreSelection() {
  editor.focus({ preventScroll: true });
  const selection = window.getSelection();
  if (savedRange && editor.contains(savedRange.commonAncestorContainer)) {
    selection.removeAllRanges();
    selection.addRange(savedRange);
  } else {
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

function updateToolbar() {
  const selection = window.getSelection();
  if (!selection.rangeCount || !editor.contains(selection.anchorNode)) return;
  for (const button of toolbar.querySelectorAll('[aria-pressed]')) {
    button.setAttribute('aria-pressed', String(document.queryCommandState(button.dataset.command)));
  }
}

function renderStatus(message) {
  status.replaceChildren();
  const dot = document.createElement('span');
  dot.className = 'status-dot';
  status.append(dot, message);
}

function saveDraft() {
  clearTimeout(saveTimer);
  try {
    localStorage.setItem(storageKey, editor.innerHTML);
    storageAvailable = true;
    renderStatus('Saved in this browser');
  } catch {
    storageAvailable = false;
    renderStatus('Draft saving unavailable');
  }
}

function refresh({ save = true, historyKind = 'command' } = {}) {
  const plain = editor.innerText.replace(/\u00a0/g, ' ').trim();
  const empty = plain.length === 0;
  editor.classList.toggle('is-empty', empty);
  exampleButton.hidden = !empty;
  const words = empty ? 0 : plain.split(/\s+/u).length;
  const characters = Array.from(plain).length;
  wordCount.textContent = `${words} ${words === 1 ? 'word' : 'words'} · ${characters} ${characters === 1 ? 'character' : 'characters'}`;
  for (const button of copyButtons) button.disabled = empty;
  if (save) {
    recordHistory(historyKind);
    renderStatus('Saving…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraft, 250);
  } else if (!storageAvailable) renderStatus('Draft saving unavailable');
  rememberSelection();
  updateToolbar();
}

function toast(message) {
  const element = document.querySelector('#toast');
  clearTimeout(toastTimer);
  element.textContent = message;
  element.classList.add('visible');
  toastTimer = setTimeout(() => element.classList.remove('visible'), 3500);
}

function command(name) {
  if (name === 'undo') { moveHistory(-1); return; }
  restoreSelection();
  if (['indent', 'outdent'].includes(name)) {
    const selection = window.getSelection();
    const parent = selection.anchorNode?.parentElement;
    if (!parent?.closest('li')) {
      toast('Place your cursor in a list to change its level.');
      return;
    }
    if (name === 'indent' && !parent.closest('li').previousElementSibling) {
      toast('A sub-bullet needs a bullet above it.');
      return;
    }
  }
  edit(() => document.execCommand(name, false));
}

toolbar.addEventListener('mousedown', event => {
  if (event.target.closest('button')) event.preventDefault();
});
toolbar.addEventListener('click', event => {
  const button = event.target.closest('[data-command]');
  if (button) command(button.dataset.command);
});

editor.addEventListener('beforeinput', event => {
  if (editing) return;
  if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
    event.preventDefault();
    moveHistory(event.inputType === 'historyUndo' ? -1 : 1);
  } else captureBeforeEdit();
});
editor.addEventListener('input', event => { if (!editing) refresh({ historyKind: event.inputType }); });
editor.addEventListener('blur', saveDraft);
document.addEventListener('selectionchange', () => { rememberSelection(); updateToolbar(); });
window.addEventListener('pagehide', saveDraft);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveDraft(); });

editor.addEventListener('keydown', event => {
  const modifier = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (modifier && (key === 'z' || key === 'y')) {
    event.preventDefault();
    moveHistory(key === 'y' || event.shiftKey ? 1 : -1);
    return;
  }
  if (event.key === 'Tab' && window.getSelection()?.anchorNode?.parentElement?.closest('li')) {
    event.preventDefault();
    command(event.shiftKey ? 'outdent' : 'indent');
  }
  // Keep unsupported rich-text shortcuts from introducing invisible formatting.
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'u') event.preventDefault();
});

// Paste as regular text, never imported fonts, colors, links, or active markup.
editor.addEventListener('paste', event => {
  event.preventDefault();
  const text = event.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n');
  edit(() => document.execCommand('insertText', false, text));
});
editor.addEventListener('drop', event => event.preventDefault());

exampleButton.addEventListener('click', () => {
  restoreSelection();
  const range = document.createRange();
  range.selectNodeContents(editor);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  edit(() => document.execCommand('insertHTML', false, example));
});

document.querySelector('#clear-draft').addEventListener('click', () => {
  restoreSelection();
  edit(() => {
    editor.innerHTML = '<p><br></p>';
    savedRange = null;
    restoreSelection();
    for (const format of ['bold', 'italic', 'strikeThrough']) {
      if (document.queryCommandState(format)) document.execCommand(format, false);
    }
  });
  toast('Draft cleared. Undo or Ctrl+Z brings it back.');
});

async function copy(format, button) {
  const text = serialize(editor, format);
  if (!text.trim()) return;
  // Generate before any focus change, then try the standard clipboard API.
  let copied = false;
  try { await navigator.clipboard.writeText(text); copied = true; } catch {
    // A selected textarea also works in browsers that block the async API.
    const fallback = document.createElement('textarea');
    fallback.value = text;
    fallback.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.append(fallback);
    fallback.select();
    try { copied = document.execCommand('copy'); } catch { /* Offer manual copy below. */ }
    fallback.remove();
    button.focus({ preventScroll: true });
  }
  if (copied) toast(format === 'whatsapp' ? 'Copied for WhatsApp. Ready to paste.' : 'Copied as Markdown. Ready to paste.');
  else {
    const dialog = document.querySelector('#copy-dialog');
    const field = document.querySelector('#copy-fallback');
    field.value = text;
    dialog.showModal();
    field.select();
  }
}

copyButtons[0].addEventListener('click', () => copy('markdown', copyButtons[0]));
copyButtons[1].addEventListener('click', () => copy('whatsapp', copyButtons[1]));
refresh({ save: false });

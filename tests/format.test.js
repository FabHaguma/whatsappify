import test from 'node:test';
import assert from 'node:assert/strict';
import { serialize } from '../frontend/assets/js/format.js';

// Small DOM-shaped fixtures keep the converter tests dependency-free.
function el(tagName, ...children) {
  const childNodes = children.flat().map(child => typeof child === 'string' ? { nodeType: 3, textContent: child } : child);
  return {
    nodeType: 1, tagName: tagName.toUpperCase(), childNodes,
    get children() { return childNodes.filter(node => node.nodeType === 1); },
    get textContent() { return childNodes.map(node => node.textContent).join(''); },
    getAttribute() { return null; },
    querySelector(selector) {
      const tags = selector.split(',').map(tag => tag.trim().toUpperCase());
      for (const child of this.children) {
        if (tags.includes(child.tagName)) return child;
        const found = child.querySelector(selector);
        if (found) return found;
      }
      return null;
    },
  };
}

test('bold, italic, and strikethrough use the destination syntax', () => {
  const doc = el('div', el('p', el('b', 'Done'), ' ', el('i', 'today'), ' ', el('strike', 'tomorrow')));
  assert.equal(serialize(doc, 'markdown'), '**Done** _today_ ~~tomorrow~~');
  assert.equal(serialize(doc, 'whatsapp'), '*Done* _today_ ~tomorrow~');
});

test('nested bullets retain their hierarchy in both formats', () => {
  const doc = el('div', el('p', el('b', 'Progress')), el('ul',
    el('li', 'Completed', el('ul', el('li', 'Report', el('ul', el('li', 'Reviewed'))))),
    el('li', 'Next steps')));
  assert.equal(serialize(doc, 'markdown'), '**Progress**\n\n- Completed\n    - Report\n        - Reviewed\n- Next steps');
  assert.equal(serialize(doc, 'whatsapp'), '*Progress*\n\n- Completed\n    • Report\n        • Reviewed\n- Next steps');
});

test('numbered and mixed nested lists keep numbering', () => {
  const doc = el('div', el('ol', el('li', 'Write', el('ul', el('li', 'Draft'))), el('li', 'Send')));
  assert.equal(serialize(doc, 'markdown'), '1. Write\n    - Draft\n2. Send');
  assert.equal(serialize(doc, 'whatsapp'), '1. Write\n    • Draft\n2. Send');
});

test('paragraphs and explicit line breaks survive copying', () => {
  const doc = el('div', el('p', 'First', el('br'), 'Second'), el('p', 'Next paragraph'));
  assert.equal(serialize(doc, 'markdown'), 'First  \nSecond\n\nNext paragraph');
  assert.equal(serialize(doc, 'whatsapp'), 'First\nSecond\n\nNext paragraph');
});

test('literal markdown symbols stay literal and nonbreaking spaces stay spaces', () => {
  const doc = el('div', el('p', 'a_b *c* [d] <e> ~f~ \\g'), el('p', '1. not a list'), el('p', 'hello\u00a0world'));
  assert.equal(serialize(doc, 'markdown'), 'a\\_b \\*c\\* \\[d\\] \\<e\\> \\~f\\~ \\\\g\n\n1\\. not a list\n\nhello world');
  assert.equal(serialize(doc, 'whatsapp'), 'a_b *c* [d] <e> ~f~ \\g\n\n1. not a list\n\nhello world');
});

test('formatting whitespace does not break WhatsApp markers', () => {
  assert.equal(serialize(el('div', el('p', el('b', '  done  '))), 'whatsapp'), '  *done*');
});

test('empty drafts copy no placeholder or markup', () => {
  assert.equal(serialize(el('div', el('p', el('br'))), 'whatsapp'), '');
});

test('list continuation lines are indented under their item', () => {
  const doc = el('div', el('ul', el('li', 'First', el('br'), 'more detail')));
  assert.equal(serialize(doc, 'whatsapp'), '- First\n  more detail');
  assert.equal(serialize(doc, 'markdown'), '- First  \n  more detail');
});

test('native browser sibling lists do not lose their nested items', () => {
  const doc = el('div', el('ul', el('li', 'First'), el('ul', el('li', 'Second')), el('li', 'Third')));
  assert.equal(serialize(doc, 'markdown'), '- First\n    - Second\n- Third');
  assert.equal(serialize(doc, 'whatsapp'), '- First\n    • Second\n- Third');
});

test('newlines in pre-wrapped browser text become Markdown hard breaks', () => {
  const doc = el('div', el('p', el('b', 'Summary\n'), 'Details'));
  assert.equal(serialize(doc, 'markdown'), '**Summary**  \nDetails');
  assert.equal(serialize(doc, 'whatsapp'), '*Summary*\nDetails');
});

import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import { View, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';

/** Plain text from an older note -> the editor's markup (one block per line). */
export function textToHtml(text) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return String(text || '').split('\n').map((line) => `<div>${esc(line) || '<br>'}</div>`).join('');
}

// One toolbar button. It acts on mouse-down and keeps the focus in the note, so the selection is never lost.
function Tool({ icon, label, text, active, onRun, colors }) {
  return createElement('button', {
    type: 'button',
    title: label,
    'aria-label': label,
    'aria-pressed': active || undefined,
    onMouseDown: (e) => { e.preventDefault(); onRun(); },
    style: {
      height: 32, minWidth: 32, padding: text ? '0 9px' : 0, border: 'none', borderRadius: 6, cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      background: active ? colors.brand[50] : 'transparent', color: active ? colors.brand[700] : colors.gray[700],
      fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
    },
  }, icon ? <Ionicons name={icon} size={17} color={active ? colors.brand[700] : colors.gray[700]} /> : text);
}

const Divider = ({ colors }) => <View style={{ width: 1, height: 18, backgroundColor: colors.gray[200], marginHorizontal: 4 }} />;

/**
 * A small word processor for one note: headings, three text sizes, bold / italic / underline / strike, bullets,
 * numbers and tick lists. It edits the page's own markup (contentEditable) and reports every change as
 * `onChange(html, text)`. The server stores only the markup this editor produces (backend utils/noteContent.js).
 * Styling of the written text lives in public/index.html (.th-note).
 */
export default function RichText({ initialHtml, placeholder, onChange }) {
  const colors = useColors();
  const box = useRef(null);
  const [on, setOn] = useState({});

  // The markup is put in once; after that the browser owns it (re-setting it would move the caret).
  useEffect(() => {
    if (box.current) box.current.innerHTML = initialHtml || '';
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const report = useCallback(() => {
    const el = box.current;
    if (el) onChange?.(el.innerHTML, el.innerText);
  }, [onChange]);

  // Which buttons are lit follows the caret.
  const readState = useCallback(() => {
    const el = box.current;
    const sel = typeof document !== 'undefined' ? document.getSelection() : null;
    if (!el || !sel?.anchorNode || !el.contains(sel.anchorNode)) return;
    const q = (c) => { try { return document.queryCommandState(c); } catch { return false; } };
    let node = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
    let block = '';
    let checklist = false;
    while (node && node !== el) {
      if (!block && /^H[1-3]$/.test(node.tagName)) block = node.tagName;
      if (node.tagName === 'UL' && node.hasAttribute('data-check')) checklist = true;
      node = node.parentElement;
    }
    setOn({ bold: q('bold'), italic: q('italic'), underline: q('underline'), strike: q('strikeThrough'), ul: q('insertUnorderedList') && !checklist, ol: q('insertOrderedList'), checklist, block });
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    document.addEventListener('selectionchange', readState);
    return () => document.removeEventListener('selectionchange', readState);
  }, [readState]);

  const run = (command, value) => {
    box.current?.focus();
    try { document.execCommand(command, false, value); } catch { /* the browser does not know this one */ }
    report();
    readState();
  };

  const listOf = () => {
    const sel = document.getSelection();
    let node = sel?.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
    while (node && node !== box.current) {
      if (node.tagName === 'UL') return node;
      node = node.parentElement;
    }
    return null;
  };

  // A tick list is a bullet list marked data-check; pressing the button again turns it back into bullets.
  const toggleChecklist = () => {
    box.current?.focus();
    let list = listOf();
    if (!list) {
      document.execCommand('insertUnorderedList');
      list = listOf();
      list?.setAttribute('data-check', '1');
    } else if (list.hasAttribute('data-check')) {
      list.removeAttribute('data-check');
      list.querySelectorAll('li[data-done]').forEach((li) => li.removeAttribute('data-done'));
    } else {
      list.setAttribute('data-check', '1');
    }
    report();
    readState();
  };

  const bullets = () => {
    const list = listOf();
    if (list?.hasAttribute('data-check')) { list.removeAttribute('data-check'); report(); readState(); } else run('insertUnorderedList');
  };

  const heading = (tag) => run('formatBlock', on.block === tag ? 'DIV' : tag);

  // A click on the box in front of a tick-list line ticks it (the box is drawn by CSS, left of the text).
  const onClick = (e) => {
    const li = e.target?.closest?.('ul[data-check] > li');
    if (!li || !box.current?.contains(li)) return;
    if (e.clientX - li.getBoundingClientRect().left > 26) return;
    e.preventDefault();
    if (li.getAttribute('data-done') === '1') li.removeAttribute('data-done'); else li.setAttribute('data-done', '1');
    report();
  };

  // Pasting brings plain text only, so nothing foreign (fonts, colours, tables from a website) lands in the note.
  const onPaste = (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.some((f) => f.type.startsWith('image/'))) return; // a picture: the note's own paste handler takes it
    const text = e.clipboardData?.getData('text/plain');
    if (text === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    document.execCommand('insertText', false, text);
  };

  const t = (props) => <Tool colors={colors} {...props} />;

  return (
    <View style={{ gap: 10 }}>
      <View style={{ position: 'sticky', top: 0, zIndex: 3, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray[200], borderRadius: 10 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center', gap: 2, padding: 4 }}>
          {t({ text: 'Title', label: 'Large heading', active: on.block === 'H1', onRun: () => heading('H1') })}
          {t({ text: 'Heading', label: 'Heading', active: on.block === 'H2', onRun: () => heading('H2') })}
          {t({ text: 'Subheading', label: 'Small heading', active: on.block === 'H3', onRun: () => heading('H3') })}
          <Divider colors={colors} />
          {t({ text: 'A-', label: 'Smaller text', onRun: () => run('fontSize', '2') })}
          {t({ text: 'A', label: 'Normal text size', onRun: () => run('fontSize', '3') })}
          {t({ text: 'A+', label: 'Larger text', onRun: () => run('fontSize', '5') })}
          <Divider colors={colors} />
          {t({ text: 'B', label: 'Bold (Ctrl+B)', active: on.bold, onRun: () => run('bold') })}
          {t({ text: 'I', label: 'Italic (Ctrl+I)', active: on.italic, onRun: () => run('italic') })}
          {t({ text: 'U', label: 'Underline (Ctrl+U)', active: on.underline, onRun: () => run('underline') })}
          {t({ text: 'S', label: 'Strike through', active: on.strike, onRun: () => run('strikeThrough') })}
          <Divider colors={colors} />
          {t({ icon: 'list-outline', label: 'Bullet list', active: on.ul, onRun: bullets })}
          {t({ icon: 'reorder-four-outline', label: 'Numbered list', active: on.ol, onRun: () => run('insertOrderedList') })}
          {t({ icon: 'checkbox-outline', label: 'Tick list', active: on.checklist, onRun: toggleChecklist })}
          <Divider colors={colors} />
          {t({ icon: 'arrow-undo-outline', label: 'Undo (Ctrl+Z)', onRun: () => run('undo') })}
          {t({ icon: 'arrow-redo-outline', label: 'Redo (Ctrl+Y)', onRun: () => run('redo') })}
          {t({ icon: 'backspace-outline', label: 'Clear the formatting of the selection', onRun: () => { run('removeFormat'); run('formatBlock', 'DIV'); } })}
        </ScrollView>
      </View>
      {createElement('div', {
        ref: box,
        className: 'th-note',
        contentEditable: true,
        suppressContentEditableWarning: true,
        role: 'textbox',
        'aria-multiline': true,
        'aria-label': 'Note',
        'data-placeholder': placeholder || 'Start writing',
        spellCheck: true,
        onInput: report,
        onClick,
        onPaste,
        onKeyUp: readState,
        style: { color: colors.gray[900] },
      })}
    </View>
  );
}

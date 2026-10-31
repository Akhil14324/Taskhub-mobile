import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, BRAND } from '../../theme/theme';
import * as SecureStore from '../../utils/secureStorage';
import { makeDraggable } from '../../hooks/useWebReorder';
import Popover, { anchorOf } from '../board/Popover';
import { HOME_WIDGETS, DEFAULT_HOME } from './HomeWidgets';

const COLS = 12;
const MIN_SPAN = 3;
const MIN_H = 150;
const MAX_H = 900;
const STEP = 10;
const gutter = 8;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** The saved layout, cleaned: only known widgets, sizes in range. A new widget in a later release is appended. */
function clean(raw) {
  let list = Array.isArray(raw) ? raw : null;
  if (!list) return DEFAULT_HOME.map((id) => ({ id, span: HOME_WIDGETS[id].span, h: HOME_WIDGETS[id].h }));
  list = list.filter((w) => w && HOME_WIDGETS[w.id]).map((w) => ({ id: w.id, span: clamp(Math.round(w.span) || HOME_WIDGETS[w.id].span, MIN_SPAN, COLS), h: clamp(Math.round(w.h) || HOME_WIDGETS[w.id].h, MIN_H, MAX_H) }));
  return list;
}

/**
 * Home as a board of widgets that fills the page. On a computer every widget can be dragged by its title to a
 * new place, stretched by its bottom-right corner (width in 12 columns, height in pixels), removed with the cross
 * and added back from "Add widget". The layout is saved on this device per person. A phone shows them in one column.
 */
export default function HomeGrid({ ctx, desktop, userId }) {
  const colors = useColors();
  const key = `home.layout.${userId || 'me'}`;
  const [layout, setLayout] = useState(() => clean(null));
  const [loaded, setLoaded] = useState(false);
  const [menu, setMenu] = useState(null);
  const rootRef = useRef(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const hiddenRef = useRef([]);

  useEffect(() => {
    let live = true;
    SecureStore.getItemAsync(key).then((v) => {
      if (!live) return;
      try { if (v) setLayout(clean(JSON.parse(v))); } catch { /* keep the default */ }
      setLoaded(true);
    });
    return () => { live = false; };
  }, [key]);

  const save = useCallback((next) => {
    setLayout(next);
    SecureStore.setItemAsync(key, JSON.stringify(next)).catch(() => {});
  }, [key]);

  // Drag a widget by its title to move it before or after another.
  useEffect(() => {
    const root = rootRef.current;
    if (!desktop || !root || typeof root.addEventListener !== 'function') return undefined;
    let dragId = null;
    let mark = null;
    const cardOf = (el) => (el && el.closest ? el.closest('[data-widget]') : null);
    const clear = () => { if (mark) mark.style.boxShadow = ''; mark = null; };
    const side = (card, e) => {
      const r = card.getBoundingClientRect();
      return e.clientX < r.left + r.width / 2 ? 'before' : 'after';
    };
    const onStart = (e) => {
      const grip = e.target && e.target.closest ? e.target.closest('[data-widget-grip]') : null;
      const card = cardOf(grip);
      if (!card) return;
      dragId = card.dataset.widget;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragId);
      if (e.dataTransfer.setDragImage) e.dataTransfer.setDragImage(card, 20, 14);
      card.style.opacity = '0.5';
    };
    const onOver = (e) => {
      if (!dragId) return;
      const card = cardOf(e.target);
      clear();
      if (!card || card.dataset.widget === dragId) return;
      e.preventDefault();
      mark = card;
      card.style.boxShadow = side(card, e) === 'before' ? 'inset 4px 0 0 #0073ea' : 'inset -4px 0 0 #0073ea';
    };
    const onDrop = (e) => {
      if (!dragId) return;
      const card = cardOf(e.target);
      if (!card || card.dataset.widget === dragId) { clear(); return; }
      e.preventDefault();
      const where = side(card, e);
      const targetId = card.dataset.widget;
      clear();
      const cur = layoutRef.current;
      const moving = cur.find((w) => w.id === dragId);
      if (!moving) return;
      const rest = cur.filter((w) => w.id !== dragId);
      const at = rest.findIndex((w) => w.id === targetId) + (where === 'after' ? 1 : 0);
      rest.splice(at, 0, moving);
      save(rest);
    };
    const onEnd = (e) => { const c = cardOf(e.target); if (c) c.style.opacity = ''; clear(); dragId = null; };
    root.addEventListener('dragstart', onStart);
    root.addEventListener('dragover', onOver);
    root.addEventListener('drop', onDrop);
    root.addEventListener('dragend', onEnd);
    return () => {
      root.removeEventListener('dragstart', onStart);
      root.removeEventListener('dragover', onOver);
      root.removeEventListener('drop', onDrop);
      root.removeEventListener('dragend', onEnd);
    };
  }, [desktop, save]);

  // Stretch a widget by its corner. Width snaps to a column of 12, height to 10 px.
  const attachResize = useCallback((el, id) => {
    if (!el || typeof el.addEventListener !== 'function' || el.__resizeBound) return;
    el.__resizeBound = true;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const card = el.closest('[data-widget]');
      const grid = card && card.parentElement;
      if (!card || !grid) return;
      const rect = card.getBoundingClientRect();
      const colW = grid.getBoundingClientRect().width / COLS;
      let raf = 0;
      const move = (ev) => {
        const span = clamp(Math.round((ev.clientX - rect.left) / colW), MIN_SPAN, COLS);
        const h = clamp(Math.round((ev.clientY - rect.top) / STEP) * STEP, MIN_H, MAX_H);
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          setLayout((cur) => cur.map((w) => (w.id === id && (w.span !== span || w.h !== h) ? { ...w, span, h } : w)));
        });
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        document.body.style.userSelect = '';
        setTimeout(() => {
          SecureStore.setItemAsync(key, JSON.stringify(layoutRef.current)).catch(() => {});
        }, 60);
      };
      document.body.style.userSelect = 'none';
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }, [key]);

  const remove = (id) => save(layout.filter((w) => w.id !== id));
  const hidden = Object.keys(HOME_WIDGETS).filter((id) => !layout.some((w) => w.id === id));
  hiddenRef.current = hidden;
  const reset = () => save(clean(null));

  return (
    <View style={{ gap: spacing.sm }}>
      {desktop && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, justifyContent: 'flex-end' }}>
          <Text style={{ flex: 1, fontSize: 12, color: colors.gray[500] }}>Drag a title to move a widget. Drag its corner to resize it.</Text>
          <Pressable onPress={(e) => setMenu({ anchor: anchorOf(e) })} style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray[300], backgroundColor: hovered ? colors.gray[100] : colors.white })}>
            <Ionicons name="add" size={16} color={colors.gray[700]} />
            <Text style={{ fontSize: 14, color: colors.gray[800] }}>Add widget{hidden.length ? ` (${hidden.length})` : ''}</Text>
          </Pressable>
          <Pressable onPress={reset} accessibilityLabel="Put the widgets back as they were" style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.md, backgroundColor: hovered ? colors.gray[100] : 'transparent' })}>
            <Ionicons name="refresh-outline" size={16} color={colors.gray[600]} />
            <Text style={{ fontSize: 14, color: colors.gray[700] }}>Reset</Text>
          </Pressable>
        </View>
      )}
      <View ref={rootRef} style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -gutter / 2, opacity: loaded ? 1 : 0.999 }}>
        {layout.map((w) => {
          const def = HOME_WIDGETS[w.id];
          const Body = def.Body;
          return (
            <View key={w.id} dataSet={{ widget: w.id }} style={{ width: desktop ? `${(w.span / COLS) * 100}%` : '100%', padding: gutter / 2 }}>
              <View style={{ height: desktop ? w.h : undefined, minHeight: desktop ? undefined : 120, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.gray[200], overflow: 'hidden' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.md, paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.gray[100] }}>
                  {desktop && (
                    <View ref={makeDraggable} dataSet={{ widgetGrip: '1' }} accessibilityLabel={`Move ${def.title}`} style={{ cursor: 'grab', paddingRight: 2 }}>
                      <Ionicons name="reorder-two-outline" size={16} color={colors.gray[400]} />
                    </View>
                  )}
                  <Ionicons name={def.icon} size={16} color={colors.gray[600]} />
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, fontWeight: '600', color: colors.gray[900] }}>{def.title}</Text>
                  <Pressable onPress={() => remove(w.id)} hitSlop={8} accessibilityLabel={`Remove ${def.title}`} style={({ hovered }) => ({ opacity: hovered ? 1 : 0.45 })}>
                    <Ionicons name="close" size={16} color={colors.gray[600]} />
                  </Pressable>
                </View>
                <ScrollView style={{ flex: desktop ? 1 : undefined }} contentContainerStyle={{ padding: spacing.md }} nestedScrollEnabled>
                  <Body ctx={ctx} />
                </ScrollView>
                {desktop && (
                  <View ref={(el) => attachResize(el, w.id)} accessibilityLabel={`Resize ${def.title}`} style={{ position: 'absolute', right: 0, bottom: 0, width: 22, height: 22, cursor: 'nwse-resize', alignItems: 'flex-end', justifyContent: 'flex-end', padding: 3 }}>
                    <Ionicons name="resize-outline" size={14} color={colors.gray[400]} style={{ transform: [{ scaleX: -1 }] }} />
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </View>
      {!layout.length && <Text style={{ color: colors.gray[500], textAlign: 'center', padding: spacing.xl }}>No widgets. Use Add widget, or Reset.</Text>}
      {menu && (
        <Popover visible anchor={menu.anchor} onClose={() => setMenu(null)} width={280}>
          {hidden.length === 0 && <Text style={{ padding: 8, color: colors.gray[600], fontSize: 13 }}>Every widget is on the page.</Text>}
          {hidden.map((id) => (
            <Pressable key={id} onPress={() => { setMenu(null); save([...layout, { id, span: HOME_WIDGETS[id].span, h: HOME_WIDGETS[id].h }]); }}
              style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: radius.md, backgroundColor: hovered ? colors.gray[100] : 'transparent' })}>
              <Ionicons name={HOME_WIDGETS[id].icon} size={16} color={BRAND} />
              <Text style={{ fontSize: 14, color: colors.gray[900] }}>{HOME_WIDGETS[id].title}</Text>
            </Pressable>
          ))}
        </Popover>
      )}
    </View>
  );
}

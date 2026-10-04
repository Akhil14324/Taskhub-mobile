import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, TextInput } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../context/ThemeContext';
import { spacing, radius, fontSize } from '../theme/theme';
import useBackClose from '../hooks/useBackClose';
import { glass } from '../theme/glass';
import {
  ACTIONS, FIXED, actionById, chordOf, chordKeys, splitCombo, effective, isCustomised, setCombos, resetAction, resetAll,
  findClash, stealCombo, useShortcutVersion,
} from '../utils/shortcutRegistry';

// Combos the browser or the system keeps for itself; a page cannot catch them.
const BROWSER_KEEPS = new Set(['mod+w', 'mod+t', 'mod+n', 'mod+shift+n', 'mod+shift+t', 'mod+r', 'mod+l', 'mod+q', 'mod+tab', 'alt+F4', 'F5', 'F11', 'F12', 'mod+shift+w']);
const MAX_CHORDS = 3;

function Key({ children }) {
  const colors = useColors();
  return (
    <View style={{
      minWidth: 24, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, alignItems: 'center',
      backgroundColor: colors.gray[100], borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[300],
    }}
    >
      <Text style={{ fontSize: 12, fontWeight: '600', color: colors.gray[700] }}>{children}</Text>
    </View>
  );
}

/** One combo drawn as keys: "alt+space" is [Alt][Space]; "g t" is [G] then [T]. */
function Combo({ combo }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {splitCombo(combo).map((chord, i) => (
        <View key={`${chord}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {i > 0 && <Text style={{ fontSize: 11, color: colors.gray[400] }}>then</Text>}
          {chordKeys(chord).map((k, j) => <Key key={`${k}-${j}`}>{k}</Key>)}
        </View>
      ))}
    </View>
  );
}

/** Desktop: every keyboard shortcut, opened with "?". Click Change on any action to record your own keys. */
export default function ShortcutsSheet({ visible, onClose }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  useShortcutVersion();
  const [query, setQuery] = useState('');
  const [rec, setRec] = useState(null); // { id, index: number | null }
  const [draft, setDraft] = useState([]);
  const [problem, setProblem] = useState('');
  const [clash, setClash] = useState(null); // { other, combo }

  const stop = () => { setRec(null); setDraft([]); setProblem(''); setClash(null); };
  useEffect(() => { if (!visible) { stop(); setQuery(''); } }, [visible]);

  // While recording, every key press goes to the recorder and nowhere else.
  useEffect(() => {
    if (!rec || typeof window === 'undefined') return undefined;
    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const chord = chordOf(e);
      if (!chord) return;
      if (chord === 'Escape') { stop(); return; }
      if (chord === 'Tab' || chord === 'shift+Tab') { setProblem('Tab is kept for moving between buttons.'); return; }
      setClash(null);
      setProblem('');
      setDraft((d) => {
        const next = d.length >= MAX_CHORDS ? d : [...d, chord];
        if (next.length === 1 && BROWSER_KEEPS.has(chord)) { setProblem('The browser keeps this combination, so the app may never see it. Pick another.'); return d; }
        return next;
      });
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [rec]);

  const apply = (id, index, combo) => {
    const list = [...effective(id)];
    if (index == null || index >= list.length) list.push(combo); else list[index] = combo;
    setCombos(id, [...new Set(list)]);
    stop();
  };
  const save = () => {
    if (!rec || !draft.length) return;
    const combo = draft.join(' ');
    const other = findClash(rec.id, combo);
    if (other) { setClash({ other, combo }); return; }
    apply(rec.id, rec.index, combo);
  };
  const replace = () => {
    stealCombo(clash.other.id, clash.combo);
    apply(rec.id, rec.index, clash.combo);
  };

  const q = query.trim().toLowerCase();
  const groups = useMemo(() => {
    const out = [];
    ACTIONS.forEach((a) => {
      if (q && !`${a.label} ${a.group}`.toLowerCase().includes(q)) return;
      let g = out.find((x) => x.title === a.group);
      if (!g) { g = { title: a.group, items: [] }; out.push(g); }
      g.items.push(a);
    });
    return out;
  }, [q]);

  useBackClose(visible, onClose);

  if (!visible) return null;
  const customised = ACTIONS.some((a) => isCustomised(a.id));

  const renderRow = (a) => {
    const combos = effective(a.id);
    const editing = rec?.id === a.id;
    return (
      <View key={a.id} style={styles.rowWrap}>
        <View style={styles.row}>
          <Text style={styles.label}>{a.label}</Text>
          <View style={styles.keys}>
            {!combos.length && <Text style={styles.off}>Not set</Text>}
            {combos.map((c, i) => (
              <View key={c} style={styles.comboWrap}>
                {i > 0 && <Text style={styles.then}>or</Text>}
                <Pressable onPress={() => { setRec({ id: a.id, index: i }); setDraft([]); setProblem(''); setClash(null); }} accessibilityLabel={`Change ${a.label}`}>
                  <Combo combo={c} />
                </Pressable>
                <Pressable onPress={() => setCombos(a.id, combos.filter((x) => x !== c))} hitSlop={6} accessibilityLabel="Remove this shortcut">
                  <Ionicons name="close-circle" size={15} color={colors.gray[300]} />
                </Pressable>
              </View>
            ))}
            <Pressable style={styles.chipBtn} onPress={() => { setRec({ id: a.id, index: null }); setDraft([]); setProblem(''); setClash(null); }}>
              <Ionicons name={combos.length ? 'add' : 'create-outline'} size={14} color={colors.brand[600]} />
              <Text style={styles.chipText}>{combos.length ? 'Add' : 'Set'}</Text>
            </Pressable>
            {isCustomised(a.id) && (
              <Pressable style={styles.chipBtn} onPress={() => { resetAction(a.id); if (editing) stop(); }}>
                <Ionicons name="refresh" size={13} color={colors.gray[500]} />
                <Text style={[styles.chipText, { color: colors.gray[500] }]}>Reset</Text>
              </Pressable>
            )}
          </View>
        </View>
        {editing && (
          <View {...glass('inset')} style={styles.recorder}>
            <Text style={styles.recHint}>
              {draft.length ? 'Press more keys to make a sequence, or save.' : 'Press the keys you want. A key alone, Ctrl/Alt/Shift combinations, or up to three in a row all work. Esc cancels.'}
            </Text>
            <View style={styles.recBox}>
              {draft.length ? <Combo combo={draft.join(' ')} /> : <Text style={styles.off}>Waiting for keys...</Text>}
            </View>
            {!!problem && <Text style={styles.problem}>{problem}</Text>}
            {clash && (
              <Text style={styles.problem}>
                Already used by &quot;{clash.other.label}&quot; ({clash.other.group}). Replace it, and that action will have no shortcut.
              </Text>
            )}
            <View style={styles.recActions}>
              <Pressable style={styles.ghost} onPress={stop}><Text style={styles.ghostText}>Cancel</Text></Pressable>
              {!!draft.length && <Pressable style={styles.ghost} onPress={() => setDraft((d) => d.slice(0, -1))}><Text style={styles.ghostText}>Undo last</Text></Pressable>}
              {clash
                ? <Pressable style={styles.save} onPress={replace}><Text style={styles.saveText}>Replace</Text></Pressable>
                : <Pressable style={[styles.save, !draft.length && { opacity: 0.4 }]} disabled={!draft.length} onPress={save}><Text style={styles.saveText}>Save</Text></Pressable>}
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable {...glass('inset')} style={styles.card} onPress={() => {}}>
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Keyboard shortcuts</Text>
              <Text style={styles.sub}>Click any shortcut to change it, or Add for a second one.</Text>
            </View>
            {customised && (
              <Pressable style={styles.chipBtn} onPress={() => { resetAll(); stop(); }}>
                <Ionicons name="refresh" size={13} color={colors.gray[500]} />
                <Text style={[styles.chipText, { color: colors.gray[500] }]}>Reset all</Text>
              </Pressable>
            )}
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.gray[500]} />
            </Pressable>
          </View>
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={15} color={colors.gray[400]} />
            <TextInput value={query} onChangeText={setQuery} placeholder="Find an action" placeholderTextColor={colors.gray[400]} style={styles.search} />
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {groups.map((group) => (
              <View key={group.title} style={styles.group}>
                <Text style={styles.groupTitle}>{group.title}</Text>
                {group.items.map(renderRow)}
              </View>
            ))}
            {!groups.length && <Text style={styles.off}>No action matches.</Text>}
            {!q && (
              <View style={styles.group}>
                <Text style={styles.groupTitle}>Always the same</Text>
                {FIXED.map((f) => (
                  <View key={f.label} style={styles.row}>
                    <Text style={styles.label}>{f.label}</Text>
                    <Text style={styles.fixed}>{f.keys}</Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Keep actionById exported for callers that want a label.
export { actionById };

const createStyles = (colors) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  card: {
    width: '100%', maxWidth: 680, maxHeight: '90%', backgroundColor: colors.white, borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200], overflow: 'hidden',
  },
  head: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.gray[200],
  },
  title: { fontSize: fontSize.lg, fontWeight: '700', color: colors.gray[900] },
  sub: { fontSize: fontSize.xs, color: colors.gray[500], marginTop: 1 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: spacing.lg, marginTop: spacing.md, paddingHorizontal: spacing.md,
    height: 36, borderRadius: radius.lg, backgroundColor: colors.gray[100],
  },
  search: { flex: 1, fontSize: fontSize.sm, color: colors.gray[900], outlineStyle: 'none' },
  body: { padding: spacing.lg, gap: spacing.lg },
  group: { gap: 2 },
  groupTitle: { fontSize: 11, fontWeight: '700', color: colors.gray[400], textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  rowWrap: { borderRadius: radius.md },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, gap: spacing.md },
  label: { flex: 1, fontSize: fontSize.base, color: colors.gray[800] },
  keys: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', flexShrink: 1 },
  comboWrap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  then: { fontSize: 11, color: colors.gray[400] },
  off: { fontSize: fontSize.sm, color: colors.gray[400] },
  fixed: { fontSize: fontSize.sm, color: colors.gray[500], fontWeight: '600' },
  chipBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, height: 24, borderRadius: 12, backgroundColor: colors.gray[100] },
  chipText: { fontSize: 11, fontWeight: '700', color: colors.brand[600] },
  recorder: { marginTop: 4, marginBottom: 8, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.brand[50], borderWidth: 1, borderColor: colors.brand[200] || colors.brand[100], gap: spacing.sm },
  recHint: { fontSize: fontSize.xs, color: colors.gray[600], lineHeight: 17 },
  recBox: { minHeight: 40, borderRadius: radius.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.brand[500], alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, paddingVertical: 6 },
  problem: { fontSize: fontSize.xs, color: colors.red[600], fontWeight: '600', lineHeight: 17 },
  recActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  ghost: { paddingHorizontal: spacing.md, height: 32, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  ghostText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[600] },
  save: { paddingHorizontal: spacing.lg, height: 32, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand[600] },
  saveText: { fontSize: fontSize.sm, fontWeight: '800', color: '#fff' },
});

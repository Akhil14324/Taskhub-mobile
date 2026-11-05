import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, TextInput } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import api from '../../api/client';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, BRAND } from '../../theme/theme';
import Modal from '../Modal';
import { DropdownPicker } from '../DropdownPicker';
import useIsDesktop from '../../hooks/useBreakpoint';
import { parseClipboard, readSheetFile, pickSheetFile, autoMap, looksLikeHeader, guessKind } from '../../utils/sheet';
import { showToast } from '../../utils/events';

// Types a new column made from a sheet can have (backend utils/sheetImport.js NEW_KINDS).
const NEW_KINDS = [
  ['text', 'Text'], ['long_text', 'Long text'], ['numbers', 'Numbers'], ['date', 'Date'], ['timeline', 'Timeline'],
  ['status', 'Status (coloured labels)'], ['dropdown', 'Dropdown'], ['person', 'Person'], ['checkbox', 'Checkbox'],
  ['email', 'Email'], ['phone', 'Phone'], ['link', 'Link'], ['tags', 'Tags'], ['progress', 'Progress %'], ['rating', 'Rating'], ['hour', 'Hour'],
];
const NOT_FILLABLE = new Set(['files', 'board_relation', 'vote', 'formula', 'mirror', 'button', 'auto_number', 'creation_log', 'last_updated', 'dependency', 'sprint', 'item_type', 'approval', 'time_tracking']);

const keyOf = (m) => (m.to === 'column' ? `c:${m.column_id}` : m.to);

/**
 * Bring rows from Excel / Google Sheets into a board as new tasks (nothing on the board is changed). Three ways
 * in: paste copied cells (Ctrl+V in the box, or anywhere on the board, which opens this with `initialText`),
 * an .xlsx file, or a .csv file (picked or dropped). Each sheet column is matched to a board column (by title,
 * or by meaning for Owner / Status / Due date ...), and people who run the board can make the rest into new
 * columns. The server checks the rows as you change things (a dry run), so what will happen is on screen
 * before anything is added.
 */
export default function BoardImport({ visible, board, onClose, onDone, initialText, initialGroupId }) {
  const colors = useColors();
  const desktop = useIsDesktop();
  const canManage = !!board.access?.manage;
  const columns = useMemo(() => board.columns.filter((c) => !NOT_FILLABLE.has(c.kind) && !['item_id', 'created', 'updated', 'points'].includes(c.system_key)), [board]);

  const [source, setSource] = useState(null); // { name, sheets: [{ name, rows }] }
  const [sheetAt, setSheetAt] = useState(0);
  const [header, setHeader] = useState(true);
  const [mapping, setMapping] = useState([]);
  const [opts, setOpts] = useState({ skip_duplicates: true, create_groups: true, date_order: 'dmy', group_id: null });
  const [check, setCheck] = useState(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paste, setPaste] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const dropRef = useRef(null);
  const seq = useRef(0);

  const rows = source?.sheets[sheetAt]?.rows || [];
  const width = Math.max(0, ...rows.slice(0, 200).map((r) => r.length));
  const headers = useMemo(() => Array.from({ length: width }, (_, i) => (header ? String(rows[0]?.[i] ?? '').trim() : '') || `Column ${i + 1}`), [rows, header, width]);
  const body = useMemo(() => (header ? rows.slice(1) : rows), [rows, header]);

  // A new sheet (or the header switch) guesses the matching again.
  const remap = useCallback((rws, hdr) => {
    const w = Math.max(0, ...rws.slice(0, 200).map((r) => r.length));
    const hs = Array.from({ length: w }, (_, i) => (hdr ? String(rws[0]?.[i] ?? '').trim() : ''));
    setMapping(autoMap(hs, hdr ? rws.slice(1, 300) : rws.slice(0, 300), columns, { canManage }));
    setCheck(null);
  }, [columns, canManage]);

  const load = useCallback((name, sheets) => {
    if (!sheets.length || !sheets.some((s) => s.rows.length)) {
      showToast({ message: 'No cells found in that', icon: 'alert-circle-outline' });
      return;
    }
    const first = sheets.findIndex((s) => s.rows.length);
    const rws = sheets[first].rows;
    const hdr = looksLikeHeader(rws, board.columns);
    setSource({ name, sheets });
    setSheetAt(first);
    setHeader(hdr);
    remap(rws, hdr);
  }, [board.columns, remap]);

  const loadText = useCallback((text, name = 'Pasted cells') => {
    const rws = parseClipboard(text);
    if (!rws.length) return false;
    load(name, [{ name, rows: rws }]);
    return true;
  }, [load]);

  const loadFile = useCallback(async (file) => {
    if (!file) return;
    try {
      const sheets = await readSheetFile(file);
      load(file.name, sheets);
    } catch (e) {
      showToast({ message: e?.message || 'Could not read that file', icon: 'alert-circle-outline' });
    }
  }, [load]);

  useEffect(() => {
    if (!visible) return;
    setOpts((o) => ({ ...o, group_id: initialGroupId || null }));
    if (initialText) loadText(initialText);
  }, [visible, initialText, initialGroupId, loadText]);

  // Drop a file anywhere on the window.
  useEffect(() => {
    const el = dropRef.current;
    if (!visible || !el || typeof el.addEventListener !== 'function') return undefined;
    const over = (e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); setDragOver(true); } };
    const leave = () => setDragOver(false);
    const drop = (e) => {
      const f = e.dataTransfer?.files?.[0];
      if (!f) return;
      e.preventDefault();
      setDragOver(false);
      loadFile(f);
    };
    el.addEventListener('dragover', over);
    el.addEventListener('dragleave', leave);
    el.addEventListener('drop', drop);
    return () => { el.removeEventListener('dragover', over); el.removeEventListener('dragleave', leave); el.removeEventListener('drop', drop); };
  }, [visible, loadFile, source]);

  const payload = useCallback((dry) => ({
    mapping, rows: body, dry_run: dry, ...opts, group_id: opts.group_id || undefined,
  }), [mapping, body, opts]);

  // Check as things change (a dry run on the server), so the numbers and warnings are always current.
  useEffect(() => {
    if (!visible || !source || !mapping.length) return undefined;
    if (!mapping.some((m) => m.to === 'name')) { setCheck({ error: 'Pick the column with the task names' }); return undefined; }
    const my = ++seq.current;
    const t = setTimeout(async () => {
      setChecking(true);
      try {
        const res = await api.post(`/boards/${board.board.id}/import`, payload(true), { timeout: 120000, __skipOops: true });
        if (my === seq.current) setCheck(res.data);
      } catch (e) {
        if (my === seq.current) setCheck({ error: e?.response?.data?.error || 'Could not check the rows' });
      } finally {
        if (my === seq.current) setChecking(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [visible, source, mapping, payload, board.board.id]);

  const run = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/boards/${board.board.id}/import`, payload(false), { timeout: 300000 });
      const n = res.data.created;
      showToast({ message: `${n} task${n === 1 ? '' : 's'} added${res.data.warnings?.length ? `, ${res.data.warnings.length} cell${res.data.warnings.length === 1 ? '' : 's'} left empty` : ''}`, tone: 'success', icon: 'cloud-upload' });
      onDone?.();
      close();
    } catch (e) {
      showToast({ message: e?.response?.data?.error || 'Could not import it', icon: 'alert-circle-outline' });
    } finally {
      setBusy(false);
    }
  };
  const close = () => { setSource(null); setCheck(null); setMapping([]); setPaste(''); setSheetAt(0); onClose(); };

  const setTarget = (i, key) => {
    setMapping((ms) => ms.map((m, j) => {
      if (j !== i) {
        // Only one column can be the name / the group / a given board column.
        if (key !== 'skip' && key !== 'new' && keyOf(m) === key) return { to: 'skip' };
        return m;
      }
      if (key === 'skip' || key === 'name' || key === 'group') return { to: key };
      if (key === 'new') return { to: 'new', title: headers[i], kind: guessKind(body.map((r) => r[i])) };
      return { to: 'column', column_id: Number(key.slice(2)) };
    }));
  };
  const setKind = (i, kind) => setMapping((ms) => ms.map((m, j) => (j === i ? { ...m, kind } : m)));

  const targetItems = useMemo(() => [
    { value: 'skip', label: 'Leave out' },
    { value: 'name', label: 'Task name' },
    { value: 'group', label: 'Group' },
    ...columns.map((c) => ({ value: `c:${c.id}`, label: c.title })),
    ...(canManage ? [{ value: 'new', label: 'New column' }] : []),
  ], [columns, canManage]);
  const kindItems = useMemo(() => NEW_KINDS.map(([value, label]) => ({ value, label })), []);
  const groupItems = useMemo(() => [{ value: '', label: board.groups[0]?.name ? `${board.groups[0].name} (first group)` : 'First group' }, ...board.groups.slice(1).map((g) => ({ value: String(g.id), label: g.name }))], [board.groups]);

  const s = check?.summary;
  const ready = s ? s.ready : 0;
  const chip = (on) => ({ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 1, borderColor: on ? BRAND : colors.gray[300], backgroundColor: on ? colors.brand[50] : 'transparent' });
  const chipText = (on) => ({ fontSize: 13, color: on ? BRAND : colors.gray[700] });
  const Tick = ({ on, onPress, label }) => (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Ionicons name={on ? 'checkbox' : 'square-outline'} size={18} color={on ? BRAND : colors.gray[500]} />
      <Text style={{ fontSize: 14, color: colors.gray[800], flexShrink: 1 }}>{label}</Text>
    </Pressable>
  );
  const sampleOf = (i) => body.slice(0, 40).map((r) => String(r[i] ?? '').trim()).filter(Boolean).slice(0, 3);

  return (
    <Modal open={visible} onClose={close} title="Import from Excel" width={760}>
      <View ref={dropRef} style={{ padding: spacing.md, gap: spacing.md, borderRadius: radius.md, borderWidth: dragOver ? 2 : 0, borderStyle: 'dashed', borderColor: BRAND }}>
        {!source ? (
          <>
            <Text style={{ fontSize: 14, color: colors.gray[700] }}>
              Every row becomes a new task on this board. Nothing that is already on the board is changed.
            </Text>
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.gray[500] }}>PASTE CELLS</Text>
              <TextInput
                value={paste}
                onChangeText={(t) => { setPaste(t); if (t.includes('\t') || t.split('\n').length > 1) loadText(t); }}
                placeholder={'In Excel or Google Sheets select the cells (with the header row), press Ctrl+C, click here and press Ctrl+V'}
                placeholderTextColor={colors.gray[400]}
                multiline
                style={{ minHeight: 120, borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, padding: 12, fontSize: 14, color: colors.gray[900], textAlignVertical: 'top', outlineStyle: 'none' }}
              />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
              <Pressable onPress={async () => loadFile(await pickSheetFile())} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 }}>
                <Ionicons name="document-attach-outline" size={16} color={BRAND} />
                <Text style={{ color: colors.gray[800] }}>Choose a file</Text>
              </Pressable>
              <Text style={{ fontSize: 12, color: colors.gray[500], flexShrink: 1 }}>.xlsx or .csv, or drop it here. Every sheet of a workbook can be picked.</Text>
            </View>
          </>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
              <Ionicons name={/\.(xlsx|xlsm|csv|tsv|txt)$/i.test(source.name) ? 'document-text-outline' : 'clipboard-outline'} size={18} color={BRAND} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.gray[900] }} numberOfLines={1}>{source.name}</Text>
              <Text style={{ fontSize: 13, color: colors.gray[500] }}>{body.length} row{body.length === 1 ? '' : 's'} · {width} column{width === 1 ? '' : 's'}</Text>
              <Pressable onPress={() => { setSource(null); setCheck(null); setPaste(''); }} style={{ marginLeft: 'auto' }}>
                <Text style={{ fontSize: 13, color: BRAND, fontWeight: '600' }}>Use other cells</Text>
              </Pressable>
            </View>
            {source.sheets.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {source.sheets.map((sh, i) => (
                  <Pressable key={sh.name + i} onPress={() => { setSheetAt(i); const hdr = looksLikeHeader(sh.rows, board.columns); setHeader(hdr); remap(sh.rows, hdr); }} style={chip(i === sheetAt)}>
                    <Text style={chipText(i === sheetAt)}>{sh.name} ({sh.rows.length})</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            <Tick on={header} onPress={() => { setHeader(!header); remap(rows, !header); }} label="The first row holds the column names" />

            <View style={{ gap: 2 }}>
              <View style={{ flexDirection: 'row', paddingHorizontal: 4, paddingBottom: 4 }}>
                <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: colors.gray[500] }}>IN THE SHEET</Text>
                <Text style={{ width: desktop ? 360 : '50%', fontSize: 12, fontWeight: '700', color: colors.gray[500] }}>GOES TO</Text>
              </View>
              {headers.map((h, i) => {
                const m = mapping[i] || { to: 'skip' };
                const ex = sampleOf(i);
                return (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6, paddingHorizontal: 4, borderTopWidth: 1, borderColor: colors.gray[100], opacity: m.to === 'skip' ? 0.6 : 1 }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.gray[900] }} numberOfLines={1}>{h}</Text>
                      <Text style={{ fontSize: 12, color: colors.gray[500] }} numberOfLines={1}>{ex.length ? ex.join('  ·  ') : 'empty'}</Text>
                    </View>
                    <View style={{ width: desktop ? 360 : '50%', flexDirection: desktop ? 'row' : 'column', gap: 6 }}>
                      <DropdownPicker selectedValue={keyOf(m)} onValueChange={(v) => setTarget(i, v)} items={targetItems} style={{ flex: 1, minHeight: 36 }} />
                      {m.to === 'new' && <DropdownPicker selectedValue={m.kind} onValueChange={(v) => setKind(i, v)} items={kindItems} style={{ flex: 1, minHeight: 36 }} />}
                    </View>
                  </View>
                );
              })}
            </View>

            <View style={{ gap: 8 }}>
              {mapping.some((m) => m.to === 'group') && <Tick on={opts.create_groups} onPress={() => setOpts((o) => ({ ...o, create_groups: !o.create_groups }))} label="Make the groups that are not on the board yet" />}
              <Tick on={opts.skip_duplicates} onPress={() => setOpts((o) => ({ ...o, skip_duplicates: !o.skip_duplicates }))} label="Skip rows whose name is already on the board" />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 14, color: colors.gray[800] }}>Dates like 05/11/2026 are</Text>
                {[['dmy', 'day first (5 Nov)'], ['mdy', 'month first (May 11)']].map(([v, label]) => (
                  <Pressable key={v} onPress={() => setOpts((o) => ({ ...o, date_order: v }))} style={chip(opts.date_order === v)}><Text style={chipText(opts.date_order === v)}>{label}</Text></Pressable>
                ))}
              </View>
              {board.groups.length > 1 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Text style={{ fontSize: 14, color: colors.gray[800] }}>{mapping.some((m) => m.to === 'group') ? 'Rows without a group go to' : 'Put the rows in'}</Text>
                  <DropdownPicker selectedValue={opts.group_id ? String(opts.group_id) : ''} onValueChange={(v) => setOpts((o) => ({ ...o, group_id: v ? Number(v) : null }))} items={groupItems} style={{ minWidth: 200, minHeight: 36 }} />
                </View>
              )}
            </View>

            <View style={{ backgroundColor: colors.gray[50], borderRadius: radius.md, padding: spacing.sm, gap: 4, minHeight: 44, justifyContent: 'center' }}>
              {checking && !s && !check?.error && <ActivityIndicator color={BRAND} />}
              {check?.error && <Text style={{ fontSize: 14, color: colors.red[600] }}>{check.error}</Text>}
              {s && (
                <>
                  <Text style={{ fontSize: 14, color: colors.gray[900], fontWeight: '600' }}>
                    {ready} task{ready === 1 ? '' : 's'} will be added
                    {s.duplicates && opts.skip_duplicates ? `, ${s.duplicates} already on the board skipped` : ''}
                    {s.no_name ? `, ${s.no_name} row${s.no_name === 1 ? '' : 's'} without a name skipped` : ''}
                    {checking ? ' ...' : ''}
                  </Text>
                  {!!s.new_groups.length && <Text style={{ fontSize: 13, color: colors.gray[700] }}>New groups: {s.new_groups.join(', ')}</Text>}
                  {!!s.new_columns.length && <Text style={{ fontSize: 13, color: colors.gray[700] }}>New columns: {s.new_columns.map((c) => c.title).join(', ')}</Text>}
                  {s.new_labels.map((l) => (
                    <Text key={l.column} style={{ fontSize: 13, color: colors.gray[700] }}>New choices in {l.column}: {l.labels.join(', ')}{l.more ? ` and ${l.more} more` : ''}</Text>
                  ))}
                  {(check.notes || []).map((n) => <Text key={n} style={{ fontSize: 13, color: colors.amber?.[700] || colors.gray[700] }}>{n}</Text>)}
                  {!!check.warnings.length && (
                    <View style={{ gap: 2, marginTop: 4 }}>
                      <Text style={{ fontSize: 13, color: colors.gray[700] }}>{s.warnings} cell{s.warnings === 1 ? '' : 's'} will be left empty:</Text>
                      {check.warnings.slice(0, 8).map((w, k) => (
                        <Text key={k} style={{ fontSize: 12, color: colors.red[600] }}>Row {w.row + (header ? 1 : 0)}, {w.column}: {w.text}</Text>
                      ))}
                      {s.warnings > 8 && <Text style={{ fontSize: 12, color: colors.gray[500] }}>and {s.warnings - 8} more</Text>}
                    </View>
                  )}
                </>
              )}
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: spacing.sm }}>
              <Pressable onPress={close} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray[300] }}>
                <Text style={{ color: colors.gray[800], fontWeight: '600' }}>Cancel</Text>
              </Pressable>
              <Pressable disabled={busy || checking || !s || !ready} onPress={run} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.md, backgroundColor: s && ready && !checking ? BRAND : colors.gray[200], cursor: busy ? 'progress' : undefined }}>
                {busy && <ActivityIndicator size="small" color="#fff" />}
                <Text style={{ color: s && ready && !checking ? '#fff' : colors.gray[600], fontWeight: '600' }}>
                  {busy ? 'Adding...' : `Add ${ready} task${ready === 1 ? '' : 's'}`}
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

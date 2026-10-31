import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import api from '../../api/client';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, BRAND } from '../../theme/theme';
import Modal from '../Modal';
import { parseCsv, pickTextFile } from '../../utils/csv';
import { showToast } from '../../utils/events';

const guess = (headers, words) => headers.findIndex((h) => words.includes(String(h).trim().toLowerCase()));

/** '31/10/2026', '31-10-2026' or '2026-10-31' -> '2026-10-31'; anything else is left out. */
function ymd(v) {
  const s = String(v || '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return undefined;
}

/**
 * Import a CSV into a board (F-IMP-01): every row becomes a NEW item; nothing on the board is changed.
 * The name, group and due date columns are guessed and can be changed; other columns fill board columns of the
 * same title. "Check" runs a dry run first, so problems show before anything is added.
 */
export default function BoardImport({ visible, board, onClose, onDone }) {
  const colors = useColors();
  const [file, setFile] = useState(null); // { name, rows }
  const [map, setMap] = useState({ name: 0, group: -1, due: -1 });
  const [check, setCheck] = useState(null);
  const [busy, setBusy] = useState(false);
  const [skipDup, setSkipDup] = useState(true);

  const customTitles = useMemo(() => new Set(board.columns.filter((c) => !c.system_key).map((c) => c.title.toLowerCase())), [board]);
  const headers = file?.rows[0] || [];
  const body = file ? file.rows.slice(1) : [];

  const pick = async () => {
    const f = await pickTextFile();
    if (!f) return;
    const rows = parseCsv(f.text);
    if (rows.length < 2) { showToast({ message: 'That file has no rows under the header', icon: 'alert-circle-outline' }); return; }
    const h = rows[0];
    const name = guess(h, ['name', 'title', 'item', 'task', 'to-do', 'todo']);
    setMap({ name: name >= 0 ? name : 0, group: guess(h, ['group', 'section']), due: guess(h, ['due', 'due date', 'date', 'deadline']) });
    setFile({ name: f.name, rows: rows.slice(0, 5001) });
    setCheck(null);
  };

  const payload = () => body.map((r) => {
    const values = {};
    headers.forEach((h, i) => {
      if (i === map.name || i === map.group || i === map.due) return;
      if (customTitles.has(String(h).trim().toLowerCase()) && r[i] !== undefined && r[i] !== '') values[String(h).trim()] = r[i];
    });
    return {
      title: r[map.name] || '',
      group: map.group >= 0 ? r[map.group] : undefined,
      due_date: map.due >= 0 ? ymd(r[map.due]) : undefined,
      values,
    };
  });

  const run = async (dry) => {
    setBusy(true);
    try {
      const res = await api.post(`/boards/${board.board.id}/import`, { rows: payload(), dry_run: dry, skip_duplicates: skipDup }, { timeout: 180000 });
      if (dry) setCheck(res.data);
      else {
        showToast({ message: `${res.data.created} item${res.data.created === 1 ? '' : 's'} added`, tone: 'success', icon: 'cloud-upload' });
        onDone?.();
        close();
      }
    } catch (e) {
      showToast({ message: e?.response?.data?.error || 'Could not import it', icon: 'alert-circle-outline' });
    } finally {
      setBusy(false);
    }
  };
  const close = () => { setFile(null); setCheck(null); onClose(); };

  const Choice = ({ field, label, optional }) => (
    <View style={{ gap: 4 }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.gray[500] }}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {optional && <Pressable onPress={() => { setMap((m) => ({ ...m, [field]: -1 })); setCheck(null); }} style={chip(map[field] === -1)}><Text style={chipText(map[field] === -1)}>None</Text></Pressable>}
        {headers.map((h, i) => (
          <Pressable key={i} onPress={() => { setMap((m) => ({ ...m, [field]: i })); setCheck(null); }} style={chip(map[field] === i)}>
            <Text style={chipText(map[field] === i)}>{h || `Column ${i + 1}`}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
  const chip = (on) => ({ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 1, borderColor: on ? BRAND : colors.gray[300], backgroundColor: on ? colors.brand[50] : 'transparent' });
  const chipText = (on) => ({ fontSize: 13, color: on ? BRAND : colors.gray[700] });
  const matched = headers.filter((h, i) => i !== map.name && i !== map.group && i !== map.due && customTitles.has(String(h).trim().toLowerCase()));

  return (
    <Modal open={visible} onClose={close} title="Import from a spreadsheet" width={600}>
      <View style={{ padding: spacing.md, gap: spacing.md }}>
        <Text style={{ fontSize: 13, color: colors.gray[600] }}>Every row becomes a new item on this board. Nothing that is already on the board is changed.</Text>
        <Pressable onPress={pick} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 }}>
          <Ionicons name="document-attach-outline" size={16} color={BRAND} />
          <Text style={{ color: colors.gray[800] }}>{file ? `${file.name} · ${body.length} rows` : 'Choose a CSV file'}</Text>
        </Pressable>
        {!file && <Text style={{ fontSize: 12, color: colors.gray[500] }}>In Excel or Google Sheets: File, Download (or Save as), CSV.</Text>}
        {file && (
          <>
            <Choice field="name" label="ITEM NAME" />
            <Choice field="group" label="GROUP" optional />
            <Choice field="due" label="DUE DATE" optional />
            <Text style={{ fontSize: 13, color: colors.gray[600] }}>
              {matched.length ? `Also filled: ${matched.join(', ')} (board columns with the same title).` : 'No other column matches a board column by title, so only the name, group and date are used.'}
            </Text>
            <Pressable onPress={() => { setSkipDup((s) => !s); setCheck(null); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name={skipDup ? 'checkbox' : 'square-outline'} size={18} color={skipDup ? BRAND : colors.gray[500]} />
              <Text style={{ fontSize: 14, color: colors.gray[800] }}>Skip rows whose name is already on the board</Text>
            </Pressable>
            {check && (
              <View style={{ backgroundColor: colors.gray[50], borderRadius: radius.md, padding: spacing.sm, gap: 4 }}>
                <Text style={{ fontSize: 14, color: colors.gray[900] }}>
                  {check.summary.ok} ready{check.summary.duplicates ? `, ${check.summary.duplicates} already on the board` : ''}{check.summary.with_problems ? `, ${check.summary.with_problems} with problems (left out)` : ''}
                </Text>
                {check.problems.slice(0, 6).map((p) => <Text key={p.row} style={{ fontSize: 12, color: colors.red[600] }}>Row {p.row + 1}: {p.problems.join('; ')}</Text>)}
              </View>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm }}>
              {busy && <ActivityIndicator color={BRAND} />}
              <Pressable disabled={busy} onPress={() => run(true)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray[300] }}>
                <Text style={{ color: colors.gray[800], fontWeight: '600' }}>Check</Text>
              </Pressable>
              <Pressable disabled={busy || !check} onPress={() => run(false)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.md, backgroundColor: check ? BRAND : colors.gray[200] }}>
                <Text style={{ color: check ? '#fff' : colors.gray[600], fontWeight: '600' }}>
                  {check ? `Add ${Math.max(0, check.summary.ok - (skipDup ? check.summary.duplicates : 0))} items` : 'Check first'}
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

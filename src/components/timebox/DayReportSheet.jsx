import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Image, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import api from '../../api/client';
import Modal from '../Modal';
import useAi from '../../hooks/useAi';
import { useAuth } from '../../context/AuthContext';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, BRAND } from '../../theme/theme';
import { showToast } from '../../utils/events';
import { emptyReport, reportText, reportDate, withTotals, VERDICTS } from '../../utils/dayReport';
import { renderReportImage, canvasBlob } from '../../utils/reportImage';
import { summarize } from './model';

const noOutline = Platform.OS === 'web' ? { outlineStyle: 'none' } : null;

function Field({ label, children }) {
  const colors = useColors();
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: colors.gray[500] }}>{label}</Text>
      {children}
    </View>
  );
}

function Input({ style, ...props }) {
  const colors = useColors();
  return (
    <TextInput
      placeholderTextColor={colors.gray[400]}
      {...props}
      style={[{ borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: 7, fontSize: 14, color: colors.gray[900] }, noOutline, style]}
    />
  );
}

function Stepper({ label, value, onChange, color }) {
  const colors = useColors();
  const btn = (icon, delta) => (
    <Pressable onPress={() => onChange(Math.min(10, Math.max(1, value + delta)))} hitSlop={6} style={({ hovered }) => ({ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered ? colors.gray[200] : colors.gray[100] })}>
      <Ionicons name={icon} size={16} color={colors.gray[700]} />
    </Pressable>
  );
  return (
    <View style={{ flex: 1, minWidth: 150, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray[200], padding: spacing.sm, gap: 6 }}>
      <Text style={{ fontSize: 13, color: colors.gray[600], fontWeight: '600' }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {btn('remove', -1)}
        <Text style={{ fontSize: 26, fontWeight: '800', color }}>{value}<Text style={{ fontSize: 14, color: colors.gray[500] }}>/10</Text></Text>
        {btn('add', 1)}
      </View>
    </View>
  );
}

/**
 * The end-of-day report: drafted by the AI from the timebox, the work finished that day and a few notes, then
 * edited here. It shows as the message that gets copied or sent to WhatsApp, and as a picture.
 */
export default function DayReportSheet({ open, onClose, date, box, initial }) {
  const colors = useColors();
  const { user } = useAuth();
  const aiOn = useAi();
  const [report, setReport] = useState(initial || null);
  const [tab, setTab] = useState('text');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(true);
  const [picture, setPicture] = useState(null);
  const saveTimer = useRef(null);
  const dirty = useRef(false);

  useEffect(() => { setReport(initial || null); setSaved(true); dirty.current = false; }, [date]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open && initial && !report) setReport(initial); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    const s = summarize(box);
    return { planned: s.planned, done: s.done, priorities: box.priorities.filter((p) => p.text).length, priorities_done: box.priorities.filter((p) => p.done).length };
  }, [box]);
  const name = user?.name || '';
  const text = useMemo(() => (report ? reportText(report, { name, date }) : ''), [report, name, date]);

  // Edits are kept after a short pause, and before the window closes.
  const persist = useCallback(async (r) => {
    try {
      await api.put(`/timebox/day/${date}/report`, { report: r }, { __skipOops: true });
      dirty.current = false;
      setSaved(true);
    } catch (e) {
      showToast({ message: e?.response?.data?.error || 'The report was not saved', tone: 'error', icon: 'cloud-offline-outline' });
    }
  }, [date]);
  const latest = useRef(report);
  latest.current = report;
  const change = (fn) => {
    const next = withTotals(fn(latest.current));
    latest.current = next;
    setReport(next);
    dirty.current = true;
    setSaved(false);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persist(next), 800);
  };
  const close = () => {
    clearTimeout(saveTimer.current);
    if (dirty.current && latest.current) persist(latest.current);
    onClose();
  };

  const generate = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/timebox/day/${date}/report/generate`, { notes }, { timeout: 90000, __skipOops: true });
      setReport(res.data.report);
      setSaved(true);
      dirty.current = false;
    } catch (e) {
      showToast({ message: e?.response?.data?.error || 'Could not write the report', tone: 'error', icon: 'alert-circle' });
    } finally {
      setBusy(false);
    }
  };

  // The picture, redrawn a moment after the report changes while its tab is open.
  useEffect(() => {
    if (!open || tab !== 'picture' || !report || Platform.OS !== 'web') return undefined;
    const t = setTimeout(() => {
      try {
        const canvas = renderReportImage(report, { name, date, stats });
        setPicture({ uri: canvas.toDataURL('image/png'), ratio: canvas.width / canvas.height });
      } catch { setPicture(null); }
    }, 250);
    return () => clearTimeout(t);
  }, [open, tab, report, name, date, stats]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); showToast({ message: 'Report copied', icon: 'copy-outline', tone: 'success' }); } catch { showToast({ message: 'Could not copy. Select the text below and copy it.', tone: 'error' }); }
  };
  const whatsapp = () => { if (typeof window !== 'undefined') window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener'); };
  const pictureBlob = async () => canvasBlob(renderReportImage(report, { name, date, stats }));
  const download = async () => {
    const blob = await pictureBlob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `daily-report-${date}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const sharePicture = async () => {
    const blob = await pictureBlob();
    const file = new File([blob], `daily-report-${date}.png`, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], text }); } catch { /* cancelled */ }
    } else {
      await download();
      showToast({ message: 'Picture saved. Attach it in WhatsApp.', icon: 'image-outline' });
    }
  };

  const v = report ? VERDICTS[report.status] : null;
  const item = (i, fields) => change((r) => ({ ...r, items: r.items.map((x, j) => (j === i ? { ...x, ...fields } : x)) }));

  const action = (icon, label, onPress, primary) => (
    <Pressable onPress={onPress} style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: radius.md, backgroundColor: primary ? BRAND : hovered ? colors.gray[200] : colors.gray[100] })}>
      <Ionicons name={icon} size={16} color={primary ? '#fff' : colors.gray[800]} />
      <Text style={{ fontSize: 14, fontWeight: '600', color: primary ? '#fff' : colors.gray[800] }}>{label}</Text>
    </Pressable>
  );

  return (
    <Modal open={open} onClose={close} title={`Day report · ${reportDate(date)}`} width={760}>
      <ScrollView style={{ maxHeight: 640 }} contentContainerStyle={{ gap: spacing.md, padding: spacing.xs }} keyboardShouldPersistTaps="handled">
        {!report ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={{ fontSize: 14, color: colors.gray[700], lineHeight: 20 }}>
              The report is written from your timebox, the tasks you finished today and anything you add here. You can edit every line before you send it.
            </Text>
            <Field label="Anything else from today? (meetings, site visits, calls, what you decided)">
              <Input value={notes} onChangeText={setNotes} multiline placeholder="Met Varun in the morning about the task master. Visited the hospital site with Ashok..." style={{ minHeight: 100, textAlignVertical: 'top' }} />
            </Field>
            <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
              {aiOn && (
                <Pressable onPress={generate} disabled={busy} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: BRAND, paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.md, opacity: busy ? 0.7 : 1 }}>
                  {busy ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="sparkles" size={16} color="#fff" />}
                  <Text style={{ color: '#fff', fontWeight: '600' }}>{busy ? 'Writing…' : 'Write my report'}</Text>
                </Pressable>
              )}
              {action('create-outline', 'Start blank', () => setReport(emptyReport()))}
            </View>
            {!aiOn && <Text style={{ fontSize: 12, color: colors.gray[500] }}>AI is not switched on, so you will write the lines yourself.</Text>}
          </View>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 1, borderColor: colors.gray[200] }}>
              {[['text', 'Message'], ['picture', 'Picture']].map(([k, label]) => (
                <Pressable key={k} onPress={() => setTab(k)} style={{ paddingVertical: 8, borderBottomWidth: 2, borderColor: tab === k ? BRAND : 'transparent' }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: tab === k ? BRAND : colors.gray[600] }}>{label}</Text>
                </Pressable>
              ))}
              <View style={{ flex: 1 }} />
              <Text style={{ fontSize: 12, color: colors.gray[500] }}>{saved ? 'Saved' : 'Saving…'}</Text>
            </View>

            {tab === 'text' ? (
              <View style={{ gap: spacing.md }}>
                <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
                  <Stepper label="Productivity" value={report.productivity} onChange={(n) => change((r) => ({ ...r, productivity: n }))} color={colors.brand[600]} />
                  <Stepper label="Scale contribution" value={report.scale} onChange={(n) => change((r) => ({ ...r, scale: n }))} color={colors.purple[600]} />
                </View>
                <Text style={{ fontSize: 12, color: colors.gray[500], marginTop: -6 }}>Scale only goes up with a massive jump in what the group does. Small features count towards productivity, not scale.</Text>

                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  {Object.entries(VERDICTS).map(([k, val]) => {
                    const on = report.status === k;
                    return (
                      <Pressable key={k} onPress={() => change((r) => ({ ...r, status: k }))} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10, borderRadius: radius.md, borderWidth: 2, borderColor: on ? val.color : colors.gray[200], backgroundColor: on ? `${val.color}1f` : 'transparent' }}>
                        <Text style={{ fontSize: 20 }}>{val.emoji}</Text>
                        <Text style={{ fontWeight: '700', color: on ? val.color : colors.gray[600] }}>{k === 'goat' ? 'Failed' : 'Pottelu'}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Field label="Closing line"><Input value={report.status_line} onChangeText={(t) => change((r) => ({ ...r, status_line: t }))} multiline /></Field>

                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.gray[900] }}>What happened</Text>
                {report.items.map((it, i) => (
                  <View key={i} style={{ gap: 6, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray[200] }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Input value={it.title} onChangeText={(t) => item(i, { title: t })} placeholder="Heading" style={{ flex: 1, fontWeight: '600' }} />
                      <Pressable onPress={() => change((r) => ({ ...r, items: r.items.filter((_, j) => j !== i) }))} accessibilityLabel="Remove this line" hitSlop={6}>
                        <Ionicons name="trash-outline" size={18} color={colors.gray[500]} />
                      </Pressable>
                    </View>
                    <Input value={it.text} onChangeText={(t) => item(i, { text: t })} multiline placeholder="What happened" style={{ minHeight: 56, textAlignVertical: 'top' }} />
                  </View>
                ))}
                {report.items.length < 8 && (
                  <Pressable onPress={() => change((r) => ({ ...r, items: [...r.items, { title: '', text: '' }] }))} style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="add" size={16} color={BRAND} /><Text style={{ color: BRAND, fontWeight: '600' }}>Add a line</Text>
                  </Pressable>
                )}
                <Field label="Impact & Delegation"><Input value={report.impact} onChangeText={(t) => change((r) => ({ ...r, impact: t }))} multiline style={{ minHeight: 56, textAlignVertical: 'top' }} /></Field>

                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.gray[900] }}>Time saved</Text>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <View style={{ flex: 1 }}><Field label="Minutes per person per week"><Input keyboardType="numeric" value={String(report.time_saved.minutes_per_person || '')} onChangeText={(t) => change((r) => ({ ...r, time_saved: { ...r.time_saved, minutes_per_person: Number(t.replace(/[^\d.]/g, '')) || 0 } }))} /></Field></View>
                  <View style={{ flex: 1 }}><Field label="People it helps"><Input keyboardType="numeric" value={String(report.time_saved.people || '')} onChangeText={(t) => change((r) => ({ ...r, time_saved: { ...r.time_saved, people: Number(t.replace(/\D/g, '')) || 0 } }))} /></Field></View>
                  <View style={{ flex: 1 }}><Field label="Total hours a week"><Text style={{ paddingVertical: 9, fontSize: 16, fontWeight: '700', color: colors.green[600] }}>{report.time_saved.total_hours || 0} h</Text></Field></View>
                </View>
                <Field label="What saves the time"><Input value={report.time_saved.note} onChangeText={(t) => change((r) => ({ ...r, time_saved: { ...r.time_saved, note: t } }))} /></Field>

                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.gray[900] }}>Preview</Text>
                <View style={{ backgroundColor: colors.gray[50], borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray[200], padding: spacing.md }}>
                  <Text selectable style={{ fontSize: 14, lineHeight: 21, color: colors.gray[900] }}>{text}</Text>
                </View>
              </View>
            ) : (
              <View style={{ alignItems: 'center', gap: spacing.sm }}>
                {picture ? (
                  <Image source={{ uri: picture.uri }} resizeMode="contain" style={{ width: '100%', maxWidth: 520, aspectRatio: picture.ratio, borderRadius: radius.lg }} />
                ) : (
                  <ActivityIndicator color={BRAND} style={{ margin: spacing.xl }} />
                )}
                <Text style={{ fontSize: 12, color: colors.gray[500] }}>The picture follows the message. Change the lines on the Message tab.</Text>
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', alignItems: 'center' }}>
              {action('copy-outline', 'Copy message', copy, tab === 'text')}
              {action('logo-whatsapp', 'WhatsApp', whatsapp)}
              {Platform.OS === 'web' && action('download-outline', 'Save picture', download, tab === 'picture')}
              {Platform.OS === 'web' && action('share-outline', 'Share picture', sharePicture)}
              <View style={{ flex: 1 }} />
              {aiOn && action('sparkles-outline', busy ? 'Writing…' : 'Write again', () => { if (!busy) generate(); })}
            </View>
          </>
        )}
      </ScrollView>
    </Modal>
  );
}

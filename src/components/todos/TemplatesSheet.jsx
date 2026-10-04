import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import api from '../../api/client';
import { useColors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useTodos } from '../../context/TodoContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import BottomSheet from '../BottomSheet';
import DueDatePicker from '../DueDatePicker';
import { Chip } from '../kit';
import { formatDue, todayYmd } from '../../utils/dates';
import { parseOutline, countNodes } from '../../utils/templateOutline';
import { showToast, confirmDialog } from '../../utils/events';
import { openNotificationTarget } from '../../navigation/navigationRef';
import { glass } from '../../theme/glass';

const SCOPE_LABEL = { personal: 'Only me', business: 'My business', company: 'Everyone' };

function Preview({ tree, depth = 0, colors }) {
  return (tree || []).map((n, i) => (
    <View key={`${depth}-${i}-${n.title}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3, paddingLeft: depth * 16 }}>
        <Ionicons name={depth ? 'return-down-forward' : 'ellipse'} size={depth ? 12 : 7} color={colors.gray[400]} />
        <Text style={{ flex: 1, fontSize: fontSize.sm, color: colors.gray[800], fontWeight: depth ? '500' : '700' }} numberOfLines={1}>{n.title}</Text>
        {n.offset_days !== undefined && <Text style={{ fontSize: 11, color: colors.gray[400], fontWeight: '600' }}>day {n.offset_days}</Text>}
      </View>
      <Preview tree={n.children} depth={depth + 1} colors={colors} />
    </View>
  ));
}

/**
 * Templates: a saved set of tasks and sub-tasks you can start in one tap. Titles may use {month},
 * {year}, {date} and {week}; due dates are counted from the start day you pick.
 */
export default function TemplatesSheet({ visible, onClose, defaults = {} }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { businesses, fetchAssignees, fetchTodos } = useTodos();
  const [mode, setMode] = useState('list'); // list | use | new
  const [templates, setTemplates] = useState(null);
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState(null);
  const [start, setStart] = useState(todayYmd());
  const [dateOpen, setDateOpen] = useState(false);
  const [bizId, setBizId] = useState(null);
  const [assignId, setAssignId] = useState(null);
  const [people, setPeople] = useState([]);
  const [busy, setBusy] = useState(false);
  // new template
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [outline, setOutline] = useState('');
  const [scope, setScope] = useState('personal');
  const [scopeBiz, setScopeBiz] = useState(null);

  const load = useCallback(async () => {
    try {
      setTemplates((await api.get('/templates', { __skipOops: true })).data.templates);
    } catch {
      setTemplates([]);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    setMode('list'); setQuery(''); setChosen(null); setStart(todayYmd());
    setBizId(defaults.business_id ?? null); setAssignId(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, load]);

  useEffect(() => {
    setPeople([]);
    if (mode === 'use' && bizId) fetchAssignees(bizId).then(setPeople).catch(() => setPeople([]));
  }, [mode, bizId, fetchAssignees]);

  const shown = (templates || []).filter((t) => !query || t.name.toLowerCase().includes(query.toLowerCase()));

  const open = async (t) => {
    try {
      const full = (await api.get(`/templates/${t.id}`)).data.template;
      setChosen(full);
      setBizId(defaults.business_id ?? (full.scope === 'business' ? full.business_id : null));
      setMode('use');
    } catch {
      showToast({ message: 'Could not open that template', tone: 'error' });
    }
  };

  const use = async () => {
    if (!chosen || busy) return;
    setBusy(true);
    try {
      const res = await api.post(`/templates/${chosen.id}/use`, {
        start_date: start, business_id: bizId || undefined, assign_to: assignId || undefined,
      });
      await fetchTodos();
      showToast({ message: `Created ${res.data.created} task${res.data.created === 1 ? '' : 's'} from ${chosen.name}`, tone: 'success' });
      onClose();
      if (res.data.todo_id) openNotificationTarget({ todoId: res.data.todo_id });
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not use that template', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (t) => {
    const ok = await confirmDialog({ title: 'Delete template', message: `Delete "${t.name}"? Tasks already created from it stay.`, confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    try {
      await api.delete(`/templates/${t.id}`);
      load();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not delete it', tone: 'error' });
    }
  };

  const tree = useMemo(() => parseOutline(outline), [outline]);

  const save = async () => {
    if (!name.trim() || !tree.length || busy) return;
    setBusy(true);
    try {
      await api.post('/templates', { name, description: desc, scope, business_id: scope === 'business' ? scopeBiz : undefined, tree });
      showToast({ message: 'Template saved', tone: 'success' });
      setName(''); setDesc(''); setOutline('');
      await load();
      setMode('list');
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not save it', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const scopes = [['personal', 'Only me'], ...(businesses.length ? [['business', 'A business']] : []), ...(user?.is_leader ? [['company', 'Everyone']] : [])];

  return (
    <BottomSheet visible={visible} onClose={onClose} avoidKeyboard maxHeight={680}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.wrap}>
        <View style={styles.head}>
          {mode !== 'list' && (
            <AnimatedPressable onPress={() => setMode('list')} hitSlop={8}><Ionicons name="chevron-back" size={22} color={colors.gray[700]} /></AnimatedPressable>
          )}
          <Text style={styles.title}>{mode === 'new' ? 'New template' : mode === 'use' ? chosen?.name : 'Templates'}</Text>
          {mode === 'list' && (
            <AnimatedPressable style={styles.addBtn} onPress={() => setMode('new')}>
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={styles.addText}>New</Text>
            </AnimatedPressable>
          )}
        </View>

        {mode === 'list' && (
          <>
            <TextInput value={query} onChangeText={setQuery} placeholder="Search templates" placeholderTextColor={colors.gray[400]} {...glass('inset')} style={styles.input} />
            {templates === null && <Text style={styles.sub}>Loading...</Text>}
            {templates && shown.length === 0 && (
              <View style={styles.empty}>
                <Ionicons name="copy-outline" size={30} color={colors.gray[300]} />
                <Text style={styles.sub}>{templates.length ? 'No match.' : 'No templates yet. Create one, or open any to-do and choose "Save as template".'}</Text>
              </View>
            )}
            {shown.map((t) => (
              <AnimatedPressable key={t.id} style={styles.row} onPress={() => open(t)}>
                <View style={styles.rowIcon}><Ionicons name="copy" size={16} color={colors.brand[700]} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{t.name}</Text>
                  <Text style={styles.sub} numberOfLines={1}>
                    {t.item_count} task{t.item_count === 1 ? '' : 's'} · {t.scope === 'business' ? t.business_name : SCOPE_LABEL[t.scope]}
                    {t.uses ? ` · used ${t.uses}x` : ''}
                  </Text>
                  {!!t.description && <Text style={styles.sub} numberOfLines={1}>{t.description}</Text>}
                </View>
                {t.can_edit && (
                  <AnimatedPressable onPress={() => remove(t)} hitSlop={8}><Ionicons name="trash-outline" size={18} color={colors.gray[400]} /></AnimatedPressable>
                )}
                <Ionicons name="chevron-forward" size={16} color={colors.gray[300]} />
              </AnimatedPressable>
            ))}
          </>
        )}

        {mode === 'use' && chosen && (
          <>
            {!!chosen.description && <Text style={styles.sub}>{chosen.description}</Text>}
            <View {...glass('inset')} style={styles.preview}><Preview tree={chosen.tree} colors={colors} /></View>

            <Text style={styles.label}>Start day</Text>
            <AnimatedPressable {...glass('inset')} style={styles.dateBtn} onPress={() => setDateOpen(true)}>
              <Ionicons name="calendar-outline" size={16} color={colors.brand[600]} />
              <Text style={styles.dateText}>{formatDue(start)}</Text>
              <Text style={styles.sub}>due dates count from here</Text>
            </AnimatedPressable>

            {businesses.length > 0 && (
              <>
                <Text style={styles.label}>Where</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }} keyboardShouldPersistTaps="always">
                  <Chip small icon="person-outline" label="Personal" active={!bizId} onPress={() => { setBizId(null); setAssignId(null); }} />
                  {businesses.map((b) => <Chip key={b.id} small icon="briefcase-outline" label={b.name} active={bizId === b.id} onPress={() => { setBizId(b.id); setAssignId(null); }} />)}
                </ScrollView>
              </>
            )}
            {!!bizId && people.length > 0 && (
              <>
                <Text style={styles.label}>Give the main task to</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }} keyboardShouldPersistTaps="always">
                  <Chip small icon="people-outline" label="Open to the business" active={!assignId} onPress={() => setAssignId(null)} />
                  {people.map((p) => (
                    <Chip key={p.id} small icon="person" label={p.id === user?.id ? 'Me' : p.name.split(' ')[0]} active={assignId === p.id} onPress={() => setAssignId(p.id)} />
                  ))}
                </ScrollView>
              </>
            )}

            <AnimatedPressable onPress={use} haptic="medium" {...glass('accent')} style={[styles.primary, busy && { opacity: 0.6 }]}>
              <Ionicons name="flash" size={16} color="#fff" />
              <Text style={styles.primaryText}>{busy ? 'Creating...' : `Create ${chosen.item_count} task${chosen.item_count === 1 ? '' : 's'}`}</Text>
            </AnimatedPressable>
            <DueDatePicker visible={dateOpen} onClose={() => setDateOpen(false)} date={start} allowTime={false} onChange={({ date }) => date && setStart(date)} />
          </>
        )}

        {mode === 'new' && (
          <>
            <TextInput value={name} onChangeText={setName} placeholder="Name, e.g. Monthly GST filing" placeholderTextColor={colors.gray[400]} {...glass('inset')} style={styles.input} maxLength={120} />
            <TextInput value={desc} onChangeText={setDesc} placeholder="What it is for (optional)" placeholderTextColor={colors.gray[400]} {...glass('inset')} style={styles.input} maxLength={500} />
            <Text style={styles.label}>Tasks</Text>
            <TextInput
              value={outline}
              onChangeText={setOutline}
              placeholder={'One task per line. Indent two spaces for a sub-task.\nFile GST {month} +0d\n  Reconcile sales p1 +2d\n  Pay the tax +5d'}
              placeholderTextColor={colors.gray[400]}
              {...glass('inset')} style={[styles.input, styles.outline]}
              multiline
              autoCapitalize="none"
            />
            <Text style={styles.sub}>+3d = due 3 days after the start, p1 to p3 = priority. {'{month}'}, {'{year}'}, {'{date}'} and {'{week}'} fill in automatically.</Text>
            {tree.length > 0 && <View {...glass('inset')} style={styles.preview}><Preview tree={tree} colors={colors} /></View>}
            <Text style={styles.label}>Who can use it</Text>
            <View style={styles.chips}>
              {scopes.map(([key, label]) => <Chip key={key} small label={label} active={scope === key} onPress={() => setScope(key)} />)}
            </View>
            {scope === 'business' && (
              <View style={styles.chips}>
                {businesses.map((b) => <Chip key={b.id} small icon="briefcase-outline" label={b.name} active={scopeBiz === b.id} onPress={() => setScopeBiz(b.id)} />)}
              </View>
            )}
            <AnimatedPressable
              onPress={save}
              {...glass('accent')} style={[styles.primary, (!name.trim() || !tree.length || (scope === 'business' && !scopeBiz) || busy) && { opacity: 0.5 }]}
            >
              <Text style={styles.primaryText}>{busy ? 'Saving...' : `Save template (${countNodes(tree)} tasks)`}</Text>
            </AnimatedPressable>
          </>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

/** Save an existing to-do (with its sub-tasks) as a template. */
export function SaveTemplateSheet({ visible, onClose, todo }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { businesses } = useTodos();
  const [name, setName] = useState('');
  const [scope, setScope] = useState('personal');
  const [biz, setBiz] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) { setName(todo?.title || ''); setScope(todo?.business_id ? 'business' : 'personal'); setBiz(todo?.business_id || null); }
  }, [visible, todo]);

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await api.post(`/templates/from-todo/${todo.id}`, { name, scope, business_id: scope === 'business' ? biz : undefined });
      showToast({ message: 'Saved as a template', tone: 'success' });
      onClose();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not save the template', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} avoidKeyboard maxHeight={460}>
      <View style={styles.wrap}>
        <Text style={styles.title}>Save as template</Text>
        <Text style={styles.sub}>Everything below this to-do is saved too. Dates are kept as days from its due date.</Text>
        <TextInput value={name} onChangeText={setName} placeholder="Template name" placeholderTextColor={colors.gray[400]} {...glass('inset')} style={styles.input} maxLength={120} />
        <Text style={styles.label}>Who can use it</Text>
        <View style={styles.chips}>
          <Chip small label="Only me" active={scope === 'personal'} onPress={() => setScope('personal')} />
          {businesses.length > 0 && <Chip small label="A business" active={scope === 'business'} onPress={() => setScope('business')} />}
          {user?.is_leader && <Chip small label="Everyone" active={scope === 'company'} onPress={() => setScope('company')} />}
        </View>
        {scope === 'business' && (
          <View style={styles.chips}>
            {businesses.map((b) => <Chip key={b.id} small icon="briefcase-outline" label={b.name} active={biz === b.id} onPress={() => setBiz(b.id)} />)}
          </View>
        )}
        <AnimatedPressable onPress={save} {...glass('accent')} style={[styles.primary, (!name.trim() || (scope === 'business' && !biz) || busy) && { opacity: 0.5 }]}>
          <Text style={styles.primaryText}>{busy ? 'Saving...' : 'Save template'}</Text>
        </AnimatedPressable>
      </View>
    </BottomSheet>
  );
}

const createStyles = (colors) => StyleSheet.create({
  wrap: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1, fontSize: fontSize.lg, fontWeight: '800', color: colors.gray[900] },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.md, backgroundColor: colors.brand[600] },
  addText: { color: '#fff', fontWeight: '800', fontSize: fontSize.sm },
  sub: { fontSize: fontSize.xs, color: colors.gray[500], lineHeight: 16 },
  input: {
    borderWidth: 1, borderColor: colors.gray[200], borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 10,
    fontSize: fontSize.base, color: colors.gray[900], backgroundColor: colors.white,
  },
  outline: { minHeight: 140, textAlignVertical: 'top', fontFamily: 'monospace' },
  empty: { alignItems: 'center', gap: 8, paddingVertical: spacing.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.gray[100] },
  rowIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.brand[100], alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray[900] },
  preview: { padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.gray[50], maxHeight: 220, overflow: 'hidden' },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.gray[500] },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.brand[50] },
  dateText: { fontSize: fontSize.base, fontWeight: '800', color: colors.brand[700] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: radius.lg, backgroundColor: colors.brand[600], marginTop: spacing.sm },
  primaryText: { color: '#fff', fontSize: fontSize.base, fontWeight: '800' },
});

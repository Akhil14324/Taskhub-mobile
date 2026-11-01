import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import api from '../api/client';
import { useColors } from '../context/ThemeContext';
import { useChat } from '../context/ChatContext';
import { useTodos } from '../context/TodoContext';
import { spacing, radius, BRAND } from '../theme/theme';
import { glass } from '../theme/glass';
import useIsDesktop from '../hooks/useBreakpoint';
import useBoards from '../hooks/useBoards';
import BackTitle from '../components/BackTitle';
import Modal from '../components/Modal';
import TodoDetailSheet from '../components/todos/TodoDetailSheet';
import { WidgetCard, WIDGET_KINDS, FILTERS, BY } from '../components/dashboard/Widgets';
import { CHART_TYPES } from '../components/dashboard/Charts';
import { confirmDialog, showToast } from '../utils/events';

const inputStyle = (colors) => ({ borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, padding: spacing.sm, fontSize: 15, color: colors.gray[900], outlineStyle: 'none' });

function Chips({ options, value, onPick }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {options.map(([k, l]) => (
        <Pressable key={k} onPress={() => onPick(k)} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 1, borderColor: value === k ? BRAND : colors.gray[300], backgroundColor: value === k ? colors.brand[50] : 'transparent' }}>
          <Text style={{ fontSize: 13, color: value === k ? BRAND : colors.gray[700] }}>{l}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** New dashboard or its settings: name, which boards it reads, shared or not. */
function DashboardDialog({ open, onClose, dashboard, onSaved }) {
  const colors = useColors();
  const { boards } = useBoards();
  const [name, setName] = useState('');
  const [ids, setIds] = useState([]);
  const [shared, setShared] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName(dashboard?.name || '');
    setIds(dashboard?.board_ids || []);
    setShared(!!dashboard?.shared);
  }, [open, dashboard]);
  const save = async () => {
    if (!name.trim()) return;
    try {
      const body = { name: name.trim(), board_ids: ids, shared };
      const res = dashboard ? await api.patch(`/dashboards/${dashboard.id}`, body) : await api.post('/dashboards', body);
      onSaved(res.data.dashboard);
    } catch (e) {
      showToast({ message: e?.response?.data?.error || 'Could not save it', tone: 'error' });
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={dashboard ? 'Dashboard settings' : 'New dashboard'} width={520}>
      <View style={{ gap: spacing.md }}>
        <TextInput autoFocus value={name} onChangeText={setName} placeholder="Name, e.g. Infra this month" placeholderTextColor={colors.gray[400]} style={inputStyle(colors)} />
        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.gray[600] }}>Boards it reads</Text>
        <ScrollView style={{ maxHeight: 260 }}>
          {boards.map((b) => {
            const on = ids.includes(b.id);
            return (
              <Pressable key={b.id} onPress={() => setIds((s) => (on ? s.filter((x) => x !== b.id) : [...s, b.id]))} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, paddingHorizontal: 4 }}>
                <Ionicons name={on ? 'checkbox' : 'square-outline'} size={18} color={on ? BRAND : colors.gray[500]} />
                <Text style={{ flex: 1, fontSize: 14, color: colors.gray[900] }}>{b.name}</Text>
                <Text style={{ fontSize: 12, color: colors.gray[500] }}>{b.business_name || (b.scope === 'personal' ? 'Mine' : 'Leadership')}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Pressable onPress={() => setShared((s) => !s)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name={shared ? 'checkbox' : 'square-outline'} size={18} color={shared ? BRAND : colors.gray[500]} />
          <Text style={{ flex: 1, fontSize: 14, color: colors.gray[800] }}>Share it. Everyone sees only the items they are allowed to see.</Text>
        </Pressable>
        <Pressable {...glass('accent')} onPress={save} disabled={!name.trim()} style={{ backgroundColor: BRAND, opacity: name.trim() ? 1 : 0.5, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>{dashboard ? 'Save' : 'Create dashboard'}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

/** Add or change a widget: its kind, title, what it counts and how wide it is. */
function WidgetDialog({ open, onClose, dashboardId, widget, numberColumns, onSaved }) {
  const colors = useColors();
  const [kind, setKind] = useState('numbers');
  const [title, setTitle] = useState('');
  const [config, setConfig] = useState({});
  const [width, setWidth] = useState(1);
  useEffect(() => {
    if (!open) return;
    setKind(widget?.kind || 'numbers');
    setTitle(widget?.title || '');
    setConfig(widget?.config || {});
    setWidth(widget?.width || 1);
  }, [open, widget]);
  const set = (patch) => setConfig((c) => ({ ...c, ...patch }));
  const save = async () => {
    try {
      const body = { kind, title, config, width };
      if (widget) await api.patch(`/dashboards/${dashboardId}/widgets/${widget.id}`, body);
      else await api.post(`/dashboards/${dashboardId}/widgets`, body);
      onSaved();
    } catch (e) {
      showToast({ message: e?.response?.data?.error || 'Could not save it', tone: 'error' });
    }
  };
  const remove = async () => {
    const ok = await confirmDialog({ title: 'Remove this widget?', message: 'Only the widget goes. No item is touched.', confirmLabel: 'Remove' });
    if (!ok) return;
    await api.delete(`/dashboards/${dashboardId}/widgets/${widget.id}`).catch(() => {});
    onSaved();
  };
  const label = (t) => <Text style={{ fontSize: 12, fontWeight: '700', color: colors.gray[500] }}>{t}</Text>;
  return (
    <Modal open={open} onClose={onClose} title={widget ? 'Change widget' : 'Add a widget'} width={560}>
      <ScrollView style={{ maxHeight: 600 }} contentContainerStyle={{ gap: spacing.md }}>
        {!widget && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {WIDGET_KINDS.map(([k, l, icon, hint]) => (
              <Pressable key={k} onPress={() => setKind(k)} style={{ width: 160, padding: spacing.sm, gap: 3, borderRadius: radius.md, borderWidth: 1, borderColor: kind === k ? BRAND : colors.gray[300], backgroundColor: kind === k ? colors.brand[50] : 'transparent' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name={icon} size={15} color={kind === k ? BRAND : colors.gray[600]} /><Text style={{ fontSize: 14, fontWeight: '600', color: colors.gray[900] }}>{l}</Text></View>
                <Text style={{ fontSize: 12, color: colors.gray[600] }}>{hint}</Text>
              </Pressable>
            ))}
          </View>
        )}
        {label('TITLE')}
        <TextInput value={title} onChangeText={setTitle} placeholder={WIDGET_KINDS.find((x) => x[0] === kind)?.[1]} placeholderTextColor={colors.gray[400]} style={inputStyle(colors)} />
        {['numbers', 'chart', 'status', 'upcoming'].includes(kind) && (<>{label('WHICH ITEMS')}<Chips options={FILTERS} value={config.filter || 'all'} onPick={(v) => set({ filter: v })} /></>)}
        {kind === 'chart' && (
          <>
            {label('CHART TYPE')}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {CHART_TYPES.map(([k, l, icon]) => {
                const on = (config.chart || 'bar') === k;
                return (
                  <Pressable key={k} onPress={() => set({ chart: k })} style={{ width: 150, flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, borderRadius: radius.md, borderWidth: 1, borderColor: on ? BRAND : colors.gray[300], backgroundColor: on ? colors.brand[50] : 'transparent' }}>
                    <Ionicons name={icon} size={16} color={on ? BRAND : colors.gray[600]} />
                    <Text style={{ flex: 1, fontSize: 13, color: on ? BRAND : colors.gray[800] }}>{l}</Text>
                  </Pressable>
                );
              })}
            </View>
            {label('ALONG THE AXIS')}
            <Chips options={BY} value={config.by || 'status'} onPick={(v) => set({ by: v })} />
            {label('SPLIT EACH BY (stacked and line types)')}
            <Chips options={[['', 'Nothing'], ...BY.filter(([k]) => k !== (config.by || 'status'))]} value={config.series || ''} onPick={(v) => set({ series: v || undefined })} />
            <Pressable onPress={() => set({ legend: config.legend === false })} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name={config.legend === false ? 'square-outline' : 'checkbox'} size={18} color={config.legend === false ? colors.gray[500] : BRAND} /><Text style={{ fontSize: 14, color: colors.gray[800] }}>Show the legend</Text>
            </Pressable>
            <Pressable onPress={() => set({ labels: config.labels === false })} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name={config.labels === false ? 'square-outline' : 'checkbox'} size={18} color={config.labels === false ? colors.gray[500] : BRAND} /><Text style={{ fontSize: 14, color: colors.gray[800] }}>Show the numbers on the bars</Text>
            </Pressable>
          </>
        )}
        {kind === 'numbers' && (
          <>
            {label('COUNT OR ADD UP')}
            <Chips options={[['', 'Count items'], ...numberColumns.map((c) => [c, `Total of ${c}`])]} value={config.column || ''} onPick={(v) => set({ column: v || undefined })} />
            {!!config.column && <TextInput value={config.unit || ''} onChangeText={(t) => set({ unit: t })} placeholder="Unit, e.g. ₹ or kg" placeholderTextColor={colors.gray[400]} style={inputStyle(colors)} />}
            {!numberColumns.length && <Text style={{ fontSize: 12, color: colors.gray[500] }}>Add a Numbers column to a board to add up its values here.</Text>}
          </>
        )}
        {kind === 'text' && <TextInput value={config.text || ''} onChangeText={(t) => set({ text: t })} multiline placeholder="What should people read here?" placeholderTextColor={colors.gray[400]} style={[inputStyle(colors), { minHeight: 90, textAlignVertical: 'top' }]} />}
        {label('WIDTH')}
        <Chips options={[[1, 'Narrow'], [2, 'Wide'], [3, 'Full row']]} value={width} onPick={setWidth} />
        {label('HEIGHT')}
        <Chips options={[[0, 'Automatic'], [200, 'Short'], [300, 'Medium'], [440, 'Tall'], [600, 'Very tall']]} value={config.h || 0} onPick={(v) => set({ h: v || undefined })} />
        <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' }}>
          {widget && <Pressable onPress={remove} style={{ paddingHorizontal: 14, paddingVertical: 9 }}><Text style={{ color: colors.red[600], fontWeight: '600' }}>Remove</Text></Pressable>}
          <Pressable {...glass('accent')} onPress={save} style={{ backgroundColor: BRAND, borderRadius: radius.md, paddingHorizontal: 18, paddingVertical: 9 }}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>{widget ? 'Save' : 'Add widget'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Modal>
  );
}

/**
 * Dashboards (F-DSH): pages of widgets over one or more boards. Every number is computed on the server for the
 * person looking, so a shared dashboard never shows anyone more than they may see.
 */
export default function DashboardsScreen() {
  const colors = useColors();
  const desktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const { subscribe } = useChat();
  const { todos } = useTodos();
  const [list, setList] = useState(null);
  const [currentId, setCurrentId] = useState(route.params?.id || null);
  const [data, setData] = useState(null);
  const [dialog, setDialog] = useState(null); // 'new' | 'settings'
  const [widgetDialog, setWidgetDialog] = useState(null); // { widget? }
  const [openId, setOpenId] = useState(null);
  const [preview, setPreview] = useState(null); // { id, cols, h } while a widget is being stretched
  const gridW = useRef(0);

  const loadList = useCallback(async () => {
    try {
      const res = await api.get('/dashboards', { __skipOops: true });
      setList(res.data.dashboards);
      setCurrentId((c) => c || res.data.dashboards[0]?.id || null);
    } catch { setList([]); }
  }, []);
  const loadData = useCallback(async () => {
    if (!currentId) { setData(null); return; }
    try {
      const res = await api.get(`/dashboards/${currentId}/data`, { __skipOops: true });
      setData(res.data);
    } catch { setData(null); }
  }, [currentId]);
  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { setData(null); loadData(); }, [loadData]);
  // Numbers follow the work: a changed item refreshes the page (at most every 3 seconds).
  useEffect(() => {
    let t = null;
    const off = subscribe('todo:changed', () => { clearTimeout(t); t = setTimeout(loadData, 3000); });
    return () => { off(); clearTimeout(t); };
  }, [subscribe, loadData]);

  const openItem = (id) => {
    if (todos.some((t) => t.id === id)) setOpenId(id);
    else showToast({ message: 'Open it from its board', icon: 'information-circle' });
  };
  const archive = async () => {
    const ok = await confirmDialog({ title: `Archive "${data.dashboard.name}"?`, message: 'The dashboard goes away. No board or item is touched.', confirmLabel: 'Archive' });
    if (!ok) return;
    await api.patch(`/dashboards/${currentId}`, { archived: true }).catch(() => {});
    setCurrentId(null);
    loadList();
  };

  const saveWidget = useCallback(async (w, patch) => {
    try {
      await api.patch(`/dashboards/${currentId}/widgets/${w.id}`, patch);
      loadData();
    } catch (e) { showToast({ message: e?.response?.data?.error || 'Could not save it', tone: 'error' }); }
  }, [currentId, loadData]);
  // The corner grip stretches a widget: wider in whole columns, taller in any amount; saved when let go.
  const grip = (w, cols) => (el) => {
    if (!el || typeof el.addEventListener !== 'function' || el.__grip) return;
    el.__grip = true;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const card = el.parentElement;
      const startH = card.getBoundingClientRect().height;
      const x0 = e.clientX;
      const y0 = e.clientY;
      const colW = gridW.current / cols;
      const startCols = Math.min(w.width || 1, cols);
      let cur = { id: w.id, cols: startCols, h: Math.round(startH) };
      const move = (ev) => {
        cur = { id: w.id, cols: Math.min(cols, Math.max(1, Math.round(startCols + (ev.clientX - x0) / colW))), h: Math.min(900, Math.max(120, Math.round((startH + ev.clientY - y0) / 10) * 10)) };
        setPreview(cur);
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        setPreview(null);
        if (cur.cols !== startCols || Math.abs(cur.h - startH) > 6) saveWidget(w, { width: cur.cols, config: { ...(w.config || {}), h: cur.h } });
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  };

  const mine = !!data?.dashboard?.mine;
  const columnsPer = desktop ? 3 : 1;
  return (
    <View style={{ flex: 1, backgroundColor: colors.page, paddingTop: desktop ? 0 : insets.top }}>
      <View style={{ paddingHorizontal: desktop ? spacing.xl : spacing.md, paddingTop: spacing.md, gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View style={{ flex: 1 }}><BackTitle title="Dashboards" style={{ fontSize: desktop ? 26 : 22, fontWeight: '700', color: colors.gray[900] }} /></View>
          <Pressable {...glass('accent')} onPress={() => setDialog('new')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: BRAND, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.md }}>
            <Ionicons name="add" size={17} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '600' }}>New dashboard</Text>
          </Pressable>
        </View>
        {!!list?.length && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 2 }}>
            {list.map((d) => (
              <Pressable key={d.id} onPress={() => setCurrentId(d.id)} style={{ paddingVertical: 8, paddingHorizontal: spacing.md, borderBottomWidth: 2, borderColor: d.id === currentId ? BRAND : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {d.shared && <Ionicons name="people-outline" size={14} color={colors.gray[500]} />}
                <Text style={{ fontSize: 14, fontWeight: d.id === currentId ? '600' : '400', color: d.id === currentId ? colors.gray[900] : colors.gray[600] }}>{d.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
      {list === null ? <ActivityIndicator color={BRAND} style={{ marginTop: spacing.xl }} /> : !list.length ? (
        <View style={{ alignItems: 'center', gap: spacing.sm, padding: spacing.xl }}>
          <Ionicons name="speedometer-outline" size={36} color={colors.gray[400]} />
          <Text style={{ fontSize: 16, color: colors.gray[800] }}>No dashboards yet</Text>
          <Text style={{ fontSize: 14, color: colors.gray[500], textAlign: 'center' }}>Pick a few boards and see their numbers in one place: progress, stages, who carries what, what is late.</Text>
        </View>
      ) : !data ? <ActivityIndicator color={BRAND} style={{ marginTop: spacing.xl }} /> : (
        <ScrollView contentContainerStyle={{ padding: desktop ? spacing.xl : spacing.md, gap: spacing.md, paddingBottom: 140 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
            <Text style={{ flex: 1, fontSize: 13, color: colors.gray[600] }}>
              {data.boards.length ? `Reads ${data.boards.map((b) => b.name).join(', ')}` : 'Reads no board yet. Open the settings to pick some.'}
              {!mine && data.dashboard.owner_name ? ` · made by ${data.dashboard.owner_name}` : ''}
            </Text>
            {mine && (
              <>
                <Pressable onPress={() => setWidgetDialog({})} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Ionicons name="add-circle-outline" size={16} color={BRAND} /><Text style={{ color: BRAND, fontWeight: '600' }}>Add widget</Text></Pressable>
                <Pressable onPress={() => setDialog('settings')} accessibilityLabel="Settings" hitSlop={6}><Ionicons name="settings-outline" size={17} color={colors.gray[600]} /></Pressable>
                <Pressable onPress={archive} accessibilityLabel="Archive dashboard" hitSlop={6}><Ionicons name="archive-outline" size={17} color={colors.gray[600]} /></Pressable>
              </>
            )}
          </View>
          <View onLayout={(e) => { gridW.current = e.nativeEvent.layout.width; }} style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -spacing.sm / 2 }}>
            {data.widgets.map((w) => {
              const pv = preview && preview.id === w.id ? preview : null;
              const cols = pv ? pv.cols : Math.min(w.width || 1, columnsPer);
              return (
                <View key={w.id} style={{ width: `${(cols / columnsPer) * 100}%`, padding: spacing.sm / 2 }}>
                  <WidgetCard
                    widget={w} mine={mine} minHeight={pv ? pv.h : undefined} onEdit={(widget) => setWidgetDialog({ widget })} onOpenItem={openItem}
                    onRename={(widget, title) => saveWidget(widget, { title })} onGrip={desktop && mine ? grip(w, columnsPer) : undefined}
                  />
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
      <DashboardDialog
        open={!!dialog} onClose={() => setDialog(null)} dashboard={dialog === 'settings' ? data?.dashboard : null}
        onSaved={(d) => { setDialog(null); loadList(); setCurrentId(d.id); loadData(); }}
      />
      <WidgetDialog
        open={!!widgetDialog} onClose={() => setWidgetDialog(null)} dashboardId={currentId} widget={widgetDialog?.widget}
        numberColumns={data?.number_columns || []} onSaved={() => { setWidgetDialog(null); loadData(); }}
      />
      <TodoDetailSheet todoId={openId} onClose={() => setOpenId(null)} />
    </View>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Image, Modal, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import api from '../../api/client';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, BRAND } from '../../theme/theme';
import { timeAgo } from '../../utils/dates';
import { showToast, confirmDialog } from '../../utils/events';
import { pickFile } from '../todos/collab';
import BottomSheet from '../BottomSheet';
import AnimatedPressable from '../AnimatedPressable';
import RichText, { textToHtml } from './RichText';
import SheetGrid from './SheetGrid';
import { TEXT_TEMPLATES, SHEET_TEMPLATES } from './templates';

/** "23 Nov, 3:42 PM" (with the year when it is not this one). */
function editedAt(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const opts = { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleString(undefined, opts);
}

/** One picture, shown whole at its own proportions. Tap to see it large. */
function NotePicture({ image, onOpen, onRemove }) {
  const colors = useColors();
  const [ratio, setRatio] = useState(4 / 3);
  useEffect(() => {
    let live = true;
    Image.getSize(image.url, (w, h) => { if (live && w && h) setRatio(w / h); }, () => {});
    return () => { live = false; };
  }, [image.url]);
  return (
    <View style={{ borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.gray[200], backgroundColor: colors.gray[50] }}>
      <Pressable onPress={() => onOpen(image)} accessibilityLabel={`Picture ${image.filename}`}>
        <Image
          source={{ uri: image.url }}
          resizeMode="contain"
          style={{ width: '100%', aspectRatio: ratio, maxHeight: 520 }}
        />
      </Pressable>
      <Pressable onPress={() => onRemove(image)} accessibilityLabel="Remove this picture" hitSlop={8} style={({ hovered }) => ({ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.5)' })}>
        <Ionicons name="close" size={16} color="#fff" />
      </Pressable>
    </View>
  );
}

/**
 * The notepad: a list of notes and one open note. A note is either writing (a small word processor: headings,
 * text sizes, lists, tick lists, pictures) or a sheet (a grid for typing and exporting to Excel). A new one can
 * start empty or from a ready-made template. Everything saves itself as you type.
 */
export default function NotesPad({ desktop }) {
  const colors = useColors();
  const [notes, setNotes] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(false);
  const [show, setShow] = useState('all'); // all | text | sheet

  const load = useCallback(async () => {
    try {
      const res = await api.get('/notes', { params: q.trim() ? { q: q.trim() } : {}, __skipOops: true });
      setNotes(res.data.notes || []);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load your notes');
    }
  }, [q]);
  useEffect(() => { const t = setTimeout(load, q ? 250 : 0); return () => clearTimeout(t); }, [load, q]);

  const create = async (start = {}) => {
    try {
      const res = await api.post('/notes', start);
      setPicking(false);
      setNotes((cur) => [res.data.note, ...(cur || [])]);
      setOpenId(res.data.note.id);
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not start a note', tone: 'error' });
    }
  };

  const patchLocal = useCallback((note) => setNotes((cur) => (cur || []).map((n) => (n.id === note.id ? { ...n, ...note } : n))), []);
  const open = notes?.find((n) => n.id === openId) || null;
  const showList = desktop || !open;
  const showEditor = desktop || !!open;

  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      {showList && (
        <View style={{ width: desktop ? 340 : '100%', borderRightWidth: desktop ? 1 : 0, borderColor: colors.gray[200] }}>
          <View style={{ padding: spacing.md, gap: spacing.sm }}>
            <Pressable onPress={() => setPicking(true)} accessibilityLabel="New. Start a note or a sheet, empty or from a template." style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: BRAND, borderRadius: radius.md, paddingVertical: 10 }}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>New</Text>
            </Pressable>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, paddingHorizontal: spacing.sm }}>
              <Ionicons name="search" size={15} color={colors.gray[500]} />
              <TextInput value={q} onChangeText={setQ} placeholder="Search notes" placeholderTextColor={colors.gray[400]} style={{ flex: 1, paddingVertical: 8, fontSize: 14, color: colors.gray[900], outlineStyle: 'none' }} />
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {[['all', 'All'], ['text', 'Notes'], ['sheet', 'Sheets']].map(([k, label]) => (
                <Pressable key={k} onPress={() => setShow(k)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: show === k ? colors.brand[50] : colors.gray[100] }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: show === k ? colors.brand[700] : colors.gray[700] }}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: 120, gap: 6 }}>
            {!!error && <Text style={{ color: colors.red[600] }}>{error}</Text>}
            {notes === null && !error && <ActivityIndicator color={BRAND} style={{ marginTop: spacing.xl }} />}
            {notes && notes.length === 0 && <Text style={{ color: colors.gray[500], textAlign: 'center', padding: spacing.xl }}>{q ? 'No note matches.' : 'No notes yet. Start one.'}</Text>}
            {(notes || []).filter((n) => show === 'all' || (n.kind || 'text') === show).map((n) => {
              const active = n.id === openId;
              const sheet = n.kind === 'sheet';
              const line = (n.title || n.body.split('\n')[0] || '').trim();
              return (
                <Pressable key={n.id} onPress={() => setOpenId(n.id)} style={({ hovered }) => ({ flexDirection: 'row', gap: 10, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: active ? BRAND : colors.gray[200], backgroundColor: active ? colors.brand[50] : hovered ? colors.gray[50] : colors.white })}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name={sheet ? 'grid-outline' : 'document-text-outline'} size={13} color={colors.gray[500]} />
                      {n.pinned && <Ionicons name="pin" size={12} color={BRAND} />}
                      <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, fontWeight: '600', color: line ? colors.gray[900] : colors.gray[400] }}>{line || (sheet ? 'Empty sheet' : 'Empty note')}</Text>
                    </View>
                    <Text numberOfLines={2} style={{ fontSize: 13, color: colors.gray[600] }}>{(n.title ? n.body : n.body.split('\n').slice(1).join(' ')) || (n.images.length ? `${n.images.length} picture${n.images.length > 1 ? 's' : ''}` : '')}</Text>
                    <Text style={{ fontSize: 11, color: colors.gray[500] }}>{timeAgo(n.updated_at)}</Text>
                  </View>
                  {n.images[0] && <Image source={{ uri: n.images[0].url }} resizeMode="cover" style={{ width: 54, height: 54, borderRadius: radius.sm, backgroundColor: colors.gray[100] }} />}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}
      {showEditor && (
        <View style={{ flex: 1 }}>
          {open ? (
            <NoteEditor
              key={open.id} note={open} desktop={desktop}
              onBack={() => setOpenId(null)} onChanged={patchLocal}
              onDeleted={() => { setNotes((cur) => (cur || []).filter((n) => n.id !== open.id)); setOpenId(null); }}
            />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Ionicons name="document-text-outline" size={40} color={colors.gray[300]} />
              <Text style={{ color: colors.gray[500], fontSize: 15 }}>Pick a note, or start a new one.</Text>
            </View>
          )}
        </View>
      )}
      <NewNoteSheet visible={picking} onClose={() => setPicking(false)} onCreate={create} />
    </View>
  );
}

/** Start a note: writing or a sheet, empty or from a ready-made template. One press makes it and opens it. */
function NewNoteSheet({ visible, onClose, onCreate }) {
  const colors = useColors();
  const big = (icon, name, hint, start) => (
    <AnimatedPressable key={name} onPress={() => onCreate(start)} style={{ flex: 1, minWidth: 150, gap: 6, padding: spacing.lg, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.gray[200], backgroundColor: colors.white }}>
      <Ionicons name={icon} size={22} color={BRAND} />
      <Text style={{ fontSize: 15, fontWeight: '600', color: colors.gray[900] }}>{name}</Text>
      <Text style={{ fontSize: 12, color: colors.gray[500], lineHeight: 16 }}>{hint}</Text>
    </AnimatedPressable>
  );
  const row = (t, start) => (
    <AnimatedPressable key={t.key} onPress={() => onCreate(start)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10, paddingHorizontal: spacing.sm, borderRadius: radius.lg }}>
      <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: colors.gray[100], alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={t.icon} size={17} color={colors.gray[700]} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.gray[900] }}>{t.name}</Text>
        <Text numberOfLines={1} style={{ fontSize: 12, color: colors.gray[500] }}>{t.hint}</Text>
      </View>
    </AnimatedPressable>
  );
  const label = (text) => <Text style={{ fontSize: 12, fontWeight: '600', color: colors.gray[500], letterSpacing: 0.4, textTransform: 'uppercase', marginTop: spacing.md, marginBottom: 2 }}>{text}</Text>;
  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight={640}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl }}>
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.gray[900], marginBottom: spacing.md }}>New</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          {big('document-text-outline', 'Note', 'Writing with headings, lists and tick lists', { kind: 'text' })}
          {big('grid-outline', 'Sheet', 'A grid for typing, saved to Excel when you need it', { kind: 'sheet' })}
        </View>
        {label('Note templates')}
        {TEXT_TEMPLATES.map((t) => row(t, { kind: 'text', title: t.title, html: t.html }))}
        {label('Sheet templates')}
        {SHEET_TEMPLATES.map((t) => row(t, { kind: 'sheet', title: t.title, content: { rows: t.rows } }))}
      </ScrollView>
    </BottomSheet>
  );
}

function NoteEditor({ note, desktop, onBack, onChanged, onDeleted }) {
  const colors = useColors();
  const sheet = note.kind === 'sheet';
  const [title, setTitle] = useState(note.title);
  // What is being written: the markup of a text note, or the rows of a sheet. Kept in a ref (the editors own
  // their content while it is open), so typing never re-renders the whole note.
  const draft = useRef(sheet ? { content: { rows: note.content?.rows || [] } } : { html: note.html ?? textToHtml(note.body) });
  const [tick, setTick] = useState(0);
  const [images, setImages] = useState(note.images || []);
  const [state, setState] = useState('saved'); // saved | saving | error
  const [uploading, setUploading] = useState(0);
  const [big, setBig] = useState(null);
  const dirty = useRef(false);
  const latest = useRef({ title, ...draft.current });
  latest.current = { title, ...draft.current };
  const edited = useCallback((next) => { draft.current = next; dirty.current = true; setTick((n) => n + 1); }, []);
  const viewRef = useRef(null);

  const save = useCallback(async () => {
    setState('saving');
    try {
      const res = await api.patch(`/notes/${note.id}`, latest.current);
      onChanged({ id: note.id, title: res.data.note.title, body: res.data.note.body, html: res.data.note.html, content: res.data.note.content, updated_at: res.data.note.updated_at });
      dirty.current = false;
      setState('saved');
    } catch { setState('error'); }
  }, [note.id, onChanged]);

  // Save a moment after the last key, and when leaving the note.
  useEffect(() => {
    if (!dirty.current) return undefined;
    const t = setTimeout(save, 700);
    return () => clearTimeout(t);
  }, [title, tick, save]);
  useEffect(() => () => { if (dirty.current) api.patch(`/notes/${note.id}`, latest.current).catch(() => {}); }, [note.id]);

  // Closing the tab with a change still on its way: ask first, so nothing typed is lost.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const warn = (e) => { if (dirty.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const addFiles = useCallback(async (files) => {
    for (const file of files) {
      if (!String(file.type).startsWith('image/')) { showToast({ message: 'Notes take pictures only', tone: 'error' }); continue; }
      setUploading((n) => n + 1);
      try {
        const form = new FormData();
        form.append('file', file, file.name || 'picture.png');
        const res = await api.post(`/notes/${note.id}/images`, form, { timeout: 180000 });
        setImages((cur) => [...cur, res.data.image]);
        onChanged({ id: note.id, images: [...images, res.data.image], updated_at: new Date().toISOString() });
      } catch (err) {
        showToast({ message: err.response?.data?.error || 'Could not add the picture', tone: 'error' });
      } finally { setUploading((n) => n - 1); }
    }
  }, [note.id, images, onChanged]);

  // Paste a picture (Ctrl+V) or drop one on the note.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onPaste = (e) => {
      const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
      if (files.length) { e.preventDefault(); addFiles(files); }
    };
    window.addEventListener('paste', onPaste);
    const el = viewRef.current;
    const over = (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); };
    const drop = (e) => {
      const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
      if (files.length) { e.preventDefault(); addFiles(files); }
    };
    el?.addEventListener?.('dragover', over);
    el?.addEventListener?.('drop', drop);
    return () => { window.removeEventListener('paste', onPaste); el?.removeEventListener?.('dragover', over); el?.removeEventListener?.('drop', drop); };
  }, [addFiles]);

  const pick = async () => { const f = await pickFile(); if (f) addFiles([f]); };
  const removeImage = async (img) => {
    setImages((cur) => cur.filter((i) => i.id !== img.id));
    try { await api.delete(`/notes/${note.id}/images/${img.id}`); onChanged({ id: note.id, images: images.filter((i) => i.id !== img.id) }); } catch { showToast({ message: 'Could not remove it', tone: 'error' }); }
  };
  const togglePin = async () => {
    const pinned = !note.pinned;
    onChanged({ id: note.id, pinned });
    try { await api.patch(`/notes/${note.id}`, { pinned }); } catch { onChanged({ id: note.id, pinned: !pinned }); }
  };
  const remove = async () => {
    const ok = await confirmDialog({ title: 'Delete this note?', message: 'The note and its pictures will be removed.', confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    try { await api.delete(`/notes/${note.id}`); dirty.current = false; onDeleted(); } catch { showToast({ message: 'Could not delete it', tone: 'error' }); }
  };

  return (
    <View ref={viewRef} style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: 1, borderColor: colors.gray[200] }}>
        {!desktop && <Pressable onPress={() => { if (dirty.current) save(); onBack(); }} accessibilityLabel="Back to notes" hitSlop={8}><Ionicons name="chevron-back" size={22} color={colors.gray[700]} /></Pressable>}
        <Text style={{ flex: 1, fontSize: 12, color: state === 'error' ? colors.red[600] : colors.gray[500] }}>
          {state === 'saving' ? 'Saving...' : state === 'error' ? 'Could not save. Check your connection.' : `Saved · Last edited ${editedAt(note.updated_at)}`}
        </Text>
        {!sheet && (
          <Pressable onPress={pick} accessibilityLabel="Add a picture. You can also paste or drop one." style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.md, backgroundColor: hovered ? colors.gray[100] : 'transparent' })}>
            <Ionicons name="image-outline" size={18} color={colors.gray[700]} />
            <Text style={{ fontSize: 14, color: colors.gray[800] }}>Picture</Text>
          </Pressable>
        )}
        <Pressable onPress={togglePin} accessibilityLabel={note.pinned ? 'Unpin' : 'Pin to the top'} hitSlop={6} style={{ padding: 6 }}>
          <Ionicons name={note.pinned ? 'pin' : 'pin-outline'} size={18} color={note.pinned ? BRAND : colors.gray[600]} />
        </Pressable>
        <Pressable onPress={remove} accessibilityLabel="Delete this note" hitSlop={6} style={{ padding: 6 }}>
          <Ionicons name="trash-outline" size={18} color={colors.gray[600]} />
        </Pressable>
      </View>
      {sheet ? (
        <View style={{ flex: 1, padding: desktop ? spacing.xl : spacing.md, gap: spacing.md }}>
          <TextInput
            value={title} onChangeText={(t) => { dirty.current = true; setTitle(t); }} placeholder="Name this sheet"
            placeholderTextColor={colors.gray[400]}
            style={{ fontSize: 22, fontWeight: '700', color: colors.gray[900], outlineStyle: 'none', paddingVertical: 4 }}
          />
          <SheetGrid initialRows={note.content?.rows} title={title} onChange={(rows) => edited({ content: { rows } })} />
        </View>
      ) : (
      <ScrollView contentContainerStyle={{ padding: desktop ? spacing.xl : spacing.lg, paddingBottom: 160, gap: spacing.md, maxWidth: 860, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        <TextInput
          value={title} onChangeText={(t) => { dirty.current = true; setTitle(t); }} placeholder="Title"
          placeholderTextColor={colors.gray[400]}
          style={{ fontSize: 26, fontWeight: '700', color: colors.gray[900], outlineStyle: 'none', paddingVertical: 4 }}
        />
        <RichText initialHtml={draft.current.html} placeholder="Start writing. Paste or drop a picture to add it." onChange={(html) => edited({ html })} />
        {images.map((img) => <NotePicture key={img.id} image={img} onOpen={setBig} onRemove={removeImage} />)}
        {uploading > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator color={BRAND} />
            <Text style={{ color: colors.gray[600], fontSize: 14 }}>Adding picture{uploading > 1 ? 's' : ''}...</Text>
          </View>
        )}
      </ScrollView>
      )}
      {big && (
        <Modal transparent visible animationType="fade" onRequestClose={() => setBig(null)}>
          <Pressable onPress={() => setBig(null)} accessibilityLabel="Close picture" style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
            <Image source={{ uri: big.url }} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

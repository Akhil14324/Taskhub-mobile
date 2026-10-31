import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Image, Modal, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import api from '../../api/client';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, BRAND } from '../../theme/theme';
import { timeAgo } from '../../utils/dates';
import { showToast, confirmDialog } from '../../utils/events';
import { pickFile } from '../todos/collab';

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
 * The notepad: a list of notes and one open note with a title, text and pictures. Nothing else. Pictures can be
 * added with the button, pasted (Ctrl+V) or dropped on the note. A note saves itself as you type.
 */
export default function NotesPad({ desktop }) {
  const colors = useColors();
  const [notes, setNotes] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

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

  const create = async () => {
    try {
      const res = await api.post('/notes', {});
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
            <Pressable onPress={create} accessibilityLabel="New note. Starts an empty note." style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: BRAND, borderRadius: radius.md, paddingVertical: 10 }}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>New note</Text>
            </Pressable>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, paddingHorizontal: spacing.sm }}>
              <Ionicons name="search" size={15} color={colors.gray[500]} />
              <TextInput value={q} onChangeText={setQ} placeholder="Search notes" placeholderTextColor={colors.gray[400]} style={{ flex: 1, paddingVertical: 8, fontSize: 14, color: colors.gray[900], outlineStyle: 'none' }} />
            </View>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: 120, gap: 6 }}>
            {!!error && <Text style={{ color: colors.red[600] }}>{error}</Text>}
            {notes === null && !error && <ActivityIndicator color={BRAND} style={{ marginTop: spacing.xl }} />}
            {notes && notes.length === 0 && <Text style={{ color: colors.gray[500], textAlign: 'center', padding: spacing.xl }}>{q ? 'No note matches.' : 'No notes yet. Start one.'}</Text>}
            {(notes || []).map((n) => {
              const active = n.id === openId;
              const line = (n.title || n.body.split('\n')[0] || '').trim();
              return (
                <Pressable key={n.id} onPress={() => setOpenId(n.id)} style={({ hovered }) => ({ flexDirection: 'row', gap: 10, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: active ? BRAND : colors.gray[200], backgroundColor: active ? colors.brand[50] : hovered ? colors.gray[50] : colors.white })}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {n.pinned && <Ionicons name="pin" size={12} color={BRAND} />}
                      <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, fontWeight: '600', color: line ? colors.gray[900] : colors.gray[400] }}>{line || 'Empty note'}</Text>
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
    </View>
  );
}

function NoteEditor({ note, desktop, onBack, onChanged, onDeleted }) {
  const colors = useColors();
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [images, setImages] = useState(note.images || []);
  const [state, setState] = useState('saved'); // saved | saving | error
  const [uploading, setUploading] = useState(0);
  const [big, setBig] = useState(null);
  const dirty = useRef(false);
  const latest = useRef({ title, body });
  latest.current = { title, body };
  const viewRef = useRef(null);

  const save = useCallback(async () => {
    setState('saving');
    try {
      const res = await api.patch(`/notes/${note.id}`, latest.current);
      onChanged({ id: note.id, title: res.data.note.title, body: res.data.note.body, updated_at: res.data.note.updated_at });
      dirty.current = false;
      setState('saved');
    } catch { setState('error'); }
  }, [note.id, onChanged]);

  // Save a moment after the last key, and when leaving the note.
  useEffect(() => {
    if (!dirty.current) return undefined;
    const t = setTimeout(save, 700);
    return () => clearTimeout(t);
  }, [title, body, save]);
  useEffect(() => () => { if (dirty.current) api.patch(`/notes/${note.id}`, latest.current).catch(() => {}); }, [note.id]);

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
          {state === 'saving' ? 'Saving...' : state === 'error' ? 'Could not save. Check your connection.' : `Saved · ${timeAgo(note.updated_at)}`}
        </Text>
        <Pressable onPress={pick} accessibilityLabel="Add a picture. You can also paste or drop one." style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.md, backgroundColor: hovered ? colors.gray[100] : 'transparent' })}>
          <Ionicons name="image-outline" size={18} color={colors.gray[700]} />
          <Text style={{ fontSize: 14, color: colors.gray[800] }}>Picture</Text>
        </Pressable>
        <Pressable onPress={togglePin} accessibilityLabel={note.pinned ? 'Unpin' : 'Pin to the top'} hitSlop={6} style={{ padding: 6 }}>
          <Ionicons name={note.pinned ? 'pin' : 'pin-outline'} size={18} color={note.pinned ? BRAND : colors.gray[600]} />
        </Pressable>
        <Pressable onPress={remove} accessibilityLabel="Delete this note" hitSlop={6} style={{ padding: 6 }}>
          <Ionicons name="trash-outline" size={18} color={colors.gray[600]} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 160, gap: spacing.md, maxWidth: 860, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        <TextInput
          value={title} onChangeText={(t) => { dirty.current = true; setTitle(t); }} placeholder="Title"
          placeholderTextColor={colors.gray[400]}
          style={{ fontSize: 26, fontWeight: '700', color: colors.gray[900], outlineStyle: 'none', paddingVertical: 4 }}
        />
        <TextInput
          value={body} onChangeText={(t) => { dirty.current = true; setBody(t); }} placeholder="Start writing. Paste or drop a picture to add it here."
          placeholderTextColor={colors.gray[400]} multiline
          style={{ fontSize: 16, lineHeight: 24, color: colors.gray[900], outlineStyle: 'none', minHeight: 140, textAlignVertical: 'top' }}
        />
        {images.map((img) => <NotePicture key={img.id} image={img} onOpen={setBig} onRemove={removeImage} />)}
        {uploading > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator color={BRAND} />
            <Text style={{ color: colors.gray[600], fontSize: 14 }}>Adding picture{uploading > 1 ? 's' : ''}...</Text>
          </View>
        )}
      </ScrollView>
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

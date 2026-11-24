import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import api from '../../api/client';
import { useColors } from '../../context/ThemeContext';
import { radius, BRAND } from '../../theme/theme';
import { timeAgo } from '../../utils/dates';
import { Avatar, Tr } from '../kit';
import Popover, { anchorOf } from './Popover';

export const COMMENTS_W = 220;

/** The whole thread of a task, with a box to answer, right where the person is looking. */
function Thread({ todoId, onPosted }) {
  const colors = useColors();
  const [list, setList] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const load = useCallback(async () => {
    try { setList((await api.get(`/todos/${todoId}/comments`, { __skipOops: true })).data.comments || []); } catch { setList([]); }
  }, [todoId]);
  useEffect(() => { load(); }, [load]);
  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try { await api.post(`/todos/${todoId}/comments`, { body }); setText(''); await load(); onPosted?.(); } finally { setSending(false); }
  };
  return (
    <View style={{ gap: 8 }}>
      <ScrollView style={{ maxHeight: 300 }} contentContainerStyle={{ gap: 10 }}>
        {list === null && <Text style={{ color: colors.gray[500], fontSize: 13 }}>Loading...</Text>}
        {list && !list.length && <Text style={{ color: colors.gray[500], fontSize: 13 }}>No updates yet.</Text>}
        {(list || []).map((c) => (
          <View key={c.id} style={{ flexDirection: 'row', gap: 8 }}>
            <Avatar name={c.user_name} uri={c.user_picture} size={24} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, color: colors.gray[500] }}><Text style={{ fontWeight: '700', color: colors.gray[800] }}>{c.user_name || 'Someone'}</Text> · {timeAgo(c.created_at)}</Text>
              <Text style={{ fontSize: 14, color: colors.gray[900] }}><Tr>{c.body}</Tr></Text>
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
        <TextInput value={text} onChangeText={setText} onSubmitEditing={send} placeholder="Write an update..." placeholderTextColor={colors.gray[400]} accessibilityLabel="Write an update"
          style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray[200], fontSize: 14, color: colors.gray[900], outlineStyle: 'none' }} />
        <Pressable onPress={send} accessibilityLabel="Send update" style={{ padding: 8, borderRadius: radius.md, backgroundColor: text.trim() ? BRAND : colors.gray[200] }}>
          <Ionicons name="send" size={15} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

/**
 * The "Comments" column: the latest comment in a small box. Hover (or click) opens the whole thread with a box to
 * answer, without opening the task.
 */
export default function CommentsCell({ item, height }) {
  const colors = useColors();
  const [pop, setPop] = useState(null);
  const hover = useRef(null);
  const last = item.latest_comment;
  const count = item.comment_count || 0;
  const open = (e) => setPop({ anchor: anchorOf(e) });
  return (
    <>
      <Pressable
        onPress={open}
        onHoverIn={(e) => { clearTimeout(hover.current); hover.current = setTimeout(() => open(e), 450); }}
        onHoverOut={() => clearTimeout(hover.current)}
        accessibilityLabel={`Comments of ${item.title}`}
        style={({ hovered }) => ({ width: COMMENTS_W, height, paddingHorizontal: 8, justifyContent: 'center', borderRightWidth: 1, borderColor: colors.gray[200], backgroundColor: hovered ? colors.gray[50] : 'transparent' })}
      >
        {count > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="chatbubble-ellipses" size={14} color={BRAND} />
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 12.5, color: colors.gray[700] }}>
              {last ? <><Text style={{ fontWeight: '600' }}>{String(last.author || '').split(' ')[0]}: </Text><Tr>{last.body}</Tr></> : `${count} comment${count === 1 ? '' : 's'}`}
            </Text>
            {count > 1 && <Text style={{ fontSize: 11, color: colors.gray[500] }}>+{count - 1}</Text>}
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="chatbubble-outline" size={14} color={colors.gray[400]} />
            <Text style={{ fontSize: 12.5, color: colors.gray[400] }}>Add an update</Text>
          </View>
        )}
      </Pressable>
      {pop && (
        <Popover visible anchor={pop.anchor} onClose={() => setPop(null)} width={360}>
          <Thread todoId={item.id} />
        </Popover>
      )}
    </>
  );
}

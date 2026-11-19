import { useMemo, useRef, useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import { createPortal } from 'react-dom';
import { useColors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { radius, spacing } from '../../theme/theme';
import { Avatar } from '../kit';
import useDirectory, { filterPeople } from '../../hooks/useDirectory';
import { activeMentionQuery, completeMention } from '../../utils/quickAdd';

/**
 * The "+ Add task" / "+ Add subitem" line of a board. Typing "@" lists the people (name, username) and a
 * pick writes "@username " into the title; the server turns the @names in a title into task members.
 * Enter picks the highlighted person while the list is open, otherwise it adds the task.
 */
export default function MentionAddInput({ onSubmit, style, autoFocus, placeholder, accessibilityLabel, initialValue = '', keep = false, selectTextOnFocus, onBlurText, onEscape }) {
  const colors = useColors();
  const { user } = useAuth();
  const { people } = useDirectory();
  const [text, setText] = useState(initialValue);
  const [hi, setHi] = useState(0);
  const [rect, setRect] = useState(null);
  const box = useRef(null);

  const query = activeMentionQuery(text);
  const list = useMemo(
    () => (query === null ? [] : filterPeople(people, query, { excludeIds: [user?.id], limit: 6 })),
    [query, people, user?.id],
  );
  const open = list.length > 0 && !!rect;

  const measure = () => {
    const r = box.current?.getBoundingClientRect?.();
    if (r) setRect({ left: r.left, top: r.top, bottom: r.bottom, width: r.width });
  };
  const change = (t) => { setText(t); setHi(0); measure(); };
  const pick = (p) => { setText(completeMention(text, p.username)); setHi(0); };
  const submit = () => {
    if (open) { pick(list[Math.min(hi, list.length - 1)]); return; }
    if (text.trim() || keep) { onSubmit(text.trim()); if (!keep) setText(''); }
  };
  const onKeyPress = (e) => {
    const k = e.nativeEvent?.key;
    if (k === 'Escape') { onEscape?.(); return; }
    if (!open) return;
    if (k === 'ArrowDown') { e.preventDefault?.(); setHi((i) => (i + 1) % list.length); }
    else if (k === 'ArrowUp') { e.preventDefault?.(); setHi((i) => (i - 1 + list.length) % list.length); }
    else if (k === 'Tab') { e.preventDefault?.(); pick(list[Math.min(hi, list.length - 1)]); }
  };

  const below = rect && typeof window !== 'undefined' ? window.innerHeight - rect.bottom : 0;
  const placeUp = rect && below < 240 && rect.top > below;

  return (
    <View ref={box} style={{ flex: 1 }}>
      <TextInput
        value={text}
        onChangeText={change}
        autoFocus={autoFocus}
        placeholder={placeholder}
        placeholderTextColor={colors.gray[400]}
        accessibilityLabel={accessibilityLabel || placeholder}
        onSubmitEditing={submit}
        onKeyPress={onKeyPress}
        selectTextOnFocus={selectTextOnFocus}
        onBlur={() => onBlurText?.(text)}
        blurOnSubmit={false}
        style={style}
      />
      {open && typeof document !== 'undefined' && createPortal(
        <View
          // Keep the focus in the box while a person is clicked.
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: 'fixed', left: rect.left, width: Math.max(rect.width, 260), zIndex: 100000,
            top: placeUp ? undefined : rect.bottom + 4, bottom: placeUp ? window.innerHeight - rect.top + 4 : undefined,
            backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.gray[200],
            paddingVertical: spacing.xs, boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          }}
        >
          {list.map((p, i) => (
            <View
              key={p.id}
              onClick={() => pick(p)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 7, cursor: 'pointer', backgroundColor: i === hi ? colors.gray[100] : 'transparent' }}
            >
              <Avatar name={p.name} uri={p.profile_picture} size={26} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '600', color: colors.gray[900] }}>{p.name}</Text>
                <Text numberOfLines={1} style={{ fontSize: 12, color: colors.gray[500] }}>@{p.username}</Text>
              </View>
            </View>
          ))}
        </View>,
        document.body,
      )}
    </View>
  );
}

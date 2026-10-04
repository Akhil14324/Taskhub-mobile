import { useMemo } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useTodos } from '../../context/TodoContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import { Avatar } from '../kit';
import useDirectory, { filterPeople } from '../../hooks/useDirectory';
import { activeMentionQuery, completeMention } from '../../utils/quickAdd';
import { glass } from '../../theme/glass';

const TAG_ICON = { user: 'person', todo: 'checkbox-outline', business: 'business' };

/** "@name" on its own, or "@name" with other words after it, anywhere in the text. */
const stripActiveMention = (text) => String(text || '').replace(/(^|\s)@([A-Za-z0-9._-]{0,30})$/, '$1');

/**
 * A text box where "@" tags things: people (adds @username to the text), to-dos and whole businesses
 * (a business tags everyone in it). Picked tags are chips under the box; `tags` is
 * [{ type: 'user' | 'todo' | 'business', id, label }] and goes to the server as `mentions`.
 */
export default function TagInput({
  value, onChangeText, tags, onTagsChange, placeholder, excludeTodoIds = [], minHeight = 70, autoFocus,
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { todos, businesses } = useTodos();
  const { people } = useDirectory();

  const query = activeMentionQuery(value);
  const has = (type, id) => tags.some((t) => t.type === type && t.id === id);

  const suggestions = useMemo(() => {
    if (query === null) return [];
    const q = query.toLowerCase();
    const out = [];
    filterPeople(people, q, { excludeIds: [user?.id], limit: 4 }).forEach((p) => {
      if (!has('user', p.id)) out.push({ type: 'user', id: p.id, label: p.name, sub: `@${p.username}${p.display_title ? ` · ${p.display_title}` : ''}`, person: p });
    });
    (businesses || [])
      .filter((b) => !q || b.name.toLowerCase().includes(q))
      .slice(0, 3)
      .forEach((b) => { if (!has('business', b.id)) out.push({ type: 'business', id: b.id, label: b.name, sub: 'Tags everyone in this business' }); });
    (todos || [])
      .filter((t) => !t.is_done && !excludeTodoIds.includes(t.id) && (!q || t.title.toLowerCase().includes(q)))
      .slice(0, 4)
      .forEach((t) => { if (!has('todo', t.id)) out.push({ type: 'todo', id: t.id, label: t.title, sub: t.business_name || 'Personal to-do' }); });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, people, businesses, todos, tags, user?.id]);

  const pick = (s) => {
    if (s.type === 'user') onChangeText(completeMention(value, s.person.username));
    else onChangeText(stripActiveMention(value));
    onTagsChange([...tags.filter((t) => !(t.type === s.type && t.id === s.id)), { type: s.type, id: s.id, label: s.label }]);
  };

  return (
    <View>
      {tags.length > 0 && (
        <View style={styles.chips}>
          {tags.map((t) => (
            <AnimatedPressable key={`${t.type}:${t.id}`} onPress={() => onTagsChange(tags.filter((x) => x !== t))} haptic="light" style={styles.chip}>
              <Ionicons name={TAG_ICON[t.type]} size={13} color={colors.brand[700]} />
              <Text style={styles.chipText} numberOfLines={1}>{t.label}</Text>
              <Ionicons name="close" size={13} color={colors.brand[700]} />
            </AnimatedPressable>
          ))}
        </View>
      )}
      <View>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.gray[400]}
          {...glass('inset')} style={[styles.input, { minHeight }]}
          multiline
          autoFocus={autoFocus}
        />
        <AnimatedPressable
          onPress={() => onChangeText(`${value}${value && !/\s$/.test(value) ? ' ' : ''}@`)}
          haptic="light"
          hitSlop={8}
          style={styles.atBtn}
        >
          <Ionicons name="at" size={18} color={colors.brand[600]} />
        </AnimatedPressable>
      </View>
      {suggestions.length > 0 && (
        <View {...glass('card')} style={styles.box}>
          {suggestions.map((s) => (
            <AnimatedPressable key={`${s.type}:${s.id}`} onPress={() => pick(s)} haptic="light" style={styles.row}>
              {s.type === 'user'
                ? <Avatar name={s.label} uri={s.person.profile_picture} size={28} />
                : <View style={styles.iconBubble}><Ionicons name={TAG_ICON[s.type]} size={15} color={colors.brand[700]} /></View>}
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>{s.label}</Text>
                <Text style={styles.rowSub} numberOfLines={1}>{s.sub}</Text>
              </View>
            </AnimatedPressable>
          ))}
        </View>
      )}
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: spacing.sm, marginTop: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 220, paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.full, backgroundColor: colors.brand[50] },
  chipText: { flexShrink: 1, fontSize: fontSize.sm, fontWeight: '700', color: colors.brand[700] },
  input: {
    marginHorizontal: spacing.sm,
    marginTop: spacing.sm,
    backgroundColor: colors.gray[100],
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingTop: 11,
    paddingBottom: 11,
    paddingRight: 40,
    fontSize: fontSize.base,
    color: colors.gray[900],
    textAlignVertical: 'top',
    outlineStyle: 'none',
  },
  atBtn: { position: 'absolute', right: spacing.sm + 10, top: spacing.sm + 10 },
  box: {
    marginHorizontal: spacing.sm,
    marginTop: spacing.xs,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gray[200],
    paddingVertical: spacing.xs,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: 7 },
  iconBubble: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand[50] },
  rowTitle: { fontSize: fontSize.base, fontWeight: '600', color: colors.gray[900] },
  rowSub: { fontSize: fontSize.sm, color: colors.gray[500] },
});

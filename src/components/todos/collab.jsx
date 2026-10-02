import { useState } from 'react';
import { View, Text, StyleSheet, Image, Linking, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import api from '../../api/client';

/** Reactions are icons (never emoji). Keys match the backend's list. */
export const REACTIONS = [
  { kind: 'like', icon: 'thumbs-up', label: 'Like' },
  { kind: 'love', icon: 'heart', label: 'Love' },
  { kind: 'done', icon: 'checkmark-circle', label: 'Done' },
  { kind: 'fire', icon: 'flame', label: 'On fire' },
  { kind: 'idea', icon: 'bulb', label: 'Good idea' },
  { kind: 'thanks', icon: 'sparkles', label: 'Thanks' },
];
const REACTION_BY_KIND = Object.fromEntries(REACTIONS.map((r) => [r.kind, r]));

const MENTION = /(@[A-Za-z0-9._-]{2,50})/g;

/** Comment text with @mentions picked out. */
export function RichText({ text, style, mentionStyle }) {
  const parts = String(text || '').split(MENTION);
  return (
    <Text style={style}>
      {parts.map((part, i) => (i % 2 === 1 ? <Text key={i} style={mentionStyle}>{part}</Text> : part))}
    </Text>
  );
}

export function fileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/** Open a browser file picker (web). Resolves with a File, or null if none was chosen. */
export function pickFile() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = () => resolve(input.files && input.files[0] ? input.files[0] : null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/** Upload a file to a to-do. `forComment` keeps it a draft until the comment that carries it is posted. */
export async function uploadAttachment(todoId, file, forComment) {
  const form = new FormData();
  form.append('file', file, file.name);
  const res = await api.post(`/collab/todos/${todoId}/attachments${forComment ? '?for=comment' : ''}`, form);
  return res.data.attachment;
}

/** Reaction chips plus an add button. `reactions` is [{kind, count, mine}]; onToggle(kind) does the work. */
export function ReactionBar({ reactions = [], onToggle, compact }) {
  const colors = useColors();
  const [picking, setPicking] = useState(false);
  const chip = {
    flexDirection: 'row', alignItems: 'center', gap: 4, height: compact ? 22 : 26, paddingHorizontal: 8, borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
      {reactions.map((r) => {
        const meta = REACTION_BY_KIND[r.kind];
        if (!meta) return null;
        return (
          <AnimatedPressable
            key={r.kind}
            onPress={() => onToggle(r.kind)}
            scale={0.94}
            accessibilityLabel={`${meta.label}: ${r.count}`}
            style={[chip, r.mine
              ? { backgroundColor: colors.brand[50], borderColor: colors.brand[500] }
              : { backgroundColor: colors.gray[100], borderColor: colors.gray[200] }]}
          >
            <Ionicons name={meta.icon} size={compact ? 12 : 14} color={r.mine ? colors.brand[600] : colors.gray[500]} />
            <Text style={{ fontSize: 11, fontWeight: '800', color: r.mine ? colors.brand[700] : colors.gray[600] }}>{r.count}</Text>
          </AnimatedPressable>
        );
      })}
      {picking ? (
        <View style={[chip, { backgroundColor: colors.white, borderColor: colors.gray[300], gap: 10 }]}>
          {REACTIONS.map((r) => (
            <AnimatedPressable key={r.kind} onPress={() => { setPicking(false); onToggle(r.kind); }} hitSlop={4} accessibilityLabel={r.label} scale={0.9}>
              <Ionicons name={r.icon} size={16} color={colors.brand[600]} />
            </AnimatedPressable>
          ))}
        </View>
      ) : (
        <AnimatedPressable onPress={() => setPicking(true)} scale={0.94} accessibilityLabel="Add a reaction" style={[chip, { backgroundColor: colors.gray[100], borderColor: colors.gray[200] }]}>
          <Ionicons name="happy-outline" size={compact ? 13 : 15} color={colors.gray[500]} />
          <Ionicons name="add" size={11} color={colors.gray[500]} />
        </AnimatedPressable>
      )}
    </View>
  );
}

/** Files: images as thumbnails, everything else as a chip. Tapping opens it. */
export function AttachmentList({ items = [], onRemove, canRemove }) {
  const colors = useColors();
  if (!items.length) return null;
  const open = (url) => { if (Platform.OS === 'web' && typeof window !== 'undefined') window.open(url, '_blank', 'noopener'); else Linking.openURL(url); };
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 6 }}>
      {items.map((a) => {
        const image = String(a.mime || '').startsWith('image/');
        return (
          <View key={a.id} style={{ position: 'relative' }}>
            {image ? (
              <AnimatedPressable onPress={() => open(a.url)} scale={0.97} accessibilityLabel={`Open ${a.filename}`}>
                <Image source={{ uri: a.url }} style={{ width: 132, height: 92, borderRadius: radius.md, backgroundColor: colors.gray[100] }} resizeMode="cover" />
              </AnimatedPressable>
            ) : (
              <AnimatedPressable
                onPress={() => open(a.url)}
                scale={0.97}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 240, paddingHorizontal: 10, height: 40, borderRadius: radius.md,
                  backgroundColor: colors.gray[100], borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200],
                }}
              >
                <Ionicons name="document-attach-outline" size={18} color={colors.brand[600]} />
                <View style={{ flexShrink: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.gray[800] }} numberOfLines={1}>{a.filename}</Text>
                  {!!a.size && <Text style={{ fontSize: 10, color: colors.gray[500] }}>{fileSize(a.size)}</Text>}
                </View>
              </AnimatedPressable>
            )}
            {canRemove?.(a) && (
              <AnimatedPressable
                onPress={() => onRemove?.(a)}
                hitSlop={6}
                accessibilityLabel="Remove file"
                style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 9, backgroundColor: colors.gray[700], alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="close" size={12} color="#fff" />
              </AnimatedPressable>
            )}
          </View>
        );
      })}
    </View>
  );
}

export const collabStyles = (c) => StyleSheet.create({
  mention: { color: c.brand[600], fontWeight: '800' },
  small: { fontSize: fontSize.xs, color: c.gray[500], fontWeight: '700' },
});

import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import api from '../../api/client';
import { useColors } from '../../context/ThemeContext';
import { useChat } from '../../context/ChatContext';
import { spacing, radius, BRAND } from '../../theme/theme';
import { glass } from '../../theme/glass';
import { Avatar, Chip } from '../kit';
import { paletteHex, paletteInk } from '../board/model';
import { STATUS_LOOK } from './model';

const ORDER = { sent: 0, planned: 1, none: 2 };

/** Everyone below me for one day: who sent, who only planned, who has not started, and each sent box's numbers. */
export default function TeamTimebox({ date, onOpenPerson }) {
  const colors = useColors();
  const { subscribe } = useChat();
  const [data, setData] = useState(null);
  const [show, setShow] = useState('all');
  const [biz, setBiz] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/timebox/team', { params: { date }, __skipOops: true });
      setData(res.data);
    } catch {
      setData((d) => d || { people: [], counts: { sent: 0, planned: 0, none: 0 } });
    }
  }, [date]);
  useEffect(() => { setData(null); load(); }, [load]);
  useEffect(() => subscribe('timebox:changed', (p) => { if (p?.date === date && p.user_id) load(); }), [subscribe, date, load]);

  const businesses = useMemo(() => {
    const m = new Map();
    for (const p of data?.people || []) p.business_ids.forEach((id, i) => m.set(id, p.businesses[i]));
    return [...m.entries()];
  }, [data]);
  const people = useMemo(() => (data?.people || [])
    .filter((p) => (show === 'all' || p.status === show) && (!biz || p.business_ids.includes(biz)))
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name)), [data, show, biz]);

  if (!data) return <ActivityIndicator color={BRAND} style={{ marginTop: spacing.xl }} />;
  if (!data.people.length) {
    return <Text style={{ color: colors.gray[500], padding: spacing.md }}>Nobody reports to you, so there are no timeboxes to see here.</Text>;
  }
  const c = data.counts;
  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Chip small label={`Everyone ${data.people.length}`} active={show === 'all'} onPress={() => setShow('all')} />
        <Chip small label={`Sent ${c.sent}`} active={show === 'sent'} onPress={() => setShow('sent')} />
        <Chip small label={`Planned, not sent ${c.planned}`} active={show === 'planned'} onPress={() => setShow('planned')} />
        <Chip small label={`Not started ${c.none}`} active={show === 'none'} onPress={() => setShow('none')} />
        {businesses.length > 1 && <View style={{ width: 1, backgroundColor: colors.gray[200], marginHorizontal: 4 }} />}
        {businesses.length > 1 && businesses.map(([id, name]) => <Chip key={id} small label={name} active={biz === id} onPress={() => setBiz(biz === id ? null : id)} />)}
      </View>
      <View {...glass('card')} style={{ backgroundColor: colors.white, borderRadius: radius.lg, overflow: 'hidden' }}>
        {people.map((p, i) => {
          const look = STATUS_LOOK[p.status];
          return (
            <Pressable
              key={p.id}
              onPress={() => onOpenPerson(p)}
              style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderColor: colors.gray[100], backgroundColor: hovered ? colors.gray[50] : 'transparent' })}
            >
              <Avatar name={p.name} uri={p.profile_picture} size={32} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text numberOfLines={1} style={{ fontSize: 15, color: colors.gray[900] }}>{p.name}</Text>
                <Text numberOfLines={1} style={{ fontSize: 12, color: colors.gray[500] }}>
                  {p.top.length ? p.top.join(' · ') : [p.display_title, p.businesses.join(', ')].filter(Boolean).join(' · ')}
                </Text>
              </View>
              {p.summary?.percent !== null && p.summary?.percent !== undefined && (
                <Text style={{ fontSize: 13, color: colors.gray[700], minWidth: 40, textAlign: 'right' }}>{p.summary.percent}%</Text>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: paletteHex(look.color), borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3, minWidth: 96, justifyContent: 'center' }}>
                <Ionicons name={look.icon} size={12} color={paletteInk(look.color)} />
                <Text style={{ fontSize: 12, color: paletteInk(look.color) }}>{p.status === 'planned' ? 'Not sent' : look.label}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.gray[400]} />
            </Pressable>
          );
        })}
        {!people.length && <Text style={{ padding: spacing.md, color: colors.gray[500] }}>Nobody here.</Text>}
      </View>
    </View>
  );
}

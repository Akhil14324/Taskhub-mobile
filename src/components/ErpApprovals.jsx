import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, ActivityIndicator, Linking, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../context/ThemeContext';
import { useChat } from '../context/ChatContext';
import { useNotifications } from '../context/NotificationContext';
import api from '../api/client';
import { spacing, radius, fontSize } from '../theme/theme';
import AnimatedPressable from './AnimatedPressable';
import { SectionHeader } from './kit';
import { timeAgo } from '../utils/dates';
import { showToast, confirmDialog } from '../utils/events';
import { glass } from '../theme/glass';

/**
 * Hospital ERP approvals inside the Approvals screen (backend: routes/erp.js).
 * Linked people see what waits on them in the ERP and open it there; everyone else sees a small
 * "Connect Hospital ERP" row where they type the 6-digit code made in the ERP (Settings → Task Hub).
 * Decisions are made in the ERP, so its rules (budget checks, approval order) always apply.
 */

const KIND = {
  MPR: { label: 'Material request', icon: 'cube-outline' },
  QUOTATION: { label: 'Quotation', icon: 'pricetags-outline' },
  PO: { label: 'PO', icon: 'cart-outline' },
  INVOICE: { label: 'Invoice', icon: 'receipt-outline' },
  PAYMENT: { label: 'Payment', icon: 'card-outline' },
  GRN: { label: 'Goods receipt', icon: 'archive-outline' },
};

const FLAG_TEXT = {
  OVER_ESTIMATE: (v) => `${v}% over estimate`,
  NO_BUDGET_HEAD: () => 'No budget head',
  NEW_VENDOR: () => 'New vendor',
  URGENT: () => 'Urgent',
  NEEDED_SOON: (v) => (v <= 0 ? 'Needed today' : `Needed in ${v} day${v === 1 ? '' : 's'}`),
  WAITING_LONG: (v) => `Waiting ${v} days`,
  PAID_IN_ADVANCE: () => 'Paid in advance',
};

const rupees = (n) => (Number(n) > 0 ? `₹${Math.round(Number(n)).toLocaleString('en-IN')}` : null);

function openUrl(url) {
  if (!url) return;
  if (Platform.OS === 'web' && typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
  else Linking.openURL(url);
}

/** The ERP approvals state for the Approvals screen; reloads when the server says the list changed. */
export function useErpApprovals() {
  const { subscribe } = useChat();
  const { refreshCounts } = useNotifications();
  const [data, setData] = useState(null);

  const load = useCallback(async (fresh = false) => {
    try {
      const res = await api.get(`/erp/approvals${fresh ? '?fresh=1' : ''}`, { __skipOops: true });
      setData(res.data);
    } catch {
      setData((d) => d || { configured: false, linked: false, items: [] });
    }
  }, []);

  useEffect(() => { load(true); }, [load]);
  useEffect(() => subscribe('erp:approvals', () => { load(); refreshCounts(); }), [subscribe, load, refreshCounts]);

  const items = data?.linked && data.eligible !== false ? data.items || [] : [];
  return { data, setData, load, items };
}

/** part="list": the linked person's ERP approvals; part="connect": the connect row for everyone else. */
export default function ErpApprovals({ erp, part }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { refreshCounts } = useNotifications();
  const { data, setData, items } = erp;
  const [connectOpen, setConnectOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const connect = async () => {
    setBusy(true);
    try {
      const res = await api.post('/erp/link', { code }, { __skipOops: true });
      setData(res.data);
      setCode('');
      setConnectOpen(false);
      showToast({ message: `Connected as ${res.data.erpUser?.name || 'you'}`, tone: 'success' });
      refreshCounts();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not connect', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    const ok = await confirmDialog({ title: 'Disconnect Hospital ERP?', message: 'Your ERP approvals stop showing here. You can connect again with a new code.', confirmLabel: 'Disconnect', destructive: true });
    if (!ok) return;
    try {
      await api.delete('/erp/link');
      setData({ configured: true, linked: false, items: [] });
      refreshCounts();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Something went wrong', tone: 'error' });
    }
  };

  if (!data || !data.configured) return null;
  if ((part === 'connect') === !!data.linked) return null;

  if (!data.linked) {
    return (
      <View style={{ marginTop: spacing.lg }}>
        {!connectOpen ? (
          <AnimatedPressable onPress={() => setConnectOpen(true)} style={styles.connectRow}>
            <Ionicons name="business-outline" size={16} color={colors.brand[700]} />
            <Text style={styles.connectText}>Connect Hospital ERP</Text>
          </AnimatedPressable>
        ) : (
          <View {...glass('card')} style={styles.card}>
            <Text style={styles.cardTitle}>Connect Hospital ERP</Text>
            <Text style={styles.cardMeta}>
              In the ERP, open Settings → Task Hub and get a code. Type it here. Your ERP approvals then show on this screen.
            </Text>
            <TextInput
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
              placeholder="6-digit code"
              placeholderTextColor={colors.gray[400]}
              keyboardType="number-pad"
              inputMode="numeric"
              autoFocus
              maxLength={6}
              onSubmitEditing={() => code.length === 6 && connect()}
              style={styles.codeInput}
            />
            <View style={styles.buttons}>
              <Button label="Cancel" onPress={() => { setConnectOpen(false); setCode(''); }} />
              <Button label="Connect" icon="link" solid loading={busy} disabled={code.length !== 6} onPress={connect} />
            </View>
          </View>
        )}
      </View>
    );
  }

  return (
    <View>
      <SectionHeader
        title="Hospital ERP"
        icon="business"
        count={items.length}
        right={(
          <AnimatedPressable onPress={disconnect} hitSlop={8}>
            <Text style={styles.small}>{data.erpUser?.roleLabel ? `${data.erpUser.roleLabel} · ` : ''}Disconnect</Text>
          </AnimatedPressable>
        )}
      />
      {!!data.error && <Text style={styles.warn}>{data.error}. Showing the last list we had.</Text>}
      {data.eligible === false && (
        <Text style={styles.cardMeta}>Your ERP account is no longer an approver, so nothing shows here.</Text>
      )}
      {data.eligible !== false && items.length === 0 && !data.error && (
        <Text style={styles.cardMeta}>Nothing waiting on you in the ERP.</Text>
      )}
      {items.map((item) => {
        const kind = KIND[item.kind] || { label: item.kind, icon: 'document-outline' };
        const meta = [item.party, rupees(item.amount), item.project?.name].filter(Boolean).join(' · ');
        const who = [item.requestedBy, item.waitingSince ? timeAgo(item.waitingSince) : null].filter(Boolean).join(' · ');
        return (
          <View key={`${item.kind}:${item.id}:${item.action}`} {...glass('card')} style={styles.card}>
            <AnimatedPressable onPress={() => openUrl(item.url)}>
              <View style={styles.cardTop}>
                <View style={styles.kindIcon}>
                  <Ionicons name={kind.icon} size={18} color={colors.brand[700]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {kind.label} {item.number}{item.action === 'FINALIZE' ? ' · to finalize' : ''}
                  </Text>
                  {!!meta && <Text style={styles.cardMeta}>{meta}</Text>}
                  {!!item.summary && <Text style={styles.reason} numberOfLines={2}>{item.summary}</Text>}
                  {!!item.why && <Text style={styles.reason} numberOfLines={2}>“{item.why}”</Text>}
                  {!!who && <Text style={styles.cardMeta}>{who}</Text>}
                  {item.flags?.length > 0 && (
                    <View style={styles.flags}>
                      {item.flags.map((f) => (
                        <View key={f.code} style={[styles.flag, f.level === 'warn' && styles.flagWarn]}>
                          <Text style={[styles.flagText, f.level === 'warn' && styles.flagWarnText]}>
                            {(FLAG_TEXT[f.code] || (() => f.code))(f.value)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            </AnimatedPressable>
            <View style={styles.buttons}>
              <Button
                label={item.action === 'FINALIZE' ? 'Finalize in ERP' : 'Review in ERP'}
                icon="open-outline"
                solid
                onPress={() => openUrl(item.url)}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Button({ label, icon, solid, loading, disabled, onPress }) {
  const colors = useColors();
  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={loading || disabled}
      style={{
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10,
        borderRadius: radius.md, backgroundColor: solid ? colors.brand[600] : colors.gray[100], opacity: disabled ? 0.5 : 1,
      }}
    >
      {loading
        ? <ActivityIndicator size="small" color={solid ? '#fff' : colors.gray[600]} />
        : !!icon && <Ionicons name={icon} size={16} color={solid ? '#fff' : colors.gray[700]} />}
      <Text style={{ fontWeight: '600', fontSize: fontSize.sm, color: solid ? '#fff' : colors.gray[800] }}>{label}</Text>
    </AnimatedPressable>
  );
}

const createStyles = (colors) => StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gray[200],
  },
  cardTop: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  cardTitle: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray[900] },
  cardMeta: { fontSize: fontSize.xs, color: colors.gray[500], marginTop: 3 },
  reason: { fontSize: fontSize.sm, color: colors.gray[700], marginTop: 6 },
  kindIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand[100] },
  buttons: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  flags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  flag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: colors.gray[100] },
  flagWarn: { backgroundColor: colors.brand[50] },
  flagText: { fontSize: 11, fontWeight: '700', color: colors.gray[700] },
  flagWarnText: { color: colors.brand[700] },
  small: { fontSize: fontSize.xs, fontWeight: '600', color: colors.gray[500] },
  warn: { fontSize: fontSize.xs, color: colors.red[600], marginBottom: spacing.sm },
  connectRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: colors.brand[50] },
  connectText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.brand[700] },
  codeInput: {
    marginTop: spacing.md, borderWidth: 1, borderColor: colors.gray[200], borderRadius: radius.md, paddingHorizontal: spacing.md,
    paddingVertical: 10, fontSize: 22, letterSpacing: 6, fontWeight: '700', color: colors.gray[900], textAlign: 'center',
  },
});

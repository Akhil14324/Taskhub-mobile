import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Switch } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import api from '../../api/client';
import AnimatedPressable from '../AnimatedPressable';
import BottomSheet from '../BottomSheet';
import { Chip, accent } from '../kit';
import { showToast, showDialog } from '../../utils/events';
import { invalidateDirectory } from '../../hooks/useDirectory';

/**
 * Portal editor for one person (Chairman / Chief of Staff only).
 * person = null → create a new account.
 * catalog = { leadership: [{ level, label }], designations: [{ key, label, level }] }
 */
export default function PersonEditorSheet({ visible, onClose, person, businesses, catalog, myLevel, onSaved }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const creating = !person;
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const wasVisible = useRef(false);

  useEffect(() => {
    const opening = visible && !wasVisible.current;
    wasVisible.current = visible;
    if (!opening) return;
    setForm(person ? {
      name: person.name,
      username: person.username,
      title: person.title || '',
      org_level: person.org_level || null,
      status: person.status === 'inactive' ? 'inactive' : 'active',
      memberships: (person.memberships || []).map((m) => ({ business_id: m.business_id, designation: m.designation, title: m.title || '' })),
    } : {
      name: '',
      username: '',
      title: '',
      org_level: null,
      status: 'active',
      memberships: [],
    });
  }, [visible, person]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const membership = (businessId) => form.memberships?.find((m) => m.business_id === businessId);
  const toggleBusiness = (businessId) => {
    set({
      memberships: membership(businessId)
        ? form.memberships.filter((m) => m.business_id !== businessId)
        : [...(form.memberships || []), { business_id: businessId, designation: 'member', title: '' }],
    });
  };
  const setDesignation = (businessId, designation) => {
    set({ memberships: form.memberships.map((m) => (m.business_id === businessId ? { ...m, designation } : m)) });
  };

  const tiers = (catalog?.leadership || []).filter((t) => t.level > myLevel);
  const designations = catalog?.designations || [];

  const save = async () => {
    if (!form.name?.trim()) return showToast({ message: 'Name is required', tone: 'error' });
    if (creating && !/^[A-Za-z0-9._-]{3,30}$/.test(form.username || '')) {
      return showToast({ message: 'Username: 3–30 letters, numbers, dot, dash or underscore', tone: 'error' });
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        title: form.title.trim() || null,
        org_level: form.org_level,
        memberships: form.memberships.map((m) => ({ ...m, title: m.title?.trim() || null })),
      };
      if (creating) {
        const res = await api.post('/org/people', { ...payload, username: form.username.trim() });
        invalidateDirectory();
        onSaved?.(res.data.person);
        onClose();
        const pw = res.data.temp_password;
        showDialog({
          title: `${res.data.person.name.split(' ')[0]} is in`,
          message: `Share these sign-in details:\n\nUsername: ${res.data.person.username}\nTemporary password: ${pw}\n\nThey'll be asked to set their own password on first login.`,
          buttons: [
            { text: 'Copy details', onPress: () => Clipboard.setStringAsync(`TaskHub login\nUsername: ${res.data.person.username}\nPassword: ${pw}`).then(() => showToast({ message: 'Copied', tone: 'success' })) },
            { text: 'Done', style: 'cancel' },
          ],
        });
      } else {
        const res = await api.put(`/org/people/${person.id}`, { ...payload, status: form.status });
        invalidateDirectory();
        onSaved?.(res.data.person);
        showToast({ message: 'Saved', tone: 'success' });
        onClose();
      }
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not save', tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight={800} avoidKeyboard>
      <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>{creating ? 'Add a person' : `Edit ${person.name.split(' ')[0]}`}</Text>
        <Text style={styles.sub}>{creating ? 'Creates their account and places them in the organisation.' : `@${person.username}`}</Text>

        <Field label="Full name">
          <TextInput value={form.name} onChangeText={(name) => set({ name })} style={styles.input} placeholder="e.g. Ravi Teja" placeholderTextColor={colors.gray[400]} />
        </Field>
        {creating && (
          <Field label="Username (for login and @mentions)">
            <TextInput
              value={form.username}
              onChangeText={(username) => set({ username: username.replace(/\s/g, '') })}
              style={styles.input}
              autoCapitalize="none"
              placeholder="e.g. ravi"
              placeholderTextColor={colors.gray[400]}
            />
          </Field>
        )}
        <Field label="Custom title (optional)">
          <TextInput value={form.title} onChangeText={(title) => set({ title })} style={styles.input} placeholder="e.g. Head Chef, Site Engineer" placeholderTextColor={colors.gray[400]} />
        </Field>

        <Text style={styles.label}>Leadership tier</Text>
        <Text style={styles.hint}>Leaders sit above every business and can see all work.</Text>
        <View style={styles.wrap}>
          <Chip label="None" active={!form.org_level} onPress={() => set({ org_level: null })} />
          {tiers.map((t) => (
            <Chip key={t.level} icon="star" color="#b91c1c" label={t.label} active={form.org_level === t.level} onPress={() => set({ org_level: t.level })} />
          ))}
        </View>

        <Text style={styles.label}>Businesses & position</Text>
        {businesses.map((b) => {
          const m = membership(b.id);
          return (
            <View key={b.id} style={[styles.bizCard, m && { borderColor: accent(b.color) }]}>
              <AnimatedPressable style={styles.bizHeader} onPress={() => toggleBusiness(b.id)} haptic="light">
                <View style={[styles.bizDot, { backgroundColor: accent(b.color) }]} />
                <Text style={styles.bizName}>{b.name}</Text>
                <Ionicons name={m ? 'checkmark-circle' : 'add-circle-outline'} size={22} color={m ? accent(b.color) : colors.gray[400]} />
              </AnimatedPressable>
              {m && (
                <View style={styles.wrapInner}>
                  {designations.map((d) => (
                    <Chip key={d.key} small label={d.label} color={accent(b.color)} active={m.designation === d.key} onPress={() => setDesignation(b.id, d.key)} />
                  ))}
                </View>
              )}
            </View>
          );
        })}

        {!creating && (
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchTitle}>Account active</Text>
              <Text style={styles.hint}>Inactive people can’t sign in or be assigned work.</Text>
            </View>
            <Switch
              value={form.status !== 'inactive'}
              onValueChange={(v) => set({ status: v ? 'active' : 'inactive' })}
              trackColor={{ true: colors.green[500], false: colors.gray[300] }}
            />
          </View>
        )}

        <AnimatedPressable onPress={save} disabled={saving} haptic="medium" style={[styles.saveBtn, saving && { opacity: 0.6 }]}>
          <Text style={styles.saveText}>{saving ? 'Saving…' : creating ? 'Create account' : 'Save changes'}</Text>
        </AnimatedPressable>
      </ScrollView>
    </BottomSheet>
  );
}

function Field({ label, children }) {
  const colors = useColors();
  return (
    <View style={{ marginTop: spacing.md, paddingHorizontal: spacing.sm }}>
      <Text style={{ fontSize: fontSize.xs, fontWeight: '700', color: colors.gray[500], marginBottom: 6 }}>{label}</Text>
      {children}
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  heading: { fontSize: fontSize.xl, fontWeight: '800', color: colors.gray[900], paddingHorizontal: spacing.sm },
  sub: { fontSize: fontSize.sm, color: colors.gray[500], paddingHorizontal: spacing.sm, marginTop: 2 },
  input: {
    backgroundColor: colors.gray[100],
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    fontSize: fontSize.base,
    color: colors.gray[900],
    outlineStyle: 'none',
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.gray[500],
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.sm,
  },
  hint: { fontSize: fontSize.xs, color: colors.gray[400], paddingHorizontal: spacing.sm, marginTop: 2, marginBottom: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.sm },
  wrapInner: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: spacing.sm },
  bizCard: {
    marginHorizontal: spacing.sm,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.gray[200],
    backgroundColor: colors.white,
  },
  bizHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bizDot: { width: 10, height: 10, borderRadius: 5 },
  bizName: { flex: 1, fontSize: fontSize.base, fontWeight: '700', color: colors.gray[900] },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    margin: spacing.sm,
    marginTop: spacing.xl,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.gray[100],
  },
  switchTitle: { fontSize: fontSize.base, fontWeight: '600', color: colors.gray[900], paddingHorizontal: spacing.sm },
  saveBtn: {
    marginTop: spacing.xl,
    marginHorizontal: spacing.sm,
    marginBottom: spacing.md,
    paddingVertical: 14,
    borderRadius: radius.lg,
    alignItems: 'center',
    backgroundColor: colors.brand[600],
  },
  saveText: { color: colors.white, fontWeight: '700', fontSize: fontSize.md },
});

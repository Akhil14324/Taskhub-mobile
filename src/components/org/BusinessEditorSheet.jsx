import { useEffect, useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import api from '../../api/client';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import BottomSheet from '../BottomSheet';
import { Chip } from '../kit';
import { BUSINESS_TYPES } from '../../utils/orgMeta';
import { showToast, confirmDialog } from '../../utils/events';

/** Create or edit a business (Organisation portal only). business === null creates. */
export default function BusinessEditorSheet({ visible, business, onClose, onSaved }) {
  const colors = useColors();
  const [name, setName] = useState('');
  const [type, setType] = useState('other');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(business?.name || '');
    setType(business?.type || 'other');
  }, [visible, business]);

  const known = BUSINESS_TYPES.some((t) => t.key === type);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return showToast({ message: 'Give the business a name', tone: 'error' });
    setSaving(true);
    try {
      if (business) await api.put(`/businesses/${business.id}`, { name: trimmed, type });
      else await api.post('/businesses', { name: trimmed, type });
      showToast({ message: business ? 'Business updated' : 'Business added', tone: 'success' });
      onClose();
      onSaved?.();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not save the business', tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: `Delete ${business.name}?`,
      message: 'Its tasks and team placements are deleted with it. This cannot be undone.',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await api.delete(`/businesses/${business.id}`);
      showToast({ message: 'Business deleted', icon: 'trash' });
      onClose();
      onSaved?.();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not delete the business', tone: 'error' });
    }
  };

  const label = { fontSize: fontSize.xs, fontWeight: '700', color: colors.gray[500], marginTop: spacing.lg, marginBottom: spacing.sm };

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight={560} avoidKeyboard>
      <View style={{ paddingHorizontal: spacing.sm }}>
        <Text style={{ fontSize: fontSize.lg, fontWeight: '800', color: colors.gray[900] }}>{business ? 'Edit business' : 'Add a business'}</Text>
        <Text style={label}>NAME</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. VGrand Retail"
          placeholderTextColor={colors.gray[400]}
          style={{ backgroundColor: colors.gray[100], borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: fontSize.md, color: colors.gray[900], outlineStyle: 'none' }}
        />
        <Text style={label}>TYPE</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {BUSINESS_TYPES.map((t) => (
            <Chip key={t.key} icon={t.icon} label={t.label} active={type === t.key || (t.key === 'other' && !known)} onPress={() => setType(t.key)} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl, marginBottom: spacing.md }}>
          {business && (
            <AnimatedPressable onPress={remove} style={{ paddingVertical: 12, paddingHorizontal: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.red[50] }}>
              <Ionicons name="trash-outline" size={20} color={colors.red[600]} />
            </AnimatedPressable>
          )}
          <AnimatedPressable
            onPress={save}
            disabled={saving}
            haptic="medium"
            style={{ flex: 1, paddingVertical: 14, borderRadius: radius.lg, alignItems: 'center', backgroundColor: colors.brand[600], opacity: saving ? 0.6 : 1 }}
          >
            <Text style={{ color: colors.white, fontWeight: '700', fontSize: fontSize.md }}>{saving ? 'Saving…' : business ? 'Save' : 'Add business'}</Text>
          </AnimatedPressable>
        </View>
      </View>
    </BottomSheet>
  );
}

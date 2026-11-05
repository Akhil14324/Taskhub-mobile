import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import api from '../../api/client';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, BRAND } from '../../theme/theme';
import { glass } from '../../theme/glass';
import { refreshBoards } from '../../hooks/useBoards';
import Modal from '../Modal';
import { showToast } from '../../utils/events';

const SECTORS = [
  ['food', 'Food and restaurants', 'restaurant-outline'], ['liquor', 'Bar and liquor', 'wine-outline'], ['mining', 'Mining', 'diamond-outline'],
  ['real_estate', 'Construction and real estate', 'business-outline'], ['healthcare', 'Healthcare', 'medkit-outline'],
  ['software', 'Software', 'code-slash-outline'], ['other', 'Something else', 'briefcase-outline'],
];

/** A workspace is a company (business): it is made here and gets its own main board. Leadership only. */
export default function NewWorkspaceDialog({ visible, onClose, onCreated }) {
  const colors = useColors();
  const [name, setName] = useState('');
  const [sector, setSector] = useState('other');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) { setName(''); setSector('other'); } }, [visible]);
  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const res = await api.post('/org/businesses', { name: name.trim(), sector }, { __skipOops: true });
      const list = await refreshBoards();
      onCreated(res.data.business, (list || []).find((b) => b.business_id === res.data.business.id && b.is_default));
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not create the workspace. Check your connection and try again.', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={visible} onClose={onClose} title="New workspace" width={460}>
      <View style={{ gap: spacing.md }}>
        <TextInput
          autoFocus value={name} onChangeText={setName} onSubmitEditing={create} placeholder="Workspace name, e.g. Vgrand Hospitality" placeholderTextColor={colors.gray[400]}
          style={{ borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, padding: spacing.sm, fontSize: 15, color: colors.gray[900], outlineStyle: 'none' }}
        />
        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.gray[600] }}>What kind of work</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {SECTORS.map(([k, label, icon]) => {
            const on = sector === k;
            return (
              <Pressable key={k} onPress={() => setSector(k)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.md, borderWidth: 1, borderColor: on ? BRAND : colors.gray[300], backgroundColor: on ? colors.brand[50] : 'transparent' }}>
                <Ionicons name={icon} size={15} color={on ? BRAND : colors.gray[600]} />
                <Text style={{ fontSize: 13, color: colors.gray[900] }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={{ fontSize: 12, color: colors.gray[500] }}>It starts with one main board. Add people from Organisation, and make more boards (or start from a template) with + once you are in it.</Text>
        <Pressable {...glass('accent')} onPress={create} disabled={!name.trim() || busy} style={{ backgroundColor: BRAND, opacity: name.trim() ? 1 : 0.5, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>{busy ? 'Creating…' : 'Create workspace'}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

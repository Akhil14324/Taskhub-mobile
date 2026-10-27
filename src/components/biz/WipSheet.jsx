import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import api from '../../api/client';
import { useColors } from '../../context/ThemeContext';
import { spacing, fontSize } from '../../theme/theme';
import BottomSheet from '../BottomSheet';
import { PrimaryButton } from '../Button';
import { Chip } from '../kit';
import { STATUS } from '../../utils/timeline';
import { showToast } from '../../utils/events';

const STATUSES = ['in_progress', 'in_review', 'blocked', 'on_hold'];
const CHOICES = [null, 2, 3, 5, 8, 10];

/** How many tasks each board column may hold before it turns red. Keeps work moving instead of piling up. */
export default function WipSheet({ visible, onClose, businessId, limits, onSaved }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) setDraft({ ...(limits || {}) }); }, [visible, limits]);

  const save = async () => {
    setBusy(true);
    try {
      const res = await api.put('/workspace/wip', { business_id: businessId, limits: draft });
      onSaved(res.data);
      onClose();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not save the limits', icon: 'alert-circle' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight={560}>
      <View style={styles.wrap}>
        <Text style={styles.title}>Limits for the board</Text>
        <Text style={styles.hint}>A column turns red when it holds more than its limit, so a team finishes work before starting more.</Text>
        {STATUSES.map((s) => (
          <View key={s} style={{ gap: 6 }}>
            <Text style={styles.label}>{STATUS[s].label}</Text>
            <View style={styles.row}>
              {CHOICES.map((n) => (
                <Chip
                  key={String(n)}
                  small
                  label={n === null ? 'No limit' : String(n)}
                  active={(draft[s] ?? null) === n}
                  onPress={() => setDraft((d) => { const next = { ...d }; if (n === null) delete next[s]; else next[s] = n; return next; })}
                />
              ))}
            </View>
          </View>
        ))}
        <PrimaryButton onPress={save} loading={busy} style={{ marginTop: spacing.md }}>Save limits</PrimaryButton>
      </View>
    </BottomSheet>
  );
}

const createStyles = (colors) => StyleSheet.create({
  wrap: { padding: spacing.lg, gap: spacing.sm },
  title: { fontSize: fontSize.xl, fontWeight: '800', color: colors.gray[900] },
  hint: { fontSize: fontSize.sm, color: colors.gray[500], lineHeight: 19 },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.gray[500], marginTop: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});

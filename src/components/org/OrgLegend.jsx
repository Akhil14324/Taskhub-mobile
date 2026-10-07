import { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import { tint } from '../kit';
import { TIER_ICONS, TIER_SHADES, DESIGNATION_ICONS, DESIGNATION_BLURBS, businessIcon } from '../../utils/orgMeta';
import { glass } from '../../theme/glass';

/**
 * What every icon on the Organisation screen means: leadership tiers, business positions
 * and each business. Collapsible so it stays out of the way once people know it.
 */
export default function OrgLegend({ structure }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [open, setOpen] = useState(true);

  const Row = ({ icon, shade = colors.brand[600], title, note, level }) => (
    <View style={styles.row}>
      <View style={[styles.iconBox, { backgroundColor: tint(shade, 0.14) }]}>
        <Ionicons name={icon} size={16} color={shade} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        {!!note && <Text style={styles.rowNote}>{note}</Text>}
      </View>
      {level != null && <Text style={styles.level}>L{level}</Text>}
    </View>
  );

  return (
    <View {...glass('card')} style={styles.card}>
      <AnimatedPressable onPress={() => setOpen((o) => !o)} haptic="light" style={styles.header}>
        <Ionicons name="information-circle" size={20} color={colors.brand[600]} />
        <Text style={styles.heading}>Legend</Text>
        <Text style={styles.headingNote}>who is who</Text>
        <View style={{ flex: 1 }} />
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.gray[400]} />
      </AnimatedPressable>

      {open && (
        <View>
          <Text style={styles.group}>Leadership</Text>
          {structure.leadership.map((l) => (
            <Row key={l.level} icon={TIER_ICONS[l.level] || 'star'} shade={TIER_SHADES[l.level]} title={l.label} note="Sits above every business" level={l.level} />
          ))}

          <Text style={styles.group}>Positions in a business</Text>
          {structure.designations.map((d) => (
            <Row key={d.key} icon={DESIGNATION_ICONS[d.key] || 'person'} title={d.label} note={DESIGNATION_BLURBS[d.key]} level={d.level} />
          ))}

          <Text style={styles.group}>Businesses</Text>
          {structure.businesses.map((b) => (
            <Row key={b.id} icon={businessIcon(b.type)} title={b.name} note={`${b.members.length} ${b.members.length === 1 ? 'person' : 'people'}`} />
          ))}

          <Text style={styles.foot}>
            L-numbers are levels: a lower number is more senior. You can only approve, remove or manage people at a strictly higher number than yours.
          </Text>
        </View>
      )}
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gray[200],
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  heading: { fontSize: fontSize.md, fontWeight: '800', color: colors.gray[900] },
  headingNote: { fontSize: fontSize.xs, color: colors.gray[400] },
  group: { fontSize: 11, fontWeight: '800', color: colors.gray[500], textTransform: 'uppercase', letterSpacing: 0.6, marginTop: spacing.lg, marginBottom: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 6 },
  iconBox: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray[900] },
  rowNote: { fontSize: fontSize.xs, color: colors.gray[500], marginTop: 1 },
  level: { fontSize: 11, fontWeight: '800', color: colors.gray[400] },
  foot: { fontSize: fontSize.xs, color: colors.gray[500], marginTop: spacing.md, lineHeight: 16 },
});

import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DropdownPicker } from '../components/DropdownPicker';
import { useLang } from '../context/LanguageContext';
import { useColors } from '../context/ThemeContext';
import api from '../api/client';
import Modal from '../components/Modal';
import { Card, Badge, LoadingSpinner, ErrorBanner, EmptyState } from '../components/UI';
import { PrimaryButton, SecondaryButton } from '../components/Button';
import { Input } from '../components/Input';
import { spacing, radius, fontSize } from '../theme/theme';

const DEFAULT_TYPES = [
  { value: 'restaurant', labelKey: 'restaurant' },
  { value: 'hospital', labelKey: 'hospital' },
  { value: 'construction', labelKey: 'construction' },
  { value: 'mines', labelKey: 'mines' },
  { value: 'it', labelKey: 'it' },
];

export default function AdminBusinesses() {
  const { t } = useLang();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [businesses, setBusinesses] = useState([]);
  const [businessTypes, setBusinessTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', type: 'restaurant', customType: '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchBusinesses = useCallback(async () => {
    try {
      const res = await api.get('/businesses');
      setBusinesses(res.data.businesses || []);
    } catch (err) {
      setError(err.response?.data?.error || t('failedLoadBusinesses'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  const fetchTypes = useCallback(async () => {
    try {
      const res = await api.get('/businesses/types');
      setBusinessTypes(res.data.types || []);
    } catch {
      setBusinessTypes([]);
    }
  }, []);

  useEffect(() => {
    fetchBusinesses();
    fetchTypes();
  }, [fetchBusinesses, fetchTypes]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchBusinesses();
  };

  const typeOptions = [...new Set([...DEFAULT_TYPES.map((dt) => dt.value), ...businessTypes])];

  const getTypeLabel = (type) => {
    const found = DEFAULT_TYPES.find((dt) => dt.value === type);
    return found ? t(found.labelKey) : type.replace(/_/g, ' ');
  };

  const getFinalType = () => {
    if (form.type === '__custom__') {
      return form.customType.trim().toLowerCase().replace(/\s+/g, '_');
    }
    return form.type;
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', type: 'restaurant', customType: '' });
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (biz) => {
    setEditing(biz);
    const isDefault = DEFAULT_TYPES.some((dt) => dt.value === biz.type);
    setForm({ name: biz.name, type: isDefault ? biz.type : '__custom__', customType: isDefault ? '' : biz.type });
    setFormError('');
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setFormError(t('businessNameRequired'));
      return;
    }
    const finalType = getFinalType();
    if (!finalType) {
      setFormError(t('enterNewTypeName'));
      return;
    }
    setFormError('');
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/businesses/${editing.id}`, { name: form.name, type: finalType });
      } else {
        await api.post('/businesses', { name: form.name, type: finalType });
      }
      setModalOpen(false);
      fetchBusinesses();
      fetchTypes();
    } catch (err) {
      setFormError(err.response?.data?.error || t('failedSaveBusiness'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (biz) => {
    Alert.alert(
      biz.name,
      t('deleteBusinessConfirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/businesses/${biz.id}`);
              fetchBusinesses();
            } catch (err) {
              Alert.alert('Error', err.response?.data?.error || t('failedDeleteBusiness'));
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item: biz }) => (
    <Card style={styles.bizCard}>
      <View style={styles.bizHeader}>
        <View style={styles.bizInfo}>
          <Text style={styles.bizName}>{biz.name}</Text>
          <Badge bg={colors.brand[100]} color={colors.brand[700]} style={{ marginTop: 4 }}>
            {getTypeLabel(biz.type)}
          </Badge>
        </View>
        <View style={styles.bizActions}>
          <TouchableOpacity onPress={() => openEdit(biz)} style={styles.iconBtn}>
            <Ionicons name="create-outline" size={18} color={colors.gray[400]} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleDelete(biz)} style={styles.iconBtn}>
            <Ionicons name="trash-outline" size={18} color={colors.red[500]} />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.bizStats}>
        <View style={styles.bizStat}>
          <Text style={styles.bizStatValue}>{biz.task_count}</Text>
          <Text style={styles.bizStatLabel}>{t('tasks')}</Text>
        </View>
        <View style={styles.bizStat}>
          <Text style={[styles.bizStatValue, { color: colors.green[600] }]}>{biz.completed_count}</Text>
          <Text style={styles.bizStatLabel}>{t('done')}</Text>
        </View>
        <View style={styles.bizStat}>
          <Text style={[styles.bizStatValue, { color: colors.yellow[600] }]}>{biz.pending_count}</Text>
          <Text style={styles.bizStatLabel}>{t('pending')}</Text>
        </View>
        <View style={styles.bizStat}>
          <Text style={[styles.bizStatValue, { color: colors.blue[600] }]}>{biz.user_count}</Text>
          <Text style={styles.bizStatLabel}>{t('usersCount')}</Text>
        </View>
      </View>
    </Card>
  );

  if (loading) return <LoadingSpinner />;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>{t('businesses')}</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openCreate}>
          <Ionicons name="add" size={24} color={colors.white} />
        </TouchableOpacity>
      </View>

      {error && <ErrorBanner message={error} />}

      <FlatList
        data={businesses}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <EmptyState
            icon={<Ionicons name="business-outline" size={32} color={colors.gray[300]} />}
            message={t('noBusinessesYet')}
          />
        }
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? t('editBusiness') : t('addBusiness')}>
        {formError && <ErrorBanner message={formError} />}
        <Input label={t('name')} value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="e.g. Downtown Restaurant" />
        <View style={styles.pickerField}>
          <Text style={styles.pickerLabel}>{t('type')}</Text>
          <View style={styles.pickerWrap}>
            <DropdownPicker
              selectedValue={form.type}
              onValueChange={(v) => setForm({ ...form, type: v })}
              items={[
                ...typeOptions.map((topt) => ({ label: getTypeLabel(topt), value: topt })),
                { label: `+ ${t('addNewType')}`, value: '__custom__' },
              ]}
            />
          </View>
        </View>
        {form.type === '__custom__' && (
          <Input label={t('newTypeName')} value={form.customType} onChangeText={(v) => setForm({ ...form, customType: v })} placeholder="e.g. Retail, Warehouse" />
        )}
        <View style={styles.modalActions}>
          <SecondaryButton onPress={() => setModalOpen(false)} style={{ flex: 1, marginRight: spacing.sm }}>
            {t('cancel')}
          </SecondaryButton>
          <PrimaryButton onPress={handleSave} loading={saving} style={{ flex: 1, marginLeft: spacing.sm }}>
            {saving ? t('saving') : editing ? t('update') : t('create')}
          </PrimaryButton>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray[50],
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  header: {
    fontSize: fontSize.xxxl,
    fontWeight: '700',
    color: colors.gray[900],
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.brand[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    padding: spacing.lg,
    paddingTop: 0,
    gap: spacing.md,
  },
  bizCard: {
    padding: spacing.lg,
  },
  bizHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  bizInfo: {
    flex: 1,
  },
  bizName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.gray[900],
  },
  bizActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconBtn: {
    padding: spacing.xs,
  },
  bizStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  bizStat: {
    alignItems: 'center',
  },
  bizStatValue: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.gray[900],
  },
  bizStatLabel: {
    fontSize: fontSize.xs,
    color: colors.gray[400],
    marginTop: 2,
  },
  pickerField: {
    marginBottom: spacing.md,
  },
  pickerLabel: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.gray[700],
    marginBottom: spacing.xs,
  },
  pickerWrap: {
    borderWidth: 1,
    borderColor: colors.gray[300],
    borderRadius: radius.md,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  picker: {
    height: 44,
  },
  modalActions: {
    flexDirection: 'row',
    marginTop: spacing.md,
  },
});

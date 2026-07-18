import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, FlatList, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import api from '../api/client';
import Modal from '../components/Modal';
import { Card, Badge, LoadingSpinner, ErrorBanner, EmptyState } from '../components/UI';
import { PrimaryButton, SecondaryButton, DangerButton } from '../components/Button';
import { Input, MultilineInput } from '../components/Input';
import { colors, spacing, radius, fontSize } from '../theme/theme';

const STATUS_COLORS = {
  completed: { bg: colors.green[100], text: colors.green[700] },
  pending: { bg: colors.yellow[100], text: colors.yellow[700] },
  on_hold: { bg: colors.blue[100], text: colors.blue[700] },
  warned: { bg: colors.red[100], text: colors.red[700] },
};

export default function Tasks() {
  const { user } = useAuth();
  const { t } = useLang();
  const isAdmin = ['admin', 'super_admin'].includes(user?.role);

  const [tasks, setTasks] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [businessUsers, setBusinessUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const [filterBusiness, setFilterBusiness] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [warnModalOpen, setWarnModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [warningTask, setWarningTask] = useState(null);

  const [form, setForm] = useState({ title: '', description: '', due_date: '', business_id: '', assigned_user_id: '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [warnMessage, setWarnMessage] = useState('');
  const [warnError, setWarnError] = useState('');
  const [sendingWarn, setSendingWarn] = useState(false);

  const fetchTasks = useCallback(async () => {
    try {
      const params = {};
      if (filterBusiness !== 'all') params.business_id = filterBusiness;
      if (filterStatus !== 'all') params.status = filterStatus;
      const res = await api.get('/tasks', { params });
      setTasks(res.data.tasks || []);
    } catch (err) {
      setError(err.response?.data?.error || t('failedLoadTasks'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filterBusiness, filterStatus, t]);

  const fetchBusinesses = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await api.get('/businesses');
      setBusinesses(res.data.businesses || []);
    } catch {
      // ignore
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchTasks();
    fetchBusinesses();
  }, [fetchTasks, fetchBusinesses]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchTasks();
  };

  const fetchBusinessUsers = async (bizId) => {
    if (!bizId) {
      setBusinessUsers([]);
      return;
    }
    try {
      const res = await api.get('/users');
      const allUsers = res.data?.users || res.data?.users || [];
      setBusinessUsers(allUsers.filter((u) => u.businesses?.some((b) => b.id === parseInt(bizId)) && u.role === 'user'));
    } catch {
      setBusinessUsers([]);
    }
  };

  const openCreate = () => {
    if (isAdmin && businesses.length === 0) {
      Alert.alert(t('businesses'), t('noBusinessesYet'));
      return;
    }
    const defaultBiz = isAdmin ? (businesses[0]?.id?.toString() || '') : (user?.business_id?.toString() || '');
    setForm({ title: '', description: '', due_date: '', business_id: defaultBiz, assigned_user_id: '' });
    setFormError('');
    setCreateModalOpen(true);
    if (defaultBiz) fetchBusinessUsers(defaultBiz);
  };

  const openEdit = (task) => {
    setEditingTask(task);
    setForm({ title: task.title, description: task.description || '', due_date: task.due_date || '', business_id: '', assigned_user_id: '' });
    setFormError('');
    setEditModalOpen(true);
  };

  const openWarn = (task) => {
    setWarningTask(task);
    setWarnMessage('');
    setWarnError('');
    setWarnModalOpen(true);
  };

  const handleCreate = async () => {
    if (!form.title.trim()) {
      setFormError(t('taskTitle'));
      return;
    }
    if (!form.business_id) {
      setFormError(t('selectBusiness'));
      return;
    }
    setFormError('');
    setSaving(true);
    try {
      await api.post('/tasks', {
        title: form.title.trim(),
        description: form.description,
        due_date: form.due_date || null,
        business_id: parseInt(form.business_id),
        assigned_user_id: form.assigned_user_id ? parseInt(form.assigned_user_id) : null,
      });
      setCreateModalOpen(false);
      fetchTasks();
    } catch (err) {
      setFormError(err.response?.data?.error || t('failedCreateTask'));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!form.title.trim()) {
      setFormError(t('taskTitle'));
      return;
    }
    setFormError('');
    setSaving(true);
    try {
      await api.put(`/tasks/${editingTask.id}`, {
        title: form.title.trim(),
        description: form.description,
        due_date: form.due_date || null,
      });
      setEditModalOpen(false);
      fetchTasks();
    } catch (err) {
      setFormError(err.response?.data?.error || t('failedUpdateTask'));
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async (task) => {
    try {
      await api.put(`/tasks/${task.id}/complete`);
      fetchTasks();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || t('failedUpdateTaskStatus'));
    }
  };

  const handleHold = async (task) => {
    try {
      await api.put(`/tasks/${task.id}/hold`);
      fetchTasks();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || t('failedToggleHold'));
    }
  };

  const handleWarn = async () => {
    if (!warnMessage.trim()) {
      setWarnError(t('warningMessageRequired'));
      return;
    }
    setWarnError('');
    setSendingWarn(true);
    try {
      await api.put(`/tasks/${warningTask.id}/warn`, { message: warnMessage.trim() });
      setWarnModalOpen(false);
      fetchTasks();
    } catch (err) {
      setWarnError(err.response?.data?.error || t('failedSendWarning'));
    } finally {
      setSendingWarn(false);
    }
  };

  const handleDelete = (task) => {
    Alert.alert(
      t('deleteTaskConfirm'),
      task.title,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/tasks/${task.id}`);
              fetchTasks();
            } catch (err) {
              Alert.alert('Error', err.response?.data?.error || t('failedDeleteTask'));
            }
          },
        },
      ]
    );
  };

  const renderTask = ({ item: task }) => {
    const statusColors = STATUS_COLORS[task.status] || STATUS_COLORS.pending;
    const isOverdue = task.due_date && task.status !== 'completed' && task.status !== 'on_hold' && new Date(task.due_date) < new Date();

    return (
      <Card style={styles.taskCard}>
        <View style={styles.taskHeader}>
          <View style={styles.taskInfo}>
            <Text style={styles.taskTitle}>{task.title}</Text>
            {task.business_name && <Text style={styles.taskBusiness}>{task.business_name}</Text>}
            {task.description ? <Text style={styles.taskDesc} numberOfLines={2}>{task.description}</Text> : null}
            {task.assigned_user_name && (
              <Text style={styles.taskAssigned}>{t('assignedTo')}: {task.assigned_user_name}</Text>
            )}
            {task.due_date && (
              <Text style={[styles.taskDue, isOverdue && styles.taskOverdue]}>
                {t('due')}: {new Date(task.due_date).toLocaleDateString()}
              </Text>
            )}
            {task.completed_by_name && (
              <Text style={styles.taskCompletedBy}>{t('doneBy')}: {task.completed_by_name}</Text>
            )}
          </View>
          <View style={styles.taskBadges}>
            <Badge bg={statusColors.bg} color={statusColors.text}>
              {task.status === 'completed' ? t('completed') : task.status === 'on_hold' ? t('onHold') : task.is_warned ? t('warned') : t('pending')}
            </Badge>
            {isOverdue && <Badge bg={colors.red[100]} color={colors.red[700]}>{t('overdue')}</Badge>}
          </View>
        </View>

        <View style={styles.taskActions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleComplete(task)}
          >
            <Ionicons
              name={task.status === 'completed' ? 'undo' : 'checkmark-circle'}
              size={18}
              color={task.status === 'completed' ? colors.yellow[600] : colors.green[600]}
            />
            <Text style={[styles.actionText, { color: task.status === 'completed' ? colors.yellow[600] : colors.green[600] }]}>
              {task.status === 'completed' ? t('pending') : t('completed')}
            </Text>
          </TouchableOpacity>

          {isAdmin && task.status !== 'completed' && (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => handleHold(task)}
            >
              <Ionicons
                name={task.status === 'on_hold' ? 'play-circle' : 'pause-circle'}
                size={18}
                color={colors.blue[600]}
              />
              <Text style={[styles.actionText, { color: colors.blue[600] }]}>
                {task.status === 'on_hold' ? t('resumeFromHold') : t('putOnHold')}
              </Text>
            </TouchableOpacity>
          )}
          {isAdmin && task.status === 'pending' && (
            <>
              <TouchableOpacity style={styles.actionBtn} onPress={() => openWarn(task)}>
                <Ionicons name="warning-outline" size={18} color={colors.amber[600]} />
                <Text style={[styles.actionText, { color: colors.amber[600] }]}>{t('sendWarning')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => openEdit(task)}>
                <Ionicons name="create-outline" size={18} color={colors.brand[600]} />
                <Text style={[styles.actionText, { color: colors.brand[600] }]}>{t('editTask')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(task)}>
                <Ionicons name="trash-outline" size={18} color={colors.red[600]} />
                <Text style={[styles.actionText, { color: colors.red[600] }]}>{t('delete')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </Card>
    );
  };

  if (loading) return <LoadingSpinner />;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>{t('tasks')}</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openCreate}>
          <Ionicons name="add" size={24} color={colors.white} />
        </TouchableOpacity>
      </View>

      {error && <ErrorBanner message={error} />}

      {isAdmin && businesses.length > 0 && (
        <View style={styles.filters}>
          <View style={styles.filterItem}>
            <Text style={styles.filterLabel}>{t('business')}</Text>
            <View style={styles.pickerWrap}>
              <Picker
                selectedValue={filterBusiness}
                onValueChange={setFilterBusiness}
                style={styles.picker}
              >
                <Picker.Item label={t('allBusinesses')} value="all" />
                {businesses.map((b) => (
                  <Picker.Item key={b.id} label={b.name} value={b.id.toString()} />
                ))}
              </Picker>
            </View>
          </View>
          <View style={styles.filterItem}>
            <Text style={styles.filterLabel}>{t('status')}</Text>
            <View style={styles.pickerWrap}>
              <Picker
                selectedValue={filterStatus}
                onValueChange={setFilterStatus}
                style={styles.picker}
              >
                <Picker.Item label={t('allStatus')} value="all" />
                <Picker.Item label={t('pending')} value="pending" />
                <Picker.Item label={t('completed')} value="completed" />
                <Picker.Item label={t('onHold')} value="on_hold" />
              </Picker>
            </View>
          </View>
        </View>
      )}

      <FlatList
        data={tasks}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderTask}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <EmptyState
            icon={<Ionicons name="clipboard-outline" size={32} color={colors.gray[300]} />}
            message={t('noTasksYetTasks')}
          />
        }
      />

      {/* Create Modal */}
      <Modal open={createModalOpen} onClose={() => setCreateModalOpen(false)} title={t('addTask')}>
        {formError && <ErrorBanner message={formError} />}
        <Input label={t('title')} value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} placeholder="Task title" />
        <MultilineInput label={t('description')} value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} placeholder={t('optionalDetails')} />
        <Input label={t('dueDate') + ' (YYYY-MM-DD)'} value={form.due_date} onChangeText={(v) => setForm({ ...form, due_date: v })} placeholder="2024-12-31" />
        {isAdmin && (
          <View style={styles.pickerField}>
            <Text style={styles.pickerLabel}>{t('business')}</Text>
            <View style={styles.pickerWrap}>
              <Picker
                selectedValue={form.business_id}
                onValueChange={(v) => {
                  setForm({ ...form, business_id: v, assigned_user_id: '' });
                  fetchBusinessUsers(v);
                }}
                style={styles.picker}
              >
                <Picker.Item label={t('selectBusinessPlaceholder')} value="" />
                {businesses.map((b) => (
                  <Picker.Item key={b.id} label={b.name} value={b.id.toString()} />
                ))}
              </Picker>
            </View>
          </View>
        )}
        {businessUsers.length > 0 && (
          <View style={styles.pickerField}>
            <Text style={styles.pickerLabel}>{t('assignToUser')} ({t('optional')})</Text>
            <View style={styles.pickerWrap}>
              <Picker
                selectedValue={form.assigned_user_id}
                onValueChange={(v) => setForm({ ...form, assigned_user_id: v })}
                style={styles.picker}
              >
                <Picker.Item label={t('allUsersInBusiness')} value="" />
                {businessUsers.map((u) => (
                  <Picker.Item key={u.id} label={u.name} value={u.id.toString()} />
                ))}
              </Picker>
            </View>
          </View>
        )}
        <View style={styles.modalActions}>
          <SecondaryButton onPress={() => setCreateModalOpen(false)} style={{ flex: 1, marginRight: spacing.sm }}>
            {t('cancel')}
          </SecondaryButton>
          <PrimaryButton onPress={handleCreate} loading={saving} style={{ flex: 1, marginLeft: spacing.sm }}>
            {saving ? t('creating') : t('createTask')}
          </PrimaryButton>
        </View>
      </Modal>

      {/* Edit Modal */}
      <Modal open={editModalOpen} onClose={() => setEditModalOpen(false)} title={t('editTask')}>
        {formError && <ErrorBanner message={formError} />}
        <Input label={t('title')} value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} placeholder="Task title" />
        <MultilineInput label={t('description')} value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} placeholder={t('optionalDetails')} />
        <Input label={t('dueDate') + ' (YYYY-MM-DD)'} value={form.due_date} onChangeText={(v) => setForm({ ...form, due_date: v })} placeholder="2024-12-31" />
        <View style={styles.modalActions}>
          <SecondaryButton onPress={() => setEditModalOpen(false)} style={{ flex: 1, marginRight: spacing.sm }}>
            {t('cancel')}
          </SecondaryButton>
          <PrimaryButton onPress={handleEdit} loading={saving} style={{ flex: 1, marginLeft: spacing.sm }}>
            {saving ? t('saving') : t('updateTask')}
          </PrimaryButton>
        </View>
      </Modal>

      {/* Warn Modal */}
      <Modal open={warnModalOpen} onClose={() => setWarnModalOpen(false)} title={t('sendWarning')}>
        {warnError && <ErrorBanner message={warnError} />}
        {warningTask && (
          <View style={styles.warnTaskInfo}>
            <Text style={styles.warnTaskTitle}>{warningTask.title}</Text>
          </View>
        )}
        <MultilineInput
          label={t('warningMessage')}
          value={warnMessage}
          onChangeText={setWarnMessage}
          placeholder="Enter warning message..."
          rows={4}
        />
        <View style={styles.modalActions}>
          <SecondaryButton onPress={() => setWarnModalOpen(false)} style={{ flex: 1, marginRight: spacing.sm }}>
            {t('cancel')}
          </SecondaryButton>
          <DangerButton onPress={handleWarn} loading={sendingWarn} style={{ flex: 1, marginLeft: spacing.sm }}>
            {sendingWarn ? t('sending') : t('sendWarning')}
          </DangerButton>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
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
  filters: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  filterItem: {
    flex: 1,
  },
  filterLabel: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.gray[600],
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
  list: {
    padding: spacing.lg,
    paddingTop: 0,
    gap: spacing.sm,
  },
  taskCard: {
    padding: spacing.lg,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  taskInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  taskTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.gray[900],
  },
  taskBusiness: {
    fontSize: fontSize.sm,
    color: colors.gray[400],
    marginTop: 2,
  },
  taskDesc: {
    fontSize: fontSize.sm,
    color: colors.gray[500],
    marginTop: spacing.xs,
  },
  taskAssigned: {
    fontSize: fontSize.sm,
    color: colors.gray[500],
    marginTop: spacing.xs,
  },
  taskDue: {
    fontSize: fontSize.sm,
    color: colors.gray[500],
    marginTop: spacing.xs,
  },
  taskOverdue: {
    color: colors.red[600],
    fontWeight: '500',
  },
  taskCompletedBy: {
    fontSize: fontSize.sm,
    color: colors.green[600],
    marginTop: spacing.xs,
  },
  taskBadges: {
    flexDirection: 'column',
    gap: spacing.xs,
    alignItems: 'flex-end',
  },
  taskActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.gray[100],
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  actionText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
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
  modalActions: {
    flexDirection: 'row',
    marginTop: spacing.md,
  },
  warnTaskInfo: {
    backgroundColor: colors.gray[50],
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  warnTaskTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.gray[900],
  },
});

// Notification categories for the filter chips. Mirrors vgrand-taskhub-backend-ai/src/utils/notificationPrefs.js.

export const CATEGORIES = [
  { key: 'reminders', label: 'Reminders', icon: 'alarm-outline' },
  { key: 'assignments', label: 'Assignments', icon: 'person-add-outline' },
  { key: 'deadlines', label: 'Deadlines', icon: 'alert-circle-outline' },
  { key: 'overdue', label: 'Overdue', icon: 'time-outline' },
  { key: 'completed', label: 'Completed', icon: 'checkmark-circle-outline' },
  { key: 'team', label: 'Team', icon: 'people-outline' },
  { key: 'daily', label: 'Daily reports', icon: 'sunny-outline' },
  { key: 'ai', label: 'AI', icon: 'sparkles-outline' },
];

const CATEGORY_OF = {
  todo_reminder: 'reminders', todo_upcoming: 'reminders', todo_nudge: 'reminders', blocker_nudge: 'reminders',
  task_assigned: 'assignments', todo_assigned: 'assignments', assignment: 'assignments', todo_shared: 'assignments',
  todo_deadline: 'deadlines', todo_deadline_changed: 'deadlines',
  overdue: 'overdue',
  task_completed: 'completed', todo_done: 'completed',
  daily_digest: 'daily', weekly_recap: 'daily', daily_brief: 'daily',
  ai_recommendation: 'ai',
};

export const categoryOf = (type) => CATEGORY_OF[type] || 'team';

export const NOTIF_DEFAULTS = { reminders: true, assignments: true, deadlines: true, daily: true, ai: true, quietEnabled: false, quietStart: 22, quietEnd: 7, delivery: 'all', leads: [1440, 180, 30] };

/** A person's notification settings with the defaults filled in. */
export const notifSettingsOf = (preferences) => ({ ...NOTIF_DEFAULTS, ...(preferences?.notifications || {}) });

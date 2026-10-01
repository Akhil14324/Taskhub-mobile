// Display metadata for task statuses (shared by list, detail and home screens).
export const TASK_STATUS = {
  pending: { label: 'To do', icon: 'ellipse-outline', color: '#64748b' },
  in_progress: { label: 'In progress', icon: 'play-circle', color: '#dc2626' },
  in_review: { label: 'In review', icon: 'shield-checkmark', color: '#991b1b' },
  completed: { label: 'Done', icon: 'checkmark-circle', color: '#dc2626' },
  on_hold: { label: 'On hold', icon: 'pause-circle', color: '#94a3b8' },
};

export const TASK_FILTERS = [
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'in_review', label: 'In review' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'on_hold', label: 'On hold' },
  { key: 'completed', label: 'Done' },
  { key: 'all', label: 'All' },
];

export function statusMeta(status) {
  return TASK_STATUS[status] || TASK_STATUS.pending;
}

/** Human description of an activity entry for the task timeline. */
export function describeActivity(a) {
  const who = a.user_name || 'Someone';
  switch (a.kind) {
    case 'created':
      return `${who} created this task`;
    case 'status': {
      const to = TASK_STATUS[a.meta?.to]?.label || a.meta?.to;
      if (a.meta?.to === 'in_review') return `${who} marked it done — waiting for review`;
      return `${who} moved it to ${to}`;
    }
    case 'assigned':
      return a.meta?.to ? `${who} reassigned the task` : `${who} opened it to the whole business`;
    case 'edited':
      return `${who} edited ${a.body || 'the task'}`;
    case 'approved':
      return `${who} approved the work`;
    case 'changes_requested':
      return `${who} asked for changes`;
    case 'warning':
      return `${who} sent a warning`;
    case 'delete_requested':
      return `${who} asked to delete this task`;
    case 'delete_rejected':
      return `${who} declined the delete request`;
    default:
      return `${who} updated the task`;
  }
}

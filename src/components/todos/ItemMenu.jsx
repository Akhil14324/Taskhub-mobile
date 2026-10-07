import { useRef, useState } from 'react';
import { useTodos } from '../../context/TodoContext';
import { PickerSheet } from './Pickers';
import PromptSheet from './PromptSheet';
import { showToast, confirmDialog } from '../../utils/events';
import { cleanLabel } from '../../utils/todoMeta';

/**
 * The three-dots menu of a list, a filter or a label: favourite, edit, duplicate, move to a business,
 * delete. `menu` is { kind: 'list' | 'filter' | 'label', item } (a list or filter row, or { name } for a
 * label); `view` and `setView` let it step away from something it just removed.
 */
export default function ItemMenu({ menu, onClose, view, setView, onEditList, onEditFilter }) {
  const {
    todos, businesses, isFavorite, toggleFavorite, deleteList, deleteFilter, duplicateFilter, renameLabel, removeLabel, moveToBusiness,
  } = useTodos();
  const [pickBusiness, setPickBusiness] = useState(false);
  const [rename, setRename] = useState(null);
  const keepOpen = useRef(false);
  if (!menu && !rename) return null;

  const { kind, item } = menu || {};
  const ref = kind === 'label' ? item?.name : item?.id;
  const run = async (fn, text) => {
    try { await fn(); } catch (err) { showToast({ message: err.response?.data?.error || text, tone: 'error' }); }
  };

  const options = menu ? [
    { key: 'fav', label: isFavorite(kind, ref) ? 'Remove from favourites' : 'Add to favourites', icon: isFavorite(kind, ref) ? 'star' : 'star-outline' },
    kind !== 'label' && !item?.builtin && { key: 'edit', label: 'Edit', icon: 'create-outline' },
    kind === 'label' && { key: 'rename', label: 'Rename', icon: 'create-outline' },
    kind === 'filter' && !item?.builtin && { key: 'duplicate', label: 'Duplicate', icon: 'copy-outline' },
    kind === 'list' && businesses.length > 0 && { key: 'business', label: 'Move its to-dos to a business', icon: 'briefcase-outline' },
    !item?.builtin && { key: 'delete', label: kind === 'label' ? 'Remove label from everything' : 'Delete', icon: 'trash-outline', destructive: true },
  ].filter(Boolean) : [];

  const onPick = (key) => {
    if (key === 'fav') run(() => toggleFavorite(kind, ref), 'Could not change favourites');
    else if (key === 'edit') (kind === 'list' ? onEditList : onEditFilter)?.(item);
    else if (key === 'rename') setRename({ title: `Rename +${item.name}`, placeholder: 'New label name', confirmLabel: 'Rename', required: true, from: item.name });
    else if (key === 'duplicate') run(async () => { await duplicateFilter(item.id); showToast({ message: 'Filter duplicated', tone: 'success', icon: 'copy' }); }, 'Could not duplicate it');
    else if (key === 'business') { keepOpen.current = true; setPickBusiness(true); }
    else if (key === 'delete') {
      confirmDialog({
        title: kind === 'label' ? `Remove +${item.name}?` : `Delete “${item.name}”?`,
        message: kind === 'list' ? 'Its to-dos move to your Inbox.' : kind === 'label' ? 'The label comes off every to-do. The to-dos stay.' : undefined,
        confirmLabel: kind === 'label' ? 'Remove' : 'Delete',
        destructive: true,
      }).then((ok) => {
        if (!ok) return;
        run(async () => {
          if (kind === 'list') { await deleteList(item.id); if (view === `list:${item.id}`) setView('inbox'); }
          else if (kind === 'filter') { await deleteFilter(item.id); if (view === `filter:${item.id}`) setView('today'); }
          else { await removeLabel(item.name); if (view === `label:${item.name}`) setView('today'); }
        }, 'Could not delete it');
      });
    }
  };

  const listTodos = kind === 'list' ? todos.filter((t) => t.list_id === item.id && !t.parent_id && !t.is_done && !t.business_id) : [];

  return (
    <>
      <PickerSheet
        visible={!!menu && !pickBusiness}
        onClose={() => { if (keepOpen.current) { keepOpen.current = false; return; } onClose(); }}
        title={kind === 'label' ? `+${item?.name}` : item?.name}
        options={options}
        onPick={onPick}
      />
      <PickerSheet
        visible={pickBusiness}
        onClose={() => { setPickBusiness(false); onClose(); }}
        title={`Move ${listTodos.length} to-do${listTodos.length === 1 ? '' : 's'} to`}
        options={businesses.map((b) => ({ key: b.id, label: b.can_manage ? b.name : `${b.name} (sent as proposals)`, icon: 'briefcase-outline' }))}
        onPick={(id) => run(async () => {
          for (const t of listTodos) {
            // eslint-disable-next-line no-await-in-loop
            await moveToBusiness(t, id);
          }
        }, 'Could not move them')}
      />
      <PromptSheet
        value={rename}
        onClose={() => { setRename(null); onClose(); }}
        onSubmit={(text) => {
          const to = cleanLabel(text);
          const from = rename?.from;
          setRename(null);
          onClose();
          if (!to || !from) return;
          run(async () => {
            await renameLabel(from, to);
            if (view === `label:${from}`) setView(`label:${to}`);
          }, 'Could not rename it');
        }}
      />
    </>
  );
}

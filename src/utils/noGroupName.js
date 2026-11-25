// The name a person gave the ungrouped bucket of a board ("No group" until renamed). Kept on this device, per board.
const key = (boardId) => `board.noGroup.${boardId}`;

export function getNoGroupName(boardId) {
  try { return (typeof localStorage !== 'undefined' && localStorage.getItem(key(boardId))) || 'No group'; } catch { return 'No group'; }
}

export function setNoGroupName(boardId, name) {
  const clean = String(name || '').trim();
  try {
    if (typeof localStorage === 'undefined') return;
    if (clean && clean !== 'No group') localStorage.setItem(key(boardId), clean); else localStorage.removeItem(key(boardId));
  } catch { /* private mode */ }
}

import { useEffect, useState } from 'react';
import api from '../../api/client';

// The catalog (what a profile can listen for and what a task can do) comes from the server, so a new
// action added there shows up in the editor without an app change. Cached for the life of the page.
let cached = null;
let inflight = null;

export function loadCatalog() {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = api.get('/automation/catalog', { __skipOops: true })
      .then((res) => {
        const c = res.data;
        c.contextByType = Object.fromEntries(c.contexts.map((x) => [x.type, x]));
        c.actionByType = Object.fromEntries(c.actions.map((x) => [x.type, x]));
        cached = c;
        return c;
      })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

export function useCatalog() {
  const [catalog, setCatalog] = useState(cached);
  const [error, setError] = useState(null);
  useEffect(() => {
    let alive = true;
    if (!cached) loadCatalog().then((c) => alive && setCatalog(c)).catch((e) => alive && setError(e.response?.data?.error || 'Could not load'));
    return () => { alive = false; };
  }, []);
  return { catalog, error };
}

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function describeDays(days) {
  const d = [...(days || [])].sort();
  if (!d.length || d.length === 7) return 'every day';
  if (d.join() === '1,2,3,4,5') return 'on weekdays';
  if (d.join() === '0,6') return 'on weekends';
  return `on ${d.map((x) => DAY_NAMES[x]).join(', ')}`;
}

const time12 = (hm) => {
  if (!hm) return '';
  const [h, m] = hm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};

const PRIORITY_WORD = { 1: 'urgent', 2: 'high', 3: 'medium', 4: 'low' };

/** One plain sentence for a context, such as "At 8:30 am on weekdays". */
export function describeContext(c, catalog) {
  const spec = catalog?.contextByType?.[c.type];
  const filter = () => {
    const bits = [];
    if (c.scope === 'mine') bits.push('mine');
    if (c.scope === 'business') bits.push('in one business');
    if (c.text) bits.push(`with "${c.text}" in the title`);
    if (c.label) bits.push(`labelled ${c.label}`);
    return bits.length ? ` (${bits.join(', ')})` : '';
  };
  switch (c.type) {
    case 'time_at': return `At ${time12(c.at)} ${describeDays(c.days)}`;
    case 'interval': return `Every ${c.every} minutes${c.from && c.to ? ` from ${time12(c.from)} to ${time12(c.to)}` : ''} ${describeDays(c.days)}`;
    case 'date_on': return `On ${c.date} at ${time12(c.at)}`;
    case 'time_range': return `Between ${time12(c.from)} and ${time12(c.to)} ${describeDays(c.days)}`;
    case 'todo_status': return `A to-do changes status${c.to && c.to !== 'any' ? ` to ${c.to.replace('_', ' ')}` : ''}${filter()}`;
    case 'todo_priority': return `Priority changes${c.to && c.to !== 'any' ? ` to ${PRIORITY_WORD[c.to]}` : ''}${filter()}`;
    case 'overdue_count': return `${c.min} or more to-dos are overdue`;
    case 'open_today_count': return `${c.cmp === 'le' ? 'At most' : 'At least'} ${c.n} to-dos are due today`;
    case 'battery': return `Battery ${c.cmp === 'ge' ? 'at least' : 'at most'} ${c.percent}%${c.charging === 'no' ? ' and not charging' : c.charging === 'yes' ? ' and charging' : ''}`;
    case 'place': return `I am ${c.is === 'outside' ? 'away from' : 'near'} a place (${Number(c.lat).toFixed(3)}, ${Number(c.lon).toFixed(3)})`;
    case 'app_open': return `TaskHub is ${c.is === 'closed' ? 'closed' : 'open'}`;
    case 'variable': return `${c.cond?.left || ''} ${c.cond?.op === 'eq' ? '=' : c.cond?.op || ''} ${c.cond?.right || ''}`.trim();
    case 'notification': return `I get a notification${c.ntype && c.ntype !== 'any' ? ` (${c.ntype.replace('_', ' ')})` : ''}${c.text ? ` with "${c.text}"` : ''}`;
    case 'chat_message': return `A chat message arrives${c.text ? ` with "${c.text}"` : ''}`;
    case 'webhook': return 'A web link is called';
    case 'app_opened': return 'TaskHub is opened';
    default: return (spec?.label || c.type) + (spec?.group === 'To-dos' ? filter() : '');
  }
}

/** The short line under an action in a task: its name and the most telling value. */
export function describeAction(a, catalog) {
  const spec = catalog?.actionByType?.[a.type];
  if (!spec) return a.type;
  const cut = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 70);
  const OP = { eq: 'is', ne: 'is not', gt: '>', lt: '<', ge: '>=', le: '<=', contains: 'contains', not_contains: 'does not contain', starts: 'starts with', ends: 'ends with', matches: 'matches', empty: 'is empty', not_empty: 'is not empty' };
  switch (a.type) {
    case 'if': case 'elseif': return `${spec.label} ${cut(a.cond?.left)} ${OP[a.cond?.op] || ''} ${cut(a.cond?.right)}`.trim();
    case 'for': return a.mode === 'each' ? `Repeat for each in ${cut(a.list)}` : `Repeat ${cut(a.times)} times`;
    case 'wait': return `Wait ${a.seconds} seconds`;
    case 'set_var': return `${cut(a.name)} = ${cut(a.value)}${a.calculate ? ' (calculated)' : ''}`;
    case 'goto': return `Jump to ${cut(a.name)}`;
    case 'label': return `Label ${cut(a.name)}`;
    case 'find_todos': return `Find ${a.which} to-dos`;
    case 'http_request': return `${a.method} ${cut(a.url)}`;
    default: break;
  }
  const first = spec.fields.find((f) => ['text', 'textarea'].includes(f.type) && a[f.key] && !f.raw)
    || spec.fields.find((f) => ['text', 'textarea'].includes(f.type) && a[f.key]);
  return first ? `${spec.label}: ${cut(a[first.key])}` : spec.label;
}

/** How deep each action sits inside If / Repeat blocks, for indenting the list. */
export function depths(actions) {
  const out = [];
  let d = 0;
  for (const a of actions) {
    if (['end_if', 'end_for', 'else', 'elseif'].includes(a.type)) d = Math.max(0, d - 1);
    out.push(d);
    if (['if', 'for', 'else', 'elseif'].includes(a.type)) d += 1;
  }
  return out;
}

const BUILT_IN = ['TIME', 'DATE', 'DAY', 'HOUR', 'MIN', 'WEEKDAY', 'TODAY', 'TOMORROW', 'USER', 'USERID', 'overdue_count', 'today_count', 'open_count'];

/** Names of the variables a person can use at a given point of a task (for the "insert a variable" row). */
export function variablesAt(actions, index, contextVars = [], globals = []) {
  const names = new Set([...contextVars, ...BUILT_IN, ...globals]);
  const clean = (n) => String(n || '').replace(/^%/, '').replace(/[^A-Za-z0-9_]/g, '');
  actions.slice(0, index).forEach((a) => {
    if (a.disabled) return;
    if (['set_var', 'var_split', 'var_join', 'var_replace'].includes(a.type) && clean(a.name)) names.add(clean(a.name));
    if (a.type === 'find_todos') { const n = clean(a.into) || 'found'; names.add(n); names.add(`${n}_ids`); names.add(`${n}_count`); }
    if (a.type === 'for') { const n = clean(a.var) || 'item'; names.add(n); names.add(`${n}_index`); }
    if (a.type === 'http_request') { names.add('http_status'); names.add(clean(a.into) || 'http_body'); }
    if (a.type === 'create_todo') names.add('new_todo_id');
    if (a.type === 'perform_task' && clean(a.into)) names.add(clean(a.into));
  });
  return [...names];
}

/** The matching closer of an If / Repeat (or its opener, from the closer); -1 if there is none. */
export function blockPartner(actions, index) {
  const open = actions[index]?.type;
  const pair = { if: ['if', 'end_if'], for: ['for', 'end_for'] };
  const kind = open === 'if' || open === 'end_if' ? 'if' : open === 'for' || open === 'end_for' ? 'for' : null;
  if (!kind) return -1;
  const [o, c] = pair[kind];
  if (open === o) {
    let d = 0;
    for (let i = index; i < actions.length; i += 1) {
      if (actions[i].type === o) d += 1;
      if (actions[i].type === c) { d -= 1; if (d === 0) return i; }
    }
    return -1;
  }
  let d = 0;
  for (let i = index; i >= 0; i -= 1) {
    if (actions[i].type === c) d += 1;
    if (actions[i].type === o) { d -= 1; if (d === 0) return i; }
  }
  return -1;
}

/** A new action with the defaults the catalog gives each field. */
export function blankAction(spec) {
  const a = { id: Math.random().toString(36).slice(2, 10), type: spec.type };
  for (const f of spec.fields) {
    if (f.default !== undefined) a[f.key] = Array.isArray(f.default) ? [...f.default] : (f.default && typeof f.default === 'object' ? { ...f.default } : f.default);
    else if (f.type === 'bool') a[f.key] = false;
    else if (f.type === 'cond') a[f.key] = { left: '', op: 'eq', right: '' };
    else a[f.key] = '';
  }
  return a;
}

/** The same for a context. */
export function blankContext(spec) {
  const c = { type: spec.type };
  for (const f of spec.fields) {
    if (f.default !== undefined) c[f.key] = Array.isArray(f.default) ? [...f.default] : (f.default && typeof f.default === 'object' ? { ...f.default } : f.default);
    else if (f.type === 'bool') c[f.key] = false;
    else if (f.type === 'days') c[f.key] = [];
    else if (f.type === 'number') c[f.key] = null;
    else c[f.key] = '';
  }
  return c;
}

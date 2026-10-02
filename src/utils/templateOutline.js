// A quick way to write a template: one task per line, two spaces (or a tab) per level of sub-task.
//   Onboard {month} client +0d
//     Collect KYC documents p1 +2d
//     Send welcome email +1d
// "+3d" = due 3 days after the start, "p1".."p3" = priority. Returns a tree for POST /api/templates.

export function parseOutline(text) {
  const lines = String(text || '').split('\n').filter((l) => l.trim());
  const root = { children: [], depth: -1 };
  const stack = [root];
  lines.forEach((raw) => {
    const indent = raw.match(/^[ \t]*/)[0].replace(/\t/g, '  ').length;
    const depth = Math.floor(indent / 2);
    let title = raw.trim().replace(/^[-*•]\s+/, '');
    const node = {};
    const offset = title.match(/\s\+(\d{1,3})d$/i);
    if (offset) { node.offset_days = Number(offset[1]); title = title.slice(0, offset.index).trim(); }
    const prio = title.match(/(?:^|\s)p([1-3])$/i);
    if (prio) { node.priority = Number(prio[1]); title = title.slice(0, prio.index).trim(); }
    node.title = title;
    while (stack.length > 1 && stack[stack.length - 1].depth >= depth) stack.pop();
    const parent = stack[stack.length - 1];
    node.depth = depth;
    node.children = [];
    parent.children.push(node);
    stack.push(node);
  });
  const strip = (n) => {
    const { depth, children, ...rest } = n;
    const out = { ...rest };
    if (children.length) out.children = children.map(strip);
    return out;
  };
  return root.children.map(strip);
}

/** The tree back as outline text (to edit a template). */
export function toOutline(tree, depth = 0) {
  return (tree || []).map((n) => {
    let line = `${'  '.repeat(depth)}${n.title}`;
    if (n.priority && n.priority < 4) line += ` p${n.priority}`;
    if (n.offset_days !== undefined) line += ` +${n.offset_days}d`;
    return [line, n.children ? toOutline(n.children, depth + 1) : ''].filter(Boolean).join('\n');
  }).join('\n');
}

export function countNodes(tree) {
  return (tree || []).reduce((n, node) => n + 1 + countNodes(node.children), 0);
}

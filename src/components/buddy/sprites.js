/**
 * Pixel art for the cat buddy. Every frame is a grid of characters, one per pixel, built from parts (a
 * head with swappable faces, bodies for each pose, tails, props) so poses stay consistent. A frame is an
 * array of equal-length strings; '.' is transparent. Colours come from PALETTE: the cat is white with a
 * dark outline like the app icon and wears the brand-red collar; props are red, grey or cream so the app
 * keeps to its one colour.
 *
 * Side-on bodies are described as shapes (a test "is this pixel inside?") and get a one-pixel outline
 * automatically; the head and faces are hand-drawn. Plain data and functions only (no React): the renderer
 * turns a frame into one SVG path per colour.
 */

export const PALETTE = {
  k: '#2a1a1a', // outline, eyes
  w: '#ffffff', // fur
  s: '#eadada', // fur in shade (far legs)
  p: '#ffa8b0', // inner ears, nose, toe beans, blush
  t: '#ff7f8a', // tears, sweat
  r: '#dc2626', // collar, hearts, bowl
  d: '#8f1d1d', // bell, darker red
  c: '#ffe0e0', // water in the bowl, glow
  m: '#c9c1c1', // laptop shell
  n: '#5a4646', // laptop keys
  l: '#fff6f6', // screen light
  y: '#ffd9a8', // yarn and butterfly highlight (warm cream)
};

// ---- grid helpers -----------------------------------------------------------------------------------

const blank = (w, h) => Array.from({ length: h }, () => Array(w).fill('.'));
const toRows = (g) => g.map((r) => r.join(''));
const width = (rows) => Math.max(...rows.map((r) => r.length));

/** Draw `src` rows onto grid `dst` at x, y. mode 'over' paints every pixel; 'under' only empty ones. */
function put(dst, src, x, y, mode = 'over') {
  src.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '.' || ch === ' ') continue;
      const yy = y + j;
      const xx = x + i;
      if (yy < 0 || yy >= dst.length || xx < 0 || xx >= dst[0].length) continue;
      if (mode === 'under' && dst[yy][xx] !== '.') continue;
      dst[yy][xx] = ch === '_' ? '.' : ch; // '_' erases
    }
  });
  return dst;
}

/** Build a frame of w x h from layers: [rows, x, y, mode?] (falsy layers are skipped). */
function frame(w, h, ...layers) {
  const g = blank(w, h);
  layers.filter(Boolean).forEach(([rows, x, y, mode]) => put(g, rows, x, y, mode));
  return toRows(g);
}

/**
 * A filled shape with a one-pixel outline. `inside(x, y)` returns a fill character (or true for fur) for
 * pixels inside, falsy outside; every outside pixel touching an inside one (4-neighbour) becomes outline.
 */
function blob(w, h, inside) {
  const g = blank(w, h);
  const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? inside(x, y) : false);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = at(x, y);
      if (v) g[y][x] = v === true ? 'w' : v;
      else if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) g[y][x] = 'k';
    }
  }
  return toRows(g);
}

/** Inside a rectangle with its four corner pixels cut (a rounded box). */
const rbox = (x0, y0, x1, y1) => (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1
  && !((x === x0 || x === x1) && (y === y0 || y === y1));

/** Distance from (px, py) to the segment a-b. */
function segDist(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
/** Inside a thick line through the points (a tail). */
const stroke = (pts, r = 0.6) => (x, y) => pts.slice(1).some((p, i) => segDist(x, y, pts[i], p) <= r);

const mirror = (rows) => rows.map((r) => r.split('').reverse().join(''));

// ---- the head (16 x 10) and its faces ---------------------------------------------------------------

const HEAD = [
  '..k..........k..',
  '..kk........kk..',
  '..kpk......kpk..',
  '.kwpwkkkkkkwpwk.',
  '.kwwwwwwwwwwwwk.',
  'kwwwwwwwwwwwwwwk',
  'kwwwwwwwwwwwwwwk',
  'kwwwwwwwwwwwwwwk',
  'kwwwwwwwwwwwwwwk',
  '.kwwwwwwwwwwwwk.',
];

// Faces are drawn over rows 5..9 of the head ('.' keeps the fur).
const FACES = {
  normal: [
    '................',
    '...kk......kk...',
    '...kk......kk...',
    '..p...kppk...p..',
    '.......kk.......',
  ],
  lookR: [
    '................',
    '....kk......kk..',
    '....kk......kk..',
    '..p...kppk...p..',
    '.......kk.......',
  ],
  lookL: [
    '................',
    '..kk......kk....',
    '..kk......kk....',
    '..p...kppk...p..',
    '.......kk.......',
  ],
  lookDown: [
    '................',
    '................',
    '....kk......kk..',
    '..p.kkkppk..kkp.',
    '.......kk.......',
  ],
  blink: [
    '................',
    '................',
    '...kk......kk...',
    '..p...kppk...p..',
    '.......kk.......',
  ],
  happy: [
    '................',
    '....k......k....',
    '...k.k....k.k...',
    '..p...kppk...p..',
    '.......kk.......',
  ],
  love: [
    '................',
    '..r.r.....r.r...',
    '..rrr.....rrr...',
    '..prp.kppk.rp...',
    '.......kk.......',
  ],
  kiss: [
    '................',
    '....k......k....',
    '...k.k....k.k...',
    '..p....pp....p..',
    '.......rr.......',
  ],
  meow: [
    '................',
    '...kk......kk...',
    '...kk......kk...',
    '..p...kppk...p..',
    '.......rr.......',
  ],
  sad: [
    '..k..........k..',
    '...kk......kk...',
    '...kk......kk...',
    '..tp...pp...pt..',
    '..t...k..k...t..',
  ],
  cry: [
    '..k..........k..',
    '...kk......kk...',
    '..tkk......kkt..',
    '..t....pp....t..',
    '..t...kkkk...t..',
  ],
  sleep: [
    '................',
    '................',
    '..k..k....k..k..',
    '..pkk..pp..kkp..',
    '.......kk.......',
  ],
  dizzy: [
    '..k.k......k.k..',
    '...k........k...',
    '..k.k......k.k..',
    '..p....pp....p..',
    '......kkkk......',
  ],
  shock: [
    '..kkk......kkk..',
    '..kwk......kwk..',
    '..kkk......kkk..',
    '..p....pp....p..',
    '.......kk.......',
  ],
  grumpy: [
    '..kk........kk..',
    '....k......k....',
    '...kk......kk...',
    '..p....pp....p..',
    '......kkkk......',
  ],
  sweat: [
    '.............t..',
    '...kk......kktt.',
    '...kk......kk...',
    '..p...kppk...p..',
    '......kkkk......',
  ],
};

const headWith = (face) => frame(16, 10, [HEAD, 0, 0], [FACES[face] || FACES.normal, 0, 5]);

// ---- sitting, facing you (22 x 17) ------------------------------------------------------------------

const BODY_SIT = [
  '..krrrrrrrrrrk..',
  '..kwwwwddwwwwk..',
  '.kwwwwwwwwwwwwk.',
  '.kwwwwwwwwwwwwk.',
  '.kwwswwwwwwswwk.',
  '.kwwkwwwwwwkwwk.',
  '.kkkkkkkkkkkkkk.',
];
// The right front paw is up (at the cheek: grooming, blowing a kiss, waving).
const BODY_SIT_PAW = [
  '..krrrrrrrrrrk..',
  '..kwwwwddwwwwk..',
  '.kwwwwwwwwwwwwk.',
  '.kwwwwwwwwwwwwk.',
  '.kwwswwwwwwwwwk.',
  '.kwwkwwwwwwwwwk.',
  '.kkkkkkkkkkkkkk.',
];
const MITT = ['.kkk.', 'kwwwk', 'kwwwk', 'kpwpk', '.kkk.'];

const TAIL_SIT = [
  ['....kk.', '...kwwk', '...kwk.', '...kwk.', '...kwk.', '..kwk..', '.kwwk..', 'kwwk...', 'kkk....'],
  ['.......', '.....kk', '....kwk', '...kwk.', '...kwk.', '..kwk..', '.kwwk..', 'kwwk...', 'kkk....'],
  ['...kk..', '..kwwk.', '..kwk..', '...kwk.', '...kwk.', '..kwk..', '.kwwk..', 'kwwk...', 'kkk....'],
];

/** Sitting, facing you. paw: 0 down, 1 at the cheek, 2 raised high (waving). */
const sit = (face = 'normal', tail = 0, paw = 0) => frame(22, 17,
  [paw ? BODY_SIT_PAW : BODY_SIT, 0, 10],
  [headWith(face), 0, 0],
  paw === 1 && [MITT, 11, 8],
  paw === 2 && [blob(22, 17, stroke([[12, 13], [15, 9]], 0.8)), 0, 0],
  paw === 2 && [MITT, 14, 5],
  [TAIL_SIT[tail], 14, 8, 'under'],
);

// ---- a sitting cat holding a water bottle in its paw; tilted up to its mouth when it drinks -------------

const BOTTLE_UP = ['.kkk.', '.krk.', 'kkkkk', 'kcccK', 'kcccK', 'kcccK', 'kcccK', 'kkkkk'].map((r) => r.replace('K', 'k'));
const BOTTLE_TILT = ['..kkkk..', '.krrkcck', 'kkkkcccck', '.kcccccck', '..kkkkkk.'].map((r) => r.replace('K', 'k'));

/** tilt 0: the bottle held up beside the head; tilt 1: raised to the mouth, the head tipped back. */
const sitBottle = (face = 'normal', tail = 0, tilt = 0) => frame(22, 17,
  [BODY_SIT_PAW, 0, 10],
  [headWith(face), 0, 0],
  tilt ? [BOTTLE_TILT, 8, 6] : [BOTTLE_UP, 15, 3],
  [MITT, tilt ? 12 : 11, tilt ? 9 : 8],
  [TAIL_SIT[tail], 14, 8, 'under'],
);

// ---- standing / walking, side on (28 x 18); the head stays turned toward you ------------------------

const SIDE_W = 28;
const SIDE_H = 18;

const TAILS = [
  [[5, 11], [3, 9], [2, 6], [3, 3], [5, 2]],
  [[5, 11], [3, 9], [2, 6], [1, 3], [2, 1]],
  [[5, 11], [3, 9], [3, 6], [5, 4], [6, 2]],
];
const tailBlob = (i, dy = 0) => blob(SIDE_W, SIDE_H, stroke(TAILS[i].map(([x, y]) => [x, y + dy]), 0.75));

/** One leg: 2 pixels wide, from the belly to the floor (or `lift` pixels short), fur or shade. */
const legBlob = (x, lift = 0, shade = false) => blob(SIDE_W, SIDE_H, (px, py) => px >= x && px <= x + 1 && py >= 12 && py <= 16 - lift && (shade ? 's' : 'w'));

const bodySide = (dy = 0) => {
  const rows = blob(SIDE_W, SIDE_H, rbox(5, 9 + dy, 22, 13 + dy));
  const g = rows.map((r) => r.split(''));
  // Collar round the neck and the bell under the chin.
  for (let x = 15; x <= 22; x++) if (g[10 + dy][x] === 'w') g[10 + dy][x] = 'r';
  if (g[11 + dy][19] === 'w') { g[11 + dy][19] = 'd'; g[11 + dy][20] = 'd'; }
  return toRows(g);
};

// Walk cycle: [x, lift] for far-back, near-back, far-front, near-front.
const STRIDES = [
  [[9, 0], [6, 0], [20, 0], [17, 0]],
  [[8, 1], [7, 0], [19, 0], [18, 1]],
  [[7, 0], [8, 0], [18, 0], [19, 0]],
  [[6, 0], [9, 1], [17, 1], [20, 0]],
];

/** Standing / walking (step 0..3), facing right. typing: lift the near front paw on even steps. */
const side = (face = 'lookR', step = 0, tail = 0, { bob = 0, typing = false } = {}) => {
  const [fb, nb, ff, nf] = STRIDES[typing ? 2 : step];
  const frontLift = typing ? (step % 2 ? 0 : 3) : nf[1];
  const farLift = typing ? (step % 2 ? 3 : 0) : ff[1];
  return frame(SIDE_W, SIDE_H,
    [tailBlob(tail, bob), 0, 0],
    [legBlob(fb[0], fb[1], true), 0, 0],
    [legBlob(ff[0], farLift, true), 0, 0],
    [bodySide(bob), 0, 0],
    [legBlob(nb[0], nb[1]), 0, 0],
    [legBlob(nf[0], frontLift), 0, 0],
    [headWith(face), 12, bob],
  );
};

// ---- lying down: loaf (paws tucked) and sleeping curl (28 x 18) --------------------------------------

/** Loaf: lying with paws tucked under. breath lifts the back a pixel; low lays the head on the paws. */
const loaf = (face = 'normal', breath = 0, low = false) => frame(SIDE_W, SIDE_H,
  [blob(SIDE_W, SIDE_H, (x, y) => rbox(3, 12 - breath, 23, 16)(x, y) || (y >= 15 && y <= 16 && x >= 22 && x <= 25)), 0, 0],
  // the tail wrapped round the front
  [blob(SIDE_W, SIDE_H, (x, y) => y === 16 && x >= 6 && x <= 17), 0, 0],
  [headWith(face), 12, low ? 7 : 4],
);

/** Flat on its back, legs in the air (fainted from thirst). */
const flat = (face = 'dizzy') => frame(30, SIDE_H,
  [blob(30, SIDE_H, (x, y) => [4, 8, 13, 17].some((lx) => x === lx && y >= 8 && y <= 12) && (y === 8 ? 'p' : true)), 0, 0],
  [blob(30, SIDE_H, rbox(2, 12, 19, 16)), 0, 0],
  [headWith(face), 14, 7],
);

// ---- stretch (play bow): head and front paws low, back end up (32 x 18) -------------------------------

const STRETCH_W = 32;
const stretchPose = (face = 'happy', tail = 0, { paws = true } = {}) => {
  const top = (x) => 3 + Math.round((x - 4) * 0.42);
  const bottom = (x) => 8 + Math.round((x - 4) * 0.36);
  const body = (x, y) => x >= 4 && x <= 21 && y >= top(x) && y <= bottom(x) && !(x === 4 && y === top(x));
  const tails = [[[5, 4], [3, 2], [3, 0]], [[5, 4], [4, 1], [6, 0]], [[5, 4], [2, 2], [1, 0]]];
  return frame(STRETCH_W, SIDE_H,
    [blob(STRETCH_W, SIDE_H, stroke(tails[tail], 0.75)), 0, 0],
    [blob(STRETCH_W, SIDE_H, (x, y) => (x >= 7 && x <= 8 && y >= 9 && y <= 16 && 's')), 0, 0],
    [blob(STRETCH_W, SIDE_H, body), 0, 0],
    [blob(STRETCH_W, SIDE_H, (x, y) => x >= 4 && x <= 5 && y >= 9 && y <= 16), 0, 0],
    [headWith(face), 13, 7],
    paws && [blob(STRETCH_W, SIDE_H, (x, y) => y >= 15 && y <= 16 && x >= 23 && x <= 30 && (x === 30 && y === 15 ? 'p' : true)), 0, 0],
  );
};

// ---- props --------------------------------------------------------------------------------------------

export const PROPS = {
  heart: ['.rr.rr.', 'rrrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'],
  heartSmall: ['r.r', 'rrr', '.r.'],
  z: ['kkkk', '..k.', '.k..', 'kkkk'],
  zSmall: ['kkk', '.k.', 'kkk'],
  drop: ['..k..', '.kck.', 'kccck', 'kccck', '.kkk.'],
  sweat: ['.t.', 'ttt', '.t.'],
  bang: ['rr', 'rr', 'rr', '..', 'rr'],
  ques: ['.kkk.', 'k...k', '...k.', '..k..', '.....', '..k..'],
  note: ['..kk', '..kk', '..k.', 'kkk.', 'kk..'],
  bottleLying: ['kkk.........', 'krk.kkkkkkkk', 'kkkkcccccccck', '...kkkkkkkkk'],
  bowlEmpty: ['k..........k', 'krrrrrrrrrrk', '.krrrrrrrrk.', '..kkkkkkkk..'],
  bowlFull: ['kcccccccccck', 'krrrrrrrrrrk', '.krrrrrrrrk.', '..kkkkkkkk..'],
  yarn: ['..kkk..', '.kryrk.', 'krrryrk', 'kryrrrk', 'krrrryk', '.kryrk.', '..kkk..'],
  butterfly0: ['rr.rr', 'ryryr', '.rkr.', 'rr.rr'],
  butterfly1: ['.r.r.', 'rrkrr', '.rkr.', '..k..'],
  mug: ['.kkkkk.', '.kwwwkk', '.kwrwk.k', '.kwwwkk', '..kkk..'],
  fish: ['..kkk...k', '.kwwwk.kk', 'kwkwwwkwk', '.kwwwk.kk', '..kkk...k'],
  // A laptop seen from the side: the lid stands up on the right, keys along the base.
  laptop: [
    '.............kk',
    '............klk',
    '...........kllk',
    '..........kllk.',
    '.........kllk..',
    '........kllk...',
    'kkkkkkkkkkkk...',
    'kmnmnmnmnmmk...',
    'kkkkkkkkkkkk...',
  ],
  laptopGlow: [
    '.............kk',
    '............kck',
    '...........kcck',
    '..........kcck.',
    '.........kcck..',
    '........kcck...',
    'kkkkkkkkkkkk...',
    'kmnmnmnmnmmk...',
    'kkkkkkkkkkkk...',
  ],
};

// ---- typing: facing you behind a laptop, paws tapping over the lid (22 x 18) ---------------------------

const LID = [
  'kkkkkkkkkkkkkkkkkk',
  'kmmmmmmmmmmmmmmmmk',
  'kmmmmmmrmrmmmmmmmk',
  'kmmmmmmrrrmmmmmmmk',
  'kmmmmmmmrmmmmmmmmk',
  'kmmmmmmmmmmmmmmmmk',
  'kkkkkkkkkkkkkkkkkk',
  'knnnnnnnnnnnnnnnnk',
  'kkkkkkkkkkkkkkkkkk',
];
const PAW = ['.kk.', 'kwwk', 'kwwk'];

/** typing step 0..3: which paw is down on the keys. */
const typingFront = (face = 'lookDown', step = 0, tail = 0) => frame(22, 20,
  [BODY_SIT, 0, 10],
  [headWith(face), 0, 0],
  [TAIL_SIT[tail], 14, 8, 'under'],
  [PAW, 2, step % 2 ? 8 : 10],
  [PAW, 11, step % 2 ? 10 : 8],
  [LID, 0, 11],
);

// ---- the frame set the buddy plays ------------------------------------------------------------------

/** name -> list of frames (each an array of strings). Facing right; the renderer mirrors for left. */
export const ANIMS = {
  sit: [sit('normal', 0), sit('normal', 0), sit('normal', 1), sit('blink', 1), sit('normal', 2), sit('normal', 0)],
  lookL: [sit('lookL', 0), sit('lookL', 1)],
  lookR: [sit('lookR', 0), sit('lookR', 1)],
  happy: [sit('happy', 0), sit('happy', 1), sit('happy', 2), sit('happy', 1)],
  love: [sit('love', 0), sit('love', 1)],
  kiss: [sit('kiss', 0, 1), sit('kiss', 1, 1)],
  meow: [sit('meow', 0), sit('normal', 1), sit('meow', 2), sit('normal', 0)],
  wave: [sit('happy', 0, 2), sit('happy', 1, 1), sit('happy', 2, 2), sit('happy', 1, 1)],
  groom: [sit('blink', 0, 1), sit('happy', 1, 1), sit('blink', 2, 1), sit('happy', 1, 1)],
  sad: [sit('sad', 0), sit('sad', 1)],
  cry: [sit('cry', 0), sit('cry', 1), sit('sad', 1)],
  grumpy: [sit('grumpy', 0), sit('grumpy', 1)],
  sweat: [sit('sweat', 0), sit('sweat', 1)],
  shock: [sit('shock', 2)],
  holdBottle: [sitBottle('normal', 0), sitBottle('normal', 1), sitBottle('blink', 2), sitBottle('normal', 1)],
  askBottle: [sitBottle('meow', 0), sitBottle('normal', 1), sitBottle('meow', 2), sitBottle('normal', 0)],
  cryBottle: [sitBottle('cry', 0), sitBottle('cry', 1), sitBottle('sad', 1)],
  sip: [sitBottle('happy', 0), sitBottle('blink', 1, 1), sitBottle('happy', 1, 1), sitBottle('blink', 2, 1), sitBottle('happy', 1)],
  walk: [side('lookR', 0, 0), side('lookR', 1, 1, { bob: 1 }), side('lookR', 2, 2), side('lookR', 3, 1, { bob: 1 })],
  stand: [side('lookR', 2, 0), side('lookR', 2, 1), side('blink', 2, 2), side('lookR', 2, 1)],
  typing: [typingFront('lookDown', 0, 0), typingFront('lookDown', 1, 1), typingFront('lookDown', 0, 2), typingFront('blink', 1, 1)],
  typingIdle: [typingFront('normal', 0, 0), typingFront('blink', 0, 1), typingFront('normal', 0, 2), typingFront('lookR', 0, 1)],
  loaf: [loaf('normal', 0), loaf('blink', 1), loaf('normal', 0), loaf('normal', 1)],
  sleep: [loaf('sleep', 0, true), loaf('sleep', 0, true), loaf('sleep', 1, true), loaf('sleep', 1, true)],
  stiff: [loaf('grumpy', 0), loaf('grumpy', 0), loaf('sweat', 0)],
  flat: [flat('dizzy'), flat('dizzy'), flat('cry')],
  stretch: [stretchPose('happy', 0), stretchPose('blink', 1), stretchPose('happy', 2), stretchPose('happy', 1)],
  drink: [stretchPose('blink', 0, { paws: false }), stretchPose('happy', 1, { paws: false })],
  pounce: [stretchPose('lookR', 0), stretchPose('lookR', 2)],
  jump: [side('shock', 0, 2)],
  dangle: [frame(22, 20,
    [BODY_SIT_PAW.slice(0, 5), 0, 10],
    [blob(22, 20, (x, y) => ((x >= 3 && x <= 4) || (x >= 11 && x <= 12)) && y >= 14 && y <= 17), 0, 0],
    [headWith('shock'), 0, 0],
    [TAIL_SIT[1], 13, 9, 'under'],
  )],
};

/** Width and height of a frame in pixels. */
export const frameSize = (rows) => ({ w: width(rows), h: rows.length });
export { mirror };

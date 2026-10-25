import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import { openNotificationTarget } from '../../navigation/navigationRef';
import { useTheme } from '../../context/ThemeContext';
import { useTodos } from '../../context/TodoContext';
import { featureOn } from '../../utils/features';
import { on, emit } from '../../utils/events';
import { isFocusActive } from '../../utils/focus';
import { playMeow, playPurr, haptic, catMeowRate } from '../../utils/feedback';
import { remindersOf, CRY_SCALE } from '../../utils/reminders';
import { todayYmd, toYmd } from '../../utils/dates';
import { readWater } from '../WaterReminder';
import { readStretch } from '../StretchBreak';
import { buddyOf, COATS, HATS, DEFAULT_NAME, SHOP, bondLevel, bondStart, BOND_TITLES } from '../../utils/buddyProfile';
import { PROPS, animsFor, frameSize, paletteFor } from './sprites';
import { Sprite } from './Sprite';

/**
 * Mochi, the pixel cat that lives at the bottom of the screen: a small Tamagotchi made of the same white
 * pixels as the app icon. It wanders along the bottom (and up onto the floating bars), sits, grooms, naps,
 * chases a butterfly, bats a ball of yarn and knocks a mug off the edge. It reacts to the app:
 *  - adding a task: it leaps onto the Quick add dialog and types on a little laptop while you type,
 *  - finishing a task: it blows you a kiss (and earns a treat),
 *  - water and stretch: it gets thirsty / stiff with you, and the longer they are ignored the louder it
 *    gets (sad, crying and hopping, then fainting with a red glow round the screen) until you drink or
 *    stretch. Tapping it then opens the reminder.
 * Click it for its stats and toys, double-click to pet it, drag it to pick it up by the scruff. The card also
 * renames it and changes its coat and hat (kept on the account as `preferences.buddy`).
 * Optional behaviours each have their own feature switch (buddy_chase, buddy_rows, buddy_mood, buddy_life,
 * buddy_cheer): it follows and pounces on the pointer, hops onto your tasks and nudges overdue ones, takes its
 * mood from your work, has small habits through the day, and celebrates bigger.
 *
 * It is drawn with the DOM (one SVG per frame, one path per colour) and moved by one animation-frame
 * loop that writes transforms directly; React only re-renders when the frame or a bubble changes.
 * Everything is local to this device; it is off with the "Cat buddy" feature switch.
 */

const FPS_MS = 130;               // frame tick
const GRAVITY = 2200;             // px/s^2
const WALK = 46;                  // px/s
const IDLE_SLEEP_MS = 4 * 60e3;   // no input for this long: the cat naps until you come back
const MIN = 60e3;
const storeKey = (id) => `th.buddy.${id}`;

const LINES = {
  complete: ['Mwah!', 'Good job!', 'Purr-fect.', 'One less thing!', 'You did it!', 'Proud of you.', 'Look at you go!', 'Nailed it.', 'Kiss for that one.'],
  combo: ['On fire!', 'Unstoppable!', 'Zoom zoom!', 'Another one!'],
  added: ['Got it!', 'Noted.', 'Into the Inbox.', 'Saved!', 'Typed it up.'],
  hello: ['Hi!', 'Meow.', 'Need a break?', 'I am here if you need me.', 'Pet me?', '*stares at you*', 'Is it treat time?'],
  water1: ['Water time? I brought my bottle.', 'Mrrp. Thirsty. You too?', 'Drink with me?'],
  water2: ['I am SO thirsty...', 'Please... one glass of water?', 'My bottle is empty and so is your glass.'],
  water3: ['*faints from thirst*', 'Too... dry... drink to save me.'],
  stretch1: ['Stretch with me!', 'Big stretch time.', 'Up! One minute stretch.'],
  stretch2: ['I am getting stiff...', 'My back! Your back! Stretch!', 'Creak. Creak.'],
  stretch3: ['*stuck as a loaf*', 'I cannot feel my legs. Stretch, please.'],
  drank: ['Ahh! Refreshing.', 'Slurp slurp.', 'Hydrated!'],
  stretched: ['Ahh, much better.', 'So bendy now.', 'Nice stretch!'],
  focus: ['Deep work!', 'Focus champion.', 'That was some focus.'],
  wake: ['Huh? I was awake.', '...five more minutes.', 'Mrrp?'],
  mug: ['Oops.', '*clink*', 'It was like that when I got here.'],
  row: ['Nice task you have here.', 'Just checking on this one.', 'Mind if I sit?', 'Keeping it warm.'],
  overdue: ['This one is overdue. Just saying.', 'Hmm. This should have been done by now.', 'Looking at you, overdue task.'],
  push: ['*push*', 'Whoops. Did that move?', 'Gravity test.'],
  gloomy: ['So much overdue...', 'Tiny cat, big pile.', 'Can we tackle one today?'],
  sunny: ['Nothing overdue!', 'A good day to be a cat.', 'Everything is on track.'],
  coffee: ['Coffee first. Always coffee first.', 'Mmm, morning coffee.'],
  lunch: ['Lunch time!', 'Did you eat? I did.'],
  yawn: ['*yawn* Long day.', 'Almost time to go home.', 'Five more tasks and a nap.'],
  stalk: ['Got it!', 'Mine.', 'It got away.', 'Pounce!'],
  weekend: ['Is it the weekend?', 'Party time.'],
};
/** What a visiting cat says, from the kind of notification that brought it. */
function visitLine(kind = '', owner = 'Someone') {
  const k = String(kind);
  if (/assign|delegate|shared|proposed|added/.test(k)) return `${owner} sent you a task.`;
  if (/comment|reply|mention/.test(k)) return `${owner} wrote to you.`;
  if (/kudos|thank/.test(k)) return `${owner} says thanks!`;
  if (/nudge|bell/.test(k)) return `${owner} is ringing the bell!`;
  if (/approv|done|completed|review/.test(k)) return `${owner} has news about a task.`;
  if (/chat/.test(k)) return `${owner} messaged you.`;
  return `${owner} says hi.`;
}
const pickLine = (k) => LINES[k][Math.floor(Math.random() * LINES[k].length)];
const rand = (a, b) => a + Math.random() * (b - a);

function loadState(id) {
  const fresh = { treats: 3, happiness: 70, day: todayYmd(), hiddenDay: null, pets: 0, bond: 0, owned: [], best: 0 };
  try { return { ...fresh, ...(JSON.parse(localStorage.getItem(storeKey(id)) || 'null') || {}) }; } catch { return fresh; }
}
function saveState(id, s) {
  try { localStorage.setItem(storeKey(id), JSON.stringify(s)); } catch { /* storage blocked */ }
}

// ---- drawing --------------------------------------------------------------------------------------------

const CSS = `
@keyframes buddy-float { 0% { opacity: 0; transform: translate(0, 0) scale(.6); } 15% { opacity: 1; transform: translate(calc(var(--dx) * .2), -10px) scale(1); } 100% { opacity: 0; transform: translate(var(--dx), var(--rise)) scale(1); } }
@keyframes buddy-pop { 0% { opacity: 0; transform: translate(-50%, 6px) scale(.85); } 100% { opacity: 1; transform: translate(-50%, 0) scale(1); } }
@keyframes buddy-glow { 0%, 100% { box-shadow: inset 0 0 60px 6px rgba(220, 38, 38, .28); } 50% { box-shadow: inset 0 0 110px 22px rgba(220, 38, 38, .55); } }
@keyframes buddy-fall { 0% { transform: translate(0, 0) rotate(0); } 100% { transform: translate(var(--dx), 120vh) rotate(540deg); } }
@keyframes buddy-peek { from { transform: translateY(105%); } to { transform: translateY(0); } }
@keyframes buddy-shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-2px); } 75% { transform: translateX(2px); } }
.buddy-cat { position: fixed; left: 0; top: 0; pointer-events: auto; touch-action: none; cursor: grab; will-change: transform; -webkit-tap-highlight-color: transparent; user-select: none; }
.buddy-cat:active { cursor: grabbing; }
.buddy-cat.shake svg { animation: buddy-shake .25s linear infinite; }
.buddy-fx { position: fixed; left: 0; top: 0; pointer-events: none; animation: buddy-float var(--life, 1.6s) cubic-bezier(.2,.7,.3,1) forwards; }
.buddy-bubble { position: absolute; bottom: 100%; left: 50%; margin-bottom: 8px; transform: translate(-50%, 0); animation: buddy-pop .18s cubic-bezier(.2,.8,.3,1.2); min-width: 92px; max-width: 220px; width: max-content; padding: 7px 10px; border-radius: 10px; font: 600 12.5px/1.35 System, Inter, sans-serif; text-align: center; pointer-events: auto; cursor: default; }
.buddy-bubble::after { content: ''; position: absolute; top: 100%; left: calc(50% - 6px + var(--tail, 0px)); border: 6px solid transparent; border-top-color: var(--bubble-border); }
.buddy-bubble button { font: 700 12px System, Inter, sans-serif; border: 0; border-radius: 999px; padding: 5px 10px; margin: 6px 3px 0; cursor: pointer; }
.buddy-card { position: absolute; bottom: 100%; left: 50%; transform: translate(-50%, 0); margin-bottom: 10px; width: 236px; padding: 12px; border-radius: 16px; font: 500 12.5px/1.4 System, Inter, sans-serif; pointer-events: auto; cursor: default; animation: buddy-pop .2s cubic-bezier(.2,.8,.3,1.2); }
.buddy-card h4 { margin: 0 0 2px; font: 800 15px System, Inter, sans-serif; }
.buddy-card .bar { height: 7px; border-radius: 4px; overflow: hidden; margin: 3px 0 7px; }
.buddy-card .bar i { display: block; height: 100%; border-radius: 4px; background: #dc2626; }
.buddy-card .acts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.buddy-card .acts button { flex: 1 1 calc(50% - 6px); font: 700 12px System, Inter, sans-serif; border: 0; border-radius: 10px; padding: 7px 6px; cursor: pointer; }
.buddy-glow { position: fixed; inset: 0; pointer-events: none; animation: buddy-glow 1.6s ease-in-out infinite; }
.buddy-toy { position: fixed; left: 0; top: 0; pointer-events: none; will-change: transform; }
.buddy-mug-fall { animation: buddy-fall 1.1s cubic-bezier(.5,0,.9,.6) forwards; }
@media (prefers-reduced-motion: reduce) { .buddy-glow { animation: none; box-shadow: inset 0 0 80px 12px rgba(220,38,38,.4); } }
`;

// ---- the buddy ------------------------------------------------------------------------------------------

export default function CatBuddy() {
  const { user, updatePreferences } = useAuth();
  const { theme } = useTheme();
  const { todos } = useTodos();
  const enabled = !!user && featureOn(user.preferences, 'buddy');
  const userId = user?.id;

  const [hiddenToday, setHiddenToday] = useState(() => (userId ? loadState(userId).hiddenDay === todayYmd() : false));
  useEffect(() => { if (userId) setHiddenToday(loadState(userId).hiddenDay === todayYmd()); }, [userId]);
  if (!enabled || hiddenToday) return null;
  return <Buddy userId={userId} dark={theme === 'dark'} todos={todos} prefs={user.preferences} update={updatePreferences} onHide={() => setHiddenToday(true)} />;
}

function Buddy({ userId, dark, todos, prefs, update, onHide }) {
  const small = typeof window !== 'undefined' && (window.innerWidth < 700 || window.matchMedia?.('(pointer: coarse)').matches);
  const S = small ? 2.5 : 3;

  // What React draws.
  const [anim, setAnim] = useState('sit');
  const [tick, setTick] = useState(0);
  const [flip, setFlip] = useState(false);
  const [bubble, setBubble] = useState(null); // { text, actions?: [{ label, onPress, primary }] }
  const [fx, setFx] = useState([]);           // floating hearts, Zs, drops
  const [toy, setToy] = useState(null);       // { kind: 'yarn' | 'butterfly' | 'mug' | 'bowl' | 'bowlFull' | 'fish', x, y }
  const [card, setCard] = useState(false);
  const [guests, setGuests] = useState([]);    // other people's cats visiting this screen
  const [edit, setEdit] = useState(false);        // the card shows the name / coat / hat editor
  const [nameDraft, setNameDraft] = useState('');
  const [shopMsg, setShopMsg] = useState('');
  const [game, setGame] = useState(false);
  const [peek, setPeek] = useState(null);       // the cat popping up from the bottom edge with a notification
  useEffect(() => { if (!card) setEdit(false); }, [card]);
  const [glow, setGlow] = useState(false);
  const [layer, setLayer] = useState(9500);
  const [hidden, setHidden] = useState(false);
  const [shake, setShake] = useState(false);
  const [, force] = useState(0);

  const rootRef = useRef(null);
  const bubbleRef = useRef(null);
  const toyRef = useRef(null);
  const animRef = useRef(anim);
  animRef.current = anim;
  const todosRef = useRef(todos);
  todosRef.current = todos;

  // Who this cat is, and which optional behaviours are on (read by the loop, so kept in refs).
  const profile = buddyOf(prefs);
  const nameRef = useRef(profile.name);
  nameRef.current = profile.name;
  // The water / stretch timing and the cat's voice are the person's own settings (`preferences.reminders`).
  const rem = remindersOf(prefs);
  const remRef = useRef(rem);
  remRef.current = rem;
  const flags = useRef({});
  flags.current = {
    social: featureOn(prefs, 'buddy_social'),
    chase: featureOn(prefs, 'buddy_chase'),
    rows: featureOn(prefs, 'buddy_rows'),
    mood: featureOn(prefs, 'buddy_mood'),
    life: featureOn(prefs, 'buddy_life'),
    cheer: featureOn(prefs, 'buddy_cheer'),
    bond: featureOn(prefs, 'buddy_bond'),
    games: featureOn(prefs, 'buddy_games'),
    peek: featureOn(prefs, 'buddy_peek'),
  };
  const hat = profile.hat !== 'none' ? profile.hat : (flags.current.life && new Date().getDay() === 6 ? 'party' : 'none'); // Saturdays are party days
  const ANIMS = animsFor(hat);
  const coatPalette = useMemo(() => paletteFor(profile.coat), [profile.coat]);
  const saveLook = (patch) => update?.({ buddy: { ...profile, ...patch } });
  /** Is this look free, already bought, or on right now? (With the shop switched off everything is free.) */
  const owned = (kind, key) => !SHOP[kind][key] || !flags.current.bond || (pet.current.owned || []).includes(`${kind}:${key}`) || profile[kind] === key;
  const shopTitle = (kind, key, label) => (owned(kind, key) ? label : `${label}: ${SHOP[kind][key].cost} treats, bond level ${SHOP[kind][key].level}`);
  /** Wear a look, buying it first if it is in the shop and there are enough treats and bond. */
  const choose = (kind, key) => {
    if (owned(kind, key)) { saveLook({ [kind]: key }); setShopMsg(''); return; }
    const price = SHOP[kind][key];
    const level = bondLevel(pet.current.bond);
    if (level < price.level) { setShopMsg(`Needs bond level ${price.level}; you are at ${level}. Pet, play and finish tasks.`); return; }
    if ((pet.current.treats || 0) < price.cost) { setShopMsg(`That costs ${price.cost} treats and you have ${pet.current.treats || 0}. Finish tasks to earn more.`); return; }
    savePet({ treats: pet.current.treats - price.cost, owned: [...(pet.current.owned || []), `${kind}:${key}`] });
    saveLook({ [kind]: key });
    setShopMsg(`Bought for ${price.cost} treats!`);
    spawn('heart', 3);
  };
  const sizeRef = useRef({ w: 22 * S, h: 17 * S });
  const pet = useRef(loadState(userId));
  const savePet = (patch) => { pet.current = { ...pet.current, ...patch }; saveState(userId, pet.current); force((n) => n + 1); };
  /** Bond grows with care; a new level is announced. */
  const gainBond = (n) => {
    const before = bondLevel(pet.current.bond);
    savePet({ bond: (pet.current.bond || 0) + n });
    const after = bondLevel(pet.current.bond);
    if (after > before && flags.current.bond) {
      say(`Bond level ${after}: ${BOND_TITLES[after]}! New things to unlock.`, 4800);
      spawn('heart', 5);
    }
  };
  const finishGame = (score) => {
    const reward = Math.min(6, Math.floor(score / 4));
    const best = Math.max(pet.current.best || 0, score);
    setGame(false);
    savePet({ treats: Math.min(99, (pet.current.treats || 0) + reward), best });
    gainBond(2);
    act('happy', 2600);
    spawn('heart', 4);
    say(`${score} caught${reward ? `, +${reward} treat${reward > 1 ? 's' : ''}` : ''}! Best ${best}.`, 4200);
  };

  // Where it is and what it is doing (read by the loop; never React state).
  const me = useRef({
    x: typeof window !== 'undefined' ? window.innerWidth - 80 : 300,
    y: typeof window !== 'undefined' ? window.innerHeight : 600,
    vx: 0, vy: 0, facing: -1,
    mode: 'fall',          // still | walk | fall | leap | perch | drag
    target: null, onArrive: null, until: 0, onDone: null,
    leap: null,            // { x0, y0, x1, y1, t0, T, peak, then }
    speed: WALK,
    busy: 0,               // a reaction is playing until this time; the scheduler waits
    need: null,            // { kind: 'water' | 'stretch', level }
    lastTyping: 0,
    lastInput: Date.now(),
    pointer: { x: -1, y: -1, at: 0 },
    perchEl: null,
    rowEl: null, rowDx: 0, rowUntil: 0,   // the to-do row it is sitting on
    toyT0: 0,
    asleep: false,
    combo: [],
  });

  // ---- small helpers ----------------------------------------------------------------------------------

  const bubbleTimer = useRef(null);
  const say = useCallback((text, ms = 3200, actions) => {
    clearTimeout(bubbleTimer.current);
    setBubble(text ? { text, actions } : null);
    if (text && ms) bubbleTimer.current = setTimeout(() => setBubble(null), ms);
  }, []);

  const spawn = useCallback((kind, n = 1, opts = {}) => {
    const m = me.current;
    const items = Array.from({ length: n }, (_, i) => ({
      id: `${Date.now()}-${Math.random()}`,
      kind,
      x: m.x + rand(-14, 14) + (opts.dx || 0),
      y: m.y - sizeRef.current.h + rand(-4, 10),
      dx: `${Math.round(rand(-30, 30))}px`,
      rise: `${-Math.round(rand(50, 90))}px`,
      life: opts.life || 1.6,
      delay: i * (opts.stagger ?? 0.18),
    }));
    setFx((list) => [...list.slice(-24), ...items]);
    items.forEach((it) => setTimeout(() => setFx((list) => list.filter((f) => f.id !== it.id)), (it.life + it.delay) * 1000 + 100));
  }, []);

  const floors = useRef([]);
  const floorAt = useCallback((x) => {
    let y = window.innerHeight - 4;
    floors.current.forEach((r) => { if (x >= r.left + 8 && x <= r.right - 8 && r.top < y) y = r.top + 1; });
    return y;
  }, []);

  /** Play an animation for a while (a reaction); the scheduler waits until it is over. */
  const act = useCallback((name, ms, then) => {
    const m = me.current;
    setAnim(name);
    m.mode = m.mode === 'perch' || m.mode === 'row' ? m.mode : 'still';
    m.busy = Date.now() + ms;
    m.until = Date.now() + ms;
    m.onDone = then || null;
  }, []);

  const walkTo = useCallback((x, then, speed = WALK) => {
    const m = me.current;
    const W = window.innerWidth;
    m.target = Math.max(30, Math.min(W - 30, x));
    m.onArrive = then || null;
    m.speed = speed;
    m.mode = 'walk';
    m.facing = m.target > m.x ? 1 : -1;
    setFlip(m.facing < 0);
    setAnim('walk');
  }, []);

  const leapTo = useCallback((x1, y1, then) => {
    const m = me.current;
    const dist = Math.hypot(x1 - m.x, y1 - m.y);
    m.leap = { x0: m.x, y0: m.y, x1, y1, t0: performance.now(), T: Math.min(700, Math.max(320, dist * 0.9)), peak: Math.max(50, Math.abs(y1 - m.y) * 0.35), then };
    m.mode = 'leap';
    m.facing = x1 >= m.x ? 1 : -1;
    setFlip(m.facing < 0);
    setAnim('jump');
  }, []);

  // ---- needs: water and stretch, louder the longer they are ignored ----------------------------------

  const applyNeed = useCallback((need) => {
    const m = me.current;
    m.need = need;
    setGlow(!!need && need.level >= 3);
    if (!need) { setToy((t) => (t && (t.kind === 'bottleLying' ? null : t))); return; }
    if (m.mode === 'perch' || m.mode === 'drag') return;
    const spot = small ? window.innerWidth / 2 : window.innerWidth - 220;
    const settle = () => {
      if (need.kind === 'water') {
        // It holds its own bottle (and sips from it when you drink); passed out, the bottle lies beside it.
        setToy(need.level >= 3 ? { kind: 'bottleLying', x: m.x + 34 * (m.facing || 1), y: floorAt(m.x) } : null);
        if (need.level === 1) { setAnim('askBottle'); say(pickLine('water1'), 0, needActions(need)); }
        if (need.level === 2) { setAnim('cryBottle'); say(pickLine('water2'), 0, needActions(need)); }
        if (need.level >= 3) { setAnim('flat'); say(pickLine('water3'), 0, needActions(need)); }
      } else {
        if (need.level === 1) { setAnim('stretch'); say(pickLine('stretch1'), 0, needActions(need)); }
        if (need.level === 2) { setAnim('stiff'); say(pickLine('stretch2'), 0, needActions(need)); }
        if (need.level >= 3) { setAnim('stiff'); say(pickLine('stretch3'), 0, needActions(need)); }
      }
      m.mode = 'still';
      m.until = Infinity;
    };
    if (Math.abs(m.x - spot) > 40) walkTo(spot, settle, need.level >= 2 ? WALK * 2.2 : WALK * 1.4);
    else settle();
    playMeow({ attention: true, pitch: need.level >= 2 ? 0.85 : 1, length: need.level >= 2 ? 0.8 : 0.5 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floorAt, say, small, walkTo]);

  const needActions = (need) => (need.kind === 'water'
    ? [{ label: 'Drink with me', primary: true, onPress: () => emit('water:open') }, { label: 'Later', onPress: () => say('Fine. I will wait here. Thirsty.', 2500) }]
    : [{ label: "Let's stretch", primary: true, onPress: () => emit('stretch:open') }, { label: 'Later', onPress: () => say('My back will remember this.', 2500) }]);

  // ---- the idle scheduler: what to do next ------------------------------------------------------------

  const think = useCallback(() => {
    const m = me.current;
    if (m.need) { applyNeed(m.need); return; }
    const now = Date.now();
    const hour = new Date().getHours();
    const night = hour >= 21 || hour < 7;
    if (now - m.lastInput > IDLE_SLEEP_MS) {
      m.asleep = true;
      setAnim('sleep');
      m.mode = 'still';
      m.until = Infinity;
      return;
    }
    const W = window.innerWidth;
    const lo = small ? 40 : Math.max(40, W * 0.5);
    const hi = W - 40;
    const roll = Math.random();
    const f = flags.current;
    const { mood } = workMood();
    const pointerFresh = f.chase && m.pointer.x >= 0 && now - m.pointer.at < 5000;
    const choices = [
      [pointerFresh ? 0.28 : 0, () => { if (!stalk()) act('sit', 3000); }],
      [f.rows ? 0.07 + (mood === 'gloomy' ? 0.06 : 0) : 0, () => { if (!visitRow()) act('sit', 3000); }],
      [f.mood && mood === 'gloomy' ? 0.1 : 0, () => { act(Math.random() < 0.5 ? 'sad' : 'grumpy', 3000); say(pickLine('gloomy'), 2600); }],
      [f.mood && mood === 'gloomy' ? 0.06 : 0, () => act('lookL', 2600)],
      [f.mood && mood === 'sunny' ? 0.08 : 0, () => { act('happy', 2400); if (Math.random() < 0.5) say(pickLine('sunny'), 2400); }],
      ...(f.life ? lifeMoves() : []),
      [night ? 0.3 : 0.08, () => { setAnim('sleep'); m.asleep = true; act('sleep', rand(20e3, 60e3), () => { m.asleep = false; act('stretch', 1600); }); }],
      [0.24, () => walkTo(rand(lo, hi), () => act(Math.random() < 0.5 ? 'sit' : 'loaf', rand(4e3, 9e3)))],
      [0.16, () => act('sit', rand(4e3, 8e3))],
      [0.1, () => act('groom', rand(2.5e3, 4e3))],
      [0.08, () => act('loaf', rand(6e3, 12e3))],
      [0.07, () => playYarn()],
      [0.06, () => chaseButterfly()],
      [0.05, () => knockMug()],
      [0.04, () => zoomies()],
      [0.06 * catMeowRate(), () => { act('meow', 2200); playMeow({ pitch: rand(0.9, 1.2) }); say(helloLine(), 3000); }],
      [0.04, () => act('wave', 2200)],
    ];
    const total = choices.reduce((s, [w]) => s + w, 0);
    let acc = 0;
    for (const [w, fn] of choices) {
      acc += w / total;
      if (roll <= acc) { fn(); return; }
    }
    act('sit', 4000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act, applyNeed, small, walkTo]);

  /** Overdue count, tasks finished today and the cat's read of the day. */
  const workMood = () => {
    const today = todayYmd();
    const all = todosRef.current;
    const overdue = all.filter((t) => !t.is_done && !t.parent_id && t.due_date && t.due_date < today).length;
    const doneToday = all.filter((t) => t.is_done && t.done_at && toYmd(new Date(t.done_at)) === today).length;
    return { overdue, doneToday, mood: overdue >= 3 ? 'gloomy' : overdue === 0 ? 'sunny' : 'ok' };
  };

  const helloLine = () => {
    if (flags.current.life && [0, 6].includes(new Date().getDay()) && Math.random() < 0.3) return pickLine('weekend');
    const today = todayYmd();
    const todos = todosRef.current;
    const open = todos.filter((t) => !t.is_done && !t.parent_id);
    const overdue = open.filter((t) => t.due_date && t.due_date < today).length;
    const doneToday = todos.filter((t) => t.is_done && t.done_at && toYmd(new Date(t.done_at)) === today).length;
    const r = Math.random();
    if (overdue && r < 0.35) return `${overdue} overdue... I am not judging. Much.`;
    if (doneToday >= 3 && r < 0.6) return `${doneToday} done today. Treats?`;
    if (!overdue && r < 0.3) return 'Nothing overdue. Nice.';
    return pickLine('hello');
  };

  const playYarn = () => {
    const m = me.current;
    const x = Math.max(40, Math.min(window.innerWidth - 40, m.x + (m.x > window.innerWidth / 2 ? -90 : 90)));
    setToy({ kind: 'yarn', x, y: floorAt(x) });
    walkTo(x - 30 * Math.sign(x - m.x || 1), () => {
      act('pounce', 1300, () => {
        const nx = Math.max(40, Math.min(window.innerWidth - 40, x + rand(-80, 80)));
        setToy({ kind: 'yarn', x: nx, y: floorAt(nx), rolling: true });
        walkTo(nx - 26, () => act('happy', 2000, () => setToy(null)), WALK * 2);
      });
    });
  };

  const chaseButterfly = () => {
    const m = me.current;
    m.toyT0 = performance.now();
    setToy({ kind: 'butterfly', x: m.x, y: floorAt(m.x) - 90 });
    const hop = (n) => {
      if (n <= 0) { act('sit', 2500, () => setToy(null)); say('So close!', 1800); return; }
      const bx = m.x + rand(-120, 120);
      walkTo(bx, () => {
        const y = floorAt(m.x);
        leapTo(m.x + 12 * m.facing, y, () => hop(n - 1));
        m.leap.peak = 70;
      }, WALK * 1.8);
    };
    hop(3);
  };

  const knockMug = () => {
    const m = me.current;
    const x = m.x + 30 * (m.facing || 1);
    setToy({ kind: 'mug', x, y: floorAt(x) });
    act('lookL', 1500, () => act('groom', 700, () => {
      setToy({ kind: 'mug', x, y: floorAt(x), falling: true });
      say(pickLine('mug'), 2200);
      act('happy', 2200, () => setToy(null));
    }));
  };

  /** Walk to the pointer and pounce. Returns false if the pointer has not moved lately. */
  const stalk = () => {
    const m = me.current;
    if (m.pointer.x < 0 || Date.now() - m.pointer.at > 6000) return false;
    const px = m.pointer.x;
    walkTo(px + (px > m.x ? -34 : 34), () => {
      m.facing = px > m.x ? 1 : -1;
      setFlip(m.facing < 0);
      act('pounce', 1100, () => { say(pickLine('stalk'), 1800); act('happy', 1600); });
    }, WALK * 2.6);
    return true;
  };

  /** Hop onto a to-do row and sit there for a while; an overdue one gets pushed. False if there is no room. */
  const visitRow = () => {
    const m = me.current;
    if (m.need || m.perchEl || document.querySelector('[aria-modal="true"]')) return false;
    const rows = [...document.querySelectorAll('[data-todo-row]')]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 200 && r.top > sizeRef.current.h + 70 && r.bottom < window.innerHeight - 50);
    if (!rows.length) return false;
    const today = todayYmd();
    const isOverdue = ({ el }) => {
      const t = todosRef.current.find((x) => String(x.id) === el.dataset.todoRow);
      return !!t && !t.is_done && !!t.due_date && t.due_date < today;
    };
    const late = rows.filter(isOverdue);
    const pool = late.length && Math.random() < 0.7 ? late : rows;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const dx = Math.min(pick.r.width - 40, 60 + Math.random() * Math.min(240, pick.r.width - 120));
    const el = pick.el;
    const overdue = late.includes(pick);
    leapTo(pick.r.left + dx, pick.r.top + 2, () => {
      m.mode = 'row';
      m.rowEl = el;
      m.rowDx = dx;
      m.rowUntil = Date.now() + rand(9e3, 16e3);
      setFlip(false);
      setAnim('sit');
      if (!overdue && flags.current.bond && bondLevel(pet.current.bond) >= 3 && Math.random() < 0.4) { setAnim('loaf'); say('Mine now. Nap time.', 2600); }
      else say(pickLine(overdue ? 'overdue' : 'row'), 2800);
      if (overdue) {
        setTimeout(() => {
          if (m.rowEl !== el) return;
          setAnim('pounce');
          say(pickLine('push'), 2000);
          if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
            el.animate?.([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px) rotate(-.4deg)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 440, easing: 'ease-out' });
          }
          setTimeout(() => { if (m.rowEl === el) setAnim('sit'); }, 900);
        }, 2600);
      }
    });
    m.leap.peak = Math.max(60, m.leap.peak);
    return true;
  };

  const leaveRow = () => {
    const m = me.current;
    m.rowEl = null;
    m.mode = 'fall';
    m.vx = rand(-70, 70);
    m.vy = -180;
    setAnim('jump');
  };

  /** Small habits that depend on the time of day. */
  const lifeMoves = () => {
    const m = me.current;
    const hour = new Date().getHours();
    const out = [];
    if (hour >= 7 && hour < 11) {
      out.push([0.07, () => {
        const x = m.x + 30 * (m.facing || 1);
        setToy({ kind: 'mug', x, y: floorAt(x) });
        say(pickLine('coffee'), 3200);
        act('sit', 4200, () => setToy(null));
      }]);
    }
    if (hour >= 12 && hour < 14) {
      out.push([0.07, () => {
        setToy({ kind: 'fish', x: m.x + 24 * (m.facing || 1), y: floorAt(m.x) });
        say(pickLine('lunch'), 2600);
        act('drink', 2400, () => { setToy(null); act('happy', 1500); });
      }]);
    }
    if (hour >= 18 || hour < 6) out.push([0.06, () => { act('stretch', 2000); say(pickLine('yawn'), 2600); }]);
    out.push([0.04, () => { // chases its own tail
      const base = m.x;
      const dir = base > window.innerWidth / 2 ? -1 : 1;
      walkTo(base + 60 * dir, () => walkTo(base, () => walkTo(base + 60 * dir, () => act('sweat', 1800), WALK * 4), WALK * 4), WALK * 4);
    }]);
    out.push([0.03, () => { act(Math.random() < 0.5 ? 'lookL' : 'lookR', 3800); spawn('ques', 1); }]);
    return out;
  };

  const zoomies = () => {
    const m = me.current;
    const W = window.innerWidth;
    const far = m.x > W / 2 ? 40 : W - 40;
    walkTo(far, () => walkTo(small ? W / 2 : W - 90, () => act('sweat', 2000), WALK * 5), WALK * 5);
  };

  // ---- reactions to the app ---------------------------------------------------------------------------

  useEffect(() => on('buddy', (e) => {
    const m = me.current;
    m.lastInput = Date.now();
    if (m.asleep && e.type !== 'typing') { m.asleep = false; }
    switch (e.type) {
      case 'typing':
        m.lastTyping = Date.now();
        break;
      case 'added':
        if (m.mode === 'perch') { say(pickLine('added'), 1600); spawn('heartSmall', 2); }
        else { act('happy', 1400); say(pickLine('added'), 1600); }
        break;
      case 'complete': {
        const now = Date.now();
        m.combo = [...m.combo.filter((t) => now - t < 60e3), now];
        savePet({ treats: Math.min(99, (pet.current.treats || 0) + 1), happiness: Math.min(100, (pet.current.happiness || 0) + 4) });
        gainBond(2);
        if (m.need?.level >= 2) { spawn('heartSmall', 1); break; }
        if (flags.current.cheer) {
          const { doneToday } = workMood();
          const today = todayYmd();
          const stillOpen = todosRef.current.filter((t) => t.id !== e.todo?.id && !t.is_done && !t.parent_id && t.due_date && t.due_date <= today).length;
          if (stillOpen === 0 && doneToday >= 3) { // the day is clear: a proper dance
            act('wave', 4200);
            spawn('heart', 9, { stagger: 0.1 });
            say('All clear! Take a bow.', 3200);
            playMeow({ pitch: 1.4, length: 0.5 });
            haptic('success');
            if (m.mode === 'still') { leapTo(m.x, floorAt(m.x), () => act('wave', 3600)); m.leap.peak = 56; }
            break;
          }
          if (m.mode === 'still') { leapTo(m.x, floorAt(m.x), () => act(m.combo.length >= 3 ? 'wave' : 'kiss', 2000)); m.leap.peak = 34; }
        }
        act(m.combo.length >= 3 ? 'wave' : 'kiss', 2200);
        spawn('heart', m.combo.length >= 3 ? 5 : 3);
        say(m.combo.length >= 3 ? `${pickLine('combo')} (${m.combo.length} in a row)` : pickLine('complete'), 2200);
        playMeow({ pitch: 1.25, length: 0.3 });
        haptic('success');
        break;
      }
      case 'roulette': // the Pick for me dialog chose a task: the cat points at it
        if (m.mode === 'still') act('pounce', 1500);
        say(`I pick: ${String(e.title || '').slice(0, 50)}`, 3500);
        break;
      case 'water-due':
        checkNeeds(true);
        break;
      case 'water-drank':
        m.need = null;
        setGlow(false);
        setToy(null);
        act('sip', 3500, () => act('happy', 1500));
        say(`${pickLine('drank')} ${e.count}/${e.goal}`, 3500);
        spawn('drop', 3);
        playPurr(1.2);
        savePet({ happiness: Math.min(100, (pet.current.happiness || 0) + 6) });
        gainBond(1);
        break;
      case 'water-skipped':
        if (e.snoozes >= 2) { act('grumpy', 2600, () => checkNeeds(true)); say(`That is ${e.snoozes} snoozes. I am counting.`, 2600); }
        break;
      case 'stretch-due':
        checkNeeds(true);
        break;
      case 'stretch-start':
        m.need = null;
        setGlow(false);
        act('stretch', 60e3);
        say('Stretch with me! I am doing it too.', 4000);
        break;
      case 'stretch-done':
        gainBond(1);
        act('happy', 2500);
        say(pickLine('stretched'), 2500);
        spawn('heartSmall', 3);
        break;
      case 'stretch-skipped':
        if (e.snoozes >= 2) { act('grumpy', 2400, () => checkNeeds(true)); say('Stiff cat. Stiff human.', 2400); }
        break;
      case 'focus-done':
        act('wave', 2400);
        say(`${e.minutes} min of ${pickLine('focus').toLowerCase()}`, 3000);
        spawn('heart', 3);
        break;
      default:
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [act, say, spawn, floorAt]);

  /** Read the water and stretch reminders and set the strongest need (or none). */
  const checkNeeds = useCallback((force = false) => {
    const m = me.current;
    let need = null;
    try {
      const w = readWater(userId, remRef.current);
      const s = readStretch(userId, remRef.current);
      const lvl = (ms) => (ms < 15 * MIN ? 1 : ms < 40 * MIN ? 2 : 3);
      const water = w.due ? { kind: 'water', level: lvl(w.overdue) } : null;
      const stretch = s.due ? { kind: 'stretch', level: lvl(s.overdue) } : null;
      need = water && stretch ? (stretch.level > water.level ? stretch : water) : water || stretch;
    } catch { need = null; }
    const same = (a, b) => (a?.kind === b?.kind && a?.level === b?.level);
    if (!force && same(need, m.need)) return;
    const louder = need && (!m.need || need.level > m.need.level);
    m.need = need;
    if (!need) { setGlow(false); setBubble((b) => (b?.actions ? null : b)); setToy((t) => (t?.kind === 'bottleLying' ? null : t)); if (m.until === Infinity) { m.until = 0; m.busy = 0; } return; }
    if (louder || force) { m.busy = 0; applyNeed(need); }
  }, [userId, applyNeed]);

  // Other people's cats: one walks on when someone does something that involves you.
  const { subscribe } = useChat();
  const lastVisit = useRef({});
  const lastVisitAt = useRef(0);
  useEffect(() => subscribe('buddy:visit', (e) => {
    const m = me.current;
    const from = e?.from;
    if (!flags.current.social || !from?.id || isFocusActive() || document.hidden) return;
    const now = Date.now();
    lastVisitAt.current = now;
    if (now - (lastVisit.current[from.id] || 0) < 25e3) return;
    lastVisit.current[from.id] = now;
    setGuests((list) => {
      if (list.length >= 3) return list;
      const W = window.innerWidth;
      const idx = list.length;
      const dir = m.x < W / 2 ? 1 : -1;
      const target = Math.max(40, Math.min(W - 40, m.x + dir * (70 + idx * 58)));
      const g = {
        id: `${from.id}-${now}`,
        owner: String(from.name || 'Someone').split(' ')[0],
        cat: buddyOf({ buddy: from.buddy }),
        line: visitLine(e.kind, String(from.name || 'Someone').split(' ')[0]),
        // A task being assigned is carried over in the cat's paws and handed to this cat.
        task: /assign|delegate/.test(String(e.kind)) && e.text ? { title: e.text, id: e.todoId } : null,
        holding: false,
        bell: /nudge|bell/.test(String(e.kind)),
        x: dir > 0 ? W + 40 : -40,
        y: floorAt(target),
        target,
        dir,
        phase: 'in',
      };
      const patch = (p) => setGuests((l) => l.map((x) => (x.id === g.id ? { ...x, ...p } : x)));
      setTimeout(() => patch({ x: target }), 60);
      setTimeout(() => { patch({ phase: 'sit', holding: !!(from && e.text && /assign|delegate/.test(String(e.kind))) }); if (m.mode === 'still') { act('wave', 2200); } }, 2000);
      if (/assign|delegate/.test(String(e.kind)) && e.text) {
        // Hand-over: the card slides across to this cat, which catches it and offers to open it.
        setTimeout(() => {
          patch({ holding: false });
          if (m.mode === 'still' || m.mode === 'row') act('happy', 2600);
          spawn('heart', 3);
          playMeow({ pitch: 1.3, length: 0.3 });
          say(`Got it from ${g.owner}: ${String(e.text).slice(0, 60)}`, 6000, e.todoId ? [{ label: 'Open it', primary: true, onPress: () => { say(null); openNotificationTarget({ todoId: e.todoId }); } }, { label: 'Later', onPress: () => say(null) }] : undefined);
        }, 4200);
      }
      setTimeout(() => patch({ phase: 'out', x: g.x }), 10500);
      setTimeout(() => setGuests((l) => l.filter((x) => x.id !== g.id)), 13000);
      return [...list, g];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [subscribe, act, floorAt, spawn, say]);

  // A new notification with no visitor attached: the cat pops up from the bottom edge holding it.
  useEffect(() => subscribe('notification:new', (n) => {
    if (!flags.current.peek || isFocusActive() || document.hidden) return;
    setTimeout(() => {
      if (Date.now() - lastVisitAt.current < 2500) return; // a visiting cat already brought this one
      const W = window.innerWidth;
      let x = rand(70, W - 70);
      if (Math.abs(x - me.current.x) < 90) x = x < W / 2 ? Math.min(W - 70, x + 160) : Math.max(70, x - 160);
      const id = Date.now();
      setPeek({ id, x, text: n?.title || n?.message || 'New notification', n });
      setTimeout(() => setPeek((p) => (p && p.id === id ? null : p)), 7500);
    }, 800);
  }), [subscribe]);

  // Now and then the cat notices a moving pointer and goes after it.
  useEffect(() => {
    let beat = 0;
    const id = setInterval(() => {
      const m = me.current;
      beat += 1;
      if (beat % 2 && !(flags.current.bond && bondLevel(pet.current.bond) >= 5)) return; // close friends follow you twice as often
      if (!flags.current.chase || m.mode !== 'still' || m.need || m.asleep || Date.now() < m.busy) return;
      if (Date.now() - m.pointer.at > 1500 || Math.abs(m.pointer.x - m.x) < 140) return;
      if (Math.random() < 0.3) stalk();
    }, 3500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Needs are re-read every 20 s; a crying cat hops now and then and meows every few minutes.
  useEffect(() => {
    checkNeeds(true);
    let lastMeow = Date.now();
    const id = setInterval(() => {
      checkNeeds();
      const m = me.current;
      if (!m.need || m.mode === 'perch' || m.mode === 'drag') return;
      if (m.need.level === 2 && m.mode === 'still' && Math.random() < 0.5) {
        leapTo(m.x, floorAt(m.x), () => { m.mode = 'still'; m.until = Infinity; setAnim(m.need?.kind === 'water' ? 'cryBottle' : 'cry'); });
        m.leap.peak = 34;
      }
      // The gap between cries follows the person's choice; "never" silences them.
      const scale = CRY_SCALE[remRef.current.catMeows];
      const every = (m.need.level >= 3 ? 5 : 3) * MIN * scale;
      if (scale > 0 && m.need.level >= 2 && Date.now() - lastMeow > every) { lastMeow = Date.now(); playMeow({ attention: true, pitch: 0.8, length: 0.9 }); }
    }, 20e3);
    return () => clearInterval(id);
  }, [checkNeeds, leapTo, floorAt]);

  // ---- input: hover, click, double-click (pet), drag (scruff) -----------------------------------------

  useEffect(() => {
    const m = me.current;
    const onMove = (ev) => {
      m.pointer = { x: ev.clientX, y: ev.clientY, at: Date.now() };
      const wasAsleep = m.asleep && Date.now() - m.lastInput > IDLE_SLEEP_MS;
      m.lastInput = Date.now();
      if (wasAsleep) { m.asleep = false; act('shock', 700, () => { say(pickLine('wake'), 2000); act('stretch', 1600); }); }
    };
    const onKey = () => { m.lastInput = Date.now(); };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('keydown', onKey, { passive: true });
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('keydown', onKey); };
  }, [act, say]);

  const press = useRef(null);
  const lastClick = useRef(0);
  const onPointerDown = (ev) => {
    if (ev.button !== undefined && ev.button !== 0) return;
    const m = me.current;
    press.current = { x: ev.clientX, y: ev.clientY, t: Date.now(), dragging: false, lx: ev.clientX, ly: ev.clientY, lt: performance.now(), vx: 0, vy: 0 };
    try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
    m.lastInput = Date.now();
  };
  const onPointerMove = (ev) => {
    const p = press.current;
    if (!p) return;
    const m = me.current;
    if (!p.dragging && Math.hypot(ev.clientX - p.x, ev.clientY - p.y) > 7) {
      p.dragging = true;
      m.mode = 'drag';
      m.rowEl = null;
      m.asleep = false;
      setCard(false);
      setAnim('dangle');
      setShake(true);
      say(Math.random() < 0.5 ? 'Hey! Put me down!' : 'Mrrrow?!', 1500);
    }
    if (p.dragging) {
      const now = performance.now();
      const dt = Math.max(1, now - p.lt) / 1000;
      p.vx = (ev.clientX - p.lx) / dt;
      p.vy = (ev.clientY - p.ly) / dt;
      p.lx = ev.clientX; p.ly = ev.clientY; p.lt = now;
      m.x = ev.clientX;
      m.y = ev.clientY + sizeRef.current.h * 0.75;
    }
  };
  const onPointerUp = () => {
    const p = press.current;
    press.current = null;
    const m = me.current;
    setShake(false);
    if (p?.dragging) {
      m.vx = Math.max(-900, Math.min(900, p.vx * 0.6));
      m.vy = Math.max(-900, Math.min(600, p.vy * 0.6));
      m.mode = 'fall';
      setAnim('jump');
      return;
    }
    // A click: double-click pets, single opens the reminder (if the cat needs something) or the stats card.
    const now = Date.now();
    if (now - lastClick.current < 320) {
      lastClick.current = 0;
      petCat();
      return;
    }
    lastClick.current = now;
    setTimeout(() => {
      if (lastClick.current !== now) return;
      if (m.need) { emit(m.need.kind === 'water' ? 'water:open' : 'stretch:open'); return; }
      if (m.asleep) { m.asleep = false; act('shock', 700, () => { say(pickLine('wake'), 2000); act('stretch', 1600); }); return; }
      setEdit(false);
      setCard((c) => !c);
    }, 330);
  };

  const petCat = () => {
    const m = me.current;
    setCard(false);
    m.asleep = false;
    act('love', 2400);
    spawn('heart', 4);
    say('Prrrrr...', 2200);
    playPurr(1.6);
    savePet({ pets: (pet.current.pets || 0) + 1, happiness: Math.min(100, (pet.current.happiness || 0) + 3) });
    gainBond(1);
  };

  const giveTreat = () => {
    if (!(pet.current.treats > 0)) { say('No treats left. Finish a task to earn one!', 2600); return; }
    const m = me.current;
    savePet({ treats: pet.current.treats - 1, happiness: Math.min(100, (pet.current.happiness || 0) + 8) });
    gainBond(2);
    setCard(false);
    setToy({ kind: 'fish', x: m.x + 24 * (m.facing || 1), y: floorAt(m.x) });
    act('drink', 1800, () => { setToy(null); act('happy', 1800); say('Nom nom. Thank you!', 2000); spawn('heartSmall', 3); });
  };

  // ---- the loop -----------------------------------------------------------------------------------------

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastScan = 0;
    const m = me.current;
    const scan = (now) => {
      lastScan = now;
      floors.current = [...document.querySelectorAll('[data-buddy-floor]')]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 40 && r.height > 10 && r.top > window.innerHeight * 0.4);
      // Sit on the Quick add dialog while it is open.
      const perch = document.querySelector('[data-buddy-perch]');
      const surface = perch ? (perch.closest('[data-glass]') || perch) : null;
      const r = surface?.getBoundingClientRect();
      const usable = r && r.width > 120 && r.top > 40;
      if (usable && m.mode !== 'perch' && m.mode !== 'leap' && m.mode !== 'drag') {
        m.perchEl = surface;
        m.rowEl = null;
        const tx = r.right - sizeRef.current.w / 2 - 24;
        setBubble(null);
        setCard(false);
        setToy(null); // the bowl or toy stays behind; it comes back with the need after
        leapTo(tx, r.top + 2, () => { m.mode = 'perch'; setFlip(false); setAnim('typingIdle'); });
      } else if (!usable && (m.mode === 'perch' || (m.leap && m.perchEl))) {
        m.perchEl = null;
        m.leap = null;
        m.mode = 'fall';
        m.vy = -200;
        setAnim('jump');
      }
      const modal = !!document.querySelector('[aria-modal="true"]');
      setLayer(m.perchEl ? 10050 : modal ? 9000 : 9500);
      setHidden(isFocusActive());
    };

    const step = (now) => {
      raf = requestAnimationFrame(step);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (now - lastScan > 350) scan(now);
      const W = window.innerWidth;

      if (m.mode === 'walk') {
        const dir = Math.sign(m.target - m.x);
        m.x += dir * m.speed * dt;
        const floor = floorAt(m.x);
        if (floor < m.y - 6) { // a step up onto a bar: hop
          const then = m.onArrive;
          const target = m.target;
          leapTo(m.x + dir * 14, floor, () => walkTo(target, then, m.speed));
        } else if (floor > m.y + 6) { // off the edge
          m.mode = 'fall'; m.vx = dir * m.speed; m.vy = 0; m.fallThen = { target: m.target, then: m.onArrive, speed: m.speed };
        } else {
          m.y = floor;
          if ((dir > 0 && m.x >= m.target) || (dir < 0 && m.x <= m.target) || dir === 0) {
            m.x = m.target;
            m.mode = 'still';
            m.until = 0;
            const cb = m.onArrive;
            m.onArrive = null;
            if (cb) cb(); else act('sit', 3000);
          }
        }
      } else if (m.mode === 'leap' && m.leap) {
        const L = m.leap;
        let t = (now - L.t0) / L.T;
        let x1 = L.x1;
        let y1 = L.y1;
        if (m.perchEl) { const r = m.perchEl.getBoundingClientRect(); x1 = r.right - sizeRef.current.w / 2 - 24; y1 = r.top + 2; }
        if (t >= 1) {
          t = 1;
          m.x = x1; m.y = y1; m.leap = null;
          m.mode = 'still';
          if (L.then) L.then(); else act('sit', 2000);
        } else {
          m.x = L.x0 + (x1 - L.x0) * t;
          // Straight from start to end, lifted by an arc that is `peak` high in the middle.
          m.y = L.y0 + (y1 - L.y0) * t - 4 * L.peak * t * (1 - t);
        }
      } else if (m.mode === 'perch' && m.perchEl) {
        const r = m.perchEl.getBoundingClientRect();
        m.x = r.right - sizeRef.current.w / 2 - 24;
        m.y = r.top + 2;
        const typing = Date.now() - m.lastTyping < 700;
        const want = typing ? 'typing' : 'typingIdle';
        if (animRef.current !== want && Date.now() > m.busy) setAnim(want);
      } else if (m.mode === 'row') {
        const el = m.rowEl;
        const r = el && el.isConnected ? el.getBoundingClientRect() : null;
        if (!r || r.top < sizeRef.current.h + 30 || r.top > window.innerHeight - 30 || Date.now() > m.rowUntil || m.need) {
          leaveRow();
        } else {
          m.x = r.left + m.rowDx;
          m.y = r.top + 2;
          if (Date.now() > m.busy && !['sit', 'pounce', 'lookL', 'lookR', 'loaf'].includes(animRef.current)) setAnim('sit');
        }
      } else if (m.mode === 'fall') {
        m.vy += GRAVITY * dt;
        m.x += m.vx * dt;
        m.vx *= 0.995;
        if (m.x < 24) { m.x = 24; m.vx = Math.abs(m.vx) * 0.4; }
        if (m.x > W - 24) { m.x = W - 24; m.vx = -Math.abs(m.vx) * 0.4; }
        m.y += m.vy * dt;
        const floor = floorAt(m.x);
        if (m.y >= floor && m.vy > 0) {
          m.y = floor;
          const hard = m.vy > 900;
          m.vy = 0; m.vx = 0;
          m.mode = 'still';
          const f = m.fallThen;
          m.fallThen = null;
          if (f) walkTo(f.target, f.then, f.speed);
          else if (m.need) applyNeed(m.need);
          else if (hard) act('sad', 1400, () => { say('I landed on my feet. Mostly.', 2200); act('groom', 2000); });
          else act('sit', 2500);
        }
      } else if (m.mode === 'still') {
        const floor = floorAt(m.x);
        if (floor > m.y + 6) { m.mode = 'fall'; m.vy = 0; }
        else m.y = floor;
        if (Date.now() > m.until && Date.now() > m.busy) {
          const cb = m.onDone;
          m.onDone = null;
          m.until = Infinity;
          if (cb) cb(); else think();
        }
      }
      if (m.mode !== 'drag') m.x = Math.max(20, Math.min(W - 20, m.x));

      // Butterfly: flutters above the cat on a lazy figure of eight.
      if (toyRef.current?.dataset.kind === 'butterfly') {
        const t = (now - m.toyT0) / 1000;
        const bx = m.x + Math.sin(t * 0.9) * 70 + 20;
        const by = floorAt(m.x) - 70 - Math.sin(t * 2.1) * 22;
        toyRef.current.style.transform = `translate(${bx}px, ${by}px)`;
      }

      // Write the position: feet at (x, y).
      const el = rootRef.current;
      if (el) el.style.transform = `translate(${Math.round(m.x - sizeRef.current.w / 2)}px, ${Math.round(m.y - sizeRef.current.h)}px)`;
      // Keep the bubble on screen.
      const b = bubbleRef.current;
      if (b) {
        const half = b.offsetWidth / 2;
        const shift = Math.max(8 + half - m.x, Math.min(0, W - 8 - half - m.x));
        b.style.transform = `translate(calc(-50% + ${shift}px), 0)`;
        b.style.setProperty('--tail', `${-shift}px`);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Frame clock.
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), FPS_MS);
    return () => clearInterval(id);
  }, []);

  // Start: drop in from where it was, then get on with the day.
  useEffect(() => {
    const m = me.current;
    m.y = -40;
    m.vy = 0;
    m.mode = 'fall';
    const t = setTimeout(() => say(`${nameRef.current} is here.`, 2200), 900);
    return () => clearTimeout(t);
  }, [say]);

  // ---- render ---------------------------------------------------------------------------------------------

  // Eyes follow the pointer while it sits.
  const m = me.current;
  let shown = ANIMS[anim] ? anim : 'sit';
  if (shown === 'sit' && flags.current.chase && Date.now() - m.pointer.at < 2500 && m.pointer.x >= 0) {
    const dx = m.pointer.x - m.x;
    if (Math.abs(dx) > 30 && Math.abs(dx) < 420 && Math.abs(m.pointer.y - m.y) < 360) shown = dx > 0 ? 'lookR' : 'lookL';
  }
  const front = !['walk', 'stand', 'jump', 'stretch', 'drink', 'pounce', 'loaf', 'sleep', 'stiff', 'flat'].includes(shown);
  const frames = ANIMS[shown];
  // Slow anims hold each frame longer.
  const hold = shown === 'walk' ? 1 : shown === 'typing' ? 1 : shown === 'sleep' || shown === 'loaf' || shown === 'stiff' ? 6 : 3;
  const rows = frames[Math.floor(tick / hold) % frames.length];
  const { w, h } = frameSize(rows);
  sizeRef.current = { w: w * S, h: h * S };

  const ink = dark ? '#f5eaea' : '#2a1a1a';
  const paper = dark ? '#1d1414' : '#ffffff';
  const border = dark ? '#5a4646' : '#2a1a1a';
  const soft = dark ? '#3a2a2a' : '#fde8e8';

  const mood = m.need ? (m.need.kind === 'water' ? 'Thirsty' : 'Stiff')
    : m.asleep || anim === 'sleep' ? 'Sleepy'
      : flags.current.mood && workMood().mood === 'gloomy' ? 'Gloomy'
        : flags.current.mood && workMood().mood === 'sunny' ? 'Sunny'
      : (pet.current.happiness || 0) > 75 ? 'Very happy' : (pet.current.happiness || 0) > 40 ? 'Content' : 'Needs attention';
  // The cat re-renders on every frame tick (~8 a second), so the stats card's numbers (storage reads and a pass
  // over every to-do) are only worked out while the card is open: otherwise they cost the app on every frame.
  const bondPts = pet.current.bond || 0;
  const bondLvl = bondLevel(bondPts);
  const bondPct = bondLvl >= 6 ? 100 : Math.round(((bondPts - bondStart(bondLvl)) / (bondStart(bondLvl + 1) - bondStart(bondLvl))) * 100);
  let water = { count: 0, goal: rem.waterGoal };
  let stretch = { count: 0 };
  let doneToday = 0;
  if (card) {
    try { water = readWater(userId, rem); stretch = readStretch(userId, rem); } catch { /* storage blocked */ }
    const today = todayYmd();
    doneToday = todos.filter((t) => t.is_done && t.done_at && toYmd(new Date(t.done_at)) === today).length;
  }

  const toyRows = toy ? (toy.kind === 'bowl' ? PROPS.bowlEmpty : toy.kind === 'bottleLying' ? PROPS.bottleLying : toy.kind === 'bowlFull' ? PROPS.bowlFull : toy.kind === 'butterfly' ? PROPS[tick % 4 < 2 ? 'butterfly0' : 'butterfly1'] : PROPS[toy.kind]) : null;
  const toySize = toyRows ? frameSize(toyRows) : null;

  if (hidden) return null;
  // Rendered at the top of the page: React Native Web gives every View z-index 0, which would trap the cat
  // below dialogs (portalled at 9999) even when it should sit on top of Quick add.
  return createPortal(
    <>
      <style>{CSS}</style>
      {glow && <div className="buddy-glow" style={{ zIndex: layer - 1 }} />}

      {toyRows && (
        <div
          ref={toyRef}
          data-kind={toy.kind}
          className="buddy-toy"
          style={{
            zIndex: layer,
            transform: toy.kind === 'butterfly' ? undefined : `translate(${toy.x - (toySize.w * S) / 2}px, ${toy.y - toySize.h * S}px)`,
            transition: toy.rolling ? 'transform .9s cubic-bezier(.2,.7,.3,1)' : undefined,
          }}
        >
          <div className={toy.falling ? 'buddy-mug-fall' : undefined} style={{ '--dx': `${(m.facing || 1) * 60}px` }}>
            <Sprite rows={toyRows} scale={S} />
          </div>
        </div>
      )}

      {fx.map((f) => (
        <div
          key={f.id}
          className="buddy-fx"
          style={{ zIndex: layer + 1, transform: undefined, left: f.x, top: f.y, '--dx': f.dx, '--rise': f.rise, '--life': `${f.life}s`, animationDelay: `${f.delay}s`, opacity: 0 }}
        >
          <Sprite rows={PROPS[f.kind]} scale={S * (f.kind === 'heart' ? 0.9 : 1)} />
        </div>
      ))}

      <div
        ref={rootRef}
        className={`buddy-cat${shake ? ' shake' : ''}`}
        style={{ zIndex: layer }}
        role="button"
        tabIndex={0}
        aria-label={`${profile.name}, your cat. ${mood}. Click for stats, double-click to pet, drag to pick up.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { press.current = null; setShake(false); }}
        onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setCard((c) => !c); } }}
      >
        {!!bubble && !card && (
          <div
            ref={bubbleRef}
            className="buddy-bubble"
            aria-live="polite"
            style={{ background: paper, color: ink, border: `2px solid ${border}`, '--bubble-border': border, boxShadow: '0 6px 18px rgba(0,0,0,.18)' }}
            onPointerDown={(ev) => ev.stopPropagation()}
            onPointerUp={(ev) => ev.stopPropagation()}
          >
            <div>{bubble.text}</div>
            {!!bubble.actions && (
              <div>
                {bubble.actions.map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    style={{ background: a.primary ? '#dc2626' : soft, color: a.primary ? '#fff' : ink }}
                    onClick={(ev) => { ev.stopPropagation(); a.onPress(); }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {card && (
          <div
            className="buddy-card"
            style={{ background: paper, color: ink, border: `2px solid ${border}`, boxShadow: '0 10px 30px rgba(0,0,0,.22)' }}
            onPointerDown={(ev) => ev.stopPropagation()}
            onPointerUp={(ev) => ev.stopPropagation()}
          >
            {edit ? (
              <div>
                <h4>Make it yours</h4>
                <div style={{ marginTop: 6 }}>Name</div>
                <input
                  value={nameDraft}
                  maxLength={16}
                  aria-label="Cat name"
                  onChange={(ev) => setNameDraft(ev.target.value)}
                  onBlur={() => saveLook({ name: nameDraft.trim() || DEFAULT_NAME })}
                  onKeyDown={(ev) => { ev.stopPropagation(); if (ev.key === 'Enter') { saveLook({ name: nameDraft.trim() || DEFAULT_NAME }); ev.currentTarget.blur(); } }}
                  style={{ width: '100%', boxSizing: 'border-box', margin: '3px 0 8px', padding: '7px 9px', borderRadius: 9, border: `1.5px solid ${border}`, background: paper, color: ink, font: '600 13px System, Inter, sans-serif', outline: 'none' }}
                />
                <div>Coat</div>
                <div style={{ display: 'flex', gap: 8, margin: '5px 0 8px' }}>
                  {COATS.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      aria-label={c.label}
                      title={shopTitle('coat', c.key, c.label)}
                      onClick={(ev) => { ev.stopPropagation(); choose('coat', c.key); }}
                      style={{ width: 28, height: 28, borderRadius: 14, background: c.swatch, border: `2.5px solid ${profile.coat === c.key ? '#dc2626' : border}`, cursor: 'pointer', padding: 0, opacity: owned('coat', c.key) ? 1 : 0.45 }}
                    />
                  ))}
                </div>
                <div>Hat</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, margin: '5px 0 4px' }}>
                  {HATS.map((h) => (
                    <button
                      key={h.key}
                      type="button"
                      onClick={(ev) => { ev.stopPropagation(); choose('hat', h.key); }}
                      style={{ font: '700 11.5px System, Inter, sans-serif', border: 0, borderRadius: 999, padding: '5px 9px', cursor: 'pointer', background: profile.hat === h.key ? '#dc2626' : soft, color: profile.hat === h.key ? '#fff' : ink, opacity: owned('hat', h.key) ? 1 : 0.55 }}
                    >
                      {h.label}{!owned('hat', h.key) ? ` · ${SHOP.hat[h.key].cost}` : ''}
                    </button>
                  ))}
                </div>
                {flags.current.bond && <div style={{ opacity: 0.7, fontSize: 11.5, margin: '2px 0 0' }}>{shopMsg || `You have ${pet.current.treats || 0} treats. Faded looks cost treats (the number) and bond level.`}</div>}
                <div className="acts">
                  <button type="button" style={{ background: '#dc2626', color: '#fff' }} onClick={(ev) => { ev.stopPropagation(); saveLook({ name: nameDraft.trim() || DEFAULT_NAME }); setEdit(false); }}>Done</button>
                </div>
              </div>
            ) : (
            <>
            <h4>{profile.name}</h4>
            <div style={{ opacity: 0.75, marginBottom: 6 }}>{mood} · {pet.current.treats || 0} treat{pet.current.treats === 1 ? '' : 's'}</div>
            {flags.current.bond && (
              <>
                <div>Bond · level {bondLvl}, {BOND_TITLES[bondLvl]}</div>
                <div className="bar" style={{ background: soft }}><i style={{ width: `${bondPct}%` }} /></div>
              </>
            )}
            <div>Happiness</div>
            <div className="bar" style={{ background: soft }}><i style={{ width: `${pet.current.happiness || 0}%` }} /></div>
            <div>Water today · {water.count}/{water.goal}</div>
            <div className="bar" style={{ background: soft }}><i style={{ width: `${(water.count / (water.goal || 8)) * 100}%` }} /></div>
            <div style={{ opacity: 0.8 }}>Stretches today: {stretch.count} · Tasks done today: {doneToday}</div>
            <div className="acts">
              {[
                ['Pet', petCat],
                [`Treat (${pet.current.treats || 0})`, giveTreat],
                ['Play', () => { setCard(false); playYarn(); }],
                ['Water', () => { setCard(false); emit('water:open'); }],
                ['Stretch', () => { setCard(false); emit('stretch:open'); }],
                [m.asleep || anim === 'sleep' ? 'Wake up' : 'Nap', () => {
                  setCard(false);
                  if (m.asleep || anim === 'sleep') { m.asleep = false; act('stretch', 1600); } else { m.asleep = true; act('sleep', 5 * MIN, () => { m.asleep = false; act('stretch', 1600); }); }
                }],
                ...(flags.current.games ? [['Play catch', () => { setCard(false); setGame(true); }]] : []),
                ['Customize', () => { setNameDraft(profile.name); setEdit(true); }],
                ['Hide for today', () => { savePet({ hiddenDay: todayYmd() }); onHide(); }],
              ].map(([label, fn]) => (
                <button key={label} type="button" style={{ background: label === 'Pet' ? '#dc2626' : soft, color: label === 'Pet' ? '#fff' : ink }} onClick={(ev) => { ev.stopPropagation(); fn(); }}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ opacity: 0.6, marginTop: 8, fontSize: 11.5 }}>Double-click to pet, drag to pick up. Finish tasks to earn treats. Switch my tricks on or off in Profile, Features.</div>
            </>
            )}
          </div>
        )}

        <Sprite rows={rows} scale={S} flip={front ? false : flip} palette={coatPalette} />
      </div>
      {game && <CatchGame S={S} layer={layer + 3} ink={ink} paper={paper} border={border} onEnd={finishGame} />}
      <PeekCat peek={peek} tick={tick} S={S} layer={layer} ink={ink} paper={paper} border={border} cat={{ coat: profile.coat, hat }} onOpen={() => { const n = peek?.n || {}; setPeek(null); openNotificationTarget({ ...(n.data || {}), type: n.type, title: n.title, body: n.message }); }} />
      <GuestCats guests={guests} tick={tick} S={S} layer={layer} ink={ink} paper={paper} border={border} />
      <ZTicker active={anim === 'sleep'} spawn={spawn} />
    </>,
    document.body,
  );
}

/** Your cat popping up from the bottom edge, holding the notification that just arrived. */
function PeekCat({ peek, tick, S, layer, ink, paper, border, cat, onOpen }) {
  if (!peek) return null;
  const frames = animsFor(cat.hat).happy;
  const rows = frames[Math.floor(tick / 3) % frames.length].slice(0, 11);
  const w = 22 * S;
  const h = 11 * S;
  return (
    <div key={peek.id} style={{ position: 'fixed', left: Math.round(peek.x - w / 2), bottom: 0, width: w, height: h, zIndex: layer, pointerEvents: 'none' }}>
      {!!peek.text && (
        <div className="buddy-bubble" style={{ background: paper, color: ink, border: `2px solid ${border}`, '--bubble-border': border, cursor: 'pointer' }} onClick={onOpen}>
          <div>{String(peek.text).slice(0, 80)}</div>
          <div style={{ opacity: 0.6, fontSize: 11 }}>Tap to open</div>
        </div>
      )}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        <div style={{ animation: 'buddy-peek .45s cubic-bezier(.2,.8,.3,1.1) both' }}>
          <Sprite rows={rows} scale={S} palette={paletteFor(cat.coat)} />
        </div>
      </div>
    </div>
  );
}

/** A 20-second game: tap the falling hearts and fish, skip the mugs. Calls onEnd(score). */
function CatchGame({ S, layer, ink, paper, border, onEnd }) {
  const [, rerender] = useState(0);
  const [left, setLeft] = useState(20);
  const [score, setScore] = useState(0);
  const items = useRef([]);
  const els = useRef(new Map());
  const scoreRef = useRef(0);
  const endRef = useRef(onEnd);
  endRef.current = onEnd;
  const done = useRef(false);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const t0 = last;
    let spawnIn = 0.2;
    let uid = 0;
    let shown = 20;
    const step = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const elapsed = (now - t0) / 1000;
      if (elapsed >= 20) { if (!done.current) { done.current = true; endRef.current(scoreRef.current); } return; }
      raf = requestAnimationFrame(step);
      const W = window.innerWidth;
      const H = window.innerHeight;
      spawnIn -= dt;
      let changed = false;
      if (spawnIn <= 0) {
        spawnIn = rand(0.35, 0.75) * (1 - elapsed / 50);
        const r = Math.random();
        uid += 1;
        items.current.push({ id: uid, kind: r < 0.6 ? 'heart' : r < 0.85 ? 'fish' : 'mug', x: rand(30, W - 60), y: -30, vy: rand(150, 270) + elapsed * 5 });
        changed = true;
      }
      for (const it of items.current) {
        it.y += it.vy * dt;
        const el = els.current.get(it.id);
        if (el) el.style.transform = `translate(${it.x}px, ${it.y}px)`;
      }
      const kept = items.current.filter((it) => it.y < H + 40);
      if (kept.length !== items.current.length) { items.current = kept; changed = true; }
      const secs = Math.ceil(20 - elapsed);
      if (secs !== shown) { shown = secs; setLeft(secs); }
      if (changed) rerender((n) => n + 1);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  const catchIt = (it) => {
    items.current = items.current.filter((x) => x.id !== it.id);
    const gain = it.kind === 'fish' ? 2 : it.kind === 'heart' ? 1 : -1;
    scoreRef.current = Math.max(0, scoreRef.current + gain);
    setScore(scoreRef.current);
    if (it.kind !== 'mug') playMeow({ pitch: 1.5, length: 0.12 });
    haptic('light');
  };

  return createPortal(
    <>
      <div style={{ position: 'fixed', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: layer + 5, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 999, background: paper, color: ink, border: `2px solid ${border}`, font: '700 13px System, Inter, sans-serif' }}>
        <span>Catch! {score}</span>
        <span style={{ opacity: 0.6 }}>{left}s</span>
        <button type="button" onClick={() => { if (!done.current) { done.current = true; onEnd(scoreRef.current); } }} style={{ border: 0, borderRadius: 999, padding: '4px 10px', background: '#dc2626', color: '#fff', font: '700 12px System, Inter, sans-serif', cursor: 'pointer' }}>End</button>
      </div>
      {items.current.map((it) => (
        <div
          key={it.id}
          ref={(el) => { if (el) els.current.set(it.id, el); else els.current.delete(it.id); }}
          onPointerDown={(ev) => { ev.preventDefault(); catchIt(it); }}
          style={{ position: 'fixed', left: 0, top: 0, zIndex: layer + 4, padding: 12, margin: -12, cursor: 'pointer', touchAction: 'none', transform: `translate(${it.x}px, ${it.y}px)` }}
        >
          <Sprite rows={PROPS[it.kind]} scale={S * (it.kind === 'heart' ? 0.9 : 1)} />
        </div>
      ))}
    </>,
    document.body,
  );
}

/** Cats that belong to other people, walking in to say something. Each is drawn in its owner's coat and hat. */
function GuestCats({ guests, tick, S, layer, ink, paper, border }) {
  return guests.map((g) => {
    const walking = g.phase !== 'sit';
    const set = animsFor(g.cat.hat);
    const anim = walking ? set.walk : set.sit;
    const rows = anim[Math.floor(tick / (walking ? 1 : 3)) % anim.length];
    const leaving = g.phase === 'out';
    const heading = leaving ? g.dir : -g.dir; // +1 walks right (it comes in from the right edge when dir is 1, so it walks left)
    const boxW = 28 * S;
    const boxH = 20 * S;
    return (
      <div
        key={g.id}
        aria-hidden="true"
        style={{
          position: 'fixed', left: 0, top: 0, width: boxW, height: boxH, zIndex: layer, pointerEvents: 'none',
          transform: `translate(${Math.round(g.x - boxW / 2)}px, ${Math.round(g.y - boxH)}px)`,
          transition: g.phase === 'sit' ? 'none' : 'transform 1.9s linear',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }}
      >
        {g.phase === 'sit' && (
          <div className="buddy-bubble" style={{ background: paper, color: ink, border: `2px solid ${border}`, '--bubble-border': border, pointerEvents: 'none', marginBottom: 22 }}>
            <div style={{ fontWeight: 800, opacity: 0.7, fontSize: 11 }}>{g.cat.name}, {g.owner}'s cat</div>
            <div>{g.line}</div>
          </div>
        )}
        {g.bell && g.phase === 'sit' && (
          <div style={{ position: 'absolute', bottom: 11 * S, left: '50%', marginLeft: 6, animation: 'buddy-shake .25s linear infinite' }}>
            <Sprite rows={PROPS.bell} scale={S * 0.8} />
          </div>
        )}
        {g.task && (g.phase === 'in' || g.holding) && (
          <div style={{ position: 'absolute', bottom: 12 * S, left: '50%', marginLeft: -22, width: 44, padding: '3px 4px 4px', borderRadius: 4, background: paper, border: `2px solid ${border}`, boxShadow: '0 2px 0 rgba(0,0,0,.18)', transform: `rotate(${g.phase === 'in' ? -8 : 0}deg)` }}>
            <div style={{ height: 5, background: '#dc2626', borderRadius: 2, marginBottom: 3 }} />
            <div style={{ height: 3, background: border, opacity: 0.5, borderRadius: 1, marginBottom: 2 }} />
            <div style={{ height: 3, width: '60%', background: border, opacity: 0.5, borderRadius: 1 }} />
          </div>
        )}
        <Sprite rows={rows} scale={S} flip={walking && heading < 0} palette={paletteFor(g.cat.coat)} />
      </div>
    );
  });
}

// Zs drift up from a sleeping cat every couple of seconds.
function ZTicker({ active, spawn }) {
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => spawn(Math.random() < 0.5 ? 'z' : 'zSmall', 1, { dx: 18, life: 2.4 }), 1800);
    return () => clearInterval(id);
  }, [active, spawn]);
  return null;
}

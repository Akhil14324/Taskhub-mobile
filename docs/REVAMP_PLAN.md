# TaskHub revamp plan (draft for approval, no code changed yet)

Goal: new design, fewer/simpler modules, cleaner structure, in phases. Live app (Vercel, `main`) must keep working after every phase.

## 1. Where the app is today (measured)

- 217 files, ~42,400 lines, JS/JSX, no tests, no linter. `npm run build:web` is the only automatic check.
- Largest files (the structural problem): `ChatThreadScreen` 2160, `TodosScreen` 1804, `CatBuddy.web` 1438, `TodoDetailSheet` 854, `Profile` 814, `QuickAddSheet` 770, `ChatContext` 656, `TodoContext` 648, `AppNavigator` 586.
- Size by area: components 22.8k lines, screens 12.3k (32 screens), utils 2.1k, contexts 1.9k.
- 7 global providers wrap the whole app; `TodosScreen` owns business tabs, layouts, filters, sections and sprint state in one component.
- Features beyond the core task/chat product: cat buddy (~2.5k lines incl. sprites), automations, sprints/epics/releases/time tracking/reports, goals (OKR), engage (kudos, wins, badges, leaderboard), meeting notes, assistant/AI panels, water/stretch reminders, focus mode, roulette.

## 2. Frozen: must not change (PWA + Firebase + contracts)

Hard-frozen, per your instruction:
- PWA: `public/manifest.json`, `public/sw.js` (cache strategy, `push` / `notificationclick`, `/api` and `/socket.io` bypass), SW registration and meta/safe-area/iOS tags in `public/index.html`, icons, `vercel.json` headers/rewrites. Installability and iOS-Safari install behaviour stay as they are.
- Firebase push: `src/services/webPush.web.js`, `notifications.web.js`, `EXPO_PUBLIC_FIREBASE_*` config in `src/config/index.js`, the permission flow in `NotificationContext`, the token registration endpoint calls, and `openNotificationTarget` deep-link handling in `navigationRef.js`.

Frozen by default (cheap to break, expensive to fix); tell me if any should be open:
- API client (`src/api/client.js`: JWT, 401 handling, retries) and every REST path/payload; the backend repo is not touched.
- Socket.IO event contract in `ChatContext` (`todo:changed`, `notification:new`, chat events, `RELAYED_EVENTS`).
- Route names (they are used by push payloads and deep links), `secureStorage` keys (changing them logs people out and loses device settings), `utils/dates.js` date handling, server-driven `todo.permissions` / `user.permissions`.

"Some more main parts that are pain to change": you did not name them. Please list them, or approve the default list above.

## 3. Phases (each one ends with a green `npm run build:web`, a browser smoke test and a commit; nothing is merged to `main` without your OK)

0. **Safety net (no UI change).** Playwright smoke script (login, open each tab, create a to-do, open chat, push permission prompt reachable), baseline screenshots of every screen at phone and desktop width, PWA checklist (manifest valid, SW registers, install prompt, push token request). Run after every phase so the frozen parts are proven untouched.
1. **Foundations.** Design tokens (type, spacing, radius, one red scale + time-status colours), consolidate overlapping primitives (`UI.jsx`, `kit.jsx`, `Button`, `Input`, `Modal`, `BottomSheet`, `DropdownPicker`) into one small kit with one dialog/sheet system. Add a lint/format config so structure stays clean.
2. **App shell.** Rebuild `AppNavigator` (586 lines), sidebar and phone tab bar with the new design. Route names unchanged. Reduce the 7-provider stack where state can move to per-screen hooks.
3. **To-do and business work (highest value).** Split `TodosScreen` (1804) into view modules (list, board, calendar, timeline, business tabs), split `TodoContext` and `TodoDetailSheet`, redesign quick add and the task window. Keep `todo.permissions` as the source of truth.
4. **Chat.** Split `ChatThreadScreen` (2160) and `ChatListScreen`; redesign the UI only. `ChatContext` socket logic moves behind the same event contract.
5. **Remaining screens.** Home, My Day, Approvals, Organization, Profile, Notifications, Standup, Team Monitor, Login/Signup, in that order.
6. **Module diet (needs your decision, section 4).** Remove or merge what you do not want; hide the rest behind the existing feature switches first, delete after a release with no complaints.
7. **Cleanup.** Delete dead code (native-only `services/notifications.js`, `Oops`, `Cat3D` if unused, stale `package.json` scripts), update `README.md`, `CLAUDE.md` and the Notion page.

## 4. Decisions I need from you

1. Visual direction: keep red-only + Liquid Glass and refresh it, or a new look? (Say the brand colour if it changes; the PWA manifest theme colour stays untouched either way.)
2. Per module, keep / simplify / remove: cat buddy, automations, sprints+epics+releases+time+reports, goals, engage (kudos, wins, badges, leaderboard), meeting notes, AI assistant, water/stretch/focus/roulette, Telugu support, Access and Everything screens.
3. The extra "pain to change" parts from section 2.
4. Backend: client-only revamp, or may I propose backend changes too (e.g. simplifying endpoints for removed modules)?

## 5. Risks

- No tests: regressions are caught only by the phase 0 smoke script and manual checks. This is why it comes first.
- Removing a module means its data and backend routes become orphaned; that is a backend decision.
- Heavy motion/blur is tuned for iOS Safari PWA; every phase is checked at phone width with keyboard open.

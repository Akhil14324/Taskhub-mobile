# Graph Report - Taskhub-mobile  (2026-11-14)

## Corpus Check
- 325 files · ~433,358 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 2, .woff2 2, .example 1)

## Summary
- 2653 nodes · 10877 edges · 114 communities (110 shown, 4 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 278 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `96c2efec`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- BoardScreen.jsx
- react
- useColors
- WaterReminder.jsx
- width
- GlobalHost.jsx
- BottomSheet
- ChatThreadScreen.jsx
- HomeWidgets.jsx
- AppSidebar.jsx
- AppNavigator.jsx
- expo
- dependencies
- TemplatesSheet.jsx
- sprites.js
- RemindersCard.jsx
- SprintTab.jsx
- package.json
- Worst-Case Catalog
- Worst-Case Catalog
- Cells.jsx
- BoardItemSheet.jsx
- CalendarView.jsx
- Building Animations
- BoardDashboard.jsx
- showToast
- BoardToolbar.jsx
- Spring Animations
- Write Swift
- Write Swift
- Celebration.jsx
- AnimatedPressable
- Apple Design
- The Fixes
- Apple Design
- The Fixes
- Building Animations in Expo
- Prototyping Variants
- Prototyping Variants
- WorkSidebar.jsx
- Glossary
- TodosScreen.jsx
- Glossary
- manifest.json
- LanguageContext.jsx
- App.jsx
- Building Animations
- NotificationContext.jsx
- Animation Recipes
- Finding Animation Opportunities
- Animation Recipes
- Finding Animation Opportunities
- AppSidebar.jsx
- CatBuddy.web.jsx
- Animation Audit Playbook
- Building Animations in Expo
- FocusMode.jsx
- Expo Animation Recipes
- Animation Standards Reference
- Animation Standards Reference
- scripts
- useTodos
- TimeboxDay.jsx
- keyboardMode.js
- Working With Sonner
- Expo Animation Recipes
- Working With Sonner
- AppNavigator
- notifications.js
- glass
- BoardItemSheet.jsx
- Architecture
- The list
- The list
- Animation Audit Playbook
- QuickAddSheet.jsx
- generate-assets.js
- useAuth
- useTimer.js
- TodoTimeline.jsx
- TaskEditorSheet.jsx
- Design Engineering
- Design Engineering
- TaskHub QA Guide
- Component Building Principles
- ErrorBoundary
- Improving Animations
- Improving Animations
- useBackClose
- Component Building Principles
- Chat Feature
- orgMeta.js
- The Animation Decision Framework
- board/model.js
- The Animation Decision Framework
- CLAUDE.md
- clip-path for Animation
- Gesture and Drag Interactions
- The Sonner Principles (Building Loved Components)
- Gesture and Drag Interactions
- The Sonner Principles (Building Loved Components)
- vercel.json
- Chip
- Performance Rules
- clip-path for Animation
- Core Philosophy
- Debugging Animations
- Reviewing Animations
- Spring Animations
- Core Philosophy
- Debugging Animations

## God Nodes (most connected - your core abstractions)
1. `useColors()` - 513 edges
2. `glass()` - 228 edges
3. `react` - 209 edges
4. `react-native` - 196 edges
5. `showToast()` - 189 edges
6. `spacing` - 159 edges
7. `AnimatedPressable()` - 158 edges
8. `Architecture` - 155 edges
9. `@expo/vector-icons` - 146 edges
10. `radius` - 146 edges

## Surprising Connections (you probably didn't know these)
- `Tab / segmented indicator` --references--> `width()`  [INFERRED]
  .agents/skills/animate-expo/RECIPES.md → src/components/buddy/sprites.js
- `4. Pick the properties` --references--> `width()`  [INFERRED]
  .agents/skills/animate-expo/SKILL.md → src/components/buddy/sprites.js
- `Never Ship` --references--> `width()`  [INFERRED]
  .agents/skills/animate-expo/SKILL.md → src/components/buddy/sprites.js
- `Failure signatures` --references--> `width()`  [INFERRED]
  .agents/skills/break-ui/SKILL.md → src/components/buddy/sprites.js
- `Rules` --references--> `width()`  [INFERRED]
  .agents/skills/prototype/PICKER.md → src/components/buddy/sprites.js

## Import Cycles
- None detected.

## Communities (114 total, 4 thin omitted)

### Community 0 - "BoardScreen.jsx"
Cohesion: 0.10
Nodes (32): BoardImport(), guess(), ymd(), AddColumnMenu(), AI_ACTIONS, BoardMoreMenu(), BUILT_IN, ColumnMenu() (+24 more)

### Community 1 - "react"
Cohesion: 0.05
Nodes (141): @expo/vector-icons, react, react-native, react-native-reanimated, react-native-safe-area-context, @react-navigation/native, api, settle() (+133 more)

### Community 2 - "useColors"
Cohesion: 0.08
Nodes (37): BoardAutomate(), Recipe(), BoardActivity(), NewWorkspaceDialog(), BrandedRefreshControl(), Chip(), MyDay(), ProgressRing() (+29 more)

### Community 3 - "WaterReminder.jsx"
Cohesion: 0.18
Nodes (24): createStyles(), key(), load(), readStretch(), save(), StretchBreak(), STRETCHES, createStyles() (+16 more)

### Community 4 - "width"
Cohesion: 0.08
Nodes (30): 3D transforms for depth, CSS animations beat JS under load, CSS Transform Mastery, CSS variables are inheritable, Framer Motion hardware acceleration caveat, Only animate transform and opacity, Performance Rules, scale() scales children too (+22 more)

### Community 5 - "GlobalHost.jsx"
Cohesion: 0.13
Nodes (29): AttentionAlert(), styles, CatBuddy(), BusyBar(), CommandPalette(), createStyles(), go(), score() (+21 more)

### Community 6 - "BottomSheet"
Cohesion: 0.06
Nodes (59): BoardChoice(), FieldInput(), inputStyle(), Label(), pad(), PersonPicker(), PRIORITIES, QUICK_TIMES (+51 more)

### Community 7 - "ChatThreadScreen.jsx"
Cohesion: 0.09
Nodes (32): expo-audio, expo-clipboard, expo-document-picker, expo-haptics, expo-image-picker, expo-web-browser, Panel(), SmartImage() (+24 more)

### Community 8 - "HomeWidgets.jsx"
Cohesion: 0.26
Nodes (15): paletteHex(), Bar(), Businesses(), ByBusiness(), Empty(), Kpi(), LateList(), NeedsAttention() (+7 more)

### Community 9 - "AppSidebar.jsx"
Cohesion: 0.12
Nodes (37): BROWSER_KEEPS, Combo(), createStyles(), Key(), ShortcutsSheet(), actionById(), ACTIONS, BY_ID (+29 more)

### Community 10 - "AppNavigator.jsx"
Cohesion: 0.04
Nodes (53): AnimatedTabIcon(), createStyles(), FramedAccess, FramedAssistant, FramedAutomation, FramedChangePassword, FramedDump, FramedEverything (+45 more)

### Community 11 - "expo"
Cohesion: 0.04
Nodes (44): backgroundColor, foregroundImage, adaptiveIcon, googleServicesFile, package, permissions, projectId, expo (+36 more)

### Community 12 - "dependencies"
Cohesion: 0.05
Nodes (41): dependencies, axios, babel-preset-expo, expo, expo-application, expo-asset, expo-audio, expo-build-properties (+33 more)

### Community 13 - "TemplatesSheet.jsx"
Cohesion: 0.18
Nodes (14): createStyles(), DueDatePicker(), blankKr(), createStyles(), GoalSheet(), createStyles(), SprintSheet(), createStyles() (+6 more)

### Community 14 - "sprites.js"
Cohesion: 0.12
Nodes (36): animCache, ANIMS, blank(), blob(), BODY_SIT, BODY_SIT_PAW, bodySide(), BOTTLE_TILT (+28 more)

### Community 15 - "RemindersCard.jsx"
Cohesion: 0.15
Nodes (22): AutomationHost(), distance(), createStyles(), PreferencesCard(), navigate(), audio(), catMeowRate(), note() (+14 more)

### Community 16 - "SprintTab.jsx"
Cohesion: 0.09
Nodes (48): Burndown(), Columns(), createStyles(), FLOW_SHADE, FLOW_STACK, FlowChart(), HBars(), Stat() (+40 more)

### Community 17 - "package.json"
Cohesion: 0.06
Nodes (29): devDependencies, @babel/core, react-native-dotenv, engines, node, name, private, version (+21 more)

### Community 18 - "Worst-Case Catalog"
Cohesion: 0.06
Nodes (29): Collections, Emails, URLs, identifiers, Environment, Images and media, Labels, titles, and copy from data, Numbers and money, People and names, States (+21 more)

### Community 19 - "Worst-Case Catalog"
Cohesion: 0.06
Nodes (29): Collections, Emails, URLs, identifiers, Environment, Images and media, Labels, titles, and copy from data, Numbers and money, People and names, States (+21 more)

### Community 20 - "Cells.jsx"
Cohesion: 0.16
Nodes (30): GroupMenu(), CellEditorHost(), dateSpecFor(), DependsEditor(), FilesEditor(), LinkEditor(), BoardMeta, CellView (+22 more)

### Community 21 - "BoardItemSheet.jsx"
Cohesion: 0.12
Nodes (32): AddLine(), BoardCards(), cardColumns(), ItemCard, BoardItemSheet(), COLUMN_ICONS, Field(), Row() (+24 more)

### Community 22 - "CalendarView.jsx"
Cohesion: 0.17
Nodes (18): mondayOf(), nextMonday(), nextSaturday(), CalendarView(), canMove(), createStyles(), dayOf(), hhmm() (+10 more)

### Community 23 - "Building Animations"
Cohesion: 0.12
Nodes (16): 1. Should this animate at all?, 2. What is the purpose?, 3. Pick the tool — cheapest that works, 4. Pick the properties, 5. Easing and duration — or a spring, 6. Interruption and exit, 7. Reduced motion and pointer gating, Building Animations (+8 more)

### Community 24 - "BoardDashboard.jsx"
Cohesion: 0.09
Nodes (43): react-native-svg, BoardDashboard(), CHART_LABELS, Chip(), FALLBACK, Pick(), Pie(), PivotTable() (+35 more)

### Community 25 - "showToast"
Cohesion: 0.12
Nodes (33): createStyles(), PlanSheet(), planSummary(), createStyles(), TimeBox(), AiTasksSheet(), createStyles(), ClaudePanel() (+25 more)

### Community 26 - "BoardToolbar.jsx"
Cohesion: 0.26
Nodes (13): BoardToolbar(), Check(), COLOR_OPS, FilterColumn(), Item(), PanelHead(), QUICK_FILTERS, RULE_COLORS (+5 more)

### Community 27 - "Spring Animations"
Cohesion: 0.40
Nodes (5): Interruptibility advantage, Spring Animations, Spring-based mouse interactions, Spring configuration, When to use springs

### Community 28 - "Write Swift"
Cohesion: 0.09
Nodes (22): 10. ARC and object lifetime, 11. Testing — Swift Testing by default, 12. Macros, 13. Logging and debugging, 14. Unsafe code and interop, 15. Modern syntax you should be using, 16. Migrating an existing codebase to Swift 6, 1. Model data with value types (+14 more)

### Community 29 - "Write Swift"
Cohesion: 0.09
Nodes (22): 10. ARC and object lifetime, 11. Testing — Swift Testing by default, 12. Macros, 13. Logging and debugging, 14. Unsafe code and interop, 15. Modern syntax you should be using, 16. Migrating an existing codebase to Swift 6, 1. Model data with value types (+14 more)

### Community 30 - "Celebration.jsx"
Cohesion: 0.27
Nodes (11): BadgeMedal(), Card(), Celebration(), Ring(), Speck(), useEngage(), celebrationsOn(), feedback (+3 more)

### Community 31 - "AnimatedPressable"
Cohesion: 0.10
Nodes (39): Architecture, 3. Phases (each one ends with a green `npm run build:web`, a browser smoke test and a commit; nothing is merged to `main` without your OK), AnimatedPressable(), createStyles(), SprintStrip(), createStyles(), label(), TimeLogSheet() (+31 more)

### Community 32 - "Apple Design"
Cohesion: 0.09
Nodes (21): 10. Gesture design details (the "feel" checklist), 11. Frame-level smoothness, 12. Materials & depth — translucency conveys hierarchy, 13. Multimodal feedback — motion + sound + haptics, 14. Reduced motion & accessibility, 15. Typography — optical sizing, tracking, leading, 16. Design foundations — the eight principles, 17. Process (+13 more)

### Community 33 - "The Fixes"
Cohesion: 0.09
Nodes (21): 10. Status bar color doesn't match, 11. Right in Chrome, wrong on phone, 1. Hover state stuck after tap, 2. Gray/blue flash on tap, 3. Layout has the wrong height, 4. Page zooms into the input, 5. Tap feels laggy, 6. Pull-to-refresh hijacks scroll (+13 more)

### Community 34 - "Apple Design"
Cohesion: 0.09
Nodes (21): 10. Gesture design details (the "feel" checklist), 11. Frame-level smoothness, 12. Materials & depth — translucency conveys hierarchy, 13. Multimodal feedback — motion + sound + haptics, 14. Reduced motion & accessibility, 15. Typography — optical sizing, tracking, leading, 16. Design foundations — the eight principles, 17. Process (+13 more)

### Community 35 - "The Fixes"
Cohesion: 0.09
Nodes (21): 10. Status bar color doesn't match, 11. Right in Chrome, wrong on phone, 1. Hover state stuck after tap, 2. Gray/blue flash on tap, 3. Layout has the wrong height, 4. Page zooms into the input, 5. Tap feels laggy, 6. Pull-to-refresh hijacks scroll (+13 more)

### Community 36 - "Building Animations in Expo"
Cohesion: 0.10
Nodes (20): 120fps, 1. Should this animate at all?, 2. What is the purpose?, 3. Pick the tool — cheapest that works, 4. Pick the properties, 5. Timing or spring, 6. Keep it off the JS thread, 7. Press, not hover (+12 more)

### Community 37 - "Prototyping Variants"
Cohesion: 0.10
Nodes (19): Behavior contract, Markup, Reference wiring, Rules, Styles, The Picker, Hard Rules, Initial Response (+11 more)

### Community 38 - "Prototyping Variants"
Cohesion: 0.10
Nodes (19): Behavior contract, Markup, Reference wiring, Rules, Styles, The Picker, Hard Rules, Initial Response (+11 more)

### Community 39 - "WorkSidebar.jsx"
Cohesion: 0.16
Nodes (18): BIZ_TABS, BizTabs(), styles, ListGlyph(), listIconName(), Ctx, LEAD, MID (+10 more)

### Community 40 - "Glossary"
Cohesion: 0.11
Nodes (18): Animation Vocabulary, Easing — how speed changes over an animation, Entrances & Exits — how elements appear and disappear, Examples, Feedback & Interaction — responding to the user's actions, Glossary, Initial Response, Instructions (+10 more)

### Community 41 - "TodosScreen.jsx"
Cohesion: 0.08
Nodes (33): darkestRed(), LIST_ICONS, sortTodos(), TodoProvider(), useIsWide(), useSectionReorder(), BOARD_GROUPS, BOARD_GROUPS_BASE (+25 more)

### Community 42 - "Glossary"
Cohesion: 0.11
Nodes (18): Animation Vocabulary, Easing — how speed changes over an animation, Entrances & Exits — how elements appear and disappear, Examples, Feedback & Interaction — responding to the user's actions, Glossary, Initial Response, Instructions (+10 more)

### Community 43 - "manifest.json"
Cohesion: 0.11
Nodes (18): background_color, description, display, icons, id, name, orientation, text (+10 more)

### Community 44 - "LanguageContext.jsx"
Cohesion: 0.11
Nodes (26): firebase, @react-native-async-storage/async-storage, API_URL, FIREBASE_CONFIG, FIREBASE_VAPID_KEY, isFirebaseConfigured, SOCKET_URL, getCachedTranslation() (+18 more)

### Community 45 - "App.jsx"
Cohesion: 0.16
Nodes (17): config, expo, expo-font, App(), AppRoot(), PreferencesApplier(), TEXT_ZOOM, ThemeCrossfade() (+9 more)

### Community 46 - "Building Animations"
Cohesion: 0.12
Nodes (16): 1. Should this animate at all?, 2. What is the purpose?, 3. Pick the tool — cheapest that works, 4. Pick the properties, 5. Easing and duration — or a spring, 6. Interruption and exit, 7. Reduced motion and pointer gating, Building Animations (+8 more)

### Community 47 - "NotificationContext.jsx"
Cohesion: 0.19
Nodes (13): APPROVAL_TYPES, NotificationContext, NotificationProvider(), TYPE_ICONS, getCurrentRoute(), addPushMessageListener(), consumeLaunchNotification(), enablePush() (+5 more)

### Community 48 - "Animation Recipes"
Cohesion: 0.12
Nodes (15): Accordion / collapse, Animation Recipes, Button press, Drag to dismiss, Drawer / sheet, Dropdown, popover, menu, select, Hold to confirm, Masking a crossfade that won't settle (+7 more)

### Community 49 - "Finding Animation Opportunities"
Cohesion: 0.12
Nodes (16): 1. Frequency — how often will a user see this?, 2. Purpose — why does this animate?, 3. Speed — can it stay inside budget?, 4. Function — does motion help or hinder here?, Finding Animation Opportunities, Hard Rules, Initial Response, Operating Posture (+8 more)

### Community 50 - "Animation Recipes"
Cohesion: 0.12
Nodes (15): Accordion / collapse, Animation Recipes, Button press, Drag to dismiss, Drawer / sheet, Dropdown, popover, menu, select, Hold to confirm, Masking a crossfade that won't settle (+7 more)

### Community 51 - "Finding Animation Opportunities"
Cohesion: 0.12
Nodes (16): 1. Frequency — how often will a user see this?, 2. Purpose — why does this animate?, 3. Speed — can it stay inside budget?, 4. Function — does motion help or hinder here?, Finding Animation Opportunities, Hard Rules, Initial Response, Operating Posture (+8 more)

### Community 52 - "AppSidebar.jsx"
Cohesion: 0.31
Nodes (10): AppSidebar(), createStyles(), Entry(), go(), SECTION_OF, TABS, usePanel(), useNotifications() (+2 more)

### Community 53 - "CatBuddy.web.jsx"
Cohesion: 0.15
Nodes (29): Buddy(), CatchGame(), GuestCats(), LINES, loadState(), PeekCat(), pickLine(), rand() (+21 more)

### Community 54 - "Animation Audit Playbook"
Cohesion: 0.15
Nodes (11): 1. Purpose & frequency, 2. Easing & duration, 3. Physicality & origin, 4. Interruptibility, 5. Performance, 6. Accessibility, 7. Cohesion & tokens, 8. Missed opportunities (+3 more)

### Community 55 - "Building Animations in Expo"
Cohesion: 0.10
Nodes (20): 120fps, 1. Should this animate at all?, 2. What is the purpose?, 3. Pick the tool — cheapest that works, 4. Pick the properties, 5. Timing or spring, 6. Keep it off the JS thread, 7. Press, not hover (+12 more)

### Community 56 - "FocusMode.jsx"
Cohesion: 0.27
Nodes (14): CHOICES, createStyles(), enterLandscape(), FocusMode(), leaveLandscape(), mmss(), readRun(), runKey() (+6 more)

### Community 57 - "Expo Animation Recipes"
Cohesion: 0.13
Nodes (13): Bottom sheet you can drag to dismiss, Collapsing header on scroll, Expo Animation Recipes, Firing something once at a threshold, Keyboard-synced UI, List entrances, Press feedback, Screen transitions (Expo Router) (+5 more)

### Community 58 - "Animation Standards Reference"
Cohesion: 0.12
Nodes (15): Accessibility, Animation Standards Reference, Asymmetric timing, Cohesion, Debugging (recommend in reviews when feel is uncertain), Duration, Easing, Gestures & drag (+7 more)

### Community 59 - "Animation Standards Reference"
Cohesion: 0.13
Nodes (15): Accessibility, Animation Standards Reference, Asymmetric timing, Cohesion, Debugging (recommend in reviews when feel is uncertain), Duration, Easing, Gestures & drag (+7 more)

### Community 60 - "scripts"
Cohesion: 0.13
Nodes (15): scripts, android, build:all:prod, build:android, build:android:prod, build:ios, build:ios:prod, build:web (+7 more)

### Community 61 - "useTodos"
Cohesion: 0.12
Nodes (31): DraftReviewSheet(), rectOf(), createStyles(), DayPlan(), ForYou(), DueChip, TodoCheckbox, createStyles() (+23 more)

### Community 62 - "TimeboxDay.jsx"
Cohesion: 0.07
Nodes (69): socket.io-client, DayReportSheet(), Field(), Input(), Stepper(), addBlock(), DAY_END, DAY_START (+61 more)

### Community 63 - "keyboardMode.js"
Cohesion: 0.42
Nodes (7): useKeyboardInset(), api(), expectedKeyboard(), holdKeyboardOverlay(), overlayActive(), overlayKeyboardHeight(), rememberKeyboard()

### Community 64 - "Working With Sonner"
Cohesion: 0.15
Nodes (11): Functions, Sonner API Reference, `toast()` options, `<Toaster />`, Initial Response, Picking the right call, Recipes, Setup (+3 more)

### Community 65 - "Expo Animation Recipes"
Cohesion: 0.13
Nodes (13): Bottom sheet you can drag to dismiss, Collapsing header on scroll, Expo Animation Recipes, Firing something once at a threshold, Keyboard-synced UI, List entrances, Press feedback, Screen transitions (Expo Router) (+5 more)

### Community 66 - "Working With Sonner"
Cohesion: 0.15
Nodes (11): Functions, Sonner API Reference, `toast()` options, `<Toaster />`, Initial Response, Picking the right call, Recipes, Setup (+3 more)

### Community 67 - "AppNavigator"
Cohesion: 0.29
Nodes (6): 1. Where the app is today (measured), 2. Frozen: must not change (PWA + Firebase + contracts), 4. Decisions I need from you, 5. Risks, TaskHub revamp plan (draft for approval, no code changed yet), AppNavigator()

### Community 68 - "notifications.js"
Cohesion: 0.31
Nodes (7): expo-notifications, addNotificationResponseListener(), registerForPushNotifications(), registerTokenWithServer(), setupPushNotifications(), teardownPushNotifications(), unregisterTokenFromServer()

### Community 69 - "glass"
Cohesion: 0.10
Nodes (23): AtRiskCard(), createStyles(), createStyles(), DailyReportCard(), timeOf(), createStyles(), KudosCard(), MultilineInput (+15 more)

### Community 70 - "BoardItemSheet.jsx"
Cohesion: 0.21
Nodes (17): AddLine(), BoardKanban(), IconBtn(), KanbanCard(), MenuItem(), BoardTabs(), mayEdit(), anchorOf() (+9 more)

### Community 71 - "Architecture"
Cohesion: 0.11
Nodes (26): AnimatedPressableView, NativePressable(), usePressSpring(), WebPressable(), AvatarStack, MentionText(), SectionHeader(), arrive() (+18 more)

### Community 72 - "The list"
Cohesion: 0.18
Nodes (10): Charts, Common mismatches to catch, How to use this, Initial Response, Interaction & performance, Motion & visuals, Picking The Right Library, State & styling (+2 more)

### Community 73 - "The list"
Cohesion: 0.18
Nodes (10): Charts, Common mismatches to catch, How to use this, Initial Response, Interaction & performance, Motion & visuals, Picking The Right Library, State & styling (+2 more)

### Community 74 - "Animation Audit Playbook"
Cohesion: 0.15
Nodes (11): 1. Purpose & frequency, 2. Easing & duration, 3. Physicality & origin, 4. Interruptibility, 5. Performance, 6. Accessibility, 7. Cohesion & tokens, 8. Missed opportunities (+3 more)

### Community 75 - "QuickAddSheet.jsx"
Cohesion: 0.08
Nodes (44): splitMentions(), AttachmentList(), collabStyles(), fileSize(), pickFile(), REACTION_BY_KIND, ReactionBar(), REACTIONS (+36 more)

### Community 76 - "generate-assets.js"
Cohesion: 0.20
Nodes (5): adaptiveIcon, assetsDir, createPNG(), icon, splash

### Community 77 - "useAuth"
Cohesion: 0.23
Nodes (11): CatBuddy(), createStyles(), FeaturesCard(), createStyles(), RemindersCard(), useAuth(), useFeature(), DEFAULTS (+3 more)

### Community 78 - "useTimer.js"
Cohesion: 0.36
Nodes (6): listeners, loadTimer(), startTimer(), state, stopTimer(), useTimer()

### Community 79 - "TodoTimeline.jsx"
Cohesion: 0.07
Nodes (82): ProcessProgress(), AskWhy(), createStyles(), MonitorTodoSheet(), QUICK_QUESTIONS, buildStages(), createStyles(), fmtStamp() (+74 more)

### Community 80 - "TaskEditorSheet.jsx"
Cohesion: 0.12
Nodes (33): fieldVisible(), blankAction(), blankContext(), blockPartner(), BUILT_IN, DAY_NAMES, depths(), describeAction() (+25 more)

### Community 81 - "Design Engineering"
Cohesion: 0.22
Nodes (8): Accessibility, Design Engineering, Initial Response, prefers-reduced-motion, Review Checklist, Review Format (Required), Stagger Animations, Touch device hover states

### Community 82 - "Design Engineering"
Cohesion: 0.22
Nodes (8): Accessibility, Design Engineering, Initial Response, prefers-reduced-motion, Review Checklist, Review Format (Required), Stagger Animations, Touch device hover states

### Community 83 - "TaskHub QA Guide"
Cohesion: 0.22
Nodes (8): 1. The rules (please read first), 2. What you need, 3. How to run a test case, 4. Speeding up the timed features, 5. How to report back, 6. Working with the code (only if asked), 7. Suggested order, TaskHub QA Guide

### Community 84 - "Component Building Principles"
Cohesion: 0.25
Nodes (8): Animate enter states with @starting-style, Buttons must feel responsive, Component Building Principles, Make popovers origin-aware, Never animate from scale(0), Tooltips: skip delay on subsequent hovers, Use blur to mask imperfect transitions, Use CSS transitions over keyframes for interruptible UI

### Community 86 - "Improving Animations"
Cohesion: 0.18
Nodes (11): Hard Rules, Improving Animations, Initial Response, Invocation Variants, Operating Posture, Phase 1 — Recon (always first), Phase 2 — Audit (parallel), Phase 3 — Vet, prioritize, confirm (+3 more)

### Community 87 - "Improving Animations"
Cohesion: 0.18
Nodes (11): Hard Rules, Improving Animations, Initial Response, Invocation Variants, Operating Posture, Phase 1 — Recon (always first), Phase 2 — Audit (parallel), Phase 3 — Vet, prioritize, confirm (+3 more)

### Community 88 - "useBackClose"
Cohesion: 0.18
Nodes (14): expo-image, react-native-gesture-handler, BackCloser(), cloudinaryThumb(), HeroImage(), SPRING_CLOSE, SPRING_OPEN, styles (+6 more)

### Community 89 - "Component Building Principles"
Cohesion: 0.25
Nodes (8): Animate enter states with @starting-style, Buttons must feel responsive, Component Building Principles, Make popovers origin-aware, Never animate from scale(0), Tooltips: skip delay on subsequent hovers, Use blur to mask imperfect transitions, Use CSS transitions over keyframes for interruptible UI

### Community 90 - "Chat Feature"
Cohesion: 0.25
Nodes (7): Architecture, Chat Feature, Dependencies, Environment Variables, Features, Setup, Taskhub-mobile

### Community 91 - "orgMeta.js"
Cohesion: 0.29
Nodes (6): BUSINESS_TYPES, businessIcon(), DESIGNATION_BLURBS, DESIGNATION_ICONS, TIER_ICONS, TIER_SHADES

### Community 92 - "The Animation Decision Framework"
Cohesion: 0.33
Nodes (6): 1. Should this animate at all?, 2. What is the purpose?, 3. What easing should it use?, 4. How fast should it be?, Perceived performance, The Animation Decision Framework

### Community 93 - "board/model.js"
Cohesion: 0.10
Nodes (46): SummaryRow(), ruleMatches(), BoardCalendar(), BoardChart(), BoardSummary(), BoardTimeline(), BoardWorkload(), CHART_BY (+38 more)

### Community 94 - "The Animation Decision Framework"
Cohesion: 0.33
Nodes (6): 1. Should this animate at all?, 2. What is the purpose?, 3. What easing should it use?, 4. How fast should it be?, Perceived performance, The Animation Decision Framework

### Community 95 - "CLAUDE.md"
Cohesion: 0.33
Nodes (4): Commands, Environment, Scope: website + PWA only, Second brain (Notion)

### Community 96 - "clip-path for Animation"
Cohesion: 0.33
Nodes (6): clip-path for Animation, Comparison sliders, Hold-to-delete pattern, Image reveals on scroll, Tabs with perfect color transitions, The inset shape

### Community 97 - "Gesture and Drag Interactions"
Cohesion: 0.33
Nodes (6): Damping at boundaries, Friction instead of hard stops, Gesture and Drag Interactions, Momentum-based dismissal, Multi-touch protection, Pointer capture for drag

### Community 98 - "The Sonner Principles (Building Loved Components)"
Cohesion: 0.40
Nodes (5): Asymmetric enter/exit timing, Cohesion matters, Review your work the next day, The opacity + height combination, The Sonner Principles (Building Loved Components)

### Community 99 - "Gesture and Drag Interactions"
Cohesion: 0.33
Nodes (6): Damping at boundaries, Friction instead of hard stops, Gesture and Drag Interactions, Momentum-based dismissal, Multi-touch protection, Pointer capture for drag

### Community 100 - "The Sonner Principles (Building Loved Components)"
Cohesion: 0.40
Nodes (5): Asymmetric enter/exit timing, Cohesion matters, Review your work the next day, The opacity + height combination, The Sonner Principles (Building Loved Components)

### Community 101 - "vercel.json"
Cohesion: 0.33
Nodes (5): buildCommand, framework, headers, outputDirectory, rewrites

### Community 102 - "Chip"
Cohesion: 0.09
Nodes (50): useCatalog(), createStyles(), RecipesSheet(), ago(), createStyles(), RunLogSheet(), RunRow(), BackTitle() (+42 more)

### Community 103 - "Performance Rules"
Cohesion: 0.33
Nodes (6): CSS animations beat JS under load, CSS variables are inheritable, Framer Motion hardware acceleration caveat, Only animate transform and opacity, Performance Rules, Use WAAPI for programmatic CSS animations

### Community 104 - "clip-path for Animation"
Cohesion: 0.33
Nodes (6): clip-path for Animation, Comparison sliders, Hold-to-delete pattern, Image reveals on scroll, Tabs with perfect color transitions, The inset shape

### Community 106 - "Core Philosophy"
Cohesion: 0.50
Nodes (4): Beauty is leverage, Core Philosophy, Taste is trained, not innate, Unseen details compound

### Community 107 - "Debugging Animations"
Cohesion: 0.50
Nodes (4): Debugging Animations, Frame-by-frame inspection, Slow motion testing, Test on real devices

### Community 108 - "Reviewing Animations"
Cohesion: 0.17
Nodes (10): Aggressive Escalation Triggers, Guidelines, Initial Response, Operating Posture, Part 1 — Findings table (REQUIRED), Part 2 — Verdict (REQUIRED), Remedial Preference Hierarchy, Required Output Format (+2 more)

### Community 109 - "Spring Animations"
Cohesion: 0.40
Nodes (5): Interruptibility advantage, Spring Animations, Spring-based mouse interactions, Spring configuration, When to use springs

### Community 114 - "Core Philosophy"
Cohesion: 0.50
Nodes (4): Beauty is leverage, Core Philosophy, Taste is trained, not innate, Unseen details compound

### Community 115 - "Debugging Animations"
Cohesion: 0.50
Nodes (4): Debugging Animations, Frame-by-frame inspection, Slow motion testing, Test on real devices

## Knowledge Gaps
- **14 isolated node(s):** `@expo/ngrok`, `@lottiefiles/dotlottie-react`, `babel-preset-expo`, `expo-application`, `expo-asset` (+9 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1045 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `scale()` connect `width` to `react`, `Building Animations in Expo`, `Performance Rules`, `Animation Audit Playbook`, `Reviewing Animations`, `Building Animations`, `Animation Recipes`, `Animation Recipes`, `Building Animations in Expo`, `Animation Audit Playbook`, `Building Animations`, `Animation Standards Reference`, `Animation Standards Reference`?**
  _High betweenness centrality (0.159) - this node is a cross-community bridge._
- **What connects `@expo/ngrok`, `@lottiefiles/dotlottie-react`, `babel-preset-expo` to the rest of the system?**
  _14 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `BoardScreen.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.09957325746799431 - nodes in this community are weakly interconnected._
- **Why does `useColors()` connect `useColors` to `BoardScreen.jsx`, `react`, `WaterReminder.jsx`, `GlobalHost.jsx`, `BottomSheet`, `ChatThreadScreen.jsx`, `HomeWidgets.jsx`, `AppSidebar.jsx`, `AppNavigator.jsx`, `TemplatesSheet.jsx`, `RemindersCard.jsx`, `SprintTab.jsx`, `Cells.jsx`, `BoardItemSheet.jsx`, `CalendarView.jsx`, `BoardDashboard.jsx`, `showToast`, `BoardToolbar.jsx`, `Celebration.jsx`, `AnimatedPressable`, `WorkSidebar.jsx`, `TodosScreen.jsx`, `App.jsx`, `AppSidebar.jsx`, `FocusMode.jsx`, `useTodos`, `TimeboxDay.jsx`, `AppNavigator`, `glass`, `BoardItemSheet.jsx`, `Architecture`, `QuickAddSheet.jsx`, `useAuth`, `TodoTimeline.jsx`, `TaskEditorSheet.jsx`, `useBackClose`, `board/model.js`, `Chip`?**
  _High betweenness centrality (0.131) - this node is a cross-community bridge._
- **Should `react` be split into smaller, more focused modules?**
  _Cohesion score 0.050061957868649316 - nodes in this community are weakly interconnected._
- **Why does `width()` connect `width` to `Expo Animation Recipes`, `Building Animations in Expo`, `Prototyping Variants`, `Prototyping Variants`, `Performance Rules`, `Animation Audit Playbook`, `Reviewing Animations`, `Building Animations`, `sprites.js`, `Worst-Case Catalog`, `Worst-Case Catalog`, `Building Animations in Expo`, `Animation Audit Playbook`, `Building Animations`, `CatBuddy.web.jsx`, `Expo Animation Recipes`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Should `useColors` be split into smaller, more focused modules?**
  _Cohesion score 0.07807807807807808 - nodes in this community are weakly interconnected._
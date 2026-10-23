/**
 * Per-person feature switches. Every feature below can be turned off by the person who uses it; nobody
 * else's app changes. They are stored on the account as `preferences.features` ({ key: boolean }), so the
 * choice follows the person to another device. A key that was never touched uses its default.
 */
export const FEATURES = [
  { group: 'Health and focus', key: 'water', icon: 'water-outline', label: 'Water reminder', hint: 'A drop in the header and an hourly nudge to drink 8 glasses (2 L) a day', default: true },
  { group: 'Health and focus', key: 'stretch', icon: 'body-outline', label: 'Stretch break', hint: 'Every two hours, a one-minute guided stretch for your neck, back, wrists or eyes', default: true },
  { group: 'Health and focus', key: 'focus', icon: 'timer-outline', label: 'Focus mode', hint: 'A full-screen landscape timer for one task. Notifications wait until it ends', default: true },
  { group: 'Cat buddy', key: 'buddy', icon: 'paw-outline', label: 'Cat buddy', hint: 'A pixel cat at the bottom of the screen (click it to rename it and change how it looks). Types along when you add a task, blows a kiss when you finish one, and gets thirsty and stiff with you', default: true },
  { group: 'Cat buddy', key: 'buddy_social', icon: 'people-outline', label: 'Visiting cats', hint: 'When someone assigns you a task, comments, thanks you or messages you, their cat walks onto your screen to say so. Your cat visits them too', default: true },
  { group: 'Cat buddy', key: 'buddy_bond', icon: 'ribbon-outline', label: 'Bond and treats shop', hint: 'Your bond with the cat grows as you pet it and finish tasks; spend treats on hats and coats. Off: every look is free and the bond is hidden', default: true },
  { group: 'Cat buddy', key: 'buddy_games', icon: 'game-controller-outline', label: 'Catch game', hint: 'A 20-second game from the cat card: tap the falling hearts and fish, skip the mugs. Earns treats', default: true },
  { group: 'Cat buddy', key: 'buddy_peek', icon: 'eye-outline', label: 'Peeks in with notifications', hint: 'Your cat pops up from the bottom edge holding a new notification', default: true },
  { group: 'Cat buddy', key: 'buddy_wins', icon: 'trophy-outline', label: 'Trophy on the Wins wall', hint: 'The top finisher\'s cat holds a trophy on the Wins page', default: true },
  { group: 'Cat buddy', key: 'buddy_chase', icon: 'locate-outline', label: 'Follows your pointer', hint: 'Its eyes follow the cursor, and now and then it stalks the pointer across the screen and pounces', default: true },
  { group: 'Cat buddy', key: 'buddy_rows', icon: 'list-outline', label: 'Plays with your tasks', hint: 'It hops onto a task in your list to sit, and gives an overdue one a push', default: true },
  { group: 'Cat buddy', key: 'buddy_mood', icon: 'happy-outline', label: 'Mood from your work', hint: 'Sunny when nothing is overdue, gloomy when work piles up', default: true },
  { group: 'Cat buddy', key: 'buddy_life', icon: 'cafe-outline', label: 'Little life', hint: 'Coffee in the morning, lunch, yawns at night, tail chasing and other small habits', default: true },
  { group: 'Cat buddy', key: 'buddy_cheer', icon: 'sparkles-outline', label: 'Big celebrations', hint: 'A bigger dance when you clear the day, a hop for every task you tick', default: true },
  { group: 'Getting things done', key: 'roulette', icon: 'dice-outline', label: 'Pick for me', hint: 'Cannot decide what to do next? It picks one open task, favouring overdue and urgent work', default: true },
  { group: 'Getting things done', key: 'roast', icon: 'flame-outline', label: 'Overdue roast', hint: 'A light, private joke when your own task has been overdue for 3 days. Off by default', default: false },
  { group: 'Task details', key: 'deadlines', icon: 'alert-circle-outline', label: 'Deadlines', hint: 'The deadline field on tasks and the deadline warnings on lists', default: true },
  { group: 'Task details', key: 'labels', icon: 'pricetag-outline', label: 'Labels', hint: 'Labels on tasks and in lists', default: true },
  { group: 'Task details', key: 'estimates', icon: 'time-outline', label: 'Time needed', hint: 'The time estimate field on tasks', default: true },
  { group: 'Task details', key: 'reminders', icon: 'alarm-outline', label: 'Reminders', hint: 'The reminder field on tasks', default: true },
  { group: 'Layouts and pages', key: 'board', icon: 'grid-outline', label: 'Board layout', hint: 'The Kanban board view of your to-dos', default: true },
  { group: 'Layouts and pages', key: 'calendar', icon: 'calendar-outline', label: 'Calendar layout', hint: 'The month calendar view', default: true },
  { group: 'Layouts and pages', key: 'timeline', icon: 'analytics-outline', label: 'Timeline layout', hint: 'The Gantt-style timeline view', default: true },
  { group: 'Layouts and pages', key: 'leaderboard', icon: 'trophy-outline', label: 'Leaderboard', hint: 'The leaderboard link in the menus', default: true },
  { group: 'Getting things done', key: 'alarm', icon: 'alarm-outline', label: 'Alarm for reminders', hint: 'A reminder or deadline takes over the screen, rings until you dismiss it, and can be snoozed. A closed app cannot ring, so its notification stays up until you clear it', default: true },
  { group: 'Getting things done', key: 'automation', icon: 'flash-outline', label: 'Automations', hint: 'Rules that do things for you: at a time, when a to-do changes, when a message arrives. Find them in the menu', default: true },
];

const DEFAULTS = Object.fromEntries(FEATURES.map((f) => [f.key, f.default]));

/** Is this feature on for someone with these preferences? Usable outside React components. */
export function featureOn(preferences, key) {
  const saved = preferences?.features?.[key];
  return typeof saved === 'boolean' ? saved : DEFAULTS[key] !== false;
}

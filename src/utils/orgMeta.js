// Icons and labels that identify businesses and positions across the Organisation screens.
// The app is a single colour, so these icons (not colours) are what tell things apart,
// and the Organisation legend is built from the same tables.

export const TIER_ICONS = { 1: 'diamond', 2: 'shield', 3: 'star' };

// Darkest red = most senior.
export const TIER_SHADES = { 1: '#991b1b', 2: '#dc2626', 3: '#f87171' };

export const DESIGNATION_ICONS = {
  head: 'ribbon',
  manager: 'briefcase',
  accountant: 'calculator',
  supervisor: 'eye',
  coordinator: 'git-compare',
  member: 'person',
  intern: 'school',
};

export const DESIGNATION_BLURBS = {
  head: 'Runs the business and sees every task in it',
  manager: 'Manages the team and sees every task in the business',
  accountant: 'Looks after the books and money for the business',
  supervisor: 'Supervises day-to-day work',
  coordinator: 'Coordinates work between people',
  member: 'Works on assigned tasks',
  intern: 'Learning; most limited access',
};

export const BUSINESS_TYPES = [
  { key: 'restaurant', label: 'Restaurant', icon: 'restaurant' },
  { key: 'construction', label: 'Infrastructure', icon: 'construct' },
  { key: 'it', label: 'IT / Tech', icon: 'laptop' },
  { key: 'mines', label: 'Mines & Minerals', icon: 'diamond' },
  { key: 'other', label: 'Other', icon: 'business' },
];

export function businessIcon(type) {
  return BUSINESS_TYPES.find((t) => t.key === type)?.icon || 'business';
}

export function designationIcon(key) {
  return DESIGNATION_ICONS[key] || 'person';
}

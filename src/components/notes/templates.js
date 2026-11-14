// Ready-made starting points for a new note. A text template is the editor's own markup; a sheet template is its
// first rows. Picking one makes an ordinary note that is then the person's own to change.

const li = (i) => `<li>${i || '<br>'}</li>`;
const check = (...items) => `<ul data-check="1">${items.map(li).join('')}</ul>`;
const bullets = (...items) => `<ul>${items.map(li).join('')}</ul>`;
const numbered = (...items) => `<ol>${items.map(li).join('')}</ol>`;
const blank = '<div><br></div>';

export const TEXT_TEMPLATES = [
  {
    key: 'todo', name: 'To-do list', icon: 'checkbox-outline', hint: 'A list you tick off',
    title: 'To-do list',
    html: `${check('First thing to do', 'Second thing', 'Third thing')}`,
  },
  {
    key: 'meeting', name: 'Meeting notes', icon: 'people-outline', hint: 'Agenda, notes and who does what',
    title: 'Meeting notes',
    html: `<h3>Who was there</h3>${bullets('Name')}<h3>Agenda</h3>${numbered('First point', 'Second point')}<h3>Notes</h3>${blank}<h3>Decided</h3>${bullets('Decision')}<h3>Who does what</h3>${check('Task, person, by when')}`,
  },
  {
    key: 'week', name: 'Weekly plan', icon: 'calendar-outline', hint: 'Three priorities and a line per day',
    title: 'Plan for the week',
    html: `<h3>The three that matter most</h3>${check('First', 'Second', 'Third')}<h3>Monday</h3>${bullets('')}<h3>Tuesday</h3>${bullets('')}<h3>Wednesday</h3>${bullets('')}<h3>Thursday</h3>${bullets('')}<h3>Friday</h3>${bullets('')}<h3>Saturday</h3>${bullets('')}`,
  },
  {
    key: 'brief', name: 'Project brief', icon: 'briefcase-outline', hint: 'Goal, scope, people, dates and risks',
    title: 'Project brief',
    html: `<h3>Goal</h3><div>What will be true when this is finished?</div><h3>What is in, what is out</h3>${bullets('In: ', 'Out: ')}<h3>People</h3>${bullets('Lead: ', 'Team: ')}<h3>Dates</h3>${bullets('Start: ', 'Finish: ')}<h3>Risks</h3>${bullets('What could go wrong, and what we do about it')}<h3>Next steps</h3>${check('First step')}`,
  },
  {
    key: 'journal', name: 'Daily log', icon: 'today-outline', hint: 'Done, next and what is in the way',
    title: 'Daily log',
    html: `<h3>Done today</h3>${bullets('')}<h3>Next</h3>${check('')}<h3>In the way</h3>${bullets('')}`,
  },
  {
    key: 'checklist', name: 'Site visit checklist', icon: 'clipboard-outline', hint: 'Points to check on a visit',
    title: 'Site visit checklist',
    html: `<h3>Before leaving</h3>${check('Drawings and measurements', 'Camera or phone charged')}<h3>On site</h3>${check('Safety gear in use', 'Work matches the drawing', 'Material stock checked', 'Photos taken')}<h3>After</h3>${check('Report written', 'Issues given to the people who fix them')}`,
  },
];

export const SHEET_TEMPLATES = [
  {
    key: 'expenses', name: 'Expense tracker', icon: 'wallet-outline', hint: 'Date, item, amount, who paid',
    title: 'Expenses',
    rows: [['Date', 'Item', 'Category', 'Amount', 'Paid by', 'Notes']],
  },
  {
    key: 'materials', name: 'Material log', icon: 'cube-outline', hint: 'What came to which site, and its cost',
    title: 'Material log',
    rows: [['Date', 'Site', 'Material', 'Quantity', 'Unit', 'Supplier', 'Rate', 'Amount']],
  },
  {
    key: 'contacts', name: 'Contact list', icon: 'call-outline', hint: 'Names, companies and numbers',
    title: 'Contacts',
    rows: [['Name', 'Company', 'Phone', 'Email', 'Notes']],
  },
  {
    key: 'budget', name: 'Simple budget', icon: 'cash-outline', hint: 'Planned against actual',
    title: 'Budget',
    rows: [['Item', 'Planned', 'Actual', 'Difference', 'Notes']],
  },
];

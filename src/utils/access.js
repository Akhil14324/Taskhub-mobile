// Home is switched off for everyone except these people (matched on name or username).
// TODO: move to a server-side switch in "Who can do what" so it is not tied to names.
const HOME_ALLOWED = ['vinod', 'kaushal', 'akhil'];

export const homeAllowed = (user) => !!user && (!!user.is_owner
  || HOME_ALLOWED.some((n) => `${user.name || ''} ${user.username || ''}`.toLowerCase().includes(n)));

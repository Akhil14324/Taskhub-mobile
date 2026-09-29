// expo-secure-store has no web implementation, so the PWA falls back to localStorage.
export async function getItemAsync(key) {
  try { return window.localStorage.getItem(key); } catch (e) { return null; }
}

export async function setItemAsync(key, value) {
  try { window.localStorage.setItem(key, value); } catch (e) { /* storage blocked */ }
}

export async function deleteItemAsync(key) {
  try { window.localStorage.removeItem(key); } catch (e) { /* storage blocked */ }
}

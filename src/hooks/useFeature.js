import { useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { featureOn } from '../utils/features';

/** `const on = useFeature(); on('deadlines')` and `setFeature('deadlines', false)`. */
export default function useFeature() {
  const { user, updatePreferences } = useAuth();
  const prefs = user?.preferences;
  const on = useCallback((key) => featureOn(prefs, key), [prefs]);
  const setFeature = useCallback(
    (key, value) => updatePreferences({ features: { ...(prefs?.features || {}), [key]: value } }),
    [prefs, updatePreferences]
  );
  return { on, setFeature };
}

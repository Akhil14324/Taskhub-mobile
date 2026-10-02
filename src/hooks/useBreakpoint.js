import { Platform, useWindowDimensions } from 'react-native';

/** Width from which the app switches to its desktop layout (sidebar, side-by-side panes). */
export const DESKTOP_MIN = 1024;
/** Width from which the to-do screen shows its detail pane next to the list. */
export const WIDE_MIN = 1280;

/** True in a wide browser window. Phones and narrow windows keep the mobile layout. */
export default function useIsDesktop() {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= DESKTOP_MIN;
}

export function useIsWide() {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= WIDE_MIN;
}

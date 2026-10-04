import { Platform } from 'react-native';

// Liquid Glass is a CSS material (public/index.html: [data-glass=...]) because react-native-web
// styles cannot express backdrop blur plus an inner specular edge in one place, and the CSS has to
// react to light / dark and to prefers-reduced-transparency. Spread the result onto any View,
// Pressable or Animated.View:  <View {...glass('card')} style={...} />
//
//   bar      navigation chrome (sidebar, headers)       card     task cards and tiles
//   capsule  floating input bar / tab island            sheet    modals, sheets, dialogs, palette
//   button   secondary controls and chips               accent   the brand-red glass (primary buttons)
//   menu     dropdowns (near opaque, text stays legible) inset    tile inside glass (no blur: never nest)
//   scrim    the dim + soften layer behind a sheet
//
// The RN backgroundColor on the same view stays as the fallback (and for native); on web the CSS wins.
export const isWeb = Platform.OS === 'web';

export function glass(variant) {
  return isWeb ? { dataSet: { glass: variant } } : {};
}

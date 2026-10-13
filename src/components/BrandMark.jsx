import React from 'react';
import { Image } from 'react-native';

// The app icon (same artwork as the home-screen icon), so the logo inside the app matches it.
export default function BrandMark({ size = 56, style }) {
  return (
    <Image
      source={require('../../assets/icon.png')}
      style={[{ width: size, height: size, borderRadius: size * 0.22 }, style]}
      accessibilityLabel="TaskHub"
    />
  );
}

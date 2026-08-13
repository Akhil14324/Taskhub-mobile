import { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import LottieView from 'lottie-react-native';
import catAnimation from '../assets/Cat_playing_animation.json';

// 3D-style cat rendered from an artist-authored Lottie JSON.
// Loops natively (autoPlay + loop). The outer bob/tilt/scale wrapper in
// Oops.jsx still applies on top of this View, including the "pet" press-scale.

// Source art is 1070x456 (wide scene). Size by width; height follows aspect.
const ASPECT = catAnimation.h / catAnimation.w;

export default function Cat3D({ size = 200 }) {
  const ref = useRef(null);

  useEffect(() => {
    ref.current?.play();
  }, []);

  return (
    <View style={[styles.wrap, { width: size, height: size * ASPECT }]}>
      <LottieView
        ref={ref}
        source={catAnimation}
        autoPlay
        loop
        style={StyleSheet.absoluteFillObject}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
  },
});

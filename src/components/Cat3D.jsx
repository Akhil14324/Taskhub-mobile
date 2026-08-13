import { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import LottieView from 'lottie-react-native';
import catAnimation from '../assets/Cat_playing_animation.json';

const ASPECT = catAnimation.h / catAnimation.w;

export default function Cat3D({ size = 280 }) {
  const ref = useRef(null);

  useEffect(() => {
    ref.current?.play();
  }, []);

  const w = size;
  const h = size * ASPECT;

  return (
    <View style={{ width: w, height: h }}>
      <LottieView
        ref={ref}
        source={catAnimation}
        autoPlay
        loop
        style={{ width: w, height: h }}
        resizeMode="contain"
      />
    </View>
  );
}

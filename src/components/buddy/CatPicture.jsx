import { View } from 'react-native';
import { Sprite } from './Sprite';
import { PROPS, animsFor, paletteFor } from './sprites';

/** Someone's cat as a picture (their coat and hat), optionally holding a trophy. Web only. */
export default function CatPicture({ cat, anim = 'happy', scale = 4, withTrophy = false }) {
  const set = animsFor(cat?.hat || 'none');
  const frames = set[anim] || set.sit;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
      <Sprite rows={frames[0]} scale={scale} palette={paletteFor(cat?.coat)} />
      {withTrophy && <View style={{ marginLeft: -scale * 2 }}><Sprite rows={PROPS.trophy} scale={scale} /></View>}
    </View>
  );
}

import { createPortal } from 'react-dom';
import { Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../context/AuthContext';
import AnimatedPressable from './AnimatedPressable';

/**
 * Shown while a super admin has the app open as someone else: who they are looking as, and the way back.
 * Drawn on the page body so no dialog or panel can cover it.
 */
export default function ActingAsBar() {
  const { user, actingFrom, returnToMine } = useAuth();
  if (!actingFrom || !user || typeof document === 'undefined') return null;
  return createPortal(
    <View style={{ position: 'fixed', left: 0, right: 0, bottom: 14, alignItems: 'center', zIndex: 2147483000 }} pointerEvents="box-none">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: '92%', backgroundColor: '#2A1A0E', borderRadius: 999, paddingLeft: 14, paddingRight: 5, paddingVertical: 5, boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
        <Ionicons name="eye-outline" size={16} color="#F4AE52" />
        <Text numberOfLines={1} style={{ flexShrink: 1, color: '#FEF3E2', fontSize: 13, fontWeight: '600' }}>You are signed in as {user.name}</Text>
        <AnimatedPressable onPress={returnToMine} style={{ backgroundColor: '#D4621A', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 }}>
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>Back to my account</Text>
        </AnimatedPressable>
      </View>
    </View>,
    document.body
  );
}

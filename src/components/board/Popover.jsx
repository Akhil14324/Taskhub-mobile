import { useEffect } from 'react';
import { Modal, Pressable, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useIsDesktop from '../../hooks/useBreakpoint';
import { glass } from '../../theme/glass';
import { useColors } from '../../context/ThemeContext';
import { radius, spacing } from '../../theme/theme';

/** Where a pressed element is on screen, so its editor opens right there. */
export function anchorOf(e) {
  const el = e?.currentTarget || e?.target;
  const r = el?.getBoundingClientRect?.();
  return r ? { x: r.left, y: r.top, width: r.width, height: r.height } : null;
}

/**
 * A small floating panel for picking a cell's value. On desktop it opens next to the cell it belongs to
 * (`anchor` = { x, y, width, height } from measureInWindow), flipping above when there is no room below;
 * on a phone it is a card at the bottom of the screen. Escape and a click outside close it.
 */
export default function Popover({ visible, anchor, onClose, width = 280, children }) {
  const desktop = useIsDesktop();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();

  useEffect(() => {
    if (!visible || typeof window === 'undefined') return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [visible, onClose]);

  if (!visible) return null;

  let place;
  if (desktop && anchor) {
    const w = Math.max(width, Math.min(anchor.width, 420));
    const left = Math.min(Math.max(8, anchor.x + anchor.width / 2 - w / 2), win.width - w - 8);
    const below = win.height - (anchor.y + anchor.height);
    const top = below > 300 || below > anchor.y ? anchor.y + anchor.height + 6 : undefined;
    const bottom = top === undefined ? win.height - anchor.y + 6 : undefined;
    place = { position: 'absolute', left, top, bottom, width: w, maxHeight: Math.max(220, (top !== undefined ? below : anchor.y) - 16) };
  } else {
    place = {
      position: 'absolute', left: spacing.md, right: spacing.md, bottom: insets.bottom + spacing.md,
      maxHeight: win.height * 0.7,
    };
  }

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: desktop ? 'transparent' : colors.overlay }} onPress={onClose} accessibilityLabel="Close">
        <Pressable
          {...glass('menu')}
          onPress={(e) => e.stopPropagation?.()}
          style={[place, { backgroundColor: colors.white, borderRadius: radius.lg, overflow: 'hidden' }]}
        >
          <View style={{ padding: spacing.sm }}>{children}</View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

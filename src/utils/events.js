// Tiny app-wide event bus for UI hosts (toasts, dialogs) that live outside screens.
const listeners = new Map();

export function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
  return () => listeners.get(event)?.delete(handler);
}

export function emit(event, payload) {
  listeners.get(event)?.forEach((handler) => {
    try {
      handler(payload);
    } catch (err) {
      console.warn(`[events] ${event} handler failed:`, err.message);
    }
  });
}

/**
 * Show a toast at the bottom of the screen.
 * { message, title?, icon?, tone?: 'default'|'success'|'error', actionLabel?, onAction?, onPress?, duration? }
 */
export function showToast(options) {
  emit('toast:show', typeof options === 'string' ? { message: options } : options);
}

/** Show a themed dialog. Same shape as Alert.alert: { title, message, buttons }. */
export function showDialog(options) {
  emit('dialog:show', options);
}

/** Promise-based confirm: resolves true when the confirm button is pressed. */
export function confirmDialog({ title, message, confirmLabel = 'OK', cancelLabel = 'Cancel', destructive = false }) {
  return new Promise((resolve) => {
    showDialog({
      title,
      message,
      buttons: [
        { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      onDismiss: () => resolve(false),
    });
  });
}

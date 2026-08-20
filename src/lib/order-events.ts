/**
 * Simple event emitter for order updates
 * Allows components to refresh when orders are modified
 */

type Listener = () => void;

const listeners: Set<Listener> = new Set();

export function onOrderUpdate(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitOrderUpdate(): void {
  console.log('📢 Order update event emitted');
  listeners.forEach((listener) => listener());
}

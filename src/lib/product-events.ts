/**
 * Simple event emitter for product updates
 * Allows Dashboard to refresh when products are edited on Stock page
 */

type Listener = (source?: string) => void;

const listeners: Set<Listener> = new Set();

export function onProductUpdate(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitProductUpdate(source?: string): void {
  console.log(`📢 Product update event emitted from ${source || 'unknown'}`);
  listeners.forEach((listener) => listener(source));
}

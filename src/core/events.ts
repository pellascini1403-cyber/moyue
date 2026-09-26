type Handler<T> = (payload: T) => void;

/** Minimal typed event bus used to decouple gameplay, audio, UI and saving. */
export class EventBus<Events extends Record<string, unknown>> {
  private handlers = new Map<keyof Events, Set<Handler<any>>>();

  on<K extends keyof Events>(type: K, fn: Handler<Events[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(fn);
    return () => set!.delete(fn);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const fn of set) fn(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}

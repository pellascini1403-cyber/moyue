/** localStorage wrapper that never throws (private mode, blocked storage, quota). */
export const SafeStorage = {
  get(key: string): string | null {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : memory.get(key) ?? null;
    } catch {
      return memory.get(key) ?? null;
    }
  },
  set(key: string, value: string): boolean {
    memory.set(key, value);
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
  remove(key: string): void {
    memory.delete(key);
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

const memory = new Map<string, string>();

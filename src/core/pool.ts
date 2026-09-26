/** Generic free-list pool. Objects are created lazily up to `max`. */
export class Pool<T> {
  private free: T[] = [];
  readonly all: T[] = [];
  constructor(private factory: () => T, private max = Infinity) {}

  acquire(): T | null {
    const item = this.free.pop();
    if (item) return item;
    if (this.all.length >= this.max) return null;
    const created = this.factory();
    this.all.push(created);
    return created;
  }

  release(item: T): void {
    this.free.push(item);
  }

  prewarm(n: number): void {
    const tmp: T[] = [];
    for (let i = 0; i < n; i++) {
      const it = this.acquire();
      if (it) tmp.push(it);
    }
    for (const it of tmp) this.release(it);
  }
}

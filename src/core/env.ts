/** Runtime environment detection. Headless = running in Node (unit tests / simulations). */
export const Env = {
  headless: typeof document === 'undefined',
  get touch(): boolean {
    if (typeof window === 'undefined') return false;
    return 'ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0;
  },
  get mobileUA(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1);
  },
};

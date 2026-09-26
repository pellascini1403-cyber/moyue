type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | undefined>;

/** Tiny hyperscript helper for building UI without a framework. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (k === 'text') el.textContent = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Lantern icon for health (lit or spent). */
export function lanternSvg(lit: boolean): string {
  const body = lit ? 'url(#mlg)' : '#1a1c22';
  const stroke = lit ? '#ffcf8a' : '#4a4640';
  return `<svg viewBox="0 0 24 36" class="moyue-lantern-ico${lit ? ' lit' : ''}" aria-hidden="true">
    <defs><radialGradient id="mlg" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="#fff0c8"/><stop offset=".45" stop-color="#ff9a3c"/><stop offset="1" stop-color="#8a1c0c"/></radialGradient></defs>
    <line x1="12" y1="0" x2="12" y2="5" stroke="${stroke}" stroke-width="1.2"/>
    <rect x="6" y="4.5" width="12" height="2.2" rx="0.6" fill="#2a2420" stroke="${stroke}" stroke-width=".6"/>
    <path d="M5.5 8 C2.5 12 2.5 22 5.5 26 H18.5 C21.5 22 21.5 12 18.5 8 Z" fill="${body}" stroke="${stroke}" stroke-width="1"/>
    <path d="M12 8 V26 M8 9 C6.5 14 6.5 20 8 25 M16 9 C17.5 14 17.5 20 16 25" stroke="${lit ? 'rgba(120,30,0,.35)' : 'rgba(255,255,255,.06)'}" stroke-width=".8" fill="none"/>
    <rect x="7" y="26" width="10" height="2" rx="0.6" fill="#2a2420" stroke="${stroke}" stroke-width=".6"/>
    <line x1="12" y1="28" x2="12" y2="35" stroke="${lit ? '#c0392b' : '#3a2a28'}" stroke-width="1.6"/>
  </svg>`;
}

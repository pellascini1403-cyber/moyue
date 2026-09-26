import { h, lanternSvg } from './dom';

/**
 * In-game HUD: lantern health, the ink-moon moonlight gauge, jade, region
 * title cards, toasts, contextual hints and the boss bar. Positioned inside
 * the safe area.
 */
export class Hud {
  readonly root: HTMLDivElement;
  private lanterns: HTMLDivElement;
  private moonFill: HTMLDivElement;
  private moonMarks: HTMLDivElement;
  private jadeEl: HTMLSpanElement;
  private title: HTMLDivElement;
  private toastBox: HTMLDivElement;
  private hintEl: HTMLDivElement;
  private bossBar: HTMLDivElement;
  private bossFill: HTMLDivElement;
  private bossName: HTMLDivElement;
  private promptEl: HTMLDivElement;
  private fpsEl: HTMLDivElement;
  private lastHealth = -1;
  private lastMax = -1;
  private lastMoon = -1;
  private lastJade = -1;
  private titleTimer = 0;
  private hintKey = '';

  constructor(parent: HTMLElement) {
    this.root = h('div', { class: 'moyue-hud' });
    this.lanterns = h('div', { class: 'moyue-lanterns' });
    this.moonFill = h('div', { class: 'moyue-moon-fill' });
    this.moonMarks = h('div', { class: 'moyue-moon-marks' });
    const moon = h('div', { class: 'moyue-moon' }, h('div', { class: 'moyue-moon-ink' }), this.moonFill, this.moonMarks);
    this.jadeEl = h('span', { class: 'moyue-jade-n', text: '0' });
    const jade = h('div', { class: 'moyue-jade' }, h('span', { class: 'moyue-jade-ico' }), this.jadeEl);
    const status = h('div', { class: 'moyue-status' }, moon, h('div', { class: 'moyue-status-right' }, this.lanterns, jade));
    this.title = h('div', { class: 'moyue-region-title' });
    this.toastBox = h('div', { class: 'moyue-toasts' });
    this.hintEl = h('div', { class: 'moyue-hint' });
    this.bossName = h('div', { class: 'moyue-boss-name' });
    this.bossFill = h('div', { class: 'moyue-boss-fill' });
    this.bossBar = h('div', { class: 'moyue-boss' }, this.bossName, h('div', { class: 'moyue-boss-track' }, this.bossFill));
    this.promptEl = h('div', { class: 'moyue-prompt' });
    this.fpsEl = h('div', { class: 'moyue-fps' });
    this.root.append(status, this.title, this.toastBox, this.hintEl, this.bossBar, this.promptEl, this.fpsEl);
    parent.appendChild(this.root);
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
  }

  update(dt: number, s: { health: number; maxHealth: number; moonlight: number; maxMoonlight: number; jade: number; healCost: number; fps: number; showFps: boolean }): void {
    if (s.health !== this.lastHealth || s.maxHealth !== this.lastMax) {
      const lost = s.health < this.lastHealth;
      let html = '';
      for (let i = 0; i < s.maxHealth; i++) html += `<div class="moyue-lantern${i < s.health ? ' on' : ''}${lost && i === s.health ? ' breaking' : ''}">${lanternSvg(i < s.health)}</div>`;
      this.lanterns.innerHTML = html;
      if (lost) {
        this.root.classList.remove('moyue-hurt');
        void this.root.offsetWidth;
        this.root.classList.add('moyue-hurt');
      }
      this.lastHealth = s.health;
      this.lastMax = s.maxHealth;
    }
    if (Math.abs(s.moonlight - this.lastMoon) > 0.5) {
      const k = Math.max(0, Math.min(1, s.moonlight / s.maxMoonlight));
      this.moonFill.style.clipPath = `inset(${(1 - k) * 100}% 0 0 0)`;
      this.moonFill.classList.toggle('ready', s.moonlight >= s.healCost);
      if (this.moonMarks.childElementCount === 0 || this.moonMarks.dataset.max !== String(s.maxMoonlight)) {
        this.moonMarks.innerHTML = '';
        for (let c = s.healCost; c < s.maxMoonlight; c += s.healCost) {
          const m = h('div', { class: 'moyue-moon-mark' });
          m.style.bottom = `${(c / s.maxMoonlight) * 100}%`;
          this.moonMarks.appendChild(m);
        }
        this.moonMarks.dataset.max = String(s.maxMoonlight);
      }
      this.lastMoon = s.moonlight;
    }
    if (s.jade !== this.lastJade) {
      this.jadeEl.textContent = String(s.jade);
      this.lastJade = s.jade;
    }
    if (this.titleTimer > 0) {
      this.titleTimer -= dt;
      if (this.titleTimer <= 0) this.title.classList.remove('show');
    }
    this.fpsEl.style.display = s.showFps ? '' : 'none';
    if (s.showFps) this.fpsEl.textContent = `${Math.round(s.fps)} fps`;
  }

  regionTitle(name: string, hanzi: string, subtitle: string): void {
    this.title.innerHTML = '';
    this.title.append(
      h('div', { class: 'moyue-rt-hanzi', text: hanzi }),
      h('div', { class: 'moyue-rt-name', text: name }),
      h('div', { class: 'moyue-rt-sub', text: subtitle }),
    );
    this.title.classList.remove('show');
    void this.title.offsetWidth;
    this.title.classList.add('show');
    this.titleTimer = 4.2;
  }

  toast(title: string, body = '', kind: 'item' | 'ability' | 'info' | 'save' = 'info', hanzi = ''): void {
    const t = h('div', { class: `moyue-toast moyue-toast-${kind}` },
      hanzi ? h('div', { class: 'moyue-toast-hanzi', text: hanzi }) : null,
      h('div', { class: 'moyue-toast-body' }, h('div', { class: 'moyue-toast-title', text: title }), body ? h('div', { class: 'moyue-toast-text', text: body }) : null),
    );
    this.toastBox.appendChild(t);
    const life = kind === 'ability' ? 5200 : 3200;
    setTimeout(() => t.classList.add('out'), life);
    setTimeout(() => t.remove(), life + 600);
    while (this.toastBox.childElementCount > 3) this.toastBox.firstElementChild?.remove();
  }

  hint(text: string | null): void {
    const key = text ?? '';
    if (key === this.hintKey) return;
    this.hintKey = key;
    if (!text) {
      this.hintEl.classList.remove('show');
      return;
    }
    this.hintEl.innerHTML = text;
    this.hintEl.classList.add('show');
  }

  boss(name: string | null, frac = 1): void {
    if (!name) {
      this.bossBar.classList.remove('show');
      return;
    }
    this.bossBar.classList.add('show');
    if (this.bossName.textContent !== name) this.bossName.textContent = name;
    this.bossFill.style.transform = `scaleX(${Math.max(0, Math.min(1, frac))})`;
  }

  prompt(text: string | null): void {
    if (!text) {
      this.promptEl.classList.remove('show');
      return;
    }
    if (this.promptEl.textContent !== text) this.promptEl.textContent = text;
    this.promptEl.classList.add('show');
  }
}

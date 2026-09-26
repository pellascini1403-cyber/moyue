/** Original line icons, drawn as simple brush-like strokes. */
const svg = (inner: string, vb = '0 0 48 48') =>
  `<svg class="mt-icon" viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

export const ICONS: Record<string, string> = {
  // A folded wing lifting upward
  jump: svg('<path d="M24 38 V13"/><path d="M14 22 L24 11 L34 22"/><path d="M12 36 C16 30 20 29 24 30 C28 29 32 30 36 36" stroke-width="2.4" opacity=".7"/>'),
  // A slim wing-blade with a crescent swing arc
  attack: svg('<path d="M13 35 L33 12"/><path d="M30 10 L36 9 L35 15"/><path d="M10 30 L17 38"/><path d="M9 20 C12 12 20 8 27 8" stroke-width="2.2" opacity=".65"/>'),
  // Cloud swirl
  dash: svg('<path d="M8 28 C8 21 16 18 20 22 C21 15 32 14 34 21 C40 20 42 27 38 30 H10"/><path d="M6 36 H28" stroke-width="2.4" opacity=".7"/><path d="M32 36 H40" stroke-width="2.4" opacity=".5"/>'),
  // Crescent (ink moon)
  special: svg('<path d="M30 9 C20 11 14 19 15 27 C16 35 24 40 33 38 C26 36 21 30 21 23 C21 17 25 11 30 9 Z" fill="currentColor" fill-opacity=".18"/><circle cx="34" cy="16" r="1.6" fill="currentColor" stroke="none"/>'),
  // Hanging lantern
  interact: svg('<path d="M24 6 V11"/><path d="M17 13 H31"/><path d="M16 15 C12 20 12 29 16 33 H32 C36 29 36 20 32 15 Z"/><path d="M17 35 H31"/><path d="M24 36 V42"/><path d="M24 17 V31" stroke-width="2" opacity=".6"/>'),
  // Focus eye
  lock: svg('<path d="M6 24 C12 15 36 15 42 24 C36 33 12 33 6 24 Z"/><circle cx="24" cy="24" r="4.5"/>'),
  pause: svg('<path d="M18 13 V35"/><path d="M30 13 V35"/>'),
  map: svg('<path d="M8 12 L18 8 L30 13 L40 9 V36 L30 40 L18 35 L8 39 Z"/><path d="M18 8 V35" stroke-width="2.2" opacity=".6"/><path d="M30 13 V40" stroke-width="2.2" opacity=".6"/>'),
  bell: svg('<path d="M24 7 V11"/><path d="M15 33 C15 22 17 12 24 12 C31 12 33 22 33 33 Z"/><path d="M11 34 H37"/><circle cx="24" cy="38" r="2.4"/>'),
};

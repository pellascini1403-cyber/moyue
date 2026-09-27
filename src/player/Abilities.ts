export interface Abilities {
  /** Cloud Step — the forward dash (which everyone has) becomes longer and untouchable. */
  dash: boolean;
  /** Wing Unfurl — second jump in the air. */
  doubleJump: boolean;
  /** Cicada's Grip — cling to carved/overgrown walls and leap off them. */
  wallCling: boolean;
  /** Moon-Cleave — hold attack to charge a spinning slash. */
  chargedSlash: boolean;
  /** Bell Strike — slam down from the air, shattering cracked seals. */
  bellStrike: boolean;
  /** Lantern Flare — spend moonlight to hurl a burning lantern spirit. */
  lanternFlare: boolean;
}

export type AbilityId = keyof Abilities;

export function noAbilities(): Abilities {
  return { dash: false, doubleJump: false, wallCling: false, chargedSlash: false, bellStrike: false, lanternFlare: false };
}

export function allAbilities(): Abilities {
  return { dash: true, doubleJump: true, wallCling: true, chargedSlash: true, bellStrike: true, lanternFlare: true };
}

export const AbilityInfo: Record<AbilityId, { name: string; hanzi: string; desc: string; how: string }> = {
  dash: {
    name: 'Cloud Step',
    hanzi: '云步',
    desc: 'Your dash turns to drifting mist: it carries you further, and nothing can touch you while it lasts.',
    how: 'Press DASH on the ground or once in mid-air, as before.',
  },
  doubleJump: {
    name: 'Wing Unfurl',
    hanzi: '振翅',
    desc: 'The cloak opens like the wings it was woven to remember. Beat it once more while airborne.',
    how: 'Press JUMP again while in the air.',
  },
  wallCling: {
    name: "Cicada's Grip",
    hanzi: '蝉附',
    desc: 'Cling to carved stone and root-bound walls as the cicada clings to bark.',
    how: 'Jump into a carved or root-covered wall and hold toward it. Press JUMP to leap away.',
  },
  chargedSlash: {
    name: 'Moon-Cleave',
    hanzi: '月斩',
    desc: 'Gather moonlight along the spear, then release it in a full circle.',
    how: 'Hold ATTACK until the spearhead glows, then release.',
  },
  bellStrike: {
    name: 'Bell Strike',
    hanzi: '钟击',
    desc: 'Fall like a temple bell. Cracked seals and stubborn foes shatter beneath you.',
    how: 'Press SPECIAL while in the air.',
  },
  lanternFlare: {
    name: 'Lantern Flare',
    hanzi: '灯焰',
    desc: 'A spirit-flame borrowed from the Lantern-Keeper. Spend moonlight to hurl it.',
    how: 'Tap SPECIAL on the ground (costs moonlight). Hold SPECIAL to heal instead.',
  },
};

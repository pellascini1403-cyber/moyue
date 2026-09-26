/**
 * Original world text for Mòyuè — The Eternal Descent.
 *
 * Premise: long ago a second moon — the Ink Moon (墨月) — fell through the
 * world and kept sinking. An insect civilisation, the Moth Court, followed its
 * light downward, carving terraces, temples and pagodas into the dark. Their
 * lanterns burned with borrowed moonlight. When the moon began to dim, ink
 * seeped from the stone and the Court fell silent. A cicada, sealed in jade at
 * the top of the Descent, wakes when the last bell tolls.
 */

export interface LoreEntry {
  id: string;
  title: string;
  hanzi: string;
  text: string[];
}

export const LORE: Record<string, LoreEntry> = {
  waking: {
    id: 'waking',
    title: 'Stele of the Seventeenth Summer',
    hanzi: '十七夏',
    text: [
      'We set the seed in jade at the mouth of the Descent,',
      'to sleep seventeen summers as the cicadas do.',
      'When the last bell falls silent, it will wake —',
      'and it will go down, as all light goes down.',
    ],
  },
  court: {
    id: 'court',
    title: 'Stele of the Moth Court',
    hanzi: '蛾廷',
    text: [
      'The Court did not build toward the sky. The sky had nothing left to give.',
      'We built toward the fallen moon, one terrace for every generation,',
      'and hung a lantern for every name we could not carry further down.',
    ],
  },
  lanterns: {
    id: 'lanterns',
    title: 'Stele of Borrowed Light',
    hanzi: '借光',
    text: [
      'A lantern does not make light. It keeps it.',
      'Ours kept the moon’s light for nine hundred years.',
      'Now they keep only the memory of it — and that, too, is dimming.',
    ],
  },
  ink: {
    id: 'ink',
    title: 'Stele of the Seeping',
    hanzi: '渗墨',
    text: [
      'First the stone wept black. Then the black began to walk.',
      'The scholars called it ink. The children called it hunger.',
      'Both were right.',
    ],
  },
  bell: {
    id: 'bell',
    title: 'Stele of the Bell-Warden',
    hanzi: '钟守',
    text: [
      'The great bell was cast to be struck once each night,',
      'so the moon would know it was not forgotten.',
      'Its warden swore never to let the bell fall silent. He has kept his oath too well.',
    ],
  },
  descent: {
    id: 'descent',
    title: 'Stele of the Eternal Descent',
    hanzi: '永降',
    text: [
      'There is no bottom. There is only further.',
      'Those who reach the moon will find it still falling,',
      'and must decide whether to fall with it.',
    ],
  },
  mist: {
    id: 'mist',
    title: 'Stele of the Mistfall Cloister',
    hanzi: '雾瀑',
    text: [
      'Here the waters from the world above finally give up,',
      'and become mist, and forget which way is down.',
      'The monks who lived here learned to do the same.',
    ],
  },
};

export interface DialogueLine {
  speaker: string;
  text: string;
}

export interface NpcDef {
  id: string;
  name: string;
  hanzi: string;
  title: string;
}

export const NPCS: Record<string, NpcDef> = {
  weng: { id: 'weng', name: 'Weng', hanzi: '翁', title: 'the Lantern-Keeper' },
  xun: { id: 'xun', name: 'Xun', hanzi: '寻', title: 'the Pilgrim' },
};

/** Dialogue selection is driven by progression flags (see Game.talkTo). */
export const DIALOGUE = {
  wengFirst: [
    { speaker: 'Weng', text: 'Ah. A light I did not hang. You are the jade seed, then — awake at last.' },
    { speaker: 'Weng', text: 'Seventeen summers I have trimmed these wicks, waiting for the bell to stop. Yesterday, it stopped.' },
    { speaker: 'Weng', text: 'Below us the ink grows bold. Rest at the incense shrines, little one. They remember you.' },
    { speaker: 'Weng', text: 'The old Court scroll of Cloud Step is kept in the hall across the terrace. Take it. My wings are too singed to use it.' },
  ],
  wengIdle: [
    { speaker: 'Weng', text: 'Every lantern here has a name written inside it. I have forgotten most of them. The lanterns have not.' },
  ],
  wengAfterDash: [
    { speaker: 'Weng', text: 'You step like mist now. Good. The bridge to the great pagoda is broken — but broken is not the same as closed.' },
  ],
  wengFlare: [
    { speaker: 'Weng', text: 'You have met the ink face to face and come back. Then take this — a spark of my own lantern.' },
    { speaker: 'Weng', text: 'Spend your moonlight and it will fly for you. Do not waste it on the dark; the dark is patient.' },
  ],
  wengAfterFlare: [
    { speaker: 'Weng', text: 'Beneath the cloister lies the Crimson Sanctum. The bell-warden’s hall. Do not listen to the bell for long.' },
  ],
  wengShop: [
    { speaker: 'Weng', text: 'Jade still has worth down here, if only to an old keeper. What will you trade for?' },
  ],
  xunFirst: [
    { speaker: 'Xun', text: 'Oh! Forgive me — I thought you were a lantern come loose. I am Xun. I am going down.' },
    { speaker: 'Xun', text: 'Everyone who came here was going down, once. The trick, I think, is not to stop.' },
    { speaker: 'Xun', text: 'If you see a crack of light below the bridges, follow it. The Court hid their best roads in plain sight.' },
  ],
  xunIdle: [{ speaker: 'Xun', text: 'My map ends here. Well — maps always end somewhere. That is where the walking begins.' }],
  xunMist: [
    { speaker: 'Xun', text: 'You again! You travel faster than rumours. The cloister monks left something with wings in their garden.' },
    { speaker: 'Xun', text: 'A warden of censer-smoke guards it. It swings slow. I, sadly, run slower.' },
  ],
  xunMistIdle: [{ speaker: 'Xun', text: 'Listen. Under the waterfalls you can hear the bell below. It sounds tired.' }],
  xunSanctum: [
    { speaker: 'Xun', text: 'I fell down the well. On purpose, mostly. Listen — do you hear the bell? It never stops.' },
    { speaker: 'Xun', text: 'Its warden fights like the bell itself: a toll, then a pause. Learn the pause.' },
  ],
  xunEnd: [
    { speaker: 'Xun', text: 'The bell is quiet. Do you hear how large the silence is?' },
    { speaker: 'Xun', text: 'Whatever lies under that seal, I will follow you there. Eventually. Go on.' },
  ],
} satisfies Record<string, DialogueLine[]>;

export const SHOP = [
  { id: 'fragment_shop', name: 'Moon Fragment', desc: 'A sliver of the Ink Moon. Three restore a lantern of life.', cost: 180 },
  { id: 'vessel_shop', name: 'Moonlight Vessel', desc: 'A jade cup that holds a third more moonlight.', cost: 240 },
] as const;

export const REGION_TEXT: Record<string, { name: string; hanzi: string; subtitle: string }> = {
  threshold: { name: 'The Cicada Threshold', hanzi: '蝉蜕窟', subtitle: 'where the seed awoke' },
  terraces: { name: 'Thousand Lantern Terraces', hanzi: '千灯台', subtitle: 'the Court’s fading light' },
  mistfall: { name: 'Mistfall Cloister', hanzi: '雾瀑回廊', subtitle: 'where water forgets the way down' },
  sanctum: { name: 'The Crimson Sanctum', hanzi: '赤池禅院', subtitle: 'the bell-warden’s vigil' },
};

export const ENDING_TEXT = [
  'The bell is silent.',
  'Beneath the shattered seal, a stair unwinds into a darkness older than the Court.',
  'Far below, something pale is still falling.',
  'The descent is eternal.',
];

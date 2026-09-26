# Mòyuè — The Eternal Descent · Design Document

## Premise

Long ago a second moon — the **Ink Moon (墨月)** — fell through the world and kept
sinking. An insect civilisation, the **Moth Court**, followed its light downward,
carving terraces, temples and pagodas into an enormous hollow beneath the earth.
Their lanterns burned with borrowed moonlight. When the moon began to dim, ink
seeped from the stone and the Court fell silent.

A **cicada**, sealed in jade at the top of the Descent for seventeen summers (the
cicada's cycle of rebirth), wakes when the last bell stops tolling. It carries a
slender jade **wing-blade** and a crimson scarf, and it goes down — as all light
goes down.

Everything in the game — characters, creatures, architecture, lore, dialogue,
music, sound, UI and art — is original and generated in code. Hollow Knight is a
reference only for *gameplay philosophy* (responsive control, readable enemies,
recoil and pogo, rest-point checkpoints, interconnected ability-gated world,
environmental storytelling). Chinese fantasy is a reference only for broad
artistic language (sweeping hip roofs, pagodas, lanterns, ink-wash landscapes,
pentatonic music).

## Pillars

1. **Responsive, precise control** — no input is ever delayed by animation.
2. **Scale** — a one-metre warrior in a cavern hundreds of metres across.
3. **Light in darkness** — warm lanterns against cold stone and mist.
4. **Exploration rewards curiosity** — hidden ledges, hollow walls, secrets behind falls.
5. **Mobile first** — everything is playable with two thumbs.

## Protagonist

| Aspect | Design |
| --- | --- |
| Silhouette | Round dark-jade carapace head, wide-set glowing amber eyes, three ocelli, short antennae, ink robe, folded translucent wings worn like a cape, crimson scarf (verlet ribbon) |
| Size | 1.0 m tall capsule (radius 0.3 m) |
| Weapon | Jade wing-blade (0.6 m) |
| Health | Lantern icons (5 base, +1 per 3 Moon Fragments) |
| Resource | Moonlight (the ink-moon gauge): +11 per hit on a creature; 33 per heal or flare |

## Controls (touch)

* **Left half**: floating analog stick (appears under the thumb, follows the thumb past its edge so direction is never lost). Adjustable dead zone, sensitivity, fixed/floating.
* **Right half**: drag anywhere empty to rotate the camera.
* **Thumb arc** (bottom-right): **Jump** (largest, corner), **Strike**, **Dash**, **Moon** (heal / flare / bell strike by context), **Focus** (lock-on), contextual **lantern** button for talk / rest / read / take.
* Sliding a thumb from one button to another presses the new one (Strike → Jump rolls).
* Layout editor: drag to reposition, per-button size, global size/opacity.
* Top-right: pause and map.

Keyboard/mouse and gamepad are fully supported too (see README).

## Movement & combat numbers

| Parameter | Value |
| --- | --- |
| Run speed | 7.4 m/s, reached in < 0.1 s; stops in < 0.07 s |
| Jump | 2.55 m (held), ~0.5 m (tap); apex 0.36 s; fall gravity ×1.42; apex hang while held |
| Coyote time / jump buffer | 0.10 s / 0.13 s |
| Dash (Cloud Step) | 21 m/s × 0.17 s ≈ 3.6 m, 0.12 s invulnerability, 1 air dash per airtime, jump-cancel on ground |
| Double jump (Wing Unfurl) | 2.15 m |
| Wall cling/jump (Cicada's Grip) | only on carved / root-covered surfaces; slide 3 m/s; jump 12.8 up + 8.6 out |
| Melee | 3-hit ground chain (0.30/0.30/0.40 s), air slash, automatic down-slash (pogo) / up-slash by soft aim |
| Charged spin (Moon-Cleave) | hold 0.62 s, 360°, 2.5 damage |
| Hit feedback | hit-stop 45–90 ms, camera trauma, recoil, flash, ink/spark bursts, moonlight motes |
| Damage taken | 1 lantern, 1.25 s i-frames, knockback, red vignette |

## World

```
            Threshold (y≈100)        ← jade tomb, overlook, broken bridge, first shrine
                 │
        Lantern Terraces (y 54–90)   ← Keeper Weng, Cloud Step trial (dash), Great Pagoda
                 │  (pagoda foot)
        Mistfall Cloister (y 44–72)  ← Great Gap (dash), Censer Warden → Wing Unfurl,
                 │                     Hanging Stair (double jump) → Cicada's Grip,
                 │                     carved chimney (wall jump) → Wind Gate
                 │  Descent Well (a 56 m drop)
        Crimson Sanctum (y≈16)       ← thorn-lotus pogo pool, Tolling Abbot → Bell Strike,
                                       the cracked seal → ending
```

### Progression graph (verified by `tests/traversal.test.ts`)

| Gate | Requires | Reward beyond |
| --- | --- | --- |
| Cloud Step trial (3 waves) | — | Cloud Step (dash) |
| The Great Gap (6.3 m, mist-sea hazard 2 m below) | dash | Mistfall |
| Censer Warden (elite) | — | Wing Unfurl (double jump) |
| Hanging Stair (3.8 m ledges) | double jump | Hermit's Terrace + Cicada's Grip |
| Carved chimney (13 m) | wall cling | Wind Gate → Descent Well → Sanctum |
| Tolling Abbot (3 phases) | — | Bell Strike |
| Cracked seal | Bell Strike | ending |
| Twin carved pillars (optional) | wall cling | Moon-Cleave (charged spin) |
| Lantern Flare (optional) | talk to Weng after Wing Unfurl | projectile special |

Fall catchers (invisible hazard volumes just below high ledges) prevent sequence
breaks by long glides; every hazard returns the player to the last safe ground
for one lantern.

### Collectibles

* 6 Moon Fragments (3 → +1 lantern): hidden ledge (Threshold), hollow wall (Terraces), behind the waterfall and at the Wind Gate (Mistfall), thorn pool (Sanctum), Weng's shop.
* 7 lore steles, jade (urns, enemies), Moonlight Vessel (shop).

### Checkpoints

Incense shrines: Threshold, Keeper's (Terraces), Cloister (Mistfall), Crimson (Sanctum).
Resting restores lanterns, saves, sets the respawn point and resets ordinary enemies
(elites and bosses stay defeated). Death returns you to the last shrine with nothing lost.

## Creatures

| Creature | Behaviour | Tells | Weakness |
| --- | --- | --- | --- |
| Ink Mite | wanders, chirps when it spots you, chases | crouch + eyes flare (0.42 s) → lunge | any strike; staggers on hit |
| Lantern Wisp | circles 2.6 m overhead | lantern brightens & shakes → dive; far away: ember spit | up-slash / jump strike; embers can be slashed |
| Shieldback | slow patrol, slow turn (2.3 rad/s) | glaive raised (0.7 s) → sweep | blocks frontal slashes; hit from behind/above, pogo, or during its 0.95 s recovery (shield lowered) |
| Censer Warden (elite) | censer on a chain | low 300° sweep (jump it), overhead slam → ground shockwave (jump it), charge, phase 2 smoke clouds and double sweeps | recovery windows; stunned when a charge hits a wall |
| Tolling Abbot (boss) | carries the great bell | tolls (rolling rings to jump), leap + slam with a red ground marker, horn sweep, charge (stunned on impact), phase 2 cracked bell + ink mites, phase 3 ember rain | long recoveries after slam and charge |

## Audio

All audio is synthesised with WebAudio at runtime:
* **Music** — generative, per region: plucked zither phrases, bamboo-flute lines, bowed string, drones, temple bells and drums over Chinese pentatonic modes (gong, shang, jue, zhi, yu), crossfading on region/arena changes.
* **Ambience** — wind, water, rumble beds; dripping, lantern crackle, wind chimes, insects, distant bells.
* **Effects** — ~70 synthesised effects (swings, impacts, clangs, bells, creature calls, UI).
* Cave reverb from a generated impulse response.

## Visual identity

* Deep blue/ink darkness, warm red-amber lanterns, jade accents, crimson in forbidden places.
* Custom height fog + distance fog per region; ink-wash spire backdrops; mist seas; light shafts; bioluminescence; ambient particles (dust, embers, fireflies, spores, ash).
* HDR bloom, ACES tone mapping, per-region grading, vignette and grain.
* Characters: procedural meshes, fresnel rim light and inverted-hull ink outlines for readability.

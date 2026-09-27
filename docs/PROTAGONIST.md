# The protagonist · model notes

The design reference is the user's character art: a front three-quarter
render of the character and a sheet of eight poses. It is the source of
truth. The images are not stored in this repository.

No 3D file (mesh, rig or textures) was supplied, only images. Like every
other asset in the game, the character is therefore built in code
(`src/art/characters/PlayerModel.ts`) and matched to the images by
side-by-side comparison. The dev tools listed at the end make that
comparison repeatable.

## Measured proportions

The figure is 1.0 m from the feet to the top of the mask. The collision
capsule is 1.0 m × 0.3 m, so it is unchanged. All values are in
`src/player/playerDims.ts`.

| Part | Reference | Model |
| --- | --- | --- |
| Mask/head height | 51 % of the figure | 0.51 m (0.49 → 1.00 m) |
| Mask/head width | 53 % of the figure | 0.53 m |
| Eyes | round, ~27 % of the mask width, centred ~60 % down | r 0.074 m, 0.055 m below the mask centre |
| Hair crest | ~0.34 m above the mask | ≈ 0.33 m |
| Body below the chin | 49 % (cloak almost to the ground) | 0.49 m, cloak hem at ~0.09 m |
| Legs visible below the skirt | ~6 % | ~0.07 m |
| Buns | at brow level on the upper sides of the head | 0.40 m above the neck, ±0.29 m |
| Spear | ~1.3 × the figure height | 1.32 m |
| Spear on the back | phoenix above the right shoulder at eye level, beyond the head; flaming head by the left foot | the same (grip socket at x −0.40, y 0.62, z −0.24) |

## Parts

- **Mask-head.** A hexagonal shield outline: shallow peaked top, cut top
  corners, near-vertical sides that run below the eyes, then a short V to
  the chin point. It extends back into a deep rounded box, with a red
  lacquer front and red sides.
  - The gold pattern follows the reference: a border inside the outline, a
    ridge line from the top peak to the chin, and arched brows ending in
    cloud scrolls at the temples. There is a pair of scrolls on the upper
    forehead, facet lines from the eyes to the chin, and small curls on the
    cheeks.
  - The gold is raised (bump map) and polished (metalness map).
  - The eyes are deep glossy black holes with thick raised gold rims.
- **Hair.** A single glossy copper mass:
  - It rises from behind the mask's top edge (the border stays visible) and
    crests about as wide as the head, leaning to the character's right.
  - It sweeps back and falls as a thick mane on the head's left-back side
    down to the ground, where the tail sweeps around the right side and its
    tip curls up.
  - It is a lofted surface along a simulated chain. The crown holds its
    styled shape and the tail streams with motion. Fine strands come from
    the texture, clumped locks and two anisotropic highlight bands.
- **Buns and pins.** Two dark buns on the upper sides of the head, each with
  two red pins with gold ends pointing outward in a "<".
- **Cloak.** Black silk with dark-gold cloud embroidery. It hangs from under
  the chin almost to the ground in a bell shape, open down the front, with
  its hem falling to points. It is deformed per vertex so it billows, opens
  like wings on the double jump and lifts over raised arms.
- **Armour.**
  - A red lacquer chest plate with gold chevrons, and a grey-brown sash with
    a front knot and short tails.
  - A two-tier red skirt with engraved gold trims, gold chevrons and studs
    at the front.
  - Large pauldrons: a lacquered cap and five lames, gold and red, hanging
    over the upper arm.
  - Black arms with gold bracers.
- **Legs.** Short black pegs with rounded points.
- **Spear.** A red lacquer shaft with gold fittings and a black grip.
  - At the butt, a gold phoenix head (arched neck, hooked beak, crest of
    red and gold plumes) with two long gold ribbons edged in crimson.
  - At the head, a gold cup, fourteen sculpted flame tongues (crimson to
    orange to gold) and a flame-shaped point.

## What was wrong in the first attempt, and the correction

| Element | First attempt | Corrected |
| --- | --- | --- |
| Mask outline | egg / heart shape narrowing from the eyes | hexagonal shield, V only below the eyes |
| Gold pattern | an invented layout | redrawn from the reference |
| Hair | a vertical brush of flat fins, then a flat sheet down the back | one continuous rounded mass: crest, fall, curled tail |
| Hair cap | covered the sides of the head | back of the head only; the sides are red as in the reference |
| Buns and pins | small; pins pointing forward and back | larger; pins pointing outward |
| Body | a banded tube, cloak as two flat panels | bell-shaped cloak over visible chest plate, sash and two-tier skirt |
| Pauldrons | small rings, then shelf-like | large layered pauldrons hugging the upper arm |
| Legs | hidden | visible short black pegs |
| Spear | 1.62 m, phoenix hidden behind the head, flames too small and yellow | 1.32 m, phoenix out beside the head, large crimson-to-gold flame burst, long ribbons |
| Ground contact | body sunk 0.13 m into the floor | stands on the floor (see below) |

**Sinking bug (also present in the previous character).** The rig captured
the hips' rest position before its height was set. The animation therefore
snapped the hips back to ground level every frame, which buried the
previous character up to its robe (0.36 m) and the first version of this
one by 0.13 m. `Rig.add` now documents that joints must be placed first, and
the model does so.

## Gameplay consequences

- **Reach.** The shorter reference-length spear reaches about 1.5 m. The
  hit volumes were reduced to match: slash 1.75 m, air slash 1.7 m and
  finisher 1.85 m (previously 2.05, 2.05 and 2.35). `tests/spear.test.ts`
  checks that during each attack's active frames the spear tip crosses the
  hit volume and comes within 0.35 m of its edge. The slash arc shows that
  last margin.
- **Collision, movement, camera, abilities and progression** are
  unchanged. The capsule, controller tuning and traversal simulations all
  pass.

## Dev tools

| Tool | Use |
| --- | --- |
| `viewer.html` (dev server only) | The character alone under neutral light. URL parameters: `yaw`, `pitch`, `dist`, `look`, `pose` (`idle`, `run`, `jump`, `dash`, `slash3`, `airSlash`…), `u` (attack progress), `bg` |
| `scripts/compare-ref.mjs <ref.jpg> <out.png> "<viewer query>" [w h crop]` | Render beside a reference image (optionally cropped from a sheet) |
| `scripts/model-views.mjs <out.png>` | Front, left, back and right views |
| `scripts/pose-shots.mjs` | In-game shots: idle from four angles, then slash, jump, dash and run in slow motion |

## Known remaining differences

- **Hair.** The reference hair is made of thousands of individual strands.
  Here it is a sculpted mass with strand texture and highlights, as a
  real-time mobile model requires. The crest is close in silhouette but
  slightly blockier from the three-quarter view.
- **Ornament.** Fine engraving on the pauldrons, skirt and phoenix is
  simplified to textures and a few shapes.
- **Flames.** The flame tongues are flat sculpted shapes rather than fully
  rounded ones.
- **Lighting.** The reference is a studio render. In the game the same
  materials sit in dark caves lit by lanterns, so the character is darker
  and more contrasted.

# Mòyuè — The Eternal Descent · 墨月

An original third-person 3D action-adventure for phones and tablets. A tiny
cicada-born warrior wakes in a jade tomb at the top of an enormous forgotten
cavern and descends through lantern-lit terraces, misty cloisters and a crimson
sanctum toward a fallen moon.

* **No game engine.** No Unity, Unreal or Godot. The game is TypeScript code.
  [Three.js](https://threejs.org) is used only as a WebGL rendering library.
  Physics, the character controller, combat, AI, animation, cameras, audio
  synthesis, UI and saving are all implemented in this repository.
* **No external assets.** Every model, texture, animation, sound and piece of
  music is generated procedurally at runtime.
* **Mobile first.** Built to be played with two thumbs on iOS and Android, in the
  browser or installed to the home screen (PWA manifest included).

See [`docs/DESIGN.md`](docs/DESIGN.md) for the world, mechanics and content, and
[`docs/DEVELOPMENT_REPORT.md`](docs/DEVELOPMENT_REPORT.md) for what is
implemented, tested and still untested.

## Running

```bash
npm install
npm run dev        # http://localhost:5173 (also on your LAN: open it on a phone)
npm run build      # production build in dist/
npm run preview    # serve the build
```

Open the dev URL on a phone on the same network, turn it sideways, and tap
**Begin the Descent**. On iOS use *Share → Add to Home Screen* for a full-screen app.

### Debug URL parameters

| Parameter | Effect |
| --- | --- |
| `?quality=low\|medium\|high` | override graphics quality |
| `?play=1` | skip the title and start playing |
| `?spawn=x,y,z` | start at a position |
| `?abilities=all` | grant every technique |
| `?god=1` | the player cannot die |

## Controls

| Action | Touch | Keyboard / mouse | Gamepad |
| --- | --- | --- | --- |
| Move | left thumb (floating stick) | WASD / arrows | left stick |
| Camera | drag on the right | mouse (click to lock) | right stick |
| Jump | JUMP (hold = higher) | Space | A |
| Strike (hold to charge once learned) | STRIKE | J / left click | X |
| Dash | DASH | K / Shift / right click | B / RT |
| Heal (hold) · Flare (tap) · Bell Strike (in air) | MOON | L / Q | Y |
| Talk / rest / read / take | lantern button | E / F | RB |
| Focus (lock-on) | FOCUS | Tab / R / middle click | LB |
| Pause / map | top-right buttons | Esc / M | Start / Select |

Touch layout, button size and opacity, stick dead zone and sensitivity, camera
sensitivity and distance, inverted look, auto-camera, screen shake, vibration,
hints, volumes and graphics quality are all in **Settings**.

## Tests

```bash
npm test           # unit + headless level-traversal simulations (Vitest)
npm run e2e        # end-to-end tests in headless Chromium with mobile emulation (Playwright)
npm run typecheck
```

The traversal tests build every region's real collision geometry in Node and
drive the real player controller with an autopilot through the critical path,
proving that each gap, stair, chimney and seal is passable with the intended
abilities — and impassable without them.

## Project layout

```
src/
  core/        math, seeded RNG, events, pooling, environment detection
  physics/     colliders (OBB, cylinder), spatial-hash world, kinematic character body
  player/      controller (movement + melee state machine), tuning, abilities, animator, entity
  anim/        procedural pose rig
  camera/      third-person orbit camera with collision, zones and shake
  combat/      hit volumes and damage types
  enemies/     enemy base, Ink Mite, Lantern Wisp, Shieldback, Censer Warden, Tolling Abbot
  entities/    shrines, steles, altars, pickups, urns, NPCs, gates, levers, platforms, projectiles
  world/       region definitions, build context, streaming & atmosphere
  art/         procedural textures, materials, geometry kit (roofs, pagodas, halls, bridges…), characters
  fx/          renderer + post-processing, glows, light pool, particles, combat effects
  audio/       WebAudio engine, generative music & ambience
  input/       input state, keyboard/mouse, gamepad, touch controls
  ui/          HUD, menus, map, dialogue, styles
  save/        save system (checksummed, with backup) and settings
  story/       lore, dialogue, region names
tests/         Vitest unit + traversal simulations
e2e/           Playwright end-to-end tests
scripts/       dev helpers (screenshots, audio/combat smoke checks)
```

## Packaging for the app stores

The game is a static web build (`dist/`). To ship native iOS/Android apps, wrap it
with a WebView shell such as Capacitor:

```bash
npm i -D @capacitor/cli @capacitor/core @capacitor/ios @capacitor/android
npx cap init "Mòyuè" com.example.moyue --web-dir dist
npm run build && npx cap add ios && npx cap add android && npx cap sync
```

This step needs Xcode / Android Studio and was **not** performed in this
repository's development environment (see the development report).

import './ui/styles.css';
import { Vector3 } from 'three';
import { Game } from './game/Game';
import { REGIONS } from './world/regions';
import { allAbilities } from './player/Abilities';
import { Quality } from './save/Settings';
import { AudioEngine } from './audio/AudioEngine';

/**
 * Debug URL parameters (for development & automated tests):
 *   ?quality=low|medium|high   override graphics quality for this session
 *   ?play=1                    skip the title, start a new game
 *   ?spawn=x,y,z               start at a position
 *   ?abilities=all             grant every technique
 *   ?god=1                     player cannot die
 */
async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const container = document.getElementById('moyue-root')!;
  const game = new Game(container, REGIONS);
  (window as unknown as { __MOYUE__: Game }).__MOYUE__ = game;
  game.audio = new AudioEngine();
  game.applySettings();
  const q = params.get('quality') as Quality | null;
  if (q && ['low', 'medium', 'high', 'auto'].includes(q)) {
    game.renderer.setQuality(q);
    game.world.lightPool.setCount(game.renderer.profile.lights);
    game.onResize();
  }
  await game.load((p, label) => {
    const bar = document.getElementById('moyue-loading-bar');
    if (bar) bar.style.width = `${Math.round(p * 100)}%`;
    const l = document.getElementById('moyue-loading-label');
    if (l) l.textContent = label;
  });
  document.getElementById('moyue-loading')?.remove();
  game.start();
  if (params.get('play') === '1' || params.has('spawn')) {
    game.debugStart({
      spawn: params.get('spawn')?.split(',').map(Number) as [number, number, number] | undefined,
      abilities: params.get('abilities') === 'all' ? allAbilities() : undefined,
      god: params.get('god') === '1',
    });
  } else game.showTitle();
  void Vector3;
}

boot().catch((e) => {
  console.error(e);
  const el = document.getElementById('moyue-loading-label');
  if (el) el.textContent = `Failed to start: ${e?.message ?? e}`;
});

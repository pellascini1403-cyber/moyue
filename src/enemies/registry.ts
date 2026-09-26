import { Vector3 } from 'three';
import type { Game } from '../game/Game';
import { EnemyKind } from '../world/Region';
import { Enemy } from './Enemy';
import { InkMite, LanternWisp, Shieldback } from './BasicEnemies';
import { CenserWarden, TollingAbbot } from './Bosses';

export function spawnEnemy(game: Game, kind: EnemyKind, id: string, region: string, pos: Vector3, yaw: number): Enemy {
  switch (kind) {
    case 'inkMite':
      return new InkMite(game, id, region, pos, yaw);
    case 'lanternWisp':
      return new LanternWisp(game, id, region, pos, yaw);
    case 'shieldback':
      return new Shieldback(game, id, region, pos, yaw);
    case 'censerWarden':
      return new CenserWarden(game, id, region, pos, yaw);
    case 'tollingAbbot':
      return new TollingAbbot(game, id, region, pos, yaw);
    case 'silkDropper':
    default:
      return new InkMite(game, id, region, pos, yaw);
  }
}

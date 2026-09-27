/**
 * Development-only character viewer (viewer.html, not part of the game build):
 * renders the protagonist alone under neutral studio light so the model can be
 * compared with the design references at matching angles.
 *
 * URL parameters: yaw (deg, camera azimuth, 0 = in front, + toward the
 * character's left), pitch (deg, + above), dist (m), look (m, height looked
 * at), fov, pose (idle|run|jump|fall|dash|wallSlide|heal|<attack kind>), u
 * (attack progress 0..1), bg (css colour), drawn (1 = spear in hand).
 */
import {
  CircleGeometry, Color, DirectionalLight, HemisphereLight, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, Vector3,
} from 'three';
import { Renderer } from '../fx/Renderer';
import { buildPlayerModel } from '../art/characters/PlayerModel';
import { PlayerController, AttackKind, MoveState } from '../player/PlayerController';
import { PlayerAnimator } from '../player/PlayerAnimator';
import { PlayerTuning } from '../player/PlayerTuning';
import { WorldUniforms } from '../art/materials';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
const container = document.getElementById('v')!;
const renderer = new Renderer(container);
renderer.setQuality('high');
renderer.grade.vignette = 0.15;
const scene = new Scene();
scene.background = new Color(q.get('bg') ?? '#1b1c21');
scene.add(new HemisphereLight(0x9aa4b8, 0x201812, 1.1));
const key = new DirectionalLight(0xffe4c8, 2.6);
key.position.set(2, 4, 3);
scene.add(key);
const rim = new DirectionalLight(0xa8c0ff, 1.8);
rim.position.set(-3, 2.5, -3);
scene.add(rim);
const fill = new DirectionalLight(0xffb080, 0.6);
fill.position.set(-3, 1, 2);
scene.add(fill);
const ground = new Mesh(new CircleGeometry(1.6, 48), new MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.9 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const view = buildPlayerModel();
scene.add(view.root);
for (const m of view.worldMeshes) scene.add(m);
const ctrl = new PlayerController();
ctrl.body.grounded = true;
const anim = new PlayerAnimator(view, ctrl);
anim.groundY = 0;

const pose = q.get('pose') ?? 'idle';
const u = num('u', 0.3);
const ATTACKS: Record<string, keyof typeof PlayerTuning.attack> = {
  slash1: 'slash', slash2: 'slash', slash3: 'finisher', airSlash: 'air', downSlash: 'down', upSlash: 'up', spin: 'spin', slam: 'slam',
};
function applyPose(): void {
  if (ATTACKS[pose]) {
    const s = PlayerTuning.attack[ATTACKS[pose]];
    ctrl.state = pose === 'slash1' || pose === 'slash2' || pose === 'slash3' || pose === 'spin' ? 'idle' : 'jump';
    ctrl.body.grounded = ctrl.state === 'idle';
    ctrl.attack = {
      id: 1, kind: pose as AttackKind, t: u * s.duration, duration: s.duration, activeStart: s.activeStart, activeEnd: s.activeEnd,
      cancel: s.cancel, damage: s.damage, range: s.range, arc: s.arc, knockback: s.knockback, lunge: s.lunge, dir: new Vector3(0, 0, 1), hit: new Set(),
    };
  } else {
    ctrl.state = pose as MoveState;
    ctrl.body.grounded = !['jump', 'fall', 'dash', 'doubleJump'].includes(pose);
    ctrl.stateTime = 0.2;
    if (pose === 'run') ctrl.body.velocity.set(0, 0, 7.4);
    if (pose === 'fall') ctrl.body.velocity.set(0, -8, 0);
    if (pose === 'jump') ctrl.body.velocity.set(0, 5, 0);
    if (pose === 'dash') ctrl.body.velocity.set(0, 0, 18);
  }
}

const camera = new PerspectiveCamera(num('fov', 28), 1, 0.05, 50);
function placeCamera(): void {
  const yaw = (num('yaw', 0) * Math.PI) / 180, pitch = (num('pitch', 8) * Math.PI) / 180, dist = num('dist', 3.6);
  const look = new Vector3(0, num('look', 0.62), 0);
  camera.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, look.y + Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
  camera.lookAt(look);
}
function resize(): void {
  const w = container.clientWidth, h = container.clientHeight;
  renderer.resize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
placeCamera();

let t = 0;
let frames = 0;
function frame(): void {
  const dt = 1 / 60;
  t += dt;
  WorldUniforms.uTime.value = t;
  applyPose();
  if (pose === 'run') ctrl.stridePhase = num('phase', 0.5);
  anim.update(dt, t);
  renderer.render(scene, camera, dt);
  frames++;
  (window as unknown as { __VIEWER__: { frames: number } }).__VIEWER__ = { frames };
  requestAnimationFrame(frame);
}
// settle the springs, the hair and the cloak before the first visible frame
for (let i = 0; i < 120; i++) {
  applyPose();
  anim.update(1 / 60, i / 60);
}
frame();

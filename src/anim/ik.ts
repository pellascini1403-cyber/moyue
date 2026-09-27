import { Matrix4, Quaternion, Vector3 } from 'three';

const _d = new Vector3();
const _p = new Vector3();
const _u = new Vector3();
const _f = new Vector3();
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
const _m = new Matrix4();

/**
 * Two-bone IK for a limb that hangs along -y at rest (identity rest
 * orientation), e.g. shoulder → elbow → hand. All vectors are in the upper
 * joint's parent space. Writes the upper joint's rotation to `out` and returns
 * the lower joint's bend: rotate it by -bend about its local x axis.
 * `pole` is the direction the elbow should point toward.
 */
export function solveTwoBone(root: Vector3, target: Vector3, l1: number, l2: number, pole: Vector3, out: Quaternion): number {
  _d.subVectors(target, root);
  let len = _d.length();
  if (len < 1e-6) _d.set(0, -1, 0), (len = 1e-6);
  _d.divideScalar(len);
  const D = Math.min(Math.max(len, Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-4);
  const cosA = Math.min(1, Math.max(-1, (l1 * l1 + D * D - l2 * l2) / (2 * l1 * D)));
  const cosB = Math.min(1, Math.max(-1, (l1 * l1 + l2 * l2 - D * D) / (2 * l1 * l2)));
  const bend = Math.PI - Math.acos(cosB);
  // pole direction perpendicular to the reach line
  _p.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_p.lengthSq() < 1e-8) {
    _p.set(1, 0, 0).addScaledVector(_d, -_d.x);
    if (_p.lengthSq() < 1e-8) _p.set(0, 0, 1).addScaledVector(_d, -_d.z);
  }
  _p.normalize();
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  _u.copy(_d).multiplyScalar(cosA).addScaledVector(_p, sinA); // upper bone direction
  // forearm direction (elbow → reach point); the local +z axis bends toward it
  _f.copy(_d).multiplyScalar(D).addScaledVector(_u, -l1).normalize();
  _y.copy(_u).negate();
  _z.copy(_f).addScaledVector(_u, -_f.dot(_u));
  if (_z.lengthSq() < 1e-8) _z.copy(_p).negate().addScaledVector(_u, _p.dot(_u));
  _z.normalize();
  _x.crossVectors(_y, _z).normalize();
  _z.crossVectors(_x, _y);
  _m.makeBasis(_x, _y, _z);
  out.setFromRotationMatrix(_m);
  return bend;
}

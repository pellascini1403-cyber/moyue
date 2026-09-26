import { BufferGeometry, Material, Matrix4, Mesh, Object3D } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Reduce draw calls of procedural characters: under every node, leaf meshes
 * that share a material (and outline flag) are baked into a single mesh.
 * Joint hierarchy (animated Object3Ds) is preserved.
 */
export function mergeRigParts(root: Object3D): number {
  let removed = 0;
  const visit = (node: Object3D) => {
    const groups = new Map<string, Mesh[]>();
    for (const child of node.children) {
      const m = child as Mesh;
      if (!m.isMesh || m.children.length > 0 || Array.isArray(m.material)) continue;
      if (m.userData.noMerge || m.renderOrder !== 0) continue;
      const key = `${(m.material as Material).uuid}|${m.userData.outline ? 1 : 0}|${m.castShadow ? 1 : 0}`;
      let arr = groups.get(key);
      if (!arr) groups.set(key, (arr = []));
      arr.push(m);
    }
    for (const arr of groups.values()) {
      if (arr.length < 2) continue;
      const geos: BufferGeometry[] = [];
      for (const m of arr) {
        m.updateMatrix();
        let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        g.applyMatrix4(new Matrix4().copy(m.matrix));
        for (const name of Object.keys(g.attributes)) {
          if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
        }
        if (!g.getAttribute('uv')) {
          // keep attribute sets identical for merging
          g = g.clone();
        }
        geos.push(g);
      }
      const hasUv = geos.every((g) => g.getAttribute('uv'));
      if (!hasUv) for (const g of geos) if (g.getAttribute('uv')) g.deleteAttribute('uv');
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const first = arr[0];
      const mesh = new Mesh(merged, first.material);
      mesh.castShadow = first.castShadow;
      mesh.userData.outline = first.userData.outline;
      mesh.name = `${first.name || 'part'}_merged`;
      for (const m of arr) node.remove(m);
      node.add(mesh);
      removed += arr.length - 1;
    }
    for (const child of [...node.children]) visit(child);
  };
  visit(root);
  return removed;
}

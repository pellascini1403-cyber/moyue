// Dev helper: count visible (frustum) renderables per region and the draw calls of one frame.
// usage: node scripts/drawcalls.mjs "x,y,z" [low|medium|high]   (needs `npm run dev` on :5173)
import { chromium } from '@playwright/test';
const spawn = process.argv[2] || '-24,44.1,-146';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`http://127.0.0.1:5173/?quality=${process.argv[3]||"medium"}&spawn=${spawn}`);
await page.waitForFunction(() => window.__MOYUE__?.mode === 'play', null, { timeout: 120000 });
await page.waitForTimeout(4000);
const r = await page.evaluate(() => {
  const g = window.__MOYUE__;
  const counts = {};
  let total = 0;
  g.scene.traverseVisible((o) => {
    if (!o.isMesh && !o.isPoints && !o.isSprite) return;
    const e = o.matrixWorld.elements; const cam = g.cam.camera;
    if (!o.geometry?.boundingSphere && o.geometry?.computeBoundingSphere) o.geometry.computeBoundingSphere();
    const bs = o.geometry?.boundingSphere; if (!bs) return;
    const cx = bs.center.x, cy = bs.center.y, cz = bs.center.z;
    const wx = e[0]*cx+e[4]*cy+e[8]*cz+e[12], wy = e[1]*cx+e[5]*cy+e[9]*cz+e[13], wz = e[2]*cx+e[6]*cy+e[10]*cz+e[14];
    const sc = Math.max(Math.hypot(e[0],e[1],e[2]),Math.hypot(e[4],e[5],e[6]),Math.hypot(e[8],e[9],e[10]));
    const r = bs.radius*sc;
    const vm = cam.matrixWorldInverse.elements, pm = cam.projectionMatrix.elements;
    const m = new Array(16);
    for (let i=0;i<4;i++) for (let j=0;j<4;j++){ let s2=0; for(let k=0;k<4;k++) s2+=pm[k*4+i]*vm[j*4+k]; m[j*4+i]=s2; }
    const planes = [[m[3]-m[0],m[7]-m[4],m[11]-m[8],m[15]-m[12]],[m[3]+m[0],m[7]+m[4],m[11]+m[8],m[15]+m[12]],[m[3]+m[1],m[7]+m[5],m[11]+m[9],m[15]+m[13]],[m[3]-m[1],m[7]-m[5],m[11]-m[9],m[15]-m[13]],[m[3]-m[2],m[7]-m[6],m[11]-m[10],m[15]-m[14]],[m[3]+m[2],m[7]+m[6],m[11]+m[10],m[15]+m[14]]];
    if (o.frustumCulled !== false && !o.isSprite) for (const p of planes){ const l=Math.hypot(p[0],p[1],p[2]); if ((p[0]*wx+p[1]*wy+p[2]*wz+p[3])/l < -r) return; }
    let key = (o.name||o.parent?.name||'?').slice(0,24) + ':' + (o.material?.type||'');
    let p = o.parent; let depth = 0;
    while (p && depth < 10) { if (p.name && (p.name.startsWith('region:') || p.name === 'player')) { key = p.name + '/' + key; break; } p = p.parent; depth++; }
    counts[key] = (counts[key] || 0) + 1; total++;
  });
  return { total, counts, calls: g.renderer.info().calls };
});
console.log(JSON.stringify(r));
await browser.close();

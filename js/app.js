/**
 * Ruin renovation, Monsanto — 3D walkthrough v1 (sloped ring beam design, 25 Nov 2026).
 * Static three.js site, same layout as the roundhouse walkthrough. Sketch, not for construction.
 *
 * Plan coordinates: x east (0 = outside face of the west wall), n north (0 = outside face
 * of the south/front wall), h up from floor. World: (x, h, -n) so −Z is north.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas = document.getElementById('c');
const loading = document.getElementById('loading');
const DEG = Math.PI / 180;
const LAT = 40.04, LON = -7.11;           // Monsanto, Idanha-a-Nova
const EYE = 1.70, RADIUS = 0.22, WALK_SPEED = 2.2;

/* ---------- design numbers (m) ---------- */
const L = 7.0, D = 5.0, T = 0.5;          // outside length E–W, depth N–S, wall
const SLOPE = (3.63 - 2.75) / 5;          // 0.176 = 17.6 %, ~10°
const u = (n) => 2.75 + SLOPE * n;        // roof underside
const ringTop = (n) => 2.35 + SLOPE * n;  // side-wall ring top
const ringSoff = (n) => 2.10 + SLOPE * n; // side-wall ring soffit
const HEAD = 2.10;
const RING_F = [2.10, 2.35], RING_B = [2.98, 3.23];
const ROOF_T = 0.08;
const DOOR = { x0: 3.5, x1: 4.4 };
const WIN_F = { x0: 1.5, x1: 3.0, sill: 1.10 };
const WIN_W = { n0: 1.75, n1: 3.25, sill: 1.10 };
const VER = { n: -2.0, beamN0: -1.985, beamN1: -1.865, postN: -1.925, posts: [0.025, 3.5, 6.975], brace: 0.45 };

let scene, camera, renderer, orbit, sunLight, hemi, fill;
const groups = {};
const materials = {};
const clipMats = [];
let colliders = [];
let door = null;
let mode = 'orbit';
let cutMode = 'off';
let heightsOn = false;
let structureOn = false;
let keys = Object.create(null);
let joy = { x: 0, y: 0, active: false };
const WALK_START = { x: 3.95, n: -4.0, yaw: 0, pitch: 0.02 };
let yaw = WALK_START.yaw, pitch = WALK_START.pitch;
const player = new THREE.Vector3(WALK_START.x, EYE, -WALK_START.n);
const START_CAM = { x: -7.5, y: 5.2, z: 9.5, tx: 3.5, ty: 1.5, tz: -2.0 };
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hud = [];
let fly = null;

/* ---------- textures ---------- */
function canvasTex(size, draw, rep = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(rep, rep);
  return t;
}
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

function stoneTexture() {
  return canvasTex(512, (ctx, s) => {
    ctx.fillStyle = '#5e574c'; ctx.fillRect(0, 0, s, s);
    const tones = [[160, 156, 148], [140, 136, 128], [172, 150, 114], [150, 128, 98], [122, 116, 106], [182, 172, 152]];
    let y = 0;
    while (y < s) {
      const hh = Math.min(s - y, 34 + rnd() * 34);
      let x = -rnd() * 80;
      while (x < s) {
        const w = 40 + rnd() * 90;
        const t = tones[Math.floor(rnd() * tones.length)], j = (rnd() - 0.5) * 22;
        const c = t.map((v) => Math.round(v + j));
        const q = [[x + 2 + rnd() * 5, y + 2 + rnd() * 4], [x + w - 2 - rnd() * 5, y + 2 + rnd() * 4],
                   [x + w - 2 - rnd() * 5, y + hh - 2 - rnd() * 4], [x + 2 + rnd() * 5, y + hh - 2 - rnd() * 4]];
        for (const dx of [0, s, -s]) {
          ctx.beginPath();
          q.forEach(([px, py], i) => {
            const [nx, ny] = q[(i + 1) % 4];
            const mx = (px + nx) / 2 + (rnd() - 0.5) * 6, my = (py + ny) / 2 + (rnd() - 0.5) * 6;
            if (!i) ctx.moveTo((px + q[3][0]) / 2 + dx, (py + q[3][1]) / 2);
            ctx.quadraticCurveTo(px + dx, py, mx + dx, my);
          });
          ctx.closePath();
          const g = ctx.createLinearGradient(x + dx, y, x + dx, y + hh);
          g.addColorStop(0, `rgb(${c[0] + 14},${c[1] + 14},${c[2] + 14})`);
          g.addColorStop(1, `rgb(${c[0] - 16},${c[1] - 16},${c[2] - 16})`);
          ctx.fillStyle = g; ctx.fill();
          ctx.strokeStyle = 'rgba(40,36,30,.6)'; ctx.lineWidth = 1.5; ctx.stroke();
        }
        x += w + 1 + rnd() * 4;
      }
      y += hh + 1;
    }
    const img = ctx.getImageData(0, 0, s, s);
    for (let i = 0; i < img.data.length; i += 4) {
      const k = (rnd() - 0.5) * 30 + (rnd() < 0.04 ? -40 : 0);
      img.data[i] += k; img.data[i + 1] += k; img.data[i + 2] += k;
    }
    ctx.putImageData(img, 0, 0);
  });
}
function noiseTex(size, c0, c1, specks = null) {
  return canvasTex(size, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    for (let i = 0; i < s * s; i++) {
      const k = rnd();
      for (let j = 0; j < 3; j++) img.data[i * 4 + j] = c0[j] + (c1[j] - c0[j]) * k;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    if (specks) {
      ctx.strokeStyle = specks; ctx.lineWidth = 1;
      for (let i = 0; i < s * 1.5; i++) {
        const x = rnd() * s, y = rnd() * s, a = rnd() * Math.PI;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7); ctx.stroke();
      }
    }
  });
}
function timberTex() {
  return canvasTex(256, (ctx, s) => {
    ctx.fillStyle = '#b98a58'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 90; i++) {
      const y = rnd() * s;
      ctx.strokeStyle = `rgba(${110 + rnd() * 40},${70 + rnd() * 25},${35 + rnd() * 20},${0.25 + rnd() * 0.35})`;
      ctx.lineWidth = 1 + rnd() * 2;
      ctx.beginPath(); ctx.moveTo(0, y);
      for (let x = 0; x <= s; x += 16) ctx.lineTo(x, y + Math.sin(x / 40 + i) * 2);
      ctx.stroke();
    }
  });
}
function pvTex() {
  return canvasTex(256, (ctx, s) => {
    ctx.fillStyle = '#c9ccd0'; ctx.fillRect(0, 0, s, s);
    const n = 6, m = 10, pad = 6;
    const cw = (s - pad * 2) / n, chh = (s - pad * 2) / m;
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
      const g = ctx.createLinearGradient(0, 0, cw, chh);
      g.addColorStop(0, '#1d3d7a'); g.addColorStop(1, '#122a5a');
      ctx.fillStyle = g;
      ctx.fillRect(pad + i * cw + 1, pad + j * chh + 1, cw - 2, chh - 2);
    }
  });
}
function roofTex() {
  return canvasTex(128, (ctx, s) => {
    ctx.fillStyle = '#4b4f52'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 4; i++) { ctx.fillStyle = '#3c4043'; ctx.fillRect(i * 32 + 26, 0, 6, s); }
  });
}

function makeMaterials() {
  const stone = stoneTexture();
  const mat = (o, clip = true) => {
    const m = new THREE.MeshStandardMaterial(o);
    if (clip) clipMats.push(m);
    return m;
  };
  materials.stone = mat({ map: stone, roughness: 0.95, side: THREE.DoubleSide });
  materials.stoneSkin = mat({ map: stone, roughness: 0.95, side: THREE.DoubleSide });
  const conc = noiseTex(128, [168, 166, 160], [140, 138, 133]);
  materials.concrete = mat({ map: conc, roughness: 0.9, side: THREE.DoubleSide });
  const cob = noiseTex(256, [196, 156, 104], [168, 128, 82], 'rgba(222,196,130,.7)');
  materials.cob = mat({ map: cob, roughness: 1, side: THREE.DoubleSide });
  materials.steel = mat({ color: 0x2d3033, roughness: 0.45, metalness: 0.75 });
  const tim = timberTex();
  materials.timber = mat({ map: tim, color: 0xe6c59a, roughness: 0.7 });
  materials.glulam = mat({ map: tim, color: 0xf2d6aa, roughness: 0.65 });
  materials.door = mat({ map: tim, color: 0x9a6638, roughness: 0.6 });
  materials.frame = mat({ map: tim, color: 0x7a5030, roughness: 0.6 });
  materials.glass = mat({ color: 0x9fc6d6, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
  const rt = roofTex();
  materials.roofTop = mat({ map: rt, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide });
  materials.liner = mat({ color: 0xeeece6, roughness: 0.6, side: THREE.DoubleSide });
  materials.pv = mat({ map: pvTex(), roughness: 0.18, metalness: 0.35 });
  materials.pvFrame = mat({ color: 0xb8bcc0, roughness: 0.3, metalness: 0.8 });
  materials.bottle = mat({ roughness: 0.12, metalness: 0.05, emissive: 0x111111, transparent: true, opacity: 0.92 });
  materials.floor = mat({ map: noiseTex(128, [176, 168, 154], [150, 142, 128]), roughness: 0.9 });
  materials.ground = new THREE.MeshStandardMaterial({ map: noiseTex(256, [178, 164, 112], [140, 136, 88]), roughness: 1 });
  materials.ground.map.repeat.set(30, 30);
  materials.granite = new THREE.MeshStandardMaterial({ map: noiseTex(128, [170, 166, 156], [120, 116, 108]), roughness: 0.95 });
  materials.highlight = new THREE.MeshBasicMaterial({ color: 0xffd56a });
}

/* ---------- geometry helpers ---------- */
// World-space box-projected UVs (metres / scale), so textures keep the same size everywhere.
function worldUV(geom, scale = 1.6) {
  geom.computeVertexNormals();
  const pos = geom.attributes.position, nor = geom.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    let a, b;
    if (ax >= ay && ax >= az) { a = z; b = y; } else if (ay >= az) { a = x; b = z; } else { a = x; b = y; }
    uv[i * 2] = a / scale; uv[i * 2 + 1] = b / scale;
  }
  geom.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geom;
}
function add(group, geom, mat, uvScale = 1.6, shadow = true) {
  worldUV(geom, uvScale);
  const m = new THREE.Mesh(geom, mat);
  m.castShadow = shadow; m.receiveShadow = true;
  group.add(m);
  return m;
}
// Box from plan ranges: x [x0,x1], n [n0,n1], h [h0,h1]
function boxG(x0, x1, n0, n1, h0, h1) {
  const g = new THREE.BoxGeometry(x1 - x0, h1 - h0, n1 - n0);
  g.translate((x0 + x1) / 2, (h0 + h1) / 2, -(n0 + n1) / 2);
  return g.toNonIndexed();
}
// Prism: polygon in the (n, h) plane, extruded along x from x0 to x1. Optional holes [[n,h]...].
function prismX(poly, x0, x1, holes = []) {
  const sh = new THREE.Shape(poly.map(([n, h]) => new THREE.Vector2(-n, h)));
  holes.forEach((hp) => sh.holes.push(new THREE.Path(hp.map(([n, h]) => new THREE.Vector2(-n, h)))));
  const g = new THREE.ExtrudeGeometry(sh, { depth: x1 - x0, bevelEnabled: false });
  g.rotateY(-Math.PI / 2);   // local x → world z, local z → world −x
  g.translate(x1, 0, 0);
  return g;
}
// Prism: polygon in the (x, h) plane, extruded along n from n0 to n1.
function prismN(poly, n0, n1) {
  const sh = new THREE.Shape(poly.map(([x, h]) => new THREE.Vector2(x, h)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: n1 - n0, bevelEnabled: false });
  g.translate(0, 0, -n1);
  return g;
}
const P = (x, h, n) => new THREE.Vector3(x, h, -n);

/* ---------- model ---------- */
function buildModel() {
  for (const k of ['walls', 'skins', 'ring', 'cob', 'steel', 'roof', 'pv', 'purlin', 'veranda', 'verandaRoof', 'openings', 'site']) {
    groups[k] = new THREE.Group(); groups[k].name = k; scene.add(groups[k]);
  }
  const W = groups.walls;

  // Front (south) wall, n 0..0.5, stone up to 2.10 (the ring is the lintel over door and window)
  add(W, boxG(0, WIN_F.x0, 0, T, 0, HEAD), materials.stone);
  add(W, boxG(WIN_F.x0, WIN_F.x1, 0, T, 0, 0.90), materials.stone);
  add(W, boxG(WIN_F.x1, DOOR.x0, 0, T, 0, HEAD), materials.stone);
  add(W, boxG(DOOR.x1, L, 0, T, 0, HEAD), materials.stone);
  // Back (north) wall, no openings, level top under the back ring
  add(W, boxG(0, L, D - T, D, 0, RING_B[0]), materials.stone);
  // Side walls n 0.5..4.5, top follows the ring soffit
  const sidePoly = [[T, 0], [D - T, 0], [D - T, ringSoff(D - T)], [T, ringSoff(T)]];
  const winHole = [[WIN_W.n0, 0.90], [WIN_W.n0, 2.30], [WIN_W.n1, 2.30], [WIN_W.n1, 0.90]];
  add(W, prismX(sidePoly, 0, T, [winHole]), materials.stone);        // west, with window
  add(W, prismX(sidePoly, L - T, L), materials.stone);                // east, blind

  // Concrete sills and west window lintel
  const O = groups.openings;
  add(O, boxG(WIN_F.x0 - 0.10, WIN_F.x1 + 0.10, -0.03, T, 0.90, WIN_F.sill), materials.concrete, 1);
  add(O, boxG(-0.03, T, WIN_W.n0 - 0.10, WIN_W.n1 + 0.10, 0.90, WIN_W.sill), materials.concrete, 1);
  add(O, boxG(0.0, T, WIN_W.n0 - 0.15, WIN_W.n1 + 0.15, HEAD, 2.30), materials.concrete, 1);
  // Windows: timber frame + glass, set 0.15 m in from the outside face
  windowFront(O); windowWest(O);
  buildDoor(O);

  // Ring beam 250 x 250, centred in the wall (core) + stone skins either side
  const R = groups.ring, S = groups.skins;
  const c0 = (T - 0.25) / 2, c1 = c0 + 0.25;
  add(R, boxG(0, L, c0, c1, RING_F[0], RING_F[1]), materials.concrete, 1);
  add(R, boxG(0, L, D - c1, D - c0, RING_B[0], RING_B[1]), materials.concrete, 1);
  const sideRing = [[0, ringSoff(0)], [D, ringSoff(D)], [D, ringTop(D)], [0, ringTop(0)]];
  add(R, prismX(sideRing, c0, c1), materials.concrete, 1);
  add(R, prismX(sideRing, L - c1, L - c0), materials.concrete, 1);
  add(S, boxG(0, L, 0, c0, RING_F[0], RING_F[1]), materials.stoneSkin);
  add(S, boxG(0, L, c1, T, RING_F[0], RING_F[1]), materials.stoneSkin);
  add(S, boxG(0, L, D - T, D - c1, RING_B[0], RING_B[1]), materials.stoneSkin);
  add(S, boxG(0, L, D - c0, D, RING_B[0], RING_B[1]), materials.stoneSkin);
  const sideSkin = [[T, ringSoff(T)], [D - T, ringSoff(D - T)], [D - T, ringTop(D - T)], [T, ringTop(T)]];
  for (const [a, b] of [[0, c0], [c1, T], [L - T, L - c1], [L - c0, L]]) add(S, prismX(sideSkin, a, b), materials.stoneSkin);

  // Clay + bottle band between ring top and roof underside
  const C = groups.cob;
  add(C, prismX([[0, RING_F[1]], [T, RING_F[1]], [T, u(T)], [0, u(0)]], 0, L), materials.cob, 1.2);
  add(C, prismX([[D - T, RING_B[1]], [D, RING_B[1]], [D, u(D)], [D - T, u(D - T)]], 0, L), materials.cob, 1.2);
  const sideBand = [[T, ringTop(T)], [D - T, ringTop(D - T)], [D - T, u(D - T)], [T, u(T)]];
  add(C, prismX(sideBand, 0, T), materials.cob, 1.2);
  add(C, prismX(sideBand, L - T, L), materials.cob, 1.2);
  buildBottles(C);

  // Welded steel: 100x100 rail under the roof on 60x60 posts on the ring
  const St = groups.steel;
  const rm = T / 2;
  add(St, boxG(0, L, rm - 0.05, rm + 0.05, u(rm) - 0.10, u(rm)), materials.steel);
  add(St, boxG(0, L, D - rm - 0.05, D - rm + 0.05, u(D - rm) - 0.10, u(D - rm)), materials.steel);
  const railSide = [[0, u(0) - 0.10], [D, u(D) - 0.10], [D, u(D)], [0, u(0)]];
  add(St, prismX(railSide, rm - 0.05, rm + 0.05), materials.steel);
  add(St, prismX(railSide, L - rm - 0.05, L - rm + 0.05), materials.steel);
  const xs = [0.25, 1.33, 2.42, 3.5, 4.58, 5.67, 6.75];
  for (const x of xs) {
    add(St, boxG(x - 0.03, x + 0.03, rm - 0.03, rm + 0.03, RING_F[1], u(rm) - 0.10), materials.steel);
    add(St, boxG(x - 0.03, x + 0.03, D - rm - 0.03, D - rm + 0.03, RING_B[1], u(D - rm) - 0.10), materials.steel);
  }
  for (const n of [1.25, 2.5, 3.75]) for (const x of [rm, L - rm]) {
    add(St, boxG(x - 0.03, x + 0.03, n - 0.03, n + 0.03, ringTop(n), u(n) - 0.10), materials.steel);
  }

  // Glulam middle purlin 160 x 280, E–W at n = 2.5, top under the roof
  add(groups.purlin, boxG(0, L, 2.5 - 0.08, 2.5 + 0.08, u(2.5) - 0.28, u(2.5 - 0.08)), materials.glulam, 1.0);

  // Roof: sandwich panels, main (n 0..5.5, x −0.5..7.5) and veranda (n −2..0)
  buildRoof(groups.roof, 0, D + 0.5);
  buildRoof(groups.verandaRoof, VER.n, 0);
  buildPV(groups.pv);

  buildVeranda(groups.veranda);
  buildSite(groups.site);

  // Colliders (plan AABBs in world x/z)
  const col = (x0, x1, n0, n1) => colliders.push({ x0, x1, z0: -n1, z1: -n0 });
  col(0, DOOR.x0, 0, T); col(DOOR.x1, L, 0, T);
  col(0, L, D - T, D); col(0, T, 0, D); col(L - T, L, 0, D);
  colliders.push({ x0: DOOR.x0, x1: DOOR.x1, z0: -0.2, z1: -0.1, ignore: () => door.open });
  for (const px of VER.posts) col(px - 0.075, px + 0.075, VER.postN - 0.075, VER.postN + 0.075);
}

function windowFront(O) {
  const { x0, x1, sill } = WIN_F, n0 = 0.15, n1 = 0.22, f = 0.06;
  add(O, boxG(x0, x1, n0, n1, sill, sill + f), materials.frame, 1);
  add(O, boxG(x0, x1, n0, n1, HEAD - f, HEAD), materials.frame, 1);
  add(O, boxG(x0, x0 + f, n0, n1, sill, HEAD), materials.frame, 1);
  add(O, boxG(x1 - f, x1, n0, n1, sill, HEAD), materials.frame, 1);
  add(O, boxG((x0 + x1) / 2 - 0.03, (x0 + x1) / 2 + 0.03, n0, n1, sill, HEAD), materials.frame, 1);
  add(O, boxG(x0 + f, x1 - f, 0.18, 0.19, sill + f, HEAD - f), materials.glass, 1, false);
}
function windowWest(O) {
  const { n0, n1, sill } = WIN_W, x0 = 0.15, x1 = 0.22, f = 0.06;
  add(O, boxG(x0, x1, n0, n1, sill, sill + f), materials.frame, 1);
  add(O, boxG(x0, x1, n0, n1, HEAD - f, HEAD), materials.frame, 1);
  add(O, boxG(x0, x1, n0, n0 + f, sill, HEAD), materials.frame, 1);
  add(O, boxG(x0, x1, n1 - f, n1, sill, HEAD), materials.frame, 1);
  add(O, boxG(x0, x1, (n0 + n1) / 2 - 0.03, (n0 + n1) / 2 + 0.03, sill, HEAD), materials.frame, 1);
  add(O, boxG(0.18, 0.19, n0 + f, n1 - f, sill + f, HEAD - f), materials.glass, 1, false);
}
function buildDoor(O) {
  const pivot = new THREE.Group();
  pivot.position.copy(P(DOOR.x1, 0, 0.15));          // hinge on the east jamb, opens inward
  const w = DOOR.x1 - DOOR.x0 - 0.01;
  const g = new THREE.BoxGeometry(w, HEAD - 0.01, 0.05);
  g.translate(-w / 2, (HEAD - 0.01) / 2, -0.025);
  worldUV(g, 1);
  const leaf = new THREE.Mesh(g, materials.door);
  leaf.castShadow = leaf.receiveShadow = true;
  pivot.add(leaf);
  for (let i = 1; i <= 4; i++) {                       // plank lines
    const pg = new THREE.BoxGeometry(0.008, HEAD - 0.05, 0.056);
    pg.translate(-w * i / 5, HEAD / 2, -0.025);
    pivot.add(new THREE.Mesh(pg, materials.frame));
  }
  const hg = new THREE.BoxGeometry(0.03, 0.12, 0.07);
  hg.translate(-w + 0.08, 1.05, -0.025);
  pivot.add(new THREE.Mesh(hg, materials.steel));
  O.add(pivot);
  door = { pivot, leaf, open: true, angle: -Math.PI / 2 * 0.92, target: -Math.PI / 2 * 0.92 };
  pivot.rotation.y = door.angle;
}

function buildBottles(group) {
  const colors = [0x2f8a52, 0x1f6b3e, 0xb0681c, 0x8a4a12, 0x2a62b8, 0x9fd0c4, 0x4aa36a];
  const items = [];
  const step = 0.17;
  // front & back: bottle axis along n
  for (const [n0, bot, topFn] of [[0, RING_F[1], () => u(0)], [D - T, RING_B[1], () => u(D - T)]]) {
    for (let row = 0; row < 2; row++) {
      const h = bot + 0.09 + row * 0.12;
      for (let x = 0.12 + (row ? step / 2 : 0); x < L - 0.08; x += step) items.push({ x, h, n: n0 + T / 2, axis: 'n' });
    }
  }
  // sides: axis along x
  for (const xc of [T / 2, L - T / 2]) {
    for (let row = 0; row < 2; row++) {
      for (let n = T + 0.1 + (row ? step / 2 : 0); n < D - T - 0.05; n += step) {
        items.push({ x: xc, h: ringTop(n) + 0.09 + row * 0.12, n, axis: 'x' });
      }
    }
  }
  const geo = new THREE.CylinderGeometry(0.036, 0.036, T + 0.012, 10);
  const mesh = new THREE.InstancedMesh(geo, materials.bottle, items.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  const ax = new THREE.Vector3(0, 0, 1), axX = new THREE.Vector3(1, 0, 0);
  const col = new THREE.Color();
  items.forEach((it, i) => {
    q.setFromAxisAngle(it.axis === 'n' ? axX : ax, Math.PI / 2);
    m.compose(P(it.x, it.h, it.n), q, new THREE.Vector3(1, 1, 1));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, col.setHex(colors[Math.floor(rnd() * colors.length)]));
  });
  mesh.castShadow = false; mesh.receiveShadow = false;
  group.add(mesh);
  groups.bottleMesh = mesh;
}

function buildRoof(group, n0, n1) {
  const x0 = -0.5, x1 = L + 0.5;
  const tv = ROOF_T / Math.cos(Math.atan(SLOPE));
  add(group, prismX([[n0, u(n0)], [n1, u(n1)], [n1, u(n1) + tv], [n0, u(n0) + tv]], x0, x1), materials.roofTop, 0.5);
  // white liner, 3 mm under, so the inside reads as panel liner
  add(group, prismX([[n0, u(n0) - 0.004], [n1, u(n1) - 0.004], [n1, u(n1) - 0.001], [n0, u(n0) - 0.001]], x0, x1), materials.liner, 1, false);
  // trapezoid ribs running down the slope every 0.333 m
  for (let x = x0 + 0.17; x < x1; x += 0.333) {
    add(group, prismX([[n0, u(n0) + tv], [n1, u(n1) + tv], [n1, u(n1) + tv + 0.035], [n0, u(n0) + tv + 0.035]], x - 0.02, x + 0.02), materials.roofTop, 0.5, false);
  }
}
function buildPV(group) {
  const a = Math.atan(SLOPE), cols = 6, rows = 3, pw = 1.134, pl = 1.722, gap = 0.02;
  const lift = ROOF_T / Math.cos(a) + 0.09;
  const x0 = L / 2 - (cols * pw + (cols - 1) * gap) / 2;
  const nStart = 0.35;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const sMid = (r + 0.5) * (pl + gap);
      const nMid = nStart + sMid * Math.cos(a);
      const g = new THREE.BoxGeometry(pw, 0.035, pl);
      const panel = new THREE.Mesh(g, [materials.pvFrame, materials.pvFrame, materials.pv, materials.pvFrame, materials.pvFrame, materials.pvFrame]);
      panel.position.copy(P(x0 + c * (pw + gap) + pw / 2, u(nMid) + lift, nMid));
      panel.rotation.x = a;   // rises towards the north (−z)
      panel.castShadow = true; panel.receiveShadow = true;
      group.add(panel);
    }
  }
}
function buildVeranda(group) {
  const { beamN0, beamN1, postN, posts, brace } = VER;
  add(group, boxG(-0.5, L + 0.5, beamN0, beamN1, HEAD, HEAD + 0.20), materials.glulam, 1);
  add(group, prismX([[beamN0, HEAD + 0.20], [beamN1, HEAD + 0.20], [beamN1, u(beamN1)], [beamN0, u(beamN0)]], -0.5, L + 0.5), materials.timber, 1);
  for (const px of posts) {
    add(group, boxG(px - 0.075, px + 0.075, postN - 0.075, postN + 0.075, 0, HEAD), materials.timber, 1);
    for (const d of [-1, 1]) {
      const f = px + d * 0.075;
      const poly = [[f, HEAD - brace], [f, HEAD - brace + 0.12], [f + d * (brace - 0.12), HEAD], [f + d * brace, HEAD]];
      if (d < 0) poly.reverse();
      add(group, prismN(poly, postN - 0.05, postN + 0.05), materials.timber, 1);
    }
  }
}
function buildSite(group) {
  const g = new THREE.CircleGeometry(60, 64);
  g.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(g, materials.ground);
  ground.receiveShadow = true;
  group.add(ground);
  add(group, boxG(T, L - T, T, D - T, 0, 0.015), materials.floor, 1.2);
  // a few Monsanto granite boulders, well clear of the house
  for (const [x, n, r] of [[-6.5, 6.5, 1.6], [12.5, 3.5, 2.2], [11, 9.5, 1.3], [-8, -4, 1.1], [3, 12, 2.6]]) {
    const bg = new THREE.IcosahedronGeometry(r, 3);
    const p = bg.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i) / r, vy = p.getY(i) / r, vz = p.getZ(i) / r;
      const k = 0.88 + 0.12 * Math.sin(vx * 5.1 + x) * Math.cos(vz * 4.3 + n) + 0.06 * Math.sin(vy * 7.7);
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.7, p.getZ(i) * k);
    }
    bg.computeVertexNormals();
    const b = new THREE.Mesh(bg, materials.granite);
    b.position.copy(P(x, r * 0.35, n));
    b.castShadow = b.receiveShadow = true;
    group.add(b);
  }
}

/* ---------- height labels ---------- */
const LABELS = [
  { t: 'Door 0.90 × 2.10', p: [3.95, 1.2, -0.05] },
  { t: 'Window 1.50 × 1.00, head 2.10', p: [2.25, 1.6, -0.05] },
  { t: 'West window 1.50 × 1.00', p: [-0.05, 1.6, 2.5] },
  { t: 'Ring 2.10–2.35 (front)', p: [6.9, 2.22, -0.02] },
  { t: 'Ring top ~3.23 (back)', p: [7.02, 3.1, 4.9] },
  { t: 'Roof underside 2.75', p: [7.02, 2.75, 0.0] },
  { t: 'Roof underside 3.63', p: [7.02, 3.63, 5.0] },
  { t: 'Bottles in clay, 0.40', p: [7.02, ringTop(2.5) + 0.2, 2.5] },
  { t: 'Veranda edge 2.40', p: [7.5, 2.40, -2.0] },
  { t: '2.10 clear', p: [5.2, 1.4, -1.925] },
  { t: 'Glulam purlin 160 × 280', p: [3.5, u(2.5) - 0.3, 2.5] },
];
function buildHud() {
  const root = document.getElementById('hudLabels');
  hud = LABELS.map((l) => {
    const el = document.createElement('div');
    el.className = 'lab';
    el.textContent = l.t;
    el.style.visibility = 'hidden';
    root.appendChild(el);
    return { el, v: new THREE.Vector3(l.p[0], l.p[1], -l.p[2]) };
  });
}
const _v = new THREE.Vector3();
function projectHud() {
  const w = window.innerWidth, h = window.innerHeight;
  hud.forEach(({ el, v }) => {
    if (!heightsOn) { el.style.visibility = 'hidden'; return; }
    _v.copy(v).project(camera);
    if (_v.z > 1 || _v.z < -1 || Math.abs(_v.x) > 1.05 || Math.abs(_v.y) > 1.05) { el.style.visibility = 'hidden'; return; }
    el.style.visibility = 'visible';
    el.style.transform = `translate(${(_v.x * 0.5 + 0.5) * w}px, ${(-_v.y * 0.5 + 0.5) * h}px) translate(-50%, -100%)`;
  });
}

/* ---------- sun (NOAA approximation, Europe/Lisbon clock) ---------- */
function lisbonOffsetHours(date) {
  const y = date.getUTCFullYear();
  const lastSunday = (m) => { const d = new Date(Date.UTC(y, m + 1, 0)); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); d.setUTCHours(1, 0, 0, 0); return d; };
  return (date >= lastSunday(2) && date < lastSunday(9)) ? 1 : 0;
}
function solarPosition(yy, mo, dd, hh, mi) {
  const tmp = new Date(Date.UTC(yy, mo - 1, dd, hh, mi));
  const off = lisbonOffsetHours(tmp);
  const utcMs = tmp.getTime() - off * 3600e3;
  const utc = new Date(utcMs);
  const d = utcMs / 86400000 - 0.5 + 2440588 - 2451545.0;
  const jc = d / 36525;
  const L0 = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360;
  const M = 357.52911 + jc * (35999.05029 - 0.0001537 * jc), Mr = M * DEG;
  const e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);
  const C = Math.sin(Mr) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) + Math.sin(2 * Mr) * (0.019993 - 0.000101 * jc) + Math.sin(3 * Mr) * 0.000289;
  const omega = 125.04 - 1934.136 * jc;
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(omega * DEG);
  const obl = 23.439291 - jc * 0.0130042 + 0.00256 * Math.cos(omega * DEG);
  const delta = Math.asin(Math.sin(obl * DEG) * Math.sin(lambda * DEG));
  const yv = Math.tan(obl * DEG / 2) ** 2;
  const eqTime = 4 * (yv * Math.sin(2 * L0 * DEG) - 2 * e * Math.sin(Mr) + 4 * e * yv * Math.sin(Mr) * Math.cos(2 * L0 * DEG)
    - 0.5 * yv * yv * Math.sin(4 * L0 * DEG) - 1.25 * e * e * Math.sin(2 * Mr)) / DEG;
  const minutes = utc.getUTCHours() * 60 + utc.getUTCMinutes();
  const ha = (minutes + eqTime + 4 * LON) / 4 - 180;
  const lat = LAT * DEG;
  const alt = Math.asin(Math.sin(lat) * Math.sin(delta) + Math.cos(lat) * Math.cos(delta) * Math.cos(ha * DEG));
  const az = Math.atan2(Math.sin(ha * DEG), Math.cos(ha * DEG) * Math.sin(lat) - Math.tan(delta) * Math.cos(lat)) + Math.PI;
  return { alt, az, altDeg: alt / DEG, azDeg: ((az / DEG) % 360 + 360) % 360, off };
}
function applySun() {
  const [yy, mo, dd] = document.getElementById('sunDate').value.split('-').map(Number);
  const tv = document.getElementById('sunTime').value;
  const [hh, mi] = tv.split(':').map(Number);
  const s = solarPosition(yy, mo, dd, hh, mi || 0);
  const dist = 30;
  sunLight.position.set(3.5 + Math.sin(s.az) * Math.cos(s.alt) * dist, Math.max(Math.sin(s.alt) * dist, -4), -2.5 - Math.cos(s.az) * Math.cos(s.alt) * dist);
  const dusk = Math.max(0, Math.min(1, (s.altDeg + 6) / 12));
  sunLight.intensity = s.alt > 0 ? 1.6 * Math.sin(s.alt) + 0.6 : 0.05;
  sunLight.color.setRGB(1, 0.95 - 0.2 * (1 - dusk), 0.86 - 0.35 * (1 - dusk));
  hemi.intensity = 0.7 + 0.45 * dusk;
  fill.intensity = 0.25 + 0.2 * dusk;
  const sky = new THREE.Color().setHSL(0.58, 0.45, 0.05 + 0.6 * dusk);
  scene.background = sky; scene.fog.color.copy(sky);
  const tz = s.off ? 'WEST (UTC+1)' : 'WET (UTC+0)';
  document.getElementById('sunReadout').textContent =
    `${tv} Europe/Lisbon ${tz} · sun ${s.altDeg.toFixed(1)}° high · ${s.azDeg.toFixed(0)}° from north`;
}

/* ---------- toggles ---------- */
const CUT_PLAN = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1.5);    // keeps h < 1.5
const CUT_SECTION = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 3.2); // keeps x < 3.2 (west half)
function setCut(m) {
  cutMode = m;
  const planes = m === 'plan' ? [CUT_PLAN] : m === 'section' ? [CUT_SECTION] : [];
  clipMats.forEach((mat) => { mat.clippingPlanes = planes; mat.needsUpdate = true; });
  const btn = document.getElementById('btnCut');
  btn.textContent = m === 'plan' ? 'Cut: plan' : m === 'section' ? 'Cut: section' : 'Cut: off';
  btn.setAttribute('aria-pressed', String(m !== 'off'));
}
function setRoof(v) {
  groups.roof.visible = groups.pv.visible = v;
  groups.verandaRoof.visible = v && groups.veranda.visible;
  document.getElementById('btnRoof').setAttribute('aria-pressed', String(v));
}
function setVeranda(v) {
  groups.veranda.visible = v;
  groups.verandaRoof.visible = v && groups.roof.visible;
  document.getElementById('btnVeranda').setAttribute('aria-pressed', String(v));
}
function setStructure(v) {
  structureOn = v;
  groups.skins.visible = !v;
  groups.cob.visible = !v;
  document.getElementById('btnStructure').setAttribute('aria-pressed', String(v));
}
function setHeights(v) {
  heightsOn = v;
  document.getElementById('btnHeights').setAttribute('aria-pressed', String(v));
}

/* ---------- views ---------- */
const VIEWS = [
  { name: 'From the south-west', sub: 'Front and west window', cam: [-7.5, 5.2, 9.5], t: [3.5, 1.5, -2.0] },
  { name: 'Front (south)', sub: 'Door and window under the veranda', cam: [3.5, 2.0, 11.5], t: [3.5, 1.7, 0] },
  { name: 'West side', sub: 'Window and the sloped ring', cam: [-10.5, 2.4, -1.5], t: [3.5, 1.9, -1.5] },
  { name: 'From the north-east', sub: 'Blind back and east walls', cam: [13.5, 6.5, -12], t: [3.5, 1.6, -2.5] },
  { name: 'Roof and PV from above', sub: '', cam: [3.5, 14, 5], t: [3.5, 2.5, -2.0] },
  { name: 'Inside: look at the purlin and bottles', walk: [5.6, 4.0, -2.35, 0.32] },
  { name: 'Inside: west window', walk: [5.4, 2.5, -1.57, 0.05] },
  { name: 'Veranda: walk to the door', walk: [3.95, -4.0, 0, 0.02] },
];
function flyTo(cam, t, dur = 0.8) {
  fly = { fp: camera.position.clone(), tp: new THREE.Vector3(...cam), ft: orbit.target.clone(), tt: new THREE.Vector3(...t), k: 0, dur };
}
function tickFly(dt) {
  if (!fly) return;
  fly.k = Math.min(1, fly.k + dt / fly.dur);
  const e = fly.k < 0.5 ? 2 * fly.k * fly.k : 1 - (-2 * fly.k + 2) ** 2 / 2;
  camera.position.lerpVectors(fly.fp, fly.tp, e);
  orbit.target.lerpVectors(fly.ft, fly.tt, e);
  orbit.update();
  if (fly.k >= 1) fly = null;
}
function goView(v) {
  if (v.walk) {
    setMode('walk');
    const [x, n, yw, pt] = v.walk;
    player.set(x, EYE, -n); yaw = yw; pitch = pt;
  } else {
    if (mode !== 'orbit') setMode('orbit', { keep: true });
    flyTo(v.cam, v.t);
  }
}

/* ---------- walk ---------- */
function collide(p) {
  for (const c of colliders) {
    if (c.ignore && c.ignore()) continue;
    const cx = Math.max(c.x0, Math.min(p.x, c.x1)), cz = Math.max(c.z0, Math.min(p.z, c.z1));
    const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
    if (d < RADIUS) {
      if (d > 1e-6) { p.x = cx + dx / d * RADIUS; p.z = cz + dz / d * RADIUS; }
      else {
        const opts = [[c.x0 - RADIUS - p.x, 0], [c.x1 + RADIUS - p.x, 0], [0, c.z0 - RADIUS - p.z], [0, c.z1 + RADIUS - p.z]];
        opts.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
        p.x += opts[0][0]; p.z += opts[0][1];
      }
    }
  }
}
function isTouch() { return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window; }
function setMode(next, opts = {}) {
  mode = next;
  document.getElementById('btnOrbit').setAttribute('aria-pressed', String(mode === 'orbit'));
  document.getElementById('btnWalk').setAttribute('aria-pressed', String(mode === 'walk'));
  document.body.classList.toggle('walk', mode === 'walk');
  orbit.enabled = mode === 'orbit';
  if (mode === 'walk') {
    fly = null;
    player.set(WALK_START.x, EYE, -WALK_START.n); yaw = WALK_START.yaw; pitch = WALK_START.pitch;
  } else if (!opts.keep) {
    camera.position.set(START_CAM.x, START_CAM.y, START_CAM.z);
    orbit.target.set(START_CAM.tx, START_CAM.ty, START_CAM.tz);
    orbit.update();
  }
  document.getElementById('hint').textContent = mode === 'orbit'
    ? 'Orbit: drag to turn, scroll or pinch to zoom, right-drag or two fingers to move. Tap the door to open it.'
    : (isTouch() ? 'Walk: joystick to move, drag to look. Tap the door to open it.'
                 : 'Walk: W A S D or arrows to move, drag the mouse to look. Tap the door to open it.');
}
function updateWalk(dt) {
  let mx = 0, mz = 0;
  if (keys.KeyW || keys.ArrowUp) mz += 1;
  if (keys.KeyS || keys.ArrowDown) mz -= 1;
  if (keys.KeyA || keys.ArrowLeft) mx -= 1;
  if (keys.KeyD || keys.ArrowRight) mx += 1;
  if (joy.active) { mx += joy.x; mz -= joy.y; }
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  if (len > 0.05) {
    const sp = WALK_SPEED * (keys.ShiftLeft ? 1.7 : 1) * dt;
    const fx = Math.sin(yaw), fz = -Math.cos(yaw);
    player.x += (fx * mz + Math.cos(yaw) * mx) * sp;
    player.z += (fz * mz + Math.sin(yaw) * mx) * sp;
    collide(player);
  }
  player.y = EYE;
  camera.position.copy(player);
  camera.lookAt(player.x + Math.sin(yaw) * Math.cos(pitch), player.y + Math.sin(pitch), player.z - Math.cos(yaw) * Math.cos(pitch));
}
function tickDoor(dt) {
  if (!door) return;
  const d = door.target - door.angle;
  door.angle += Math.sign(d) * Math.min(Math.abs(d), 2.4 * dt);
  door.pivot.rotation.y = door.angle;
}
function toggleDoor() { door.open = !door.open; door.target = door.open ? -Math.PI / 2 * 0.92 : 0; }
function pickDoor(e) {
  const r = canvas.getBoundingClientRect();
  pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  if (raycaster.intersectObject(door.pivot, true).length) { toggleDoor(); return true; }
  return false;
}
const _dir = new THREE.Vector3();
function updateCompass() {
  camera.getWorldDirection(_dir);
  const heading = Math.atan2(_dir.x, -_dir.z) / DEG;
  document.getElementById('compassRose').style.transform = `rotate(${-heading}deg)`;
}

/* ---------- init ---------- */
function init() {
  document.body.classList.toggle('touch', isTouch());
  if (window.innerWidth < 700) document.getElementById('panel').classList.add('hidden');
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9cb6cc);
  scene.fog = new THREE.Fog(0x9cb6cc, 45, 110);
  camera = new THREE.PerspectiveCamera(60, 2, 0.05, 200);
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.localClippingEnabled = true;

  hemi = new THREE.HemisphereLight(0xdfeaff, 0x8a7656, 0.9); scene.add(hemi);
  fill = new THREE.DirectionalLight(0xffffff, 0.35); fill.position.set(-10, 8, 12); scene.add(fill);
  sunLight = new THREE.DirectionalLight(0xffffff, 1.4);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  Object.assign(sunLight.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 80 });
  sunLight.shadow.bias = -0.0004; sunLight.shadow.normalBias = 0.02;
  sunLight.target.position.set(3.5, 1, -2.5);
  scene.add(sunLight, sunLight.target);
  // soft interior fill so the inside is readable
  const inner = new THREE.PointLight(0xfff1dc, 3.0, 9, 1.6); inner.position.set(3.5, 2.4, -2.5); scene.add(inner);

  makeMaterials();
  buildModel();
  buildHud();

  orbit = new OrbitControls(camera, canvas);
  orbit.enableDamping = true; orbit.dampingFactor = 0.08;
  orbit.maxPolarAngle = 88 * DEG; orbit.minDistance = 0.6; orbit.maxDistance = 45;
  camera.position.set(START_CAM.x, START_CAM.y, START_CAM.z);
  orbit.target.set(START_CAM.tx, START_CAM.ty, START_CAM.tz);
  orbit.update();

  bindUI();
  setMode('orbit');
  applySun();
  onResize();
  window.addEventListener('resize', onResize);
  renderer.setAnimationLoop(frame);
  loading.classList.add('done');
}

function bindUI() {
  document.getElementById('btnOrbit').onclick = () => setMode('orbit', { keep: true });
  document.getElementById('btnWalk').onclick = () => setMode('walk');
  document.getElementById('btnRoof').onclick = () => setRoof(!groups.roof.visible);
  document.getElementById('btnVeranda').onclick = () => setVeranda(!groups.veranda.visible);
  document.getElementById('btnStructure').onclick = () => setStructure(!structureOn);
  document.getElementById('btnHeights').onclick = () => setHeights(!heightsOn);
  document.getElementById('btnCut').onclick = () => setCut(cutMode === 'off' ? 'plan' : cutMode === 'plan' ? 'section' : 'off');
  document.getElementById('togglePanel').onclick = () => document.getElementById('panel').classList.toggle('hidden');
  const pres = document.getElementById('presets');
  VIEWS.forEach((v) => {
    const b = document.createElement('button');
    b.innerHTML = v.name + (v.sub ? `<small>${v.sub}</small>` : '');
    b.onclick = () => goView(v);
    pres.appendChild(b);
  });
  const sd = document.getElementById('sunDate'), st = document.getElementById('sunTime'), ss = document.getElementById('sunSlider');
  sd.oninput = applySun;
  st.oninput = () => { const [h, m] = st.value.split(':').map(Number); ss.value = String(h * 60 + (m || 0)); applySun(); };
  ss.oninput = () => { const v = +ss.value; st.value = `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`; applySun(); };

  window.addEventListener('keydown', (e) => { keys[e.code] = true; });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });

  // drag to look in walk mode; a short tap opens the door
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId }; });
  canvas.addEventListener('pointermove', (e) => {
    if (!down || down.id !== e.pointerId) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) down.moved = true;
    if (mode === 'walk' && down.moved) {
      yaw += dx * 0.0042; pitch = Math.max(-1.3, Math.min(1.3, pitch - dy * 0.0042));
      down.x = e.clientX; down.y = e.clientY;
    }
  });
  canvas.addEventListener('pointerup', (e) => { if (down && !down.moved) pickDoor(e); down = null; });
  canvas.addEventListener('pointercancel', () => { down = null; });
  orbit.addEventListener('start', () => { fly = null; });

  const joyEl = document.getElementById('joy'), knob = joyEl.querySelector('.knob');
  const setKnob = (x, y) => {
    const r = joyEl.getBoundingClientRect();
    let dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height / 2);
    const max = r.width / 2 - 28, d = Math.hypot(dx, dy) || 1;
    if (d > max) { dx *= max / d; dy *= max / d; }
    knob.style.left = (r.width / 2 - 28 + dx) + 'px'; knob.style.top = (r.height / 2 - 28 + dy) + 'px';
    joy.x = dx / max; joy.y = dy / max; joy.active = true;
  };
  const reset = () => { knob.style.left = '36px'; knob.style.top = '36px'; joy.x = joy.y = 0; joy.active = false; };
  joyEl.addEventListener('pointerdown', (e) => { e.stopPropagation(); joyEl.setPointerCapture(e.pointerId); setKnob(e.clientX, e.clientY); });
  joyEl.addEventListener('pointermove', (e) => { if (joy.active) setKnob(e.clientX, e.clientY); });
  joyEl.addEventListener('pointerup', reset);
  joyEl.addEventListener('pointercancel', reset);
}
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  tickDoor(dt);
  tickFly(dt);
  if (mode === 'orbit') { if (!fly) orbit.update(); } else updateWalk(dt);
  updateCompass();
  projectHud();
  renderer.render(scene, camera);
}

try { init(); } catch (err) { console.error(err); loading.textContent = 'Could not load the model: ' + err.message; }

window.__ruin = {
  ready: () => !!renderer,
  setMode, setCut, setRoof, setVeranda, setStructure, setHeights, goView: (i) => goView(VIEWS[i]),
  setOrbit(x, y, z, tx, ty, tz) { if (mode !== 'orbit') setMode('orbit', { keep: true }); fly = null; camera.position.set(x, y, z); orbit.target.set(tx, ty, tz); orbit.update(); },
  setPlayer(x, n, yw, pt) { player.set(x, EYE, -n); yaw = yw; pitch = pt; },
  getPlayer: () => ({ x: player.x, n: -player.z }),
  press(code, v = true) { keys[code] = v; },
  setSun(date, time) { document.getElementById('sunDate').value = date; document.getElementById('sunTime').value = time; applySun(); },
  hidePanel(v = true) { document.getElementById('panel').classList.toggle('hidden', v); },
  toggleDoor: () => toggleDoor(),
};

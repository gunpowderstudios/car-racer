// Visible crash damage: dents pushed into a car's scanned body by the vertex shader.
//
// The cars are single 200k-400k vertex meshes, so nothing here edits the mesh. Each dent is just a few numbers
// (a centre, a push direction, a radius and a depth) handed to the shader, which presses the body in around that
// point, tilts the lighting to match and scuffs the paint. A pristine car pays almost nothing; a battered one
// pays a few shader instructions per vertex. Pure arithmetic lives in dentMath.js (tested in Node).
import * as THREE from 'three';
import { DENT, DentStore, dentSize, faceOf } from './dentMath.js';

// Holy Moley (real damage): a deep enough dent tears a hole through the body and the pieces fly off. One switch for every car.
const HOLES = { value: 0 };
const HOLE_DEPTH = 0.26, HOLE_RANGE = 0.13;                 // metres: a dent this deep starts to tear; this much deeper it is a full hole
const holey = new Set();
/** Turn holes in damaged cars on or off. */
export function setHoles(on) {
  HOLES.value = on ? 1 : 0;
  for (const h of holey) h.mat.side = on ? THREE.DoubleSide : h.side;          // (double sided only while it is on: through a hole you see the inside of the far panel)
}
export const holesOn = () => HOLES.value > 0;

const GLSL_COMMON = (n) => `
uniform vec4 uDent[${n}]; uniform vec4 uDentDir[${n}]; uniform int uDentN; uniform vec2 uHoleDepth; varying float vDentW; varying float vHole; varying vec3 vDentObj;
float dh3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float dnoise(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dh3(i), dh3(i + vec3(1,0,0)), f.x), mix(dh3(i + vec3(0,1,0)), dh3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(dh3(i + vec3(0,0,1)), dh3(i + vec3(1,0,1)), f.x), mix(dh3(i + vec3(0,1,1)), dh3(i + vec3(1,1,1)), f.x), f.y), f.z); }
// total push at p, the slope it gives the surface, and how scuffed the paint is there
void dentField(vec3 p, out vec3 push, out vec3 tilt, out float scuff, out float hole) {
  push = vec3(0.0); tilt = vec3(0.0); scuff = 0.0; hole = -10.0;
  for (int i = 0; i < ${n}; i++) {
    if (i >= uDentN) break;
    float r = uDent[i].w; vec3 dir = uDentDir[i].xyz; float depth = uDentDir[i].w;
    vec3 rel = p - uDent[i].xyz; float d = length(rel);
    float hh = clamp((depth - uHoleDepth.x) / uHoleDepth.y, 0.0, 1.0);          // a crumple deep enough to tear right through (Holy Moley)
    scuff = max(scuff, (1.0 - smoothstep(0.0, r * 1.3, d)) * clamp(depth / r * 3.5, 0.3, 1.0) * (1.0 - 0.75 * hh));      // (a torn panel is burnt only at the tear, not smudged all round)
    if (hh > 0.0) {                                                            // Holy Moley: not one big hole but two or three small ones, scattered over the crumple
      float sd = dh3(uDent[i].xyz * 31.7), a0 = sd * 6.2832;
      vec3 t1 = normalize(cross(dir, abs(dir.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))), t2 = cross(dir, t1);
      for (int k = 0; k < 3; k++) {
        if (k == 2 && sd < 0.4) break;                                         // (some get only two)
        float a = a0 + float(k) * 2.2 + dh3(vec3(sd, float(k), 3.0)) * 0.9, off = r * (0.3 + 0.12 * dh3(vec3(float(k), sd, 7.0)));
        vec3 c = uDent[i].xyz + (t1 * cos(a) + t2 * sin(a)) * off;
        float hr = r * (0.065 + 0.065 * hh) * (0.8 + 0.5 * dh3(vec3(sd, 5.0, float(k))));
        hole = max(hole, (1.0 - length(p - c) * (0.8 + 0.4 * dnoise(p / (r * 0.16))) / hr) * 6.0);      // steep: a crisp edge, not a fade
      }
    }
    if (d >= r) continue;
    float t = 1.0 - d / r, w = t * t * (3.0 - 2.0 * t), dw = 6.0 * t * (1.0 - t);          // smooth bowl, deepest in the middle
    if (hh > 0.0) {                                                           // a torn panel: steep walls and a flat floor, like folded sheet metal
      float u = clamp(t / 0.3, 0.0, 1.0);
      w = mix(w, u * u * (3.0 - 2.0 * u), hh); dw = mix(dw, t < 0.3 ? 6.0 * u * (1.0 - u) / 0.3 : 0.0, hh);
    }
    float crinkle = 0.55 + 0.9 * dnoise(p / (r * 0.28));                      // uneven crumple, not a perfect dish
    push += dir * depth * w * crinkle;
    vec3 radial = rel / max(d, 1e-5); radial -= dir * dot(radial, dir);
    tilt += radial * depth * (dw / r) * crinkle;
  }
}`;

function patchMaterial(mat, n, dents, dirs, count, holeDepth) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uDent = { value: dents }; sh.uniforms.uDentDir = { value: dirs }; sh.uniforms.uDentN = count; sh.uniforms.uHoleDepth = holeDepth; sh.uniforms.uHoles = HOLES;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${GLSL_COMMON(n)}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        vec3 dPush, dTilt; float dScuff, dHole; dentField(position, dPush, dTilt, dScuff, dHole);
        objectNormal = normalize(objectNormal - dTilt);`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed += dPush; vDentW = dScuff; vHole = dHole; vDentObj = position;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vDentW; varying float vHole; varying vec3 vDentObj; uniform float uHoles;\nfloat hn3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float holeV = vHole + (hn3(floor(vDentObj * 70.0)) - 0.5) * 0.9;        // a jagged, torn edge
        if (uHoles > 0.5 && holeV > 0.0) discard;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (uHoles > 0.5) {
          if (!gl_FrontFacing) diffuseColor.rgb = vec3(0.02);                       // the dark inside of the car, seen through a hole
          else if (holeV > -0.5) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07, 0.05, 0.04), 0.9);   // a thin band of scorched, torn metal right at the edge
        }
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.34, 0.30, 0.28), clamp(vDentW * 1.2, 0.0, 0.8));`)
      .replace('#include <opaque_fragment>', `if (uHoles > 0.5 && !gl_FrontFacing) outgoingLight = vec3(0.0);       // the inside seen through a hole is plain black: no lighting, no reflections
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'dent' + n;
  mat.needsUpdate = true;
}

/** How to read raw numbers out of a vertex position attribute (quantised models store them as normalised ints). */
function positionReader(attr) {
  const inter = !!attr.isInterleavedBufferAttribute;
  const arr = inter ? attr.data.array : attr.array;
  const stride = inter ? attr.data.stride : attr.itemSize, off = inter ? attr.offset : 0;
  let k = 1;
  if (attr.normalized) k = arr instanceof Int16Array ? 1 / 32767 : arr instanceof Uint16Array ? 1 / 65535 : arr instanceof Int8Array ? 1 / 127 : arr instanceof Uint8Array ? 1 / 255 : 1;
  return { arr, stride, off, k, count: attr.count };
}

/**
 * Make the body mesh inside `model` dentable and return a controller, or null if there is no body to dent.
 * `root` is the node whose space is the car's own space (x right, y up, z forward, metres), so a crash
 * point from the physics can be handed over as it is. `avoid` is a material that must stay as it is (the plain
 * stand-in boxes share one).
 */
export function makeDentable(root, model, max, avoid = null) {
  let mesh = null, most = 0;
  model.traverse((o) => {
    const p = o.isMesh && o.geometry && o.geometry.attributes && o.geometry.attributes.position;
    if (p && p.count > most && o.material && o.material !== avoid && !(typeof avoid === 'function' && avoid(o)) && !Array.isArray(o.material)) { mesh = o; most = p.count; }
  });
  if (!mesh) return null;
  const mat = mesh.material;
  const dents = Array.from({ length: max }, () => new THREE.Vector4());
  const dirs = Array.from({ length: max }, () => new THREE.Vector4());
  const count = { value: 0 };
  const store = new DentStore(max);
  const holeDepth = { value: new THREE.Vector2(HOLE_DEPTH, HOLE_RANGE) };
  patchMaterial(mat, max, dents, dirs, count, holeDepth);
  const hEntry = { mat, side: mat.side }; holey.add(hEntry); if (HOLES.value) mat.side = THREE.DoubleSide;

  let rel = null, relInv = null, mpu = 1, box = null;       // root <- mesh transform, worked out on first use (the car is fitted after loading)
  const prep = () => {
    rel = new THREE.Matrix4();
    for (let o = mesh; o && o !== root; o = o.parent) { o.updateMatrix(); rel.premultiply(o.matrix); }
    relInv = rel.clone().invert();
    mpu = new THREE.Vector3().setFromMatrixScale(rel).x; holeDepth.value.set(HOLE_DEPTH / mpu, HOLE_RANGE / mpu);
    mesh.geometry.computeBoundingBox();
    box = mesh.geometry.boundingBox.clone().applyMatrix4(rel);
  };

  let last = null;                                           // the spot searched for most recently
  const upload = () => {                                     // hand the whole list to the shader
    for (let i = 0; i < max; i++) {
      const s = store.list[i];
      if (s) { dents[i].set(s.x, s.y, s.z, s.radius / mpu); dirs[i].set(s.dx, s.dy, s.dz, s.depth / mpu); }
      else { dents[i].set(0, 0, 0, 0); dirs[i].set(0, 0, 0, 0); }
    }
    count.value = store.length;
  };

  const tore = (e, x, y, z) => {                              // a dent has just torn through: tell the car so pieces can fly off (once per hole)
    if (e && e.depth >= HOLE_DEPTH && !e.holed) { e.holed = true; if (HOLES.value) ctl.burst = { x, y, z, size: e.radius }; }
  };
  const ctl = {
    mesh, material: mat, store, burst: null,
    get count() { return store.length; },
    clear() { last = null; ctl.burst = null; store.clear(); for (const v of dents) v.set(0, 0, 0, 0); for (const v of dirs) v.set(0, 0, 0, 0); count.value = 0; },
    /** Dent the car where a crash of `hp` hit points happened at (x, y, z), in the car's own space. Returns true if it left a mark. */
    add(x, y, z, hp, now = performance.now() / 1000) {
      const size = dentSize(hp); if (!size) return false;
      if (!rel) prep();
      const c = box.getCenter(new THREE.Vector3()), h = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
      const face = faceOf(x - c.x, y - c.y, z - c.z, h.x || 1, h.y || 1, h.z || 1);
      if (!face) return false;
      const k = face.axis, t1 = (k + 1) % 3, t2 = (k + 2) % 3, sg = face.sign;
      const P = [x, y, z], LAT = 0.4;
      // A crash is felt on many physics steps in a row: don't search the mesh again for the same spot.
      const lc = last;
      if (lc && lc.k === k && lc.sg === sg && now - lc.t < DENT.burstSeconds && Math.hypot(x - lc.x, y - lc.y, z - lc.z) < 0.3) {
        lc.t = now;
        tore(store.add({ x: lc.cx, y: lc.cy, z: lc.cz, dx: lc.ox, dy: lc.oy, dz: lc.oz, radius: size.radius, depth: size.depth }, mpu, now), x, y, z);
        upload();
        return true;
      }
      // The outermost bit of body near the crash point: look through (a sample of) the real vertices.
      const rd = positionReader(mesh.geometry.attributes.position), e = rel.elements;
      const step = Math.max(1, Math.floor(rd.count / 25000));
      let best = -Infinity, bi = -1, bx = 0, by = 0, bz = 0;
      for (let i = 0; i < rd.count; i += step) {
        const j = rd.off + i * rd.stride;
        const vx = rd.arr[j] * rd.k, vy = rd.arr[j + 1] * rd.k, vz = rd.arr[j + 2] * rd.k;
        const rx = e[0] * vx + e[4] * vy + e[8] * vz + e[12], ry = e[1] * vx + e[5] * vy + e[9] * vz + e[13], rz = e[2] * vx + e[6] * vy + e[10] * vz + e[14];
        const R = k === 0 ? rx : k === 1 ? ry : rz, A = t1 === 0 ? rx : t1 === 1 ? ry : rz, B = t2 === 0 ? rx : t2 === 1 ? ry : rz;
        if (Math.abs(A - P[t1]) > LAT || Math.abs(B - P[t2]) > LAT) continue;
        if (R * sg > best) { best = R * sg; bi = i; bx = vx; by = vy; bz = vz; }
      }
      const centre = new THREE.Vector3(bx, by, bz);
      if (bi < 0) {                                              // nothing near: put it on the box face instead
        const q = new THREE.Vector3(x, y, z); q.setComponent(k, sg > 0 ? box.max.getComponent(k) : box.min.getComponent(k));
        centre.copy(q).applyMatrix4(relInv);
      }
      const out = new THREE.Vector3(); out.setComponent(k, -sg);   // push into the car
      out.transformDirection(relInv);
      tore(store.add({ x: centre.x, y: centre.y, z: centre.z, dx: out.x, dy: out.y, dz: out.z, radius: size.radius, depth: size.depth }, mpu, now), x, y, z);
      last = { k, sg, x, y, z, t: now, cx: centre.x, cy: centre.y, cz: centre.z, ox: out.x, oy: out.y, oz: out.z };
      upload();
      return true;
    },
  };
  return ctl;
}

export { DENT };

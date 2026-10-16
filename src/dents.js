// Visible crash damage: dents pushed into a car's scanned body by the vertex shader.
//
// The cars are single 200k-400k vertex meshes, so nothing here edits the mesh. Each dent is just a few numbers
// (a centre, a push direction, a radius and a depth) handed to the shader, which presses the body in around that
// point, tilts the lighting to match and scuffs the paint. A pristine car pays almost nothing; a battered one
// pays a few shader instructions per vertex. Pure arithmetic lives in dentMath.js (tested in Node).
import * as THREE from 'three';
import { DENT, DentStore, dentSize, faceOf } from './dentMath.js';

const GLSL_COMMON = (n) => `
uniform vec4 uDent[${n}]; uniform vec4 uDentDir[${n}]; uniform int uDentN; varying float vDentW;
float dh3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float dnoise(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dh3(i), dh3(i + vec3(1,0,0)), f.x), mix(dh3(i + vec3(0,1,0)), dh3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(dh3(i + vec3(0,0,1)), dh3(i + vec3(1,0,1)), f.x), mix(dh3(i + vec3(0,1,1)), dh3(i + vec3(1,1,1)), f.x), f.y), f.z); }
// total push at p, the slope it gives the surface, and how scuffed the paint is there
void dentField(vec3 p, out vec3 push, out vec3 tilt, out float scuff) {
  push = vec3(0.0); tilt = vec3(0.0); scuff = 0.0;
  for (int i = 0; i < ${n}; i++) {
    if (i >= uDentN) break;
    float r = uDent[i].w; vec3 dir = uDentDir[i].xyz; float depth = uDentDir[i].w;
    vec3 rel = p - uDent[i].xyz; float d = length(rel);
    scuff = max(scuff, (1.0 - smoothstep(0.0, r * 1.3, d)) * clamp(depth / r * 3.5, 0.3, 1.0));
    if (d >= r) continue;
    float t = 1.0 - d / r, w = t * t * (3.0 - 2.0 * t);                       // smooth bowl, deepest in the middle
    float crinkle = 0.55 + 0.9 * dnoise(p / (r * 0.28));                      // uneven crumple, not a perfect dish
    push += dir * depth * w * crinkle;
    vec3 radial = rel / max(d, 1e-5); radial -= dir * dot(radial, dir);
    tilt += radial * depth * (6.0 * t * (1.0 - t) / r) * crinkle;
  }
}`;

function patchMaterial(mat, n, dents, dirs, count) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uDent = { value: dents }; sh.uniforms.uDentDir = { value: dirs }; sh.uniforms.uDentN = count;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${GLSL_COMMON(n)}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        vec3 dPush, dTilt; float dScuff; dentField(position, dPush, dTilt, dScuff);
        objectNormal = normalize(objectNormal - dTilt);`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed += dPush; vDentW = dScuff;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vDentW;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.34, 0.30, 0.28), clamp(vDentW * 1.2, 0.0, 0.8));`);
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
    if (p && p.count > most && o.material && o.material !== avoid && !Array.isArray(o.material)) { mesh = o; most = p.count; }
  });
  if (!mesh) return null;
  const mat = mesh.material;
  const dents = Array.from({ length: max }, () => new THREE.Vector4());
  const dirs = Array.from({ length: max }, () => new THREE.Vector4());
  const count = { value: 0 };
  const store = new DentStore(max);
  patchMaterial(mat, max, dents, dirs, count);

  let rel = null, relInv = null, mpu = 1, box = null;       // root <- mesh transform, worked out on first use (the car is fitted after loading)
  const prep = () => {
    rel = new THREE.Matrix4();
    for (let o = mesh; o && o !== root; o = o.parent) { o.updateMatrix(); rel.premultiply(o.matrix); }
    relInv = rel.clone().invert();
    mpu = new THREE.Vector3().setFromMatrixScale(rel).x;
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

  const ctl = {
    mesh, material: mat, store,
    get count() { return store.length; },
    clear() { last = null; store.clear(); for (const v of dents) v.set(0, 0, 0, 0); for (const v of dirs) v.set(0, 0, 0, 0); count.value = 0; },
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
        store.add({ x: lc.cx, y: lc.cy, z: lc.cz, dx: lc.ox, dy: lc.oy, dz: lc.oz, radius: size.radius, depth: size.depth }, mpu, now);
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
      store.add({ x: centre.x, y: centre.y, z: centre.z, dx: out.x, dy: out.y, dz: out.z, radius: size.radius, depth: size.depth }, mpu, now);
      last = { k, sg, x, y, z, t: now, cx: centre.x, cy: centre.y, cz: centre.z, ox: out.x, oy: out.y, oz: out.z };
      upload();
      return true;
    },
  };
  return ctl;
}

export { DENT };

import * as THREE from 'three';

/**
 * Depth of field for the replay (High tier only). Nothing exists until the replay opens: the scene is drawn into one
 * half-float target with a depth texture, a single full-screen pass blurs by distance from the car in focus, and
 * leaving the replay disposes the lot, so racing never pays for it in memory.
 */
const FRAG = /* glsl */`
uniform sampler2D tColor; uniform sampler2D tDepth;
uniform float focus, near, far, strength, aspect; uniform vec2 texel;
varying vec2 vUv;
float lin(float d) { float z = d * 2.0 - 1.0; return 2.0 * near * far / (far + near - z * (far - near)); }
float coc(vec2 uv) {
  float z = lin(texture2D(tDepth, uv).x), d = z - focus, dead = 5.0 + focus * 0.15;      // the whole car (and what is next to it) stays sharp
  float m = max(0.0, abs(d) - dead) / max(focus, 8.0) * strength;
  return clamp(sign(d) * m * (d < 0.0 ? 0.5 : 1.0), -1.0, 1.0);
}
void main() {
  float c0 = coc(vUv);
  float r = abs(c0) * 12.0;
  vec3 sum = texture2D(tColor, vUv).rgb; float wsum = 1.0;
  if (r > 0.6) {
    for (int i = 0; i < 16; i++) {
      float a = float(i) * 2.399963, rr = sqrt((float(i) + 0.5) / 16.0) * r;
      vec2 o = vec2(cos(a), sin(a)) * rr * texel;
      vec2 uv = vUv + o;
      float ci = coc(uv);
      // something sharp and nearer than this pixel must not smear into it
      float w = (ci < c0 - 0.15 && ci > -0.2 && c0 > 0.0) ? 0.0 : 1.0;
      sum += texture2D(tColor, uv).rgb * w; wsum += w;
    }
  }
  gl_FragColor = vec4(sum / wsum, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class ReplayDof {
  constructor(renderer) {
    this.renderer = renderer; this.rt = null; this.mat = null; this.scene = null; this.cam = null; this.size = new THREE.Vector2();
  }
  get on() { return !!this.rt; }
  enable() {
    if (this.rt) return;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4, depthBuffer: true });
    this.rt.depthTexture = new THREE.DepthTexture(4, 4);
    this.rt.depthTexture.type = THREE.UnsignedIntType;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tColor: { value: null }, tDepth: { value: null }, focus: { value: 20 }, near: { value: 0.3 }, far: { value: 1000 }, strength: { value: 1.4 }, aspect: { value: 1 }, texel: { value: new THREE.Vector2() } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: FRAG, depthTest: false, depthWrite: false, toneMapped: true,
    });
    this.scene = new THREE.Scene();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat); this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  disable() {
    if (!this.rt) return;
    this.rt.depthTexture.dispose(); this.rt.dispose(); this.mat.dispose(); this.quad.geometry.dispose();
    this.rt = this.mat = this.scene = this.quad = this.cam = null;
  }
  /** Draw the scene with depth of field, focused `focus` metres in front of the camera. */
  render(scene, camera, focus) {
    const r = this.renderer; r.getDrawingBufferSize(this.size);
    const w = this.size.x, h = this.size.y;
    if (this.rt.width !== w || this.rt.height !== h) { this.rt.setSize(w, h); this.rt.depthTexture.image.width = w; this.rt.depthTexture.image.height = h; }
    r.setRenderTarget(this.rt); r.clear(); r.render(scene, camera); r.setRenderTarget(null);
    const u = this.mat.uniforms;
    u.tColor.value = this.rt.texture; u.tDepth.value = this.rt.depthTexture;
    u.focus.value = Math.max(2, focus); u.near.value = camera.near; u.far.value = camera.far; u.texel.value.set(1 / w, 1 / h);
    r.render(this.scene, this.cam);
  }
}

// Wheels that fly off a car when it explodes: they are thrown, tumble, bounce on the road and settle, then shrink away.
// CarVisual.detachWheels() hands them over; CarVisual.restoreWheels() (a respawn) takes them back.
import * as THREE from 'three';

const G = 22, LIFE = 9;
const tmpAxis = new THREE.Vector3(), tmpOut = new THREE.Vector3(), tmpPos = new THREE.Vector3();

export class WheelFlyers {
  constructor() { this.list = []; }

  /** Throw the wheels of `visual`. `vel` is the car's velocity ({x,y,z}); `kick` 0..1 scales how hard they fly. */
  launch(visual, vel, kick = 1) {
    const wheels = visual.detachWheels();
    if (!wheels) return;
    visual.root.getWorldPosition(tmpPos);
    const cx = tmpPos.x, cz = tmpPos.z, R = Math.random;
    for (const { node, radius } of wheels) {
      node.getWorldPosition(tmpPos);
      tmpOut.set(tmpPos.x - cx, 0, tmpPos.z - cz); if (tmpOut.lengthSq() < 1e-4) tmpOut.set(R() - 0.5, 0, R() - 0.5); tmpOut.normalize();
      const out = (3 + R() * 5) * kick;
      this.list.push({
        visual, node, radius, age: 0, s0: node.scale.clone(),
        v: new THREE.Vector3((vel?.x || 0) * 0.7 + tmpOut.x * out, (5 + R() * 6) * kick, (vel?.z || 0) * 0.7 + tmpOut.z * out),
        w: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize().multiplyScalar(8 + R() * 14),
      });
    }
  }

  /** `groundY(x, z, y)` gives the road height under a point. */
  update(dt, groundY) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i], n = f.node;
      if (!f.visual._wheelsOff) { this.list.splice(i, 1); continue; }      // the car got its wheels back
      f.age += dt;
      f.v.y -= G * dt;
      n.position.x += f.v.x * dt; n.position.y += f.v.y * dt; n.position.z += f.v.z * dt;
      const gy = groundY(n.position.x, n.position.z, n.position.y) + f.radius;
      if (n.position.y < gy) {
        n.position.y = gy;
        if (f.v.y < 0) { f.v.y = -f.v.y * 0.45; if (f.v.y < 1.3) f.v.y = 0; }
        const k = Math.max(0, 1 - 1.6 * dt); f.v.x *= k; f.v.z *= k; f.w.multiplyScalar(Math.max(0, 1 - 1.2 * dt));
      }
      tmpAxis.copy(f.w); const spin = tmpAxis.length();
      if (spin > 1e-3) n.rotateOnWorldAxis(tmpAxis.multiplyScalar(1 / spin), spin * dt);
      if (f.age > LIFE) {                                                   // shrink away over the last second
        const k = 1 - (f.age - LIFE);
        if (k <= 0) { n.visible = false; this.list.splice(i, 1); } else n.scale.copy(f.s0).multiplyScalar(k);
      }
    }
  }
}

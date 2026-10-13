// Ground telegraphs: the red circles that tell the player where danger will land.
// Reading telegraphs is the core of fair, "fair but hard" combat.

import * as THREE from 'three';

export class Telegraph {
  constructor(scene, color = 0xff3d3d) {
    this.group = new THREE.Group();
    this.group.visible = false;
    const discMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false });
    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 48), discMat);
    disc.rotation.x = -Math.PI / 2;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.955, 1, 64), ringMat);
    ring.rotation.x = -Math.PI / 2;
    this.group.add(disc, ring);
    this.discMat = discMat;
    this.ringMat = ringMat;
    scene.add(this.group);
  }

  // progress 0..1 scales the disc so the player sees the fill growing over time.
  show(x, z, radius, progress = 1, color = null) {
    this.group.visible = true;
    this.group.position.set(x, 0.04, z);
    this.group.scale.setScalar(Math.max(0.01, radius * Math.min(1, progress)));
    if (color !== null) {
      this.discMat.color.setHex(color);
      this.ringMat.color.setHex(color);
    }
    this.discMat.opacity = 0.1 + 0.2 * progress;
  }

  hide() {
    this.group.visible = false;
  }
}

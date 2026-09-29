// Stage: magic circle floor, light pillars, moving spotlights, particles.
import * as THREE from 'three';

function magicCircleTexture() {
  const S = 1024, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.translate(S / 2, S / 2);
  g.strokeStyle = '#fff'; g.fillStyle = '#fff';
  g.shadowColor = '#fff'; g.shadowBlur = 8;
  const ring = (r, w) => { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); };
  ring(500, 6); ring(470, 2); ring(400, 4); ring(385, 1.5); ring(250, 3); ring(120, 2);
  // runic text band
  const text = 'VANISHMENT THIS WORLD ✦ INSIDE IDENTITY ✦ 邪王真眼 ✦ DARK FLAME MASTER ✦ ';
  g.font = 'bold 34px "Dela Gothic One", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const chars = [...text];
  chars.forEach((ch, i) => {
    g.save();
    g.rotate((i / chars.length) * Math.PI * 2);
    g.translate(0, -435);
    g.fillText(ch, 0, 0);
    g.restore();
  });
  // hexagram
  g.lineWidth = 4;
  for (let k = 0; k < 2; k++) {
    g.beginPath();
    for (let i = 0; i <= 3; i++) {
      const a = (i / 3) * Math.PI * 2 + k * Math.PI - Math.PI / 2;
      i ? g.lineTo(Math.cos(a) * 385, Math.sin(a) * 385) : g.moveTo(Math.cos(a) * 385, Math.sin(a) * 385);
    }
    g.stroke();
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    g.beginPath(); g.arc(Math.cos(a) * 250, Math.sin(a) * 250, 40, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(Math.cos(a) * 250, Math.sin(a) * 250, 26, 0, Math.PI * 2); g.stroke();
  }
  // radial ticks
  g.lineWidth = 2;
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2, r0 = i % 4 ? 478 : 470;
    g.beginPath(); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * 500, Math.sin(a) * 500); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function gradientTexture(flipY = true) {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(0.7, 'rgba(255,255,255,0.35)');
  gr.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.flipY = flipY;
  return t;
}

export class Stage {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    scene.background = new THREE.Color(0x050006);
    scene.fog = new THREE.FogExp2(0x0a0008, 0.055);

    // floor
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(30, 64),
      new THREE.MeshStandardMaterial({ color: 0x0b0a0d, roughness: 0.35, metalness: 0.6 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    const grid = new THREE.GridHelper(40, 40, 0x5a0a18, 0x2a0610);
    grid.position.y = 0.002;
    this.group.add(grid);

    this.circle = new THREE.Mesh(
      new THREE.PlaneGeometry(7.5, 7.5),
      new THREE.MeshBasicMaterial({ map: magicCircleTexture(), color: 0xff1f45, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.circle.rotation.x = -Math.PI / 2;
    this.circle.position.y = 0.01;
    this.group.add(this.circle);

    // light pillars behind the stage
    const gradTex = gradientTexture();
    this.pillars = [];
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.35, 14, 16, 1, true),
        new THREE.MeshBasicMaterial({ map: gradTex, color: i % 3 ? 0xff1f45 : 0xffffff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      );
      m.position.set((i - 4) * 1.6, 7, -5 - Math.abs(i - 4) * 0.4);
      this.pillars.push(m);
      this.group.add(m);
    }

    // particles
    const N = 900, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 24;
      pos[i * 3 + 1] = Math.random() * 10;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 16 - 3;
      const white = Math.random() < 0.25;
      col.set(white ? [1, 0.9, 0.95] : [1, 0.12, 0.25], i * 3);
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.particles = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.05, vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.group.add(this.particles);

    // lights
    scene.add(new THREE.HemisphereLight(0xffe8ef, 0x200008, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(2, 6, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -2, near: 1, far: 20 });
    key.shadow.bias = -0.0005;
    scene.add(key);

    this.spots = [];
    const colors = [0xff1f45, 0xffc2d0, 0xff1f45, 0xb400ff];
    const coneTex = gradientTexture(false); // bright at the lamp, fading toward the floor
    for (let i = 0; i < 4; i++) {
      const sp = new THREE.SpotLight(colors[i], 40, 18, 0.28, 0.5, 1.2);
      sp.position.set((i - 1.5) * 3, 7, 2.5);
      sp.target.position.set((i - 1.5) * 1.4, 0, 0);
      scene.add(sp, sp.target);
      // visible cone
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(1.9, 7, 32, 1, true),
        new THREE.MeshBasicMaterial({ map: coneTex, color: colors[i], transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      );
      cone.geometry.translate(0, -3.5, 0);
      this.group.add(cone);
      this.spots.push({ sp, cone, base: (i - 1.5) * 1.4 });
    }
    const back = new THREE.PointLight(0xff1f45, 30, 12, 1.5);
    back.position.set(0, 2.5, -3);
    scene.add(back);
    this.back = back;
  }

  update(time, beat, energy) {
    const p = Math.exp(-5 * (beat - Math.floor(beat))); // beat accent
    this.circle.rotation.z = time * 0.15;
    this.circle.material.opacity = 0.55 + 0.45 * p * energy;
    const s = 1 + 0.03 * p * energy;
    this.circle.scale.set(s, s, 1);
    this.pillars.forEach((m, i) => {
      m.material.opacity = 0.12 + 0.3 * energy * (0.5 + 0.5 * Math.sin(beat * Math.PI * 0.5 + i));
    });
    const pos = this.particles.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) + 0.004 + 0.01 * energy;
      if (y > 10) y = 0;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
    this.spots.forEach(({ sp, cone, base }, i) => {
      const a = beat * Math.PI * 0.25 + i * 1.3;
      sp.target.position.set(base + Math.sin(a) * 1.2, 0, Math.cos(a * 0.7) * 1.0);
      sp.intensity = 10 + 22 * p * energy;
      cone.position.copy(sp.position);
      cone.lookAt(sp.target.position);
      cone.rotateX(-Math.PI / 2);
      cone.material.opacity = 0.025 + 0.05 * p * energy;
    });
    this.back.intensity = 15 + 40 * p * energy;
  }
}

// The three live scenes in the headers of About, FAQ and Privacy, built on stage.ts.
//   about:   a linked list whose five nodes are the team's initials; cur visits each in turn
//   faq:     question marks built from memory cells; a pointer p hops between them
//   privacy: a lock made of memory blocks with a glowing keyhole, inside a ring of cells
import type * as Three from "three";
import { curAt } from "@/ui/auth/heap-scene-timing";
import type { Kit, SceneSpec } from "./stage";

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** A straight shaft with an arrow head from a to b (in the parent's space). */
function arrow(kit: Kit, parent: Three.Object3D, a: Three.Vector3, b: Three.Vector3) {
  const { THREE, mats } = kit;
  const dir = b.clone().sub(a);
  const len = dir.length();
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, Math.max(0.01, len - 0.34), 12), mats.accent);
  shaft.position.copy(a).add(dir.clone().multiplyScalar((len - 0.34) / 2 / len));
  shaft.quaternion.copy(q);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.34, 16), mats.accent);
  head.position.copy(b).sub(dir.clone().normalize().multiplyScalar(0.17));
  head.quaternion.copy(q);
  parent.add(shaft, head);
}

/** A pointer marker: a name above a downward arrow head. */
function marker(kit: Kit, name: string) {
  const { THREE, mats, label } = kit;
  const g = new THREE.Group();
  const text = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.65), label(name, "accent", 256, 96, 60));
  text.position.y = 0.75;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.36, 16), mats.accent);
  tip.rotation.z = Math.PI;
  g.add(text, tip);
  return g;
}

const TEAM = ["MS", "YK", "MM", "EM", "SZ"];

export const ABOUT: SceneSpec = {
  halfWidth: 7.2,
  eye: { y: 2.2, lookY: 0.2 },
  stillAt: 2 * 1.3 + 0.2,
  build(kit) {
    const { THREE, RoundedBox, scene, mats, label, glow } = kit;
    const list = new THREE.Group();
    scene.add(list);
    const dataGeo = new RoundedBox(1.5, 1.15, 0.7, 4, 0.14);
    const nextGeo = new RoundedBox(0.85, 1.15, 0.7, 4, 0.14);
    const dotGeo = new THREE.SphereGeometry(0.12, 16, 12);
    const textGeo = new THREE.PlaneGeometry(1.25, 0.62);
    const R = 10;
    const spots = TEAM.map((_, i) => {
      const a = (i - 2) * 0.33;
      return new THREE.Vector3(Math.sin(a) * R, 0, Math.cos(a) * R - R);
    });
    const nodes = TEAM.map((initials, i) => {
      const node = new THREE.Group();
      node.position.copy(spots[i]);
      node.rotation.y = (i - 2) * 0.33;
      const data = new THREE.Mesh(dataGeo, mats.card);
      data.position.x = -0.42;
      const next = new THREE.Mesh(nextGeo, mats.border);
      next.position.x = 0.78;
      const text = new THREE.Mesh(textGeo, label(initials, "text"));
      text.position.set(-0.42, 0, 0.36);
      const dot = new THREE.Mesh(dotGeo, mats.accent);
      dot.position.set(0.78, 0, 0.36);
      node.add(data, next, text, dot);
      list.add(node);
      return { node, data };
    });
    list.updateMatrixWorld(true); // the list is still unrotated here, so world = list space
    for (let i = 0; i < nodes.length - 1; i++) {
      const from = nodes[i].node.localToWorld(new THREE.Vector3(1.21, 0, 0));
      const to = nodes[i + 1].node.localToWorld(new THREE.Vector3(-1.17, 0, 0));
      arrow(kit, list, from, to);
    }
    const head = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.55), label("head", "muted", 256, 96, 56));
    head.position.set(spots[0].x - 0.42, -1.05, spots[0].z);
    head.rotation.y = -0.72;
    const nul = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.55), label("NULL", "muted", 256, 96, 56));
    nul.position.copy(nodes[4].node.localToWorld(new THREE.Vector3(1.95, 0, 0)));
    nul.rotation.y = 0.72;
    list.add(head, nul);
    const cur = marker(kit, "cur");
    list.add(cur);
    return {
      frame(t) {
        list.rotation.y = Math.sin(t * 0.22) * 0.12;
        list.rotation.x = 0.1 + Math.sin(t * 0.17) * 0.04;
        nodes.forEach(({ node }, i) => { node.position.y = Math.sin(t * 1.1 + i * 0.8) * 0.12; });
        const c = curAt(t, nodes.length);
        const a = nodes[c.from].node;
        const b = nodes[c.to].node;
        const p = ease(c.progress);
        const pa = a.localToWorld(new THREE.Vector3(-0.42, 0, 0));
        const pb = b.localToWorld(new THREE.Vector3(-0.42, 0, 0));
        list.worldToLocal(pa);
        list.worldToLocal(pb);
        cur.position.set(pa.x + (pb.x - pa.x) * p, 1.3 + pa.y + Math.sin(p * Math.PI) * 0.6, pa.z + (pb.z - pa.z) * p);
        nodes.forEach(({ data, node }, i) => {
          data.material = i === c.glowing ? mats.hot : mats.card;
          node.scale.setScalar(node.scale.x + ((i === c.glowing ? 1.07 : 1) - node.scale.x) * 0.2);
        });
        glow.position.set(cur.position.x, cur.position.y - 0.4, cur.position.z + 1.6);
      },
    };
  },
};

const QUESTION = ["01110", "10001", "00001", "00010", "00100", "00000", "00100"];

export const FAQ: SceneSpec = {
  halfWidth: 7.2,
  eye: { y: 1.6, lookY: 0 },
  stillAt: 1.3 + 0.2,
  build(kit) {
    const { THREE, RoundedBox, scene, mats, glow } = kit;
    const cellGeo = new RoundedBox(0.5, 0.5, 0.5, 3, 0.1);
    const S = 0.58;
    const marks = [-4.9, 0, 4.9].map((x, i) => {
      const g = new THREE.Group();
      const cells: Three.Mesh[] = [];
      QUESTION.forEach((row, r) => [...row].forEach((on, c) => {
        if (on !== "1") return;
        const m = new THREE.Mesh(cellGeo, mats.border);
        m.position.set((c - 2) * S, (3 - r) * S, 0);
        g.add(m);
        cells.push(m);
      }));
      g.position.set(x, 0, i === 1 ? 0.6 : -0.8);
      g.scale.setScalar(i === 1 ? 1 : 0.82);
      scene.add(g);
      return { g, cells };
    });
    // loose memory cells drifting around
    const dustGeo = new RoundedBox(0.2, 0.2, 0.2, 2, 0.04);
    const dust = Array.from({ length: 18 }, (_, i) => {
      const m = new THREE.Mesh(dustGeo, i % 4 === 0 ? mats.accent : mats.border);
      const seed = { x: ((i * 37) % 17) - 8.5, y: ((i * 53) % 9) - 4.5, z: -2 - (i % 4), s: 0.3 + (i % 5) * 0.12 };
      scene.add(m);
      return { m, seed };
    });
    const p = marker(kit, "p");
    scene.add(p);
    return {
      frame(t) {
        marks.forEach(({ g }, i) => {
          g.rotation.y = Math.sin(t * 0.55 + i * 1.7) * 0.42;
          g.position.y = Math.sin(t * 0.9 + i) * 0.2;
        });
        dust.forEach(({ m, seed }, i) => {
          m.position.set(seed.x + Math.sin(t * seed.s + i) * 0.6, seed.y + Math.cos(t * seed.s * 0.8 + i) * 0.5, seed.z);
          m.rotation.set(t * seed.s, t * seed.s * 0.7, 0);
        });
        const c = curAt(t, marks.length);
        const a = marks[c.from].g.position;
        const b = marks[c.to].g.position;
        const k = ease(c.progress);
        p.position.set(a.x + (b.x - a.x) * k, 2.75 + a.y + (b.y - a.y) * k + Math.sin(k * Math.PI) * 0.8, a.z + (b.z - a.z) * k + 0.4);
        marks.forEach(({ cells }, i) => { for (const m of cells) m.material = i === c.glowing ? mats.hot : mats.border; });
        glow.position.set(p.position.x, 0.6, p.position.z + 2.2);
      },
    };
  },
};

export const PRIVACY: SceneSpec = {
  halfWidth: 5.2,
  eye: { y: 1.4, lookY: 0.2 },
  stillAt: 1,
  build(kit) {
    const { THREE, RoundedBox, scene, mats, glow } = kit;
    const lock = new THREE.Group();
    scene.add(lock);
    const cellGeo = new RoundedBox(0.6, 0.6, 0.6, 3, 0.11);
    const S = 0.68;
    // the body: 5 x 4 memory cells
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
      const m = new THREE.Mesh(cellGeo, (r + c) % 2 ? mats.border : mats.card);
      m.position.set((c - 2) * S, -0.9 - (r - 1.5) * S, 0);
      lock.add(m);
    }
    // the shackle: small cells along a half circle with two legs, lifts and drops in a loop
    const shackle = new THREE.Group();
    const small = new RoundedBox(0.34, 0.34, 0.34, 2, 0.07);
    const rad = 1.05;
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * (i / 10);
      const m = new THREE.Mesh(small, mats.border);
      m.position.set(Math.cos(a) * rad, 0.75 + Math.sin(a) * rad, 0);
      shackle.add(m);
    }
    for (const x of [-rad, rad]) for (const y of [0.4, 0.05]) {
      const m = new THREE.Mesh(small, mats.border);
      m.position.set(x, y, 0);
      shackle.add(m);
    }
    lock.add(shackle);
    // the keyhole, glowing on the front
    const keyMat = mats.accent.clone();
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24), keyMat);
    hole.position.set(0, -0.62, S / 2 + 0.31);
    const slot = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.42), keyMat);
    slot.position.set(0, -0.86, S / 2 + 0.31);
    lock.add(hole, slot);
    // a ring of hexagonal cells around it, one lit at a time
    const hexGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.08, 6);
    const ring = new THREE.Group();
    ring.rotation.x = 1.15;
    const hexes = Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * Math.PI * 2;
      const m = new THREE.Mesh(hexGeo, mats.border);
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      m.position.copy(dir.clone().multiplyScalar(3.4));
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      ring.add(m);
      return m;
    });
    const shield = new THREE.Group();
    shield.position.y = -0.3;
    shield.add(ring);
    scene.add(shield);
    return {
      frame(t) {
        lock.rotation.y = Math.sin(t * 0.4) * 0.35;
        lock.position.y = Math.sin(t * 0.9) * 0.12;
        // every 6 s: the shackle lifts open, waits, and snaps shut; the keyhole flashes as it closes
        const k = t % 6;
        const lift = k < 0.6 ? ease(k / 0.6) : k < 2.4 ? 1 : k < 2.8 ? 1 - ease((k - 2.4) / 0.4) : 0;
        shackle.position.y = lift * 0.45;
        shackle.rotation.y = lift * 0.5;
        const flash = k >= 2.8 ? Math.exp(-(((k - 2.8) * 3) ** 2)) : 0;
        keyMat.emissiveIntensity = 0.6 + Math.sin(t * 2.2) * 0.15 + flash * 2.5;
        ring.rotation.y = t * 0.25;
        const lit = Math.floor(t * 3) % hexes.length;
        hexes.forEach((h, i) => { h.material = i === lit || i === (lit + 8) % hexes.length ? mats.accent : mats.border; });
        glow.position.set(0, -0.6, 2.4);
      },
    };
  },
};

"use client";
// A live three.js scene for the login page: a singly linked list floating in 3D. A `cur`
// pointer hops from node to node the way a traversal loop does, the list sways, and the camera
// follows the mouse a little. three.js loads only on this page, after the form is ready.
// Colours come from the site's theme and follow the light / dark switch. With reduced motion
// it draws one still frame. If WebGL isn't available, nothing is drawn and the form is unaffected.
import { useEffect, useRef } from "react";

const VALUES = [12, 7, 42, 3, 19];
const GAP = 3.1;

function cssColor(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function HeapScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const THREE = await import("three");
      const { RoundedBoxGeometry } = await import("three/examples/jsm/geometries/RoundedBoxGeometry.js");
      if (disposed) return;

      let renderer: import("three").WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
      } catch {
        return; // no WebGL: leave the panel empty
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
      camera.position.set(0, 2.2, 15);

      const theme = () => ({
        accent: new THREE.Color(cssColor("--accent", "#3dd6c6")),
        card: new THREE.Color(cssColor("--card", "#102030")),
        border: new THREE.Color(cssColor("--card-border", "#21374b")),
        text: cssColor("--foreground", "#e6eef6"),
        muted: cssColor("--muted-foreground", "#b3c1d0"),
      });
      let colors = theme();

      scene.add(new THREE.AmbientLight(0xffffff, 1.1));
      const sun = new THREE.DirectionalLight(0xffffff, 2.2);
      sun.position.set(4, 9, 8);
      scene.add(sun);
      const glow = new THREE.PointLight(colors.accent, 30, 8, 2);
      scene.add(glow);

      // A text label drawn on a small canvas, so no fonts are downloaded.
      const label = (text: string, color: string, w = 256, h = 128, size = 72) => {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const g = c.getContext("2d")!;
        g.fillStyle = color;
        g.font = `600 ${size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(text, w / 2, h / 2 + 4);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        return tex;
      };

      const list = new THREE.Group();
      const centre = new THREE.Group(); // shifts the list so head..NULL is centred
      centre.position.x = -0.5;
      centre.add(list);
      scene.add(centre);
      const dataGeo = new RoundedBoxGeometry(1.5, 1.15, 0.7, 4, 0.14);
      const nextGeo = new RoundedBoxGeometry(0.85, 1.15, 0.7, 4, 0.14);
      const shaftGeo = new THREE.CylinderGeometry(0.05, 0.05, 1, 12);
      const headGeo = new THREE.ConeGeometry(0.16, 0.36, 16);
      const dotGeo = new THREE.SphereGeometry(0.11, 16, 12);
      const labelGeo = new THREE.PlaneGeometry(1.25, 0.62);
      const dataMat = new THREE.MeshStandardMaterial({ color: colors.card, roughness: 0.35, metalness: 0.15 });
      const nextMat = new THREE.MeshStandardMaterial({ color: colors.border, roughness: 0.4, metalness: 0.2 });
      const accentMat = new THREE.MeshStandardMaterial({ color: colors.accent, emissive: colors.accent, emissiveIntensity: 0.55, roughness: 0.3 });
      const hotMat = new THREE.MeshStandardMaterial({ color: colors.card, emissive: colors.accent, emissiveIntensity: 0.35, roughness: 0.3 });
      const textures: import("three").Texture[] = [];
      const labelMats: import("three").MeshBasicMaterial[] = [];

      const nodes = VALUES.map((value, i) => {
        const node = new THREE.Group();
        node.position.x = (i - (VALUES.length - 1) / 2) * GAP;
        const data = new THREE.Mesh(dataGeo, dataMat);
        data.position.x = -0.42;
        const next = new THREE.Mesh(nextGeo, nextMat);
        next.position.x = 0.78;
        const tex = label(String(value), colors.text);
        textures.push(tex);
        const lm = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
        labelMats.push(lm);
        const text = new THREE.Mesh(labelGeo, lm);
        text.position.set(-0.42, 0, 0.36);
        const dot = new THREE.Mesh(dotGeo, accentMat);
        dot.position.set(0.78, 0, 0.36);
        node.add(data, next, text, dot);
        list.add(node);
        return { node, data };
      });

      // next arrows from each node's pointer cell to the following node
      for (let i = 0; i < nodes.length - 1; i++) {
        const shaft = new THREE.Mesh(shaftGeo, accentMat);
        shaft.rotation.z = Math.PI / 2;
        shaft.scale.y = GAP - 2.55;
        shaft.position.set(nodes[i].node.position.x + 1.21 + (GAP - 2.55) / 2, 0, 0);
        const head = new THREE.Mesh(headGeo, accentMat);
        head.rotation.z = -Math.PI / 2;
        head.position.set(nodes[i + 1].node.position.x - 1.17 - 0.18, 0, 0);
        list.add(shaft, head);
      }
      // NULL after the last node, and the head and cur pointers above
      const nullTex = label("NULL", colors.muted, 256, 96, 56);
      const headTex = label("head", colors.muted, 256, 96, 56);
      const curTex = label("cur", cssColor("--accent", "#3dd6c6"), 256, 96, 60);
      textures.push(nullTex, headTex, curTex);
      const nullMat = new THREE.MeshBasicMaterial({ map: nullTex, transparent: true });
      const headMat = new THREE.MeshBasicMaterial({ map: headTex, transparent: true });
      const curMat = new THREE.MeshBasicMaterial({ map: curTex, transparent: true });
      const nullLabel = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.65), nullMat);
      nullLabel.position.set(nodes.at(-1)!.node.position.x + 2.0, 0, 0);
      list.add(nullLabel);
      const headLabel = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.65), headMat);
      headLabel.position.set(nodes[0].node.position.x - 0.42, -1.45, 0);
      list.add(headLabel);
      const cur = new THREE.Group();
      const curText = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.65), curMat);
      curText.position.y = 0.75;
      const curArrow = new THREE.Mesh(headGeo, accentMat);
      curArrow.rotation.z = Math.PI;
      cur.add(curText, curArrow);
      list.add(cur);

      let baseZ = 15;
      const resize = () => {
        const { clientWidth: w, clientHeight: h } = canvas;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        // Back off until the whole list (head to NULL, about 20 units wide) fits the panel.
        const halfWidth = 9;
        baseZ = Math.max(12, halfWidth / (Math.tan(((camera.fov / 2) * Math.PI) / 180) * camera.aspect));
        camera.updateProjectionMatrix();
      };
      const ro = new ResizeObserver(resize);
      ro.observe(canvas);
      resize();

      const recolor = () => {
        colors = theme();
        dataMat.color.copy(colors.card);
        hotMat.color.copy(colors.card);
        nextMat.color.copy(colors.border);
        for (const m of [accentMat, hotMat]) m.emissive.copy(colors.accent);
        accentMat.color.copy(colors.accent);
        glow.color.copy(colors.accent);
      };
      const mo = new MutationObserver(recolor);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

      const pointer = { x: 0, y: 0 };
      const onMove = (e: PointerEvent) => {
        pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
        pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
      };
      window.addEventListener("pointermove", onMove);

      const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const HOP = 1.3; // seconds per node
      const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
      let raf = 0;
      const t0 = performance.now();
      const frame = (now: number) => {
        const t = still ? 2.1 : Math.max(0, now - t0) / 1000; // the first frame can be timed just before t0
        list.rotation.y = Math.sin(t * 0.25) * 0.22;
        list.rotation.x = 0.12 + Math.sin(t * 0.18) * 0.05;
        nodes.forEach(({ node }, i) => { node.position.y = Math.sin(t * 1.1 + i * 0.8) * 0.18; node.position.z = Math.cos(t * 0.7 + i) * 0.25; });
        // cur hops along the list, pausing on each node, then starts again at head
        const span = VALUES.length * HOP;
        const k = (t % span) / HOP;
        const at = Math.floor(k);
        const move = Math.min(1, (k - at) / 0.45);
        const from = nodes[at].node.position;
        const to = nodes[(at + 1) % nodes.length].node.position;
        const p = at === nodes.length - 1 ? 0 : ease(move);
        cur.position.set(from.x + (to.x - from.x) * p - 0.42, 1.25 + from.y + Math.sin(p * Math.PI) * 0.6, from.z);
        const onNode = at === nodes.length - 1 || move >= 1 ? at : -1;
        nodes.forEach(({ data, node }, i) => {
          data.material = i === onNode ? hotMat : dataMat;
          const s = i === onNode ? 1.06 : 1;
          node.scale.setScalar(node.scale.x + (s - node.scale.x) * 0.2);
        });
        glow.position.set(cur.position.x, cur.position.y - 0.6, 1.5);
        camera.position.z = baseZ;
        camera.position.x += (pointer.x * 1.6 - camera.position.x) * 0.04;
        camera.position.y += (2.2 - pointer.y * 1.2 - camera.position.y) * 0.04;
        camera.lookAt(0, 0, 0);
        renderer.render(scene, camera);
        if (!still) raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
      canvas.dataset.ready = "true";

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        mo.disconnect();
        window.removeEventListener("pointermove", onMove);
        for (const g of [dataGeo, nextGeo, shaftGeo, headGeo, dotGeo, labelGeo]) g.dispose();
        for (const m of [dataMat, nextMat, accentMat, hotMat, nullMat, headMat, curMat, ...labelMats]) m.dispose();
        for (const tx of textures) tx.dispose();
        renderer.dispose();
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className="block h-full w-full" data-heap-scene />;
}

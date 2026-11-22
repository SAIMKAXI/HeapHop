"use client";
// The shared plumbing for the small three.js scenes on the read-only pages (About, FAQ,
// Privacy): loads three.js only when the page needs it, follows the site's colours and the
// light / dark switch, sways the camera a little with the mouse, pauses while the scene is off
// screen or the tab is hidden, draws one still frame for visitors who ask for reduced motion,
// and draws nothing at all where WebGL is unavailable. Each scene only builds its objects and
// says how they move (see page-scenes.ts).
import { useEffect, type RefObject } from "react";
import type * as Three from "three";

export interface Palette {
  accent: Three.Color;
  card: Three.Color;
  border: Three.Color;
  text: string;
  muted: string;
}

export interface Kit {
  THREE: typeof Three;
  RoundedBox: typeof import("three/examples/jsm/geometries/RoundedBoxGeometry.js").RoundedBoxGeometry;
  scene: Three.Scene;
  /** The shared materials: node fill, node edge, glowing accent, and a node that glows. */
  mats: { card: Three.MeshStandardMaterial; border: Three.MeshStandardMaterial; accent: Three.MeshStandardMaterial; hot: Three.MeshStandardMaterial };
  /** A text label drawn on a canvas (no font downloads), as a material for a plane. */
  label: (text: string, color: "text" | "muted" | "accent", w?: number, h?: number, size?: number) => Three.MeshBasicMaterial;
  glow: Three.PointLight;
}

export interface SceneSpec {
  /** Half the width, in scene units, that must fit the panel. */
  halfWidth: number;
  /** Camera height and how far it looks down. */
  eye?: { y: number; lookY: number };
  /** The moment shown when motion is reduced. */
  stillAt: number;
  build: (kit: Kit) => { frame: (t: number) => void };
}

/** True when the browser can draw WebGL; checked first so a missing GPU logs nothing. */
export function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

function cssColor(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function useThreeStage(canvasRef: RefObject<HTMLCanvasElement | null>, spec: SceneSpec) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasWebGL()) return; // no WebGL: the panel stays empty and the page is unaffected
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const THREE = await import("three");
      const { RoundedBoxGeometry } = await import("three/examples/jsm/geometries/RoundedBoxGeometry.js");
      if (disposed) return;
      let renderer: Three.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
      } catch {
        return; // no WebGL: the panel stays empty and the page is unaffected
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
      const eye = spec.eye ?? { y: 2, lookY: 0 };

      const palette = (): Palette => ({
        accent: new THREE.Color(cssColor("--accent", "#3dd6c6")),
        card: new THREE.Color(cssColor("--card", "#102030")),
        border: new THREE.Color(cssColor("--card-border", "#21374b")),
        text: cssColor("--foreground", "#e6eef6"),
        muted: cssColor("--muted-foreground", "#b3c1d0"),
      });
      let colors = palette();
      scene.add(new THREE.AmbientLight(0xffffff, 1.1));
      const sun = new THREE.DirectionalLight(0xffffff, 2.2);
      sun.position.set(4, 9, 8);
      scene.add(sun);
      const glow = new THREE.PointLight(colors.accent, 26, 9, 2);
      scene.add(glow);

      const mats = {
        card: new THREE.MeshStandardMaterial({ color: colors.card, roughness: 0.35, metalness: 0.15 }),
        border: new THREE.MeshStandardMaterial({ color: colors.border, roughness: 0.4, metalness: 0.2 }),
        accent: new THREE.MeshStandardMaterial({ color: colors.accent, emissive: colors.accent, emissiveIntensity: 0.55, roughness: 0.3 }),
        hot: new THREE.MeshStandardMaterial({ color: colors.card, emissive: colors.accent, emissiveIntensity: 0.4, roughness: 0.3 }),
      };
      const labels: { mat: Three.MeshBasicMaterial; draw: () => void }[] = [];
      const label: Kit["label"] = (text, color, w = 256, h = 128, size = 72) => {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        const draw = () => {
          const g = c.getContext("2d")!;
          g.clearRect(0, 0, w, h);
          g.fillStyle = color === "accent" ? `#${colors.accent.getHexString()}` : colors[color];
          g.font = `700 ${size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.fillText(text, w / 2, h / 2 + 4);
          tex.needsUpdate = true;
        };
        draw();
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
        labels.push({ mat, draw });
        return mat;
      };

      const { frame } = spec.build({ THREE, RoundedBox: RoundedBoxGeometry, scene, mats, label, glow });

      let baseZ = 14;
      const resize = () => {
        const { clientWidth: w, clientHeight: h } = canvas;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        const tan = Math.tan(((camera.fov / 2) * Math.PI) / 180);
        baseZ = Math.max(9, spec.halfWidth / (tan * camera.aspect), (spec.halfWidth * 0.62) / tan);
        camera.updateProjectionMatrix();
      };
      const ro = new ResizeObserver(resize);
      ro.observe(canvas);
      resize();

      const recolor = () => {
        colors = palette();
        mats.card.color.copy(colors.card);
        mats.hot.color.copy(colors.card);
        mats.border.color.copy(colors.border);
        mats.accent.color.copy(colors.accent);
        mats.accent.emissive.copy(colors.accent);
        mats.hot.emissive.copy(colors.accent);
        glow.color.copy(colors.accent);
        for (const l of labels) l.draw();
        if (still) render(spec.stillAt);
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
      const render = (t: number) => {
        frame(t);
        camera.position.z = baseZ;
        camera.position.x += (pointer.x * 1.4 - camera.position.x) * 0.05;
        camera.position.y += (eye.y - pointer.y * 1.0 - camera.position.y) * 0.05;
        camera.lookAt(0, eye.lookY, 0);
        renderer.render(scene, camera);
      };
      camera.position.set(0, eye.y, baseZ);

      // Animate only while the scene is on screen and the tab is visible.
      let raf = 0;
      let visible = true;
      let elapsed = 0;
      let last = 0;
      const tick = (now: number) => {
        elapsed += Math.min(0.1, Math.max(0, (now - last) / 1000));
        last = now;
        render(elapsed);
        raf = requestAnimationFrame(tick);
      };
      const start = () => { if (!raf && !still && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(tick); } };
      const stop = () => { cancelAnimationFrame(raf); raf = 0; };
      const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); else stop(); });
      io.observe(canvas);
      const onVisibility = () => (document.hidden ? stop() : start());
      document.addEventListener("visibilitychange", onVisibility);
      if (still) {
        camera.position.set(0, eye.y, baseZ);
        render(spec.stillAt);
      } else start();
      canvas.dataset.ready = "true";

      cleanup = () => {
        stop();
        io.disconnect();
        ro.disconnect();
        mo.disconnect();
        window.removeEventListener("pointermove", onMove);
        document.removeEventListener("visibilitychange", onVisibility);
        scene.traverse((o) => {
          const mesh = o as Three.Mesh;
          mesh.geometry?.dispose();
        });
        for (const m of Object.values(mats)) m.dispose();
        for (const l of labels) { l.mat.map?.dispose(); l.mat.dispose(); }
        renderer.dispose();
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [canvasRef, spec]);
}

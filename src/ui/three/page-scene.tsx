"use client";
// The live 3D picture in the header of About, FAQ and Privacy (scenes in page-scenes.ts).
import { useRef } from "react";
import { ABOUT, FAQ, PRIVACY } from "./page-scenes";
import { useThreeStage } from "./stage";

const SCENES = { about: ABOUT, faq: FAQ, privacy: PRIVACY } as const;
export type PageSceneName = keyof typeof SCENES;

export function PageScene({ name }: { name: PageSceneName }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useThreeStage(canvas, SCENES[name]);
  return <canvas ref={canvas} aria-hidden className="block h-full w-full" data-page-scene={name} />;
}

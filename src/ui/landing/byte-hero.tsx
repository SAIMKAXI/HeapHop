"use client";
// Byte, large, beside the slogan on the landing page: a 5-second rendered clip, replayed
// after a 3-second pause, in which
// Byte bursts apart, shows its circuit board, LEDs and joint motors, and snaps back together.
// Made with scripts/byte-video (Blender). There is one video per theme, each on that
// theme's background, so it works in every browser without a transparent video format.
//
// During the pause Byte bobs gently (two slow floats that start and end at rest, so the
// clip picks up without a jump). Before hydration both still frames are in the page and CSS shows the one for the theme,
// so nothing flashes. After hydration only the current theme's video is loaded. Visitors
// who ask for reduced motion keep the still frame.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLightTheme } from "@/ui/theme";

export const BYTE_VIDEO = {
  dark: { video: "/media/byte-dark.mp4", still: "/media/byte-dark.webp" },
  light: { video: "/media/byte-light.mp4", still: "/media/byte-light.webp" },
} as const;

const REDUCED = "(prefers-reduced-motion: reduce)";
/** After each run Byte stands still this long before taking itself apart again. */
export const BYTE_PAUSE_MS = 3000;

function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (listener) => {
      const query = matchMedia(REDUCED);
      query.addEventListener("change", listener);
      return () => query.removeEventListener("change", listener);
    },
    () => matchMedia(REDUCED).matches,
    () => true // the pre-rendered page shows the still frames
  );
}

export function ByteHero() {
  const light = useLightTheme();
  const still = useReducedMotion();
  const theme = light ? "light" : "dark";
  const video = useRef<HTMLVideoElement>(null);
  const [resting, setResting] = useState(false);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const rest = () => {
      // The last frame is Byte assembled, so it stays on screen, floating, during the pause.
      setResting(true);
      timer = setTimeout(() => {
        setResting(false);
        v.currentTime = 0;
        void v.play().catch(() => {});
      }, BYTE_PAUSE_MS);
    };
    v.addEventListener("ended", rest);
    return () => {
      v.removeEventListener("ended", rest);
      clearTimeout(timer);
      setResting(false);
    };
  }, [theme, still]);
  return (
    <figure data-byte-hero className="flex flex-col items-center">
      <div className="hh-byte-video relative aspect-square w-72 sm:w-80 lg:w-[26rem]" aria-hidden>
        <div className="hh-byte-float absolute inset-0" data-resting={resting || undefined} style={{ animationDuration: `${BYTE_PAUSE_MS}ms` }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a static export: no image optimiser */}
        <img src={BYTE_VIDEO.dark.still} alt="" width={900} height={900} data-byte-still="dark" className="hh-dark-only absolute inset-0 h-full w-full" />
        {/* eslint-disable-next-line @next/next/no-img-element -- a static export: no image optimiser */}
        <img src={BYTE_VIDEO.light.still} alt="" width={900} height={900} data-byte-still="light" className="hh-light-only absolute inset-0 h-full w-full" />
        {!still && (
          <video
            key={theme}
            ref={video}
            data-byte-video={theme}
            src={BYTE_VIDEO[theme].video}
            poster={BYTE_VIDEO[theme].still}
            autoPlay
            muted
            playsInline
            disablePictureInPicture
            preload="auto"
            className="absolute inset-0 h-full w-full"
          />
        )}
        </div>
      </div>
      <figcaption className="mt-3 rounded-full border border-card-border bg-card px-4 py-1.5 text-sm text-muted-foreground">
        <span className="font-bold text-accent">Byte</span> · takes itself apart so you can see inside
      </figcaption>
    </figure>
  );
}

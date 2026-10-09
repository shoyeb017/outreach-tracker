"use client";

import { useEffect, useRef, useState } from "react";
import type { TubeScene } from "@/lib/landing/blue-tubes";

export function BlueTubesBackground() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<TubeScene | null>(null);
  const [status, setStatus] = useState<"loading" | "running" | "reduced" | "fallback">("loading");
  useEffect(() => {
    const element = canvas.current;
    const container = element?.closest<HTMLElement>(".landing-hero, [data-tubes-background]");
    if (!element || !container) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let cancelled = false;
    let revision = 0;
    async function start() {
      const current = ++revision;
      scene.current?.dispose(); scene.current = null;
      if (motion.matches) { setStatus("reduced"); return; }
      setStatus("loading");
      try {
        const { createBlueTubes } = await import("@/lib/landing/blue-tubes");
        if (cancelled || current !== revision) return;
        let failed = false;
        const result = createBlueTubes(element!, container!, () => { failed = true; scene.current?.dispose(); scene.current = null; if (!cancelled) setStatus("fallback"); });
        scene.current = result;
        if (failed) { result.dispose(); scene.current = null; }
        else setStatus("running");
      } catch { if (!cancelled && current === revision) setStatus("fallback"); }
    }
    void start(); motion.addEventListener("change", start);
    return () => { cancelled = true; revision++; motion.removeEventListener("change", start); scene.current?.dispose(); scene.current = null; };
  }, []);
  const active = status === "running";
  return <>
    <div className="blue-tubes-layer" aria-hidden="true" data-animation-state={status}>
      <svg className="blue-tubes-static" viewBox="0 0 1440 800" preserveAspectRatio="xMidYMid slice"><g fill="none" stroke="#1683ff" strokeWidth="3" opacity=".65"><path d="M-100 560C190 150 330 780 620 300S1110 150 1540 390" /><path d="M-100 510C240 120 410 700 690 270S1170 240 1540 490" /><path d="M-100 320C160 680 520 50 830 450S1180 150 1540 210" /></g></svg>
      <canvas ref={canvas} className={active ? "blue-tubes-canvas is-ready" : "blue-tubes-canvas"} />
    </div>
  </>;
}

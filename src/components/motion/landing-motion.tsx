"use client";

import { useEffect, useRef } from "react";

export function LandingMotion() {
  const progress = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    function updateProgress() {
      const available = document.documentElement.scrollHeight - window.innerHeight;
      if (progress.current) progress.current.style.transform = `scaleX(${available > 0 ? Math.min(1, Math.max(0, window.scrollY / available)) : 0})`;
      frame = 0;
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(updateProgress); }
    const observer = !media.matches && "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add("reveal-active"); observer?.unobserve(entry.target); }
    }, { threshold: .12 }) : null;
    // Content is visible even without JS; animation never gates access to content.
    document.querySelectorAll("[data-reveal]").forEach((element) => observer?.observe(element));
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    updateProgress();
    return () => { observer?.disconnect(); window.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule); if (frame) cancelAnimationFrame(frame); };
  }, []);
  return <div ref={progress} aria-hidden="true" className="scroll-progress" style={{ transform: "scaleX(0)" }} />;
}

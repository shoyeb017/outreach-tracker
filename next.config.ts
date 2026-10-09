import type { NextConfig } from "next";
import { validateProductionEnvironment } from "./src/lib/config/environment";

if (process.env.NODE_ENV === "production" || process.env.VERCEL) validateProductionEnvironment(process.env);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  outputFileTracingIncludes: { "/help": ["./content/help/*.md"], "/help/**": ["./content/help/*.md"] },
  // Keep builds viable on small Vercel/local machines rather than spawning many page workers.
  experimental: { cpus: 1 },
};

export default nextConfig;

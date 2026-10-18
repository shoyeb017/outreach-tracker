import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../../", import.meta.url));
export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)),
  envDir: false, publicDir: false,
  cacheDir: root + "/node_modules/.vite-scheduling-test",
  resolve: { alias: { "next/link": fileURLToPath(new URL("./link.tsx", import.meta.url)), "next/navigation": fileURLToPath(new URL("./navigation.ts", import.meta.url)), "@": root + "/src" } },
  oxc: { jsx: { runtime: "automatic" } },
  css: { postcss: root },
  server: { host: "127.0.0.1", port: 3110, strictPort: true, fs: { allow: [root] } },
});

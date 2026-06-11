import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// base: "./" makes the build path-relative so the same dist/ deploys to
// Vercel, Cloudflare Pages, GitHub Pages project paths, and HF Spaces static.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
});

import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const base = env.VITE_BASE_PATH || "/";
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
  if (key.startsWith("sb_secret_"))
    throw new Error("Never use a Supabase secret key in Vite.");
  if (key.includes(".")) {
    let role: string | undefined;
    try {
      role = JSON.parse(
        Buffer.from(key.split(".")[1], "base64url").toString(),
      ).role;
    } catch {
      throw new Error("Invalid Supabase client key.");
    }
    if (role !== "anon")
      throw new Error(
        "Only an anon or publishable key may be included in the frontend.",
      );
  }
  return {
    base,
    plugins: [
      react(),
      VitePWA({
        registerType: "prompt",
        injectRegister: "auto",
        includeAssets: ["floor.svg", "floor-192.png", "floor-512.png"],
        manifest: {
          name: "Floor · Warehouse Operations",
          short_name: "Floor",
          description: "Shared warehouse execution and row timing",
          display: "standalone",
          start_url: base,
          scope: base,
          theme_color: "#173f36",
          background_color: "#f4f5ef",
          icons: [
            {
              src: "floor-192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "floor-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any maskable",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,png,svg}"],
          navigateFallback: "index.html",
          runtimeCaching: [],
        },
      }),
    ],
  };
});

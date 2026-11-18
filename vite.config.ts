import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import solid from "@solidjs/vite-plugin";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    solid(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      injectRegister: "script-defer",
      includeAssets: ["icons/gem-favicon.png", "icons/gem-apple-touch.png"],
      manifest: {
        id: "/",
        name: "WikiGems",
        short_name: "WikiGems",
        description: "Collect unique cards from Wikipedia articles.",
        lang: "en",
        start_url: "/play",
        scope: "/",
        display: "standalone",
        prefer_related_applications: false,
        theme_color: "#fafafa",
        background_color: "#fafafa",
        categories: ["games", "education"],
        icons: [
          {
            src: "/icons/gem-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/gem-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/gem-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api(?:\/|$)/, /^\/solana-rpc(?:\/|$)/],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              /^\/(?:api|solana-rpc)(?:\/|$)/.test(url.pathname),
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ],
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    target: "es2022",
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: false,
      },
      "/solana-rpc": {
        target: "http://127.0.0.1:8899",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/solana-rpc/, ""),
      },
    },
  },
});

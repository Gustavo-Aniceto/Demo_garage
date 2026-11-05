import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/favicon.svg"],
      manifest: {
        name: "Oficina Modelo — Sistema da Oficina",
        short_name: "Oficina Modelo",
        description: "Check-in, diagnóstico, ordens de serviço e histórico de veículos.",
        lang: "pt-BR",
        start_url: "/sistema",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#F1F4F7",
        theme_color: "#1F2933",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Só arquivos do app ficam em cache. Dados do Supabase NUNCA são servidos do cache:
        // o que aparece na tela é sempre o que está salvo na nuvem.
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});

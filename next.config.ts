import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cloud Agent / tunnel / Playwright から同一画面を開けるようにする
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "*.trycloudflare.com",
    "dans-var-gale-arena.trycloudflare.com",
  ],
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow local + Cloudflare tunnel hosts to load Next.js dev resources
  // so client hydration (validation / address sync / date warning) works.
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "*.trycloudflare.com",
    "*.loca.lt",
  ],
};

export default nextConfig;

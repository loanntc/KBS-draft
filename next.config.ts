import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Supabase storage
      {
        protocol: "https",
        hostname: "ipivycuiphfwmjkcrkoy.supabase.co",
      },
      // Common CDN patterns for profile images / link previews
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  // Faster page transitions
  experimental: {
    optimisticClientCache: true,
  },
};

export default nextConfig;

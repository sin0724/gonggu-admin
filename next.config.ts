import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: [
        "localhost:3000",
        "gonggu-admin-production.up.railway.app",
      ],
    },
  },
};

export default nextConfig;

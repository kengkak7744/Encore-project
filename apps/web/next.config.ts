import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const server = process.env.SERVER_ORIGIN || "http://localhost:4000";
    return [{ source: "/api/:path*", destination: `${server}/api/:path*` }];
  },
};

export default nextConfig;

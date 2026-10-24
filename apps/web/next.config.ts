import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["iconoir-react"],
  },
  images: {
    qualities: [75, 90],
  },
  reactStrictMode: true,
  transpilePackages: ["@goal-app/config", "@goal-app/design-tokens"],
};

export default nextConfig;

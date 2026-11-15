import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,
  // Only bundle the icons actually used instead of the whole lucide barrel.
  experimental: { optimizePackageImports: ["lucide-react"] },
};
export default nextConfig;

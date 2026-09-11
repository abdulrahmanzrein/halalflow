import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // Cost/compare merged into the dashboard. /sharia was removed; Ask HalalFlow is the remaining guidance surface.
    return [
      { source: "/cost", destination: "/dashboard", permanent: true },
      { source: "/compare", destination: "/dashboard", permanent: true },
      { source: "/sharia", destination: "/ask", permanent: true },
    ];
  },
};

export default nextConfig;

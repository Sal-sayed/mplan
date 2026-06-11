import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the on-screen dev route indicator (the "Rendering…" badge). Cosmetic
  // only — Next.js still surfaces real build/runtime errors.
  devIndicators: false,
};

export default nextConfig;

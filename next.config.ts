import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfmake reads its bundled fonts at runtime; load it from node_modules instead of bundling it.
  serverExternalPackages: ["pdfmake"],
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["1c80-103-211-18-78.ngrok-free.app"],
  basePath: "/toolbox",
  images: { unoptimized: true },
  output: "export",
  reactCompiler: true,
};

export default nextConfig;

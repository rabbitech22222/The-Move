import type { NextConfig } from "next";
const config: NextConfig = {
  experimental: { cpus: 2 },
  outputFileTracingExcludes: {
    "/*": [
      "./.move-data/**/*",
      "./.move-runtime/**/*",
      "./.env*",
      "./tests/**/*",
    ],
  },
  poweredByHeader: false,
};
export default config;

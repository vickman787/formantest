import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Generated customer websites are served as static files from /previews,
  // never executed inside the app origin. Keep the app itself strict.
  async headers() {
    return [
      {
        source: "/previews/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "sandbox allow-scripts" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;

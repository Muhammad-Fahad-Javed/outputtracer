/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
  // Every page requires an authenticated Supabase session,
  // so static pre-rendering at build time will always fail.
  // This tells Next.js to skip static generation for all pages.
  experimental: {
    // fallback to dynamic rendering when static generation fails
  },
};

import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
});

export default withSerwist(nextConfig);

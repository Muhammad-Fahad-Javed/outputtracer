import type { NextConfig } from "next";

// Version-skew protection.
//
// Every deployment should build with a unique NEXT_DEPLOYMENT_ID (the release
// tag or git SHA). Next then tags static asset URLs with ?dpl=<id> and sends
// the id on client navigations; a browser still running the previous release
// gets a hard navigation instead of calling Server Actions or chunks that no
// longer exist on the server.
const deploymentId =
  process.env.NEXT_DEPLOYMENT_ID || process.env.DEPLOYMENT_ID || undefined;

const nextConfig: NextConfig = {
  deploymentId,
  turbopack: {
    resolveAlias: {
      "monaco-editor/esm/vs/editor/editor.api.js": "monaco-editor/editor/editor.api.js",
    },
  },
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "monaco-editor/esm/vs/editor/editor.api.js": "monaco-editor/editor/editor.api.js",
    };
    return config;
  },
};

export default nextConfig;

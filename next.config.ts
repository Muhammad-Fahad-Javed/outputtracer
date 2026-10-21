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

// Build output directory.
//
// The default is ".next", which is what the running server serves. Setting
// NEXT_DIST_DIR builds into a different directory instead, so a release can be
// compiled and verified while the live ".next" is left untouched. The
// production server must always run with the default, because the deploy
// script promotes the candidate by renaming it to ".next".
//
// Next.js derives the build cache from this directory too
// (cacheDir = <distDir>/cache), so a candidate build gets its own cache and
// cannot disturb the live build's cache or its .tsbuildinfo.
const rawDistDir = process.env.NEXT_DIST_DIR?.trim() || ".next";

if (
  rawDistDir.startsWith("/") ||
  rawDistDir.startsWith("..") ||
  rawDistDir === "public" ||
  rawDistDir.includes("\\")
) {
  throw new Error(
    `Invalid NEXT_DIST_DIR "${rawDistDir}". It must be a relative path inside the project.`
  );
}

const nextConfig: NextConfig = {
  deploymentId,
  distDir: rawDistDir,
  turbopack: {
    resolveAlias: {
      "monaco-editor/esm/vs/editor/editor.api.js": "monaco-editor/editor/editor.api.js",
    },
  },
  // Keep this in sync with the Turbopack alias above.
  //
  // Next.js 16 still ships a webpack fallback (`next build --webpack`), so
  // this function is live code and not dead weight. It also makes
  // `useBuildWorker` false in the build diagnostics, which is expected and
  // harmless for a Turbopack build.
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

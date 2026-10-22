import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    ".next/**",
    ".next-candidate/**",
    ".next.prev/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
    "scripts/**",
    "sandbox-worker/**",
    // Release artefacts: the tarball built off the host and the candidate
    // release it is unpacked into. These are compiled build output, not
    // source, and linting them produces thousands of meaningless errors.
    "release/**",
    "releases/**",
  ]),
]);

export default eslintConfig;

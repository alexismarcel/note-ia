import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The PDF route reads its fonts from disk at run time, which the build's
  // file tracing cannot see: listed here so they ship with the function.
  // Keys are picomatch globs, hence the escaped brackets.
  outputFileTracingIncludes: {
    "/api/notes/\\[id\\]/pdf": ["./src/lib/pdf/fonts/*"],
  },
};

export default nextConfig;

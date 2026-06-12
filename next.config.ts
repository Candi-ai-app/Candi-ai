import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The built-in form template (official FL DS-DE 160) is read from disk by
  // the /forms generation action; trace public/forms/** into that route's
  // function bundle so the file exists on Vercel (public/ assets are served
  // from the CDN but NOT bundled into serverless functions by default).
  outputFileTracingIncludes: {
    "/forms": ["./public/forms/**/*"],
  },
};

export default nextConfig;

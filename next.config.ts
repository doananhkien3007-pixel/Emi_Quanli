import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // The source app also targets Cloudflare Workers. Vercel/Node does not
  // provide the `cloudflare:workers` virtual module, so use a harmless stub
  // there; the Vercel UI stores data in the browser instead of calling D1.
  webpack(config, { webpack }) {
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /^cloudflare:workers$/,
        path.resolve(process.cwd(), "lib/vercel-cloudflare-workers.ts"),
      ),
    );
    return config;
  },
};

export default nextConfig;

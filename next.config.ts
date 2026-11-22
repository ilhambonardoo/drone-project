import type { NextConfig } from "next";

const getHostname = (url: string | undefined, fallback: string) => {
  if (!url) return fallback;

  try {
    return new URL(url).hostname;
  } catch {
    return fallback;
  }
};

const apiHostname = getHostname(
  process.env.DREAMPALM_API_URL,
  "api.dreampalm.id",
);
const supabaseHostname = getHostname(
  process.env.SUPABASE_STORAGE_URL,
  "ascfwobrlwaiumvfhzgj.supabase.co",
);

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: apiHostname,
        pathname: "/v1/mapir/captures/**",
      },
      {
        protocol: "https",
        hostname: supabaseHostname,
        pathname: "/storage/v1/object/public/snapshots/**",
      },
    ],
  },
};

export default nextConfig;

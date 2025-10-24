/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  async rewrites() {
    return [
      {
        source: "/.well-known/farcaster.json",
        destination: "/well-known/farcaster.json",
      },
    ];
  },
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  async redirects() {
    return [
      {
        source: "/.well-known/farcaster.json",
        destination: "/farcaster.json",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;

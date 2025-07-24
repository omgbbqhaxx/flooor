/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  basePath: "/flooor",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  distDir: "out",
};

export default nextConfig;

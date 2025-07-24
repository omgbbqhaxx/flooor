/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  distDir: "out",
  assetPrefix: "./", // ✅ kritik satır
};

export default nextConfig;

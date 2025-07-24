/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  assetPrefix: "./", // bu çok kritik
  distDir: "out", // export edilen dosyalar buraya
};

export default nextConfig;

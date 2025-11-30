/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  webpack: (config, { isServer, webpack }) => {
    // Ignore React Native modules that MetaMask SDK tries to import
    if (!isServer) {
      // Use IgnorePlugin to completely ignore the module
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^@react-native-async-storage\/async-storage$/,
        })
      );

      config.resolve.fallback = {
        ...config.resolve.fallback,
        "@react-native-async-storage/async-storage": false,
      };
    }
    return config;
  },
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const devHost = process.env.NEXT_PUBLIC_SOCKET_URL
  ? new URL(process.env.NEXT_PUBLIC_SOCKET_URL).hostname
  : undefined;

const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: [devHost, "localhost", "127.0.0.1"].filter(Boolean),
  webpack: (config, { dev }) => {
    if (dev) {
      // Avoid flaky filesystem cache pack files on Windows during local dev.
      config.cache = false;
    }

    return config;
  }
};

export default nextConfig;

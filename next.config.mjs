/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  basePath: '/score',
  experimental: {
    typedRoutes: false
  }
};

export default nextConfig;

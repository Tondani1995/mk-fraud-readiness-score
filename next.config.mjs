/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  basePath: '/score',
  experimental: {
    typedRoutes: false,
    outputFileTracingIncludes: {
      '/api/admin/orders/[orderReference]/generate-report': [
        './node_modules/@sparticuz/chromium/bin/**/*'
      ]
    }
  }
};

export default nextConfig;

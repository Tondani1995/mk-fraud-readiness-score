import { withWorkflow } from 'workflow/next';

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
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals ?? [];
      config.externals.push({
        '@sparticuz/chromium': 'commonjs @sparticuz/chromium',
        'puppeteer-core': 'commonjs puppeteer-core'
      });
    }
    return config;
  }
};

export default withWorkflow(nextConfig);

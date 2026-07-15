import workflowNext from 'workflow/next';

const { withWorkflow } = workflowNext;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return [
      {
        source: '/score/.well-known/workflow/:path*',
        destination: '/.well-known/workflow/:path*'
      }
    ];
  },
  experimental: {
    typedRoutes: false,
    outputFileTracingIncludes: {
      '/score/api/admin/orders/[orderReference]/generate-report': [
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

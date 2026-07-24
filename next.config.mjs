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
        './node_modules/@sparticuz/chromium/bin/**/*',
        './node_modules/@napi-rs/canvas/**/*'
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
      // V7 Checkpoint F blocker 7 (PDF navigation): pdfjs-dist optionally loads the native
      // @napi-rs/canvas addon (node_utils.js, guarded by `if (isNodeJS)`) to polyfill
      // DOMMatrix/Path2D and to back NodeCanvasFactory. Webpack cannot bundle a compiled .node
      // binary -- the same reason @sparticuz/chromium and puppeteer-core are already external
      // above -- so both packages must resolve through Node's own module loader at runtime
      // instead of being pulled into the webpack graph.
      config.externals.push(({ request }, callback) => {
        if (request === 'pdfjs-dist' || request.startsWith('pdfjs-dist/')
          || request === '@napi-rs/canvas' || request.startsWith('@napi-rs/canvas/')) {
          return callback(null, `commonjs ${request}`);
        }
        callback();
      });
    }
    return config;
  }
};

export default withWorkflow(nextConfig);

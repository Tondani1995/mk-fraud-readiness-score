import workflowNext from 'workflow/next';
import { withSentryConfig } from '@sentry/nextjs/config';

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
    // Both routes that render a premium PDF need the same three things on disk at runtime.
    // pdfjs-dist loads its worker by path from its own build directory, so tracing pdf.mjs alone
    // is not enough -- the automatic fulfilment worker failed with "Setting up fake worker failed:
    // Cannot find module .../pdf.worker.mjs" because the worker file was never traced, and the
    // route itself was not listed here at all even though it renders exactly the same report.
    outputFileTracingIncludes: {
      '/score/api/admin/orders/[orderReference]/generate-report': [
        './node_modules/@sparticuz/chromium/bin/**/*',
        './node_modules/@napi-rs/canvas/**/*',
        './node_modules/pdfjs-dist/legacy/build/**/*'
      ],
      '/score/api/internal/fulfilment-worker': [
        './node_modules/@sparticuz/chromium/bin/**/*',
        './node_modules/@napi-rs/canvas/**/*',
        './node_modules/pdfjs-dist/legacy/build/**/*'
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
        // pdfjs-dist ships ESM (pdf.mjs). Externalising it as `commonjs` made webpack emit
        // require('.../pdf.mjs'), which Node refuses with ERR_REQUIRE_ESM -- the call site already
        // uses `await import()`, but a commonjs external rewrites that back into a require. The
        // `import` external type keeps it a real dynamic import, which is what both Node and the
        // call site expect.
        if (request === 'pdfjs-dist' || request.startsWith('pdfjs-dist/')) {
          return callback(null, `import ${request}`);
        }
        // @napi-rs/canvas is a native CommonJS addon: it must stay a commonjs external.
        if (request === '@napi-rs/canvas' || request.startsWith('@napi-rs/canvas/')) {
          return callback(null, `commonjs ${request}`);
        }
        callback();
      });
    }
    return config;
  }
};

export default withSentryConfig(withWorkflow(nextConfig), {
  org: 'mk-fraud-insights',
  project: 'javascript-nextjs',
  silent: true,
  telemetry: false,
  sourcemaps: { disable: true }
});

import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Turbopack is the default in Next.js 16
  // Path aliases (@/*) are automatically read from tsconfig.json
  
  // Exclude server-only packages from client bundles
  // This works with both webpack and Turbopack
  // In Next.js 16, this has been moved from experimental.serverComponentsExternalPackages
  // Playwright is a huge package (hundreds of MB) - externalize it to speed up dev startup
  serverExternalPackages: ['pg', 'pg-native', 'playwright', 'playwright-core'],
  
  output: "standalone",

  // For webpack compatibility (if using --webpack flag)
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Exclude Node.js built-ins from client bundle
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        dns: false,
        child_process: false,
        dgram: false,
        crypto: false,
        stream: false,
        os: false,
        path: false,
        url: false,
        util: false,
        buffer: false,
        events: false,
        string_decoder: false,
        querystring: false,
        http: false,
        https: false,
        zlib: false,
        assert: false,
        constants: false,
        process: false,
      };
      
      // Exclude pg package from client bundle
      config.externals = config.externals || [];
      config.externals.push({
        pg: 'commonjs pg',
        'pg-native': 'commonjs pg-native',
      });
    }
    return config;
  },
  
  // Turbopack configuration
  // Set root explicitly to prevent Next.js from scanning parent directories
  // This fixes the "multiple lockfiles" warning and improves startup time
  // Using process.cwd() since we run npm run dev from the frontend directory
  turbopack: {
    root: process.cwd(),
  },
  
  // Security headers
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          // Content Security Policy - adjust based on your needs
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // 'unsafe-eval' needed for Next.js
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'", // 'unsafe-inline' needed for styled-components/emotion
              "img-src 'self' data: https:",
              "font-src 'self' data:",
              // Always allow localhost for local API
              // Allow localhost connections in development, https in production
              process.env.NODE_ENV === "development"
                ? "connect-src 'self' https: http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*"
                : "connect-src 'self' https: http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*",
              "frame-ancestors 'none'",
              // YouTube for video embeds (if needed)
              "frame-src 'self' https://www.youtube.com https://youtube.com",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;

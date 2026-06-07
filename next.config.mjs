/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // ── Content Security Policy ──
          // unsafe-inline/unsafe-eval are required by Next.js App Router hydration.
          // frame-ancestors 'none' prevents clickjacking.
          // Tighten script-src with nonces in a future hardening pass once
          // Next.js supports nonce-based CSP with App Router out of the box.
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Next.js inline scripts + Vercel Analytics
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com",
              // Tailwind inline styles + Google Fonts
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              // Google Fonts files
              "font-src 'self' https://fonts.gstatic.com data:",
              // Images: self, data URIs, Supabase storage
              "img-src 'self' data: blob: https://*.supabase.co",
              // API calls: Supabase REST + Realtime (wss)
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
              // PDF iframe: Supabase signed URLs
              "frame-src 'self' https://*.supabase.co",
              // Prevent page from being framed (clickjacking)
              "frame-ancestors 'none'",
              // Block Flash / Java / ActiveX
              "object-src 'none'",
              // Prevent base-tag injection
              "base-uri 'self'",
              // Only submit forms to same origin
              "form-action 'self'",
              // Force HTTPS for all sub-requests in production
              "upgrade-insecure-requests",
            ].join("; "),
          },

          // ── Other security headers ──
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

import type { NextConfig } from "next";

/**
 * The browser only ever talks to this origin and to Supabase (for auth).
 * Every third-party API (Anthropic, SerpAPI, Apollo, Hunter, Meta, Resend) is
 * called server-side, so none of them belong in connect-src.
 */
const supabaseHost = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");

const CSP = [
  "default-src 'self'",
  // Next's hydration bootstrap needs 'unsafe-inline'; dev also needs
  // 'unsafe-eval' for React Refresh.
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self'${supabaseHost ? ` ${supabaseHost} ${supabaseHost.replace("https://", "wss://")}` : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;

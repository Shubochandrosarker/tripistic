import type { NextConfig } from "next";

/**
 * Baseline security headers.
 *
 * Added in Phase 12 because the production smoke test found the application
 * serving none of them. They are cheap, they apply to every response, and
 * their absence never surfaces in a unit test — headers only exist on a real
 * HTTP response from a real build, which is exactly the gap a smoke test
 * exists to close.
 *
 * `Strict-Transport-Security` is deliberately NOT set here. It is a
 * commitment, not a header: once a browser has seen it, that host is
 * https-only for the whole `max-age`. Setting it from the application would
 * apply it to every hostname the app is reached by — including an operator's
 * custom domain, whose TLS this deployment does not control and may not have
 * issued yet. It belongs on the reverse proxy that terminates TLS and knows
 * which hosts are ready for it. See docs/RUNBOOK-PRODUCTION-SMOKE.md.
 */
const BASELINE_SECURITY_HEADERS = [
  // Stops a browser second-guessing a declared Content-Type, which is how an
  // uploaded file ends up executed as script.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Full URL to ourselves, origin only cross-site. Booking confirmation URLs
  // carry a `publicToken`; leaking one in a Referer hands a third party access
  // to that booking.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing in this app needs any of them.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      {
        // Everything except the embed widget.
        source: "/((?!embed).*)",
        headers: [
          ...BASELINE_SECURITY_HEADERS,
          // Clickjacking protection for the app itself, scoped away from
          // /embed on purpose: that route exists to be iframed on an
          // operator's own website, and a blanket DENY would silently break
          // every embedded booking widget in production. The smoke test
          // asserts the embed route stays framable so a future security sweep
          // cannot quietly reintroduce this.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
      {
        source: "/embed/:path*",
        // Baseline headers, and deliberately no framing restriction.
        headers: BASELINE_SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;

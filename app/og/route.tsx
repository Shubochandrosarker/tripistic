import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

import { SITE } from "@/lib/seo/site";

export const runtime = "nodejs";
export const revalidate = 86400;

const SIZE = { width: 1200, height: 630 };

/** Generates the Open Graph / Twitter card image for every public page. */
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const title = (params.get("title") ?? SITE.tagline).slice(0, 110);
  const eyebrow = (params.get("eyebrow") ?? SITE.name).slice(0, 42);

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #05080a 0%, #0b1512 55%, #04150e 100%)",
          padding: "72px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "14px",
              background: "#10b981",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "30px",
              fontWeight: 700,
              color: "#04150e",
            }}
          >
            T
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: "30px", fontWeight: 600, color: "#fafafa" }}>{SITE.name}</span>
            <span style={{ fontSize: "20px", color: "#10b981" }}>{eyebrow}</span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: title.length > 70 ? "58px" : "72px",
            fontWeight: 600,
            color: "#ffffff",
            lineHeight: 1.12,
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "24px", color: "rgba(250,250,250,0.62)" }}>
            AI Operating System for Tour Operators
          </span>
          <span style={{ fontSize: "24px", color: "rgba(250,250,250,0.62)" }}>
            {SITE.url.replace(/^https?:\/\//, "")}
          </span>
        </div>
      </div>
    ),
    SIZE,
  );
}

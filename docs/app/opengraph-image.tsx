import { ImageResponse } from "next/og";

export const alt = "conv3d documentation";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-static";

// Verbatim lines (emoji prefixes dropped) from `conv3d tsx-gen models -y`
// run against the 13 GLBs in public/models/conv3d-funnel.
const terminalLines = [
  "Starting TSX generation process...",
  "Generating .tsx files... (13/13) Sofa.glb",
  "GLB step completed",
];

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 64,
        background:
          "radial-gradient(ellipse 1100px 700px at 88% 12%, rgba(20,184,166,0.32), transparent 60%), radial-gradient(ellipse 900px 600px at 8% 92%, rgba(13,148,136,0.22), transparent 65%), linear-gradient(135deg, #0a1014 0%, #0d1418 55%, #131c22 100%)",
        color: "#e6f4f1",
        fontFamily: "Inter, Arial, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 18,
          fontSize: 30,
          fontWeight: 700,
          letterSpacing: 0,
        }}
      >
        <svg width="64" height="64" viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx="7" fill="#2dd4bf" />
          <g
            stroke="#0a1014"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          >
            <path d="M16 6 L25 11 L16 16 L7 11 Z" />
            <path d="M7 11 L7 21 L16 26 L16 16" />
            <path d="M25 11 L25 21 L16 26" />
          </g>
        </svg>
        conv3d docs
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div
          style={{
            fontSize: 68,
            fontWeight: 800,
            lineHeight: 1.04,
            letterSpacing: -1,
            color: "#e6f4f1",
          }}
        >
          Convert models into web-ready GLB assets.
        </div>
        <div
          style={{
            maxWidth: 1000,
            fontSize: 28,
            lineHeight: 1.25,
            color: "rgba(230,244,241,0.78)",
          }}
        >
          FBX, OBJ, and glTF to GLB plus React Three Fiber components - interactive or scripted.
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: "20px 26px",
          borderRadius: 14,
          border: "1px solid rgba(45,212,191,0.35)",
          background: "rgba(5,10,12,0.78)",
          fontSize: 24,
          color: "rgba(230,244,241,0.82)",
        }}
      >
        <div style={{ display: "flex", gap: 14 }}>
          <span style={{ color: "#2dd4bf" }}>$</span>
          <span style={{ color: "#e6f4f1" }}>conv3d tsx-gen models -y</span>
        </div>
        {terminalLines.map((line) => (
          <div key={line} style={{ display: "flex", paddingLeft: 30 }}>
            {line}
          </div>
        ))}
      </div>
    </div>,
    size,
  );
}

import { ImageResponse } from "next/og";

export const alt = "conv3d documentation";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-static";

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: "linear-gradient(135deg, #111827 0%, #19324d 52%, #f97316 100%)",
        color: "white",
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
        <div
          style={{
            width: 52,
            height: 52,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "2px solid rgba(255,255,255,0.72)",
            borderRadius: 14,
            background: "rgba(255,255,255,0.14)",
          }}
        >
          3D
        </div>
        conv3d docs
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.02, letterSpacing: 0 }}>
          Convert models into web-ready GLB assets.
        </div>
        <div
          style={{ maxWidth: 860, fontSize: 34, lineHeight: 1.25, color: "rgba(255,255,255,0.86)" }}
        >
          FBX, OBJ, and glTF to GLB plus React Three Fiber components - interactive or scripted.
        </div>
      </div>
      <div style={{ display: "flex", gap: 16, fontSize: 26, color: "rgba(255,255,255,0.82)" }}>
        <span>CLI</span>
        <span>/</span>
        <span>React Three Fiber</span>
        <span>/</span>
        <span>3D pipeline</span>
      </div>
    </div>,
    size,
  );
}

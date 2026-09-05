import { ImageResponse } from "next/og";

export const alt = "Crecy — Global rental operations, made clear.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#F8FAFC",
          color: "#111827",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            width: 1104,
            height: 534,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "76px 92px",
            borderRadius: 34,
            background: "#FFFFFF",
            border: "1px solid #E4E7EC",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", color: "#4F46E5" }}>
            <svg width="118" height="104" viewBox="0 0 50 44" fill="none">
              <g stroke="#4F46E5" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 38V23L15 18L20 22V38" />
                <path d="M17 38V12L25 6L33 12V38" />
                <path d="M31 38V20L38 16L42 19V38" />
                <path d="M12 38V27" opacity=".72" />
                <path d="M25 38V12" opacity=".72" />
                <path d="M36 38V24" opacity=".72" />
              </g>
            </svg>
            <div style={{ marginLeft: 28, fontSize: 112, fontWeight: 700, letterSpacing: -5 }}>
              Crecy
            </div>
          </div>
          <div style={{ marginTop: 46, fontSize: 42, fontWeight: 500 }}>
            Global rental operations, made clear.
          </div>
          <div style={{ marginTop: 18, fontSize: 25, color: "#667085" }}>
            Operator OS · Crecy Living · Crecy Owner
          </div>
        </div>
      </div>
    ),
    size,
  );
}

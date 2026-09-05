import { ImageResponse } from "next/og";
import { CRECY_PURPLE, CRECY_WORDMARK_PATH } from "@/components/brand/crecy-art";

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
          <svg width="420" height="135" viewBox="0 0 1790 574" aria-label="Crecy">
            <path d={CRECY_WORDMARK_PATH} fill={CRECY_PURPLE} fillRule="evenodd" clipRule="evenodd" />
          </svg>
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

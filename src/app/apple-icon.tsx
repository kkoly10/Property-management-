import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#4F46E5",
          borderRadius: 36,
        }}
      >
        <svg width="112" height="98" viewBox="0 0 50 44" fill="none">
          <g stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 38V23L15 18L20 22V38" />
            <path d="M17 38V12L25 6L33 12V38" />
            <path d="M31 38V20L38 16L42 19V38" />
            <path d="M12 38V27" opacity=".72" />
            <path d="M25 38V12" opacity=".72" />
            <path d="M36 38V24" opacity=".72" />
          </g>
        </svg>
      </div>
    ),
    size,
  );
}

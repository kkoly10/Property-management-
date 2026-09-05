import { ImageResponse } from "next/og";
import { CRECY_LIVING_GREEN, CRECY_MONOGRAM_PATH, CRECY_PURPLE } from "@/components/brand/crecy-art";

const ALLOWED_SIZES = new Set([16, 32, 48, 64, 180, 192, 512]);

export const runtime = "edge";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requested = Number(url.searchParams.get("size") ?? "32");
  const size = ALLOWED_SIZES.has(requested) ? requested : 32;
  const living = url.searchParams.get("surface") === "living";
  const background = living ? CRECY_LIVING_GREEN : CRECY_PURPLE;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background,
          borderRadius: Math.round(size * 0.178),
        }}
      >
        <svg width={size} height={size} viewBox="0 0 1070 1070">
          <path d={CRECY_MONOGRAM_PATH} fill="#fff" fillRule="evenodd" clipRule="evenodd" />
        </svg>
      </div>
    ),
    {
      width: size,
      height: size,
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    },
  );
}

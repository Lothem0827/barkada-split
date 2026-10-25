import { ImageResponse } from "next/og"

export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

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
          background: "#0f3d2e",
          color: "#fff8e7",
          fontFamily: "Georgia, serif",
        }}
      >
        <div
          style={{
            width: 980,
            height: 460,
            border: "8px solid #f4c14b",
            borderRadius: 28,
            padding: 48,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            background: "linear-gradient(160deg, #1a6b4a 0%, #0f3d2e 100%)",
          }}
        >
          <div style={{ fontSize: 36, letterSpacing: 6 }}>TALLY</div>
          <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.1 }}>Join the trip.</div>
          <div style={{ fontSize: 32 }}>Don't forget who owes what.</div>
        </div>
      </div>
    ),
    size
  )
}

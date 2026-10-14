import { ImageResponse } from "next/og";

export const alt = "Vain Wallet: be vain about your address";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  const mono = "ui-monospace, Menlo, monospace";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#fafafa",
          color: "#0a0a0a",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", fontFamily: mono, fontSize: 96 }}>
          <span style={{ color: "#c4c4c4" }}>0x</span>
          <span style={{ background: "#0a0a0a", color: "#fff", padding: "6px 26px", margin: "0 6px", borderRadius: 18, fontWeight: 700 }}>
            vain
          </span>
          <span style={{ color: "#d4d4d4" }}>····</span>
        </div>
        <div style={{ marginTop: 56, fontSize: 64, fontWeight: 600, letterSpacing: -2 }}>Be vain about your address.</div>
        <div style={{ marginTop: 18, fontSize: 30, color: "#6b6b6b" }}>getvain.lol</div>
      </div>
    ),
    size,
  );
}

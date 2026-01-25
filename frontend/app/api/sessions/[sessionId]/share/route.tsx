import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const imageOnly = searchParams.get("image") === "1";

    // For now, return a generic debate share image
    // In production, you would fetch session data from your API
    // const session = await getSessionData(sessionId);
    
    if (imageOnly) {
      // Generate OG image (1200x630)
      return new ImageResponse(
        (
          <div
            style={{
              height: "100%",
              width: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#161C2A",
              backgroundImage: "radial-gradient(circle at top, rgba(242,194,79,0.12), transparent 60%)",
              padding: "60px",
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "16px",
                marginBottom: "40px",
              }}
            >
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "16px",
                  background: "linear-gradient(135deg, rgba(242,194,79,0.18), rgba(16,24,38,0.9))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#F2C24F",
                  fontSize: "24px",
                  fontWeight: "600",
                  border: "1px solid rgba(242,194,79,0.35)",
                }}
              >
                💬
              </div>
              <div
                style={{
                  fontSize: "32px",
                  fontWeight: "600",
                  color: "#FFFFFF",
                }}
              >
                AI Debate Result
              </div>
            </div>

            {/* Description */}
            <div
              style={{
                fontSize: "20px",
                color: "rgba(255,255,255,0.85)",
                textAlign: "center",
                maxWidth: "900px",
                lineHeight: "1.5",
                marginBottom: "40px",
              }}
            >
              Multi-agent debate powered by Crucible
            </div>

            {/* Footer */}
            <div
              style={{
                marginTop: "60px",
                fontSize: "16px",
                color: "rgba(255,255,255,0.5)",
                textTransform: "uppercase",
                letterSpacing: "0.24em",
              }}
            >
              Powered by Crucible
            </div>
          </div>
        ),
        {
          width: 1200,
          height: 630,
        }
      );
    }

    // Return JSON share data
    // In production, fetch actual session data
    return Response.json({
      sessionId,
      shareUrl: `${request.nextUrl.origin}/app/sessions/${sessionId}/output`,
      title: "AI Debate Result",
      description: "Multi-agent debate powered by Crucible",
      imageUrl: `${request.nextUrl.origin}/api/sessions/${sessionId}/share?image=1`,
    });
  } catch (error) {
    console.error("Error generating debate share:", error);
    return new Response("Failed to generate share data", { status: 500 });
  }
}


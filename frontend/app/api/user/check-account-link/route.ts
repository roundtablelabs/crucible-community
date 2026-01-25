import { NextRequest, NextResponse } from "next/server";
import { auth, getAuthPool } from "@/auth";
import { createRoundtableAuthAdapter } from "@/lib/auth/adapter";

// Check if a provider account can be linked to the current user
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const provider = searchParams.get("provider");

    if (!provider) {
      return NextResponse.json({ error: "Provider parameter is required" }, { status: 400 });
    }

    const pool = getAuthPool();
    const adapter = createRoundtableAuthAdapter(pool);

    // Check if user already has this provider linked
    const userAccounts = await pool.query<{ provider: string }>(
      `SELECT provider FROM user_accounts WHERE user_id = $1 AND provider = $2`,
      [session.user.id, provider]
    );

    if (userAccounts.rows.length > 0) {
      return NextResponse.json({ 
        canLink: false, 
        reason: "already_linked",
        message: "This provider is already linked to your account" 
      });
    }

    // Account is available to link
    return NextResponse.json({ 
      canLink: true,
      message: "This provider can be linked" 
    });
  } catch (error) {
    console.error("[check-account-link] Error:", error);
    return NextResponse.json(
      { error: "Failed to check account link status" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { shareStore } from "@/lib/share/store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Validate ID format — must be 32 hex chars
  if (!/^[0-9a-f]{32}$/.test(id)) {
    return NextResponse.json(
      { error: "Invalid share ID.", code: "INVALID_ID" },
      { status: 400 },
    );
  }

  const payload = shareStore.get(id);
  if (!payload) {
    return NextResponse.json(
      { error: "Share not found or has expired.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  return NextResponse.json(payload);
}

import { NextRequest, NextResponse } from "next/server";
import { detectMode } from "@/lib/mode-detector";

export async function POST(req: NextRequest) {
  try {
    const { scrapeData, scoreData } = await req.json();
    const result = detectMode(scrapeData, scoreData);
    return NextResponse.json({ success: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Detection failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

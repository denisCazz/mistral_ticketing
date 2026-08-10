import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDashboardData } from "@/lib/dashboard-queries";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const data = await getDashboardData(session);
    return NextResponse.json(data);
  } catch (error) {
    console.error("[dashboard]", error);
    return NextResponse.json(
      { error: "Impossibile caricare la dashboard" },
      { status: 500 }
    );
  }
}

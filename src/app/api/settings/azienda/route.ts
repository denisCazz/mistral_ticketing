import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let settings = await prisma.aziendaSettings.findUnique({ where: { id: "default" } });
  if (!settings) {
    settings = await prisma.aziendaSettings.create({
      data: { id: "default", nomeAzienda: "Mistral Impianti" },
    });
  }

  return NextResponse.json(settings);
}

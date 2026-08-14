import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canManageMagazzino } from "@/lib/access";
import { prisma } from "@/lib/db";
import { serializeArticolo } from "@/lib/magazzino";
import { z } from "zod";

const updateSchema = z.object({
  codice: z.string().trim().min(1).max(64).optional(),
  ean: z
    .string()
    .trim()
    .regex(/^\d{8}$|^\d{12,14}$/, "EAN non valido")
    .optional()
    .nullable()
    .or(z.literal("")),
  nome: z.string().trim().min(1).max(200).optional(),
  descrizione: z.string().trim().max(2000).optional().nullable().or(z.literal("")),
  unitaMisura: z.string().trim().min(1).max(20).optional(),
  sogliaMinima: z.coerce.number().min(0).optional(),
  ubicazione: z.string().trim().max(120).optional().nullable().or(z.literal("")),
  attivo: z.boolean().optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const articolo = await prisma.articolo.findUnique({
    where: { id },
    include: {
      movimenti: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          user: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!articolo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    ...serializeArticolo(articolo),
    movimenti: articolo.movimenti.map((m) => ({
      ...m,
      quantita: Number(m.quantita),
    })),
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageMagazzino(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const d = parsed.data;
  try {
    const articolo = await prisma.articolo.update({
      where: { id },
      data: {
        ...(d.codice !== undefined ? { codice: d.codice.trim() } : {}),
        ...(d.ean !== undefined ? { ean: d.ean?.trim() || null } : {}),
        ...(d.nome !== undefined ? { nome: d.nome.trim() } : {}),
        ...(d.descrizione !== undefined
          ? { descrizione: d.descrizione?.trim() || null }
          : {}),
        ...(d.unitaMisura !== undefined ? { unitaMisura: d.unitaMisura } : {}),
        ...(d.sogliaMinima !== undefined ? { sogliaMinima: d.sogliaMinima } : {}),
        ...(d.ubicazione !== undefined
          ? { ubicazione: d.ubicazione?.trim() || null }
          : {}),
        ...(d.attivo !== undefined ? { attivo: d.attivo } : {}),
      },
    });
    return NextResponse.json(serializeArticolo(articolo));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Unique constraint") || message.includes("unique")) {
      return NextResponse.json(
        { error: "Codice o EAN già presente in magazzino" },
        { status: 409 }
      );
    }
    if (message.includes("Record to update not found")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw err;
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageMagazzino(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  // Soft-delete: disattiva invece di cancellare lo storico
  const articolo = await prisma.articolo.update({
    where: { id },
    data: { attivo: false },
  });

  return NextResponse.json(serializeArticolo(articolo));
}

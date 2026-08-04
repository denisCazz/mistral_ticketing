import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  ensureCategorieDipendente,
  serializeTariffe,
} from "@/lib/dipendente-user";

function parseMoney(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100) / 100;
}

async function requireAdmin() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

async function listCategorie() {
  await ensureCategorieDipendente();
  const categorie = await prisma.categoriaDipendente.findMany({
    orderBy: [{ sistema: "desc" }, { nome: "asc" }],
  });
  return categorie.map((categoria) => ({
    id: categoria.id,
    nome: categoria.nome,
    sistema: categoria.sistema,
    ...serializeTariffe(categoria),
  }));
}

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json({ categorie: await listCategorie() });
}

export async function PUT(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await req.json();
  const id = String(body.id ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "Categoria obbligatoria" }, { status: 400 });
  }
  const existing = await prisma.categoriaDipendente.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Categoria non trovata" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};

  for (const key of [
    "costoGiornata",
    "indennitaTrasferta",
    "costoMutua",
    "costoPermesso",
    "costoFerie",
    "costoFestivo",
  ] as const) {
    const parsed = parseMoney(body[key]);
    if (parsed === undefined) {
      return NextResponse.json(
        { error: `Valore non valido per ${key}` },
        { status: 400 }
      );
    }
    data[key] = parsed;
  }

  if (!existing.sistema && typeof body.nome === "string" && body.nome.trim()) {
    Object.assign(data, { nome: body.nome.trim() });
  }

  const categoria = await prisma.categoriaDipendente.update({
    where: { id },
    data,
  });

  return NextResponse.json({
    categoria: {
      id: categoria.id,
      nome: categoria.nome,
      sistema: categoria.sistema,
      ...serializeTariffe(categoria),
    },
  });
}

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await req.json();
  const nome = String(body.nome ?? "").trim();
  if (!nome) {
    return NextResponse.json({ error: "Nome categoria obbligatorio" }, { status: 400 });
  }

  await ensureCategorieDipendente();
  const modello = await prisma.categoriaDipendente.findUniqueOrThrow({
    where: { id: "manutentore" },
  });
  try {
    const categoria = await prisma.categoriaDipendente.create({
      data: { nome, ...serializeTariffe(modello) },
    });
    return NextResponse.json(
      {
        categoria: {
          id: categoria.id,
          nome: categoria.nome,
          sistema: categoria.sistema,
          ...serializeTariffe(categoria),
        },
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: "Categoria già esistente" }, { status: 409 });
  }
}

export async function DELETE(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await req.json();
  const id = String(body.id ?? "").trim();
  const categoria = await prisma.categoriaDipendente.findUnique({
    where: { id },
    include: { _count: { select: { dipendenti: true } } },
  });
  if (!categoria) {
    return NextResponse.json({ error: "Categoria non trovata" }, { status: 404 });
  }
  if (categoria.sistema || categoria._count.dipendenti > 0) {
    return NextResponse.json(
      {
        error: categoria.sistema
          ? "Le categorie base non possono essere eliminate"
          : "Categoria assegnata a uno o più dipendenti",
      },
      { status: 409 }
    );
  }
  await prisma.categoriaDipendente.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

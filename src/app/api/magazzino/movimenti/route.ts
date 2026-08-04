import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { serializeArticolo, toNum } from "@/lib/magazzino";
import { z } from "zod";

const movimentoSchema = z.object({
  articoloId: z.string().min(1),
  tipo: z.enum(["ENTRATA", "USCITA", "RETTIFICA"]),
  quantita: z.coerce.number().positive("Quantità deve essere > 0"),
  note: z.string().trim().max(500).optional().nullable().or(z.literal("")),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = movimentoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { articoloId, tipo, quantita, note } = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const articolo = await tx.articolo.findUnique({ where: { id: articoloId } });
      if (!articolo || !articolo.attivo) {
        throw new Error("ARTICOLO_NOT_FOUND");
      }

      const attuale = toNum(articolo.quantita);
      let nuova = attuale;

      if (tipo === "ENTRATA") {
        nuova = attuale + quantita;
      } else if (tipo === "USCITA") {
        if (quantita > attuale) {
          throw new Error("STOCK_INSUFFICIENTE");
        }
        nuova = attuale - quantita;
      } else {
        // RETTIFICA: quantita = nuova giacenza assoluta
        nuova = quantita;
      }

      const updated = await tx.articolo.update({
        where: { id: articoloId },
        data: { quantita: nuova },
      });

      const movimento = await tx.movimentoMagazzino.create({
        data: {
          articoloId,
          tipo,
          quantita: tipo === "RETTIFICA" ? nuova : quantita,
          note: note?.trim() || null,
          userId: session.user!.id,
        },
        include: {
          user: { select: { id: true, name: true } },
        },
      });

      return { articolo: updated, movimento };
    });

    return NextResponse.json({
      articolo: serializeArticolo(result.articolo),
      movimento: {
        ...result.movimento,
        quantita: Number(result.movimento.quantita),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "ARTICOLO_NOT_FOUND") {
      return NextResponse.json({ error: "Articolo non trovato" }, { status: 404 });
    }
    if (message === "STOCK_INSUFFICIENTE") {
      return NextResponse.json(
        { error: "Giacenza insufficiente per l'uscita" },
        { status: 409 }
      );
    }
    throw err;
  }
}

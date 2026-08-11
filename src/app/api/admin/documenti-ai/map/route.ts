import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getDocumentSimilarityGraph } from "@/lib/document-similarity";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

const querySchema = z.object({
  search: z.string().trim().max(200).optional(),
  categories: z.array(z.string().trim().min(1)).max(30).optional(),
  status: z
    .enum(["PENDING", "INDEXING", "READY", "FAILED"])
    .optional(),
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
  minSimilarity: z.coerce.number().min(0).max(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = new URL(req.url).searchParams;
  const categories = params
    .get("categories")
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const parsed = querySchema.safeParse({
    search: params.get("search") || undefined,
    categories: categories?.length ? categories : undefined,
    status: params.get("status") || undefined,
    dateFrom: params.get("dateFrom") || undefined,
    dateTo: params.get("dateTo") || undefined,
    minSimilarity: params.get("minSimilarity") || undefined,
    limit: params.get("limit") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Filtri non validi",
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const graph = await getDocumentSimilarityGraph(parsed.data);
  return NextResponse.json(graph);
}

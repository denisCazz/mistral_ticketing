import { prisma } from "@/lib/db";
import { CatClient } from "./cat-client";

export default async function CatPage() {
  const cat = await prisma.cat.findMany({
    orderBy: { ragioneSociale: "asc" },
    include: { _count: { select: { pratiche: true } } },
  });

  return <CatClient initialCat={cat} />;
}

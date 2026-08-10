import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listPreventivi } from "@/lib/preventivi-queries";
import { PreventiviView } from "./preventivi-view";

type SearchParams = Promise<{
  search?: string;
  page?: string;
  stato?: string;
}>;

export default async function PreventiviPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const params = await searchParams;
  const search = params.search ?? "";
  const stato = params.stato ?? "";
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const { preventivi, totalPages } = await listPreventivi(session, {
    search,
    stato,
    page,
  });

  const serialized = preventivi.map((p) => ({
    id: p.id,
    numeroPreventivo: p.numeroPreventivo,
    stato: p.stato,
    totaleFinale:
      p.totaleFinale == null ? null : Number(p.totaleFinale).toString(),
    cliente: p.cliente,
    operatore: p.operatore,
  }));

  return (
    <PreventiviView
      preventivi={serialized}
      totalPages={totalPages}
      page={page}
      stato={stato}
      search={search}
    />
  );
}

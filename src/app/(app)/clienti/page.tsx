import { listClienti } from "@/lib/clienti-queries";
import { ClientiView } from "./clienti-view";

type SearchParams = Promise<{ search?: string; page?: string }>;

export default async function ClientiPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const search = params.search ?? "";
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const { clienti, total, totalPages } = await listClienti({ search, page });

  const serialized = clienti.map((c) => ({
    id: c.id,
    ragioneSociale: c.ragioneSociale,
    citta: c.citta,
    provincia: c.provincia,
    cellulare: c.cellulare,
    telFisso: c.telFisso,
    email: c.email,
    indirizzo: c.indirizzo,
    cap: c.cap,
    note1: c.note1,
    note2: c.note2,
    note3: c.note3,
    _count: c._count,
  }));

  return (
    <ClientiView
      clienti={serialized}
      total={total}
      totalPages={totalPages}
      page={page}
      search={search}
    />
  );
}

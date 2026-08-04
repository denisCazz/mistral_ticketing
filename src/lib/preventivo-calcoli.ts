export interface PreventivoRigaInput {
  descrizione: string;
  quantita: number;
  prezzoUnitario: number;
  scontoPercentuale?: number;
  aliquotaIva?: number;
}

export interface PreventivoTotali {
  totaleImponibile: number;
  totaleIva: number;
  totaleFinale: number;
  righe: Array<{
    imponibile: number;
    iva: number;
    totale: number;
  }>;
}

export function calcolaRiga(riga: PreventivoRigaInput) {
  const quantita = Number(riga.quantita) || 0;
  const prezzo = Number(riga.prezzoUnitario) || 0;
  const sconto = Number(riga.scontoPercentuale ?? 0);
  const aliquota = Number(riga.aliquotaIva ?? 22);

  const lordo = quantita * prezzo;
  const imponibile = lordo * (1 - sconto / 100);
  const iva = imponibile * (aliquota / 100);
  const totale = imponibile + iva;

  return { imponibile, iva, totale };
}

export function calcolaTotaliPreventivo(
  righe: PreventivoRigaInput[]
): PreventivoTotali {
  const dettaglio = righe.map((r) => calcolaRiga(r));
  const totaleImponibile = dettaglio.reduce((s, r) => s + r.imponibile, 0);
  const totaleIva = dettaglio.reduce((s, r) => s + r.iva, 0);
  const totaleFinale = dettaglio.reduce((s, r) => s + r.totale, 0);

  return {
    totaleImponibile: round2(totaleImponibile),
    totaleIva: round2(totaleIva),
    totaleFinale: round2(totaleFinale),
    righe: dettaglio.map((r) => ({
      imponibile: round2(r.imponibile),
      iva: round2(r.iva),
      totale: round2(r.totale),
    })),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

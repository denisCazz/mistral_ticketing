import { jsPDF } from "jspdf";

export interface PreventivoPdfData {
  azienda: {
    nomeAzienda: string;
    indirizzo?: string | null;
    partitaIva?: string | null;
    telefono?: string | null;
    email?: string | null;
  };
  preventivo: {
    numeroPreventivo: string;
    introduzione?: string | null;
    condizioni?: string | null;
    validoFino?: string | null;
    totaleImponibile?: number | null;
    totaleIva?: number | null;
    totaleFinale?: number | null;
  };
  cliente: {
    ragioneSociale: string;
    indirizzo?: string | null;
    cap?: string | null;
    citta?: string | null;
    provincia?: string | null;
    email?: string | null;
    cellulare?: string | null;
  };
  righe: Array<{
    descrizione: string;
    quantita: number;
    prezzoUnitario: number;
    scontoPercentuale: number;
    aliquotaIva: number;
    imponibile: number;
    totale: number;
  }>;
}

export function generatePreventivoPdf(data: PreventivoPdfData): Buffer {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 15;
  let y = margin;

  doc.setFontSize(16);
  doc.text(data.azienda.nomeAzienda, margin, y);
  y += 8;

  doc.setFontSize(10);
  if (data.azienda.indirizzo) doc.text(data.azienda.indirizzo, margin, y);
  y += 5;
  if (data.azienda.partitaIva)
    doc.text(`P.IVA: ${data.azienda.partitaIva}`, margin, y);
  y += 10;

  doc.setFontSize(14);
  doc.text(`Preventivo ${data.preventivo.numeroPreventivo}`, margin, y);
  y += 8;

  doc.setFontSize(10);
  doc.text(`Cliente: ${data.cliente.ragioneSociale}`, margin, y);
  y += 5;
  const addr = [
    data.cliente.indirizzo,
    data.cliente.cap,
    data.cliente.citta,
    data.cliente.provincia,
  ]
    .filter(Boolean)
    .join(" ");
  if (addr) {
    doc.text(addr, margin, y);
    y += 5;
  }

  if (data.preventivo.validoFino) {
    doc.text(`Valido fino: ${data.preventivo.validoFino}`, margin, y);
    y += 8;
  }

  if (data.preventivo.introduzione) {
    const lines = doc.splitTextToSize(data.preventivo.introduzione, 180);
    doc.text(lines, margin, y);
    y += lines.length * 5 + 4;
  }

  doc.setFontSize(9);
  doc.text("Descrizione", margin, y);
  doc.text("Qty", 120, y);
  doc.text("Prezzo", 135, y);
  doc.text("Tot.", 165, y);
  y += 4;
  doc.line(margin, y, 195, y);
  y += 4;

  for (const riga of data.righe) {
    if (y > 270) {
      doc.addPage();
      y = margin;
    }
    const descLines = doc.splitTextToSize(riga.descrizione, 100);
    doc.text(descLines, margin, y);
    doc.text(String(riga.quantita), 120, y);
    doc.text(riga.prezzoUnitario.toFixed(2), 135, y);
    doc.text(riga.totale.toFixed(2), 165, y);
    y += Math.max(descLines.length * 4, 6);
  }

  y += 6;
  doc.text(
    `Imponibile: € ${Number(data.preventivo.totaleImponibile ?? 0).toFixed(2)}`,
    margin,
    y
  );
  y += 5;
  doc.text(
    `IVA: € ${Number(data.preventivo.totaleIva ?? 0).toFixed(2)}`,
    margin,
    y
  );
  y += 5;
  doc.setFontSize(11);
  doc.text(
    `Totale: € ${Number(data.preventivo.totaleFinale ?? 0).toFixed(2)}`,
    margin,
    y
  );

  if (data.preventivo.condizioni) {
    y += 10;
    doc.setFontSize(9);
    const cond = doc.splitTextToSize(data.preventivo.condizioni, 180);
    doc.text(cond, margin, y);
  }

  return Buffer.from(doc.output("arraybuffer"));
}

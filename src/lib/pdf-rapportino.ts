import { format } from "date-fns";
import { it } from "date-fns/locale";
import type { AziendaSettingsDTO, RapportinoDTO } from "@/types/rapportino";
import {
  formatSettore,
  formatSiNoNc,
  formatTipoImpianto,
  formatTipologiaIntervento,
  formatUbicazione,
  getControlloFields,
  TIPOLOGIA_INTERVENTO_LABELS,
  type Settore,
} from "@/lib/rapportino-constants";

function safe(value: string | null | undefined, fallback = "—") {
  const v = (value || "").trim();
  return v || fallback;
}

function clienteLabel(r: RapportinoDTO) {
  const c = r.cliente;
  if (!c) return "Cliente";
  if (c.ragioneSociale?.trim()) return c.ragioneSociale;
  return [c.nome, c.cognome].filter(Boolean).join(" ") || "Cliente";
}

/** Genera e scarica il PDF del rapportino (client-side). */
export async function downloadRapportinoPDF(
  rapportino: RapportinoDTO,
  settings: AziendaSettingsDTO
) {
  const jsPDFModule = await import("jspdf");
  const jsPDF = jsPDFModule.default;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const brand = settings.nomeAzienda || "Mistral Impianti";
  let y = 16;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(brand, 14, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text("Rapportino di intervento", 14, y);
  y += 8;
  doc.setDrawColor(200);
  doc.line(14, y, 196, y);
  y += 10;
  doc.setTextColor(0);

  const dataInt = rapportino.dataIntervento
    ? format(new Date(rapportino.dataIntervento), "dd MMMM yyyy", { locale: it })
    : "—";

  const rows: Array<[string, string]> = [
    ["Cliente", clienteLabel(rapportino)],
    [
      "Indirizzo",
      [rapportino.cliente?.indirizzo, rapportino.cliente?.cap, rapportino.cliente?.citta]
        .filter(Boolean)
        .join(", ") || "—",
    ],
    ["Telefono", safe(rapportino.cliente?.cellulare || rapportino.cliente?.telFisso)],
    ["Data intervento", `${dataInt}${rapportino.oraIntervento ? ` · ${rapportino.oraIntervento}` : ""}`],
    ["Operatore", safe(rapportino.utente?.name)],
    ["Settore", formatSettore(rapportino.settore)],
    ["Tipo impianto", formatTipoImpianto(rapportino.tipoImpianto)],
    [
      "Tipologia",
      rapportino.tipologiaIntervento &&
      rapportino.tipologiaIntervento in TIPOLOGIA_INTERVENTO_LABELS
        ? formatTipologiaIntervento(rapportino.tipologiaIntervento as never)
        : safe(rapportino.tipologiaIntervento),
    ],
    ["Marca / Modello", `${safe(rapportino.marca)} / ${safe(rapportino.modello)}`],
    ["N° serie", safe(rapportino.numeroSerie)],
    ["Ubicazione", formatUbicazione(rapportino.ubicazione)],
    ["Tipo intervento", safe(rapportino.tipoIntervento)],
    ["Motivo chiamata", safe(rapportino.motivoChiamata)],
    ["Codice anomalia", safe(rapportino.codiceErrore)],
  ];

  doc.setFontSize(11);
  for (const [label, value] of rows) {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, 14, y);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(value, 130);
    doc.text(lines, 55, y);
    y += Math.max(7, lines.length * 5 + 2);
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
  }

  y += 2;
  doc.setFont("helvetica", "bold");
  doc.text("Descrizione intervento", 14, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  const desc = doc.splitTextToSize(safe(rapportino.descrizione), 182);
  doc.text(desc, 14, y);
  y += desc.length * 5 + 6;

  const settore = (
    rapportino.settore === "elettrico" ? "elettrico" : "antincendio"
  ) as Settore;
  const checks = getControlloFields(settore).map((field) => [
    field.label,
    formatSiNoNc(rapportino[field.key] as never),
  ]);

  if (y > 240) {
    doc.addPage();
    y = 20;
  }

  doc.setFont("helvetica", "bold");
  doc.text("Controlli conformità", 14, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  for (const [label, value] of checks) {
    const lines = doc.splitTextToSize(`${label}: ${value || "—"}`, 182);
    doc.text(lines, 14, y);
    y += lines.length * 5 + 1;
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
  }

  if (rapportino.materialiUtilizzati?.trim()) {
    y += 2;
    doc.setFont("helvetica", "bold");
    doc.text("Materiali utilizzati", 14, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    const mat = doc.splitTextToSize(rapportino.materialiUtilizzati, 182);
    doc.text(mat, 14, y);
    y += mat.length * 5 + 4;
  }

  if (rapportino.note?.trim()) {
    doc.setFont("helvetica", "bold");
    doc.text("Note", 14, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    const notes = doc.splitTextToSize(rapportino.note, 182);
    doc.text(notes, 14, y);
    y += notes.length * 5 + 6;
  }

  y = Math.max(y + 8, 250);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Generato da ${brand} · ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 287);

  const filename = `rapportino-${clienteLabel(rapportino).replace(/\s+/g, "-").toLowerCase()}-${rapportino.dataIntervento}.pdf`;
  doc.save(filename);
}

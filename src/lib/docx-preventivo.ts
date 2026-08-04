import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  type FileChild,
} from "docx";

export interface PreventivoDocxData {
  numeroPreventivo: string;
  cliente: string;
  introduzione?: string | null;
  condizioni?: string | null;
  validoFino?: string | null;
  righe: Array<{
    descrizione: string;
    quantita: number;
    prezzoUnitario: number;
    totale: number;
  }>;
  totaleFinale?: number | null;
}

export async function generatePreventivoDocx(
  data: PreventivoDocxData
): Promise<Buffer> {
  const children: FileChild[] = [
    new Paragraph({
      children: [
        new TextRun({
          text: `Preventivo ${data.numeroPreventivo}`,
          bold: true,
          size: 32,
        }),
      ],
    }),
    new Paragraph({ text: `Cliente: ${data.cliente}` }),
  ];

  if (data.validoFino) {
    children.push(new Paragraph({ text: `Valido fino: ${data.validoFino}` }));
  }
  if (data.introduzione) {
    children.push(new Paragraph({ text: data.introduzione }));
  }

  const tableRows = [
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph("Descrizione")] }),
        new TableCell({ children: [new Paragraph("Qty")] }),
        new TableCell({ children: [new Paragraph("Prezzo")] }),
        new TableCell({ children: [new Paragraph("Totale")] }),
      ],
    }),
    ...data.righe.map(
      (r) =>
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph(r.descrizione)] }),
            new TableCell({
              children: [new Paragraph(String(r.quantita))],
            }),
            new TableCell({
              children: [new Paragraph(r.prezzoUnitario.toFixed(2))],
            }),
            new TableCell({
              children: [new Paragraph(r.totale.toFixed(2))],
            }),
          ],
        })
    ),
  ];

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: tableRows,
    })
  );

  if (data.totaleFinale != null) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Totale: € ${data.totaleFinale.toFixed(2)}`,
            bold: true,
          }),
        ],
      })
    );
  }

  if (data.condizioni) {
    children.push(new Paragraph({ text: data.condizioni }));
  }

  const doc = new Document({ sections: [{ children }] });
  return Buffer.from(await Packer.toBuffer(doc));
}

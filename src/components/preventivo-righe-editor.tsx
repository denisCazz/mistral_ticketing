"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  calcolaTotaliPreventivo,
  type PreventivoRigaInput,
} from "@/lib/preventivo-calcoli";

export type PreventivoRigaForm = PreventivoRigaInput & {
  id?: string;
  scontoPercentuale: number;
  aliquotaIva: number;
};

const EMPTY_RIGA: PreventivoRigaForm = {
  descrizione: "",
  quantita: 1,
  prezzoUnitario: 0,
  scontoPercentuale: 0,
  aliquotaIva: 22,
};

function euro(n: number) {
  return n.toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
  });
}

interface Props {
  righe: PreventivoRigaForm[];
  onChange: (righe: PreventivoRigaForm[]) => void;
}

export function PreventivoRigheEditor({ righe, onChange }: Props) {
  const totali = calcolaTotaliPreventivo(righe);
  const prezziMancanti = righe.some(
    (r) => r.descrizione.trim() && (!r.prezzoUnitario || r.prezzoUnitario <= 0)
  );

  function update(i: number, patch: Partial<PreventivoRigaForm>) {
    const copy = [...righe];
    copy[i] = { ...copy[i], ...patch };
    onChange(copy);
  }

  function remove(i: number) {
    if (righe.length <= 1) {
      onChange([{ ...EMPTY_RIGA }]);
      return;
    }
    onChange(righe.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <Label>Voci del preventivo</Label>
          <p className="text-xs text-gray-500 mt-1">
            Quantità × prezzo unitario − sconto + IVA = totale riga
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...righe, { ...EMPTY_RIGA }])}
        >
          <Plus className="h-4 w-4 mr-1" /> Aggiungi voce
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-gray-50 border-b text-left text-xs font-medium text-gray-600">
            <tr>
              <th className="px-3 py-2 w-[34%]">Descrizione</th>
              <th className="px-3 py-2 w-[10%]">Qtà</th>
              <th className="px-3 py-2 w-[14%]">Prezzo unit. €</th>
              <th className="px-3 py-2 w-[10%]">Sconto %</th>
              <th className="px-3 py-2 w-[10%]">IVA %</th>
              <th className="px-3 py-2 w-[14%] text-right">Totale riga</th>
              <th className="px-3 py-2 w-[8%]" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {righe.map((r, i) => {
              const rigaTotale = totali.righe[i]?.totale ?? 0;
              return (
                <tr key={i} className="align-top">
                  <td className="px-3 py-2">
                    <Input
                      placeholder="Es. Installazione impianto antincendio"
                      value={r.descrizione}
                      onChange={(e) => update(i, { descrizione: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={r.quantita}
                      onChange={(e) =>
                        update(i, { quantita: Number(e.target.value) })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={r.prezzoUnitario}
                      onChange={(e) =>
                        update(i, { prezzoUnitario: Number(e.target.value) })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={r.scontoPercentuale}
                      onChange={(e) =>
                        update(i, { scontoPercentuale: Number(e.target.value) })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min={0}
                      step="1"
                      value={r.aliquotaIva}
                      onChange={(e) =>
                        update(i, { aliquotaIva: Number(e.target.value) })
                      }
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums pt-3">
                    {euro(rigaTotale)}
                  </td>
                  <td className="px-2 py-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-gray-500 hover:text-red-600"
                      onClick={() => remove(i)}
                      aria-label="Elimina riga"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {prezziMancanti && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          Alcune voci hanno prezzo 0: inserisci i prezzi unitari per vedere il
          costo totale. L’AI lascia 0 quando non ha un listino nelle fonti.
        </p>
      )}

      <div className="rounded-lg border bg-gray-50 px-4 py-3 space-y-1 text-sm max-w-sm ml-auto">
        <div className="flex justify-between gap-6 text-gray-600">
          <span>Imponibile</span>
          <span className="tabular-nums">{euro(totali.totaleImponibile)}</span>
        </div>
        <div className="flex justify-between gap-6 text-gray-600">
          <span>IVA</span>
          <span className="tabular-nums">{euro(totali.totaleIva)}</span>
        </div>
        <div className="flex justify-between gap-6 font-semibold text-base pt-1 border-t">
          <span>Totale</span>
          <span className="tabular-nums">{euro(totali.totaleFinale)}</span>
        </div>
      </div>
    </div>
  );
}

export { EMPTY_RIGA };

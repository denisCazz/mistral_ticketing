# Anteprima PDF: frame policy

## Problema

La pagina di dettaglio documento mostra i PDF tramite un iframe same-origin che carica
`/api/documenti/[id]/file`. La configurazione globale invia
`X-Frame-Options: DENY`, quindi il browser blocca l'iframe e mostra
“mistral.bitora.it refused to connect”.

## Design approvato

Cambiare l'header globale in `X-Frame-Options: SAMEORIGIN`.

Questo consente alle pagine di `mistral.bitora.it` di incorporare risorse dello stesso
dominio, inclusa l'anteprima PDF, ma continua a impedire l'incorporamento dell'app da
siti esterni. Autenticazione, controllo accessi e streaming R2 restano invariati.

## Ambito

- Modificare esclusivamente la frame policy in `next.config.ts`.
- Aggiungere un test di regressione che verifichi il valore `SAMEORIGIN`.
- Non modificare il componente di anteprima, la route dei file o la persistenza dati.

## Verifica

- Il test deve fallire con la configurazione attuale `DENY` e passare dopo la modifica.
- Eseguire l'intera suite di test, typecheck e build.
- Dopo il deploy, verificare che un PDF sia visibile nel dettaglio documento e che la
  risposta esponga `X-Frame-Options: SAMEORIGIN`.

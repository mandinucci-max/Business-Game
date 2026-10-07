# Guida per i tester — vertical slice (Fase 3)

Grazie per provare Business Game. Questa versione serve a capire **una cosa sola**: il ciclo
quotidiano è chiaro e fa venire voglia di tornare il giorno dopo?

## Come funziona il tempo

- 1 giorno reale = 1 mese di gioco, diviso in 4 aggiornamenti settimanali (circa ogni 6 ore).
- Le tue decisioni non hanno effetto subito: vengono registrate e applicate al **prossimo
  aggiornamento**. In "Ultime decisioni" vedi se sono state applicate o rifiutate (e perché).
- A fine mese arriva il **rapporto del mese**, con le cause dei cambiamenti ("Perché?").
- Il test dura 2 settimane reali (circa 14 mesi di gioco).

## Primi passi

1. Crea un account (nome 3–20 caratteri, password di almeno 10). Nessuna email richiesta.
2. Scegli la classe di partenza. Tutte partono con lo stesso patrimonio, composto in modo diverso:
   - **Dipendente**: stipendio sicuro, tempo per studiare. Il percorso più stabile.
   - **Libero professionista**: vendi le tue ore; la tariffa cresce con l'esperienza.
   - **Imprenditore**: hai una ditta. **Primo gesto: versa liquidità in azienda** (scheda Azienda →
     "Versa in azienda", oppure la carta decisione in Panoramica), altrimenti non paga gli stipendi.
   - **Investitore**: capitale da investire in fondo, prestiti, immobili e quote.
3. Guarda le **Decisioni consigliate** in Panoramica: molte si applicano con un clic.

## Le schede

| Scheda     | A cosa serve                                                                               |
| ---------- | ------------------------------------------------------------------------------------------ |
| Panoramica | Numeri chiave, decisioni consigliate, rapporto del mese con i "Perché?"                    |
| Agenda     | Ore del mese, lavoro, studio, competenze, classi da sbloccare, pilota automatico           |
| Azienda    | Prezzo, personale, budget, attrezzature, cassa, quote; fondare nuove aziende               |
| Mercato    | Economia della città, fondo, immobili, prestiti di banca e tra giocatori, quote in vendita |
| Classifica | Posizione per Valore Economico                                                             |

Il **pilota automatico** (Agenda) gestisce la routine quando non ci sei: adegua i prezzi,
sostituisce chi si dimette, investe la liquidità in eccesso. Le tue scelte hanno sempre la precedenza.

## Cosa ti chiediamo

Gioca come vuoi, anche pochi minuti al giorno. Alla fine compila il questionario:

1. Da 1 a 5: capivi cosa stava succedendo e perché?
2. Da 1 a 5: avevi voglia di tornare il giorno dopo? Cosa ti ha fatto tornare (o no)?
3. Un esempio di decisione che ha avuto l'effetto che ti aspettavi, e uno che ti ha sorpreso.
4. Il "Perché?" del rapporto ti è stato utile? Cosa mancava?
5. Cosa hai trovato confuso, noioso o ingiusto?
6. Hai usato il telefono, il computer o entrambi? Problemi di visualizzazione?

Segnala i problemi di sicurezza **solo** in privato, come spiegato in [SECURITY.md](../SECURITY.md).

## Limiti noti di questa versione

- I messaggi di rifiuto dei comandi sono ancora solo in italiano.
- Niente chat, consorzi, contratti tra giocatori, OPA: arrivano nelle fasi successive.
- I nomi delle aziende sono codici (#c1, #c2…).
- Il bilanciamento è calibrato sui bot: con persone vere potrà cambiare durante il test.

---

## Per chi gestisce il server

Per pubblicarlo gratis (Render + Neon + cron-job.org) segui [`PUBBLICAZIONE.md`](./PUBBLICAZIONE.md).

Requisiti: Node.js 22, PostgreSQL 16.

```sh
npm ci
npm run build                     # compila la web app in packages/web/dist
cp packages/server/.env.example packages/server/.env   # poi adatta i valori
```

Variabili principali (vedi `packages/server/src/env.ts`):

| Variabile          | Esempio                        | Note                                                     |
| ------------------ | ------------------------------ | -------------------------------------------------------- |
| `NODE_ENV`         | `production`                   | In produzione sono obbligatorie le tre seguenti          |
| `DATABASE_URL`     | `postgres://utente:pw@host/db` | Senza, lo stato vive solo in memoria (sviluppo)          |
| `PUBLIC_ORIGIN`    | `https://gioco.example`        | Usata per il controllo dell'origine (CSRF)               |
| `COOKIE_SECURE`    | `true`                         | Richiede HTTPS (cookie `__Host-`)                        |
| `TRUST_PROXY`      | `true`                         | Solo se dietro un proxy che imposta X-Forwarded-For      |
| `WEB_DIST`         | `../web/dist`                  | Il server serve anche la web app                         |
| `TICK_INTERVAL_MS` | `21600000`                     | 6 ore = 1 mese di gioco al giorno                        |
| `TICK_SCHEDULER`   | `external`                     | Tick da cron esterno su `/admin/tick` (hosting gratuiti) |
| `ADMIN_TOKEN`      | 32+ caratteri casuali          | Abilita `POST /admin/tick` (tick manuale)                |

```sh
npm start                         # avvia il server (tabelle create all'avvio)
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" https://gioco.example/admin/tick
```

Una sola istanza per città: il server prende un lock su PostgreSQL e rifiuta di partire se la
città è già gestita. Mettere un proxy HTTPS (es. Caddy o la piattaforma di hosting) davanti al
server. Fare backup giornalieri del database: la tabella `worlds` contiene lo stato della città,
`commands` lo storico delle decisioni.

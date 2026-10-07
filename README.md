# Business-Game

Gioco di strategia economica multiplayer online, persistente, basato sulle logiche del cashflow. Quattro classi (Dipendente, Libero professionista, Imprenditore, Investitore) competono e collaborano in un'economia circolare e causale per il primo posto in classifica.

## Documentazione

- [Game Design Document](docs/GDD.md) — design completo, parametri di bilanciamento.
- [Piano di implementazione](docs/PIANO_IMPLEMENTAZIONE.md) — architettura, fasi, sicurezza, test.
- [Pubblicazione gratuita](docs/PUBBLICAZIONE.md) — Render + Neon + cron-job.org.
- [Guida per i tester](docs/GUIDA_TESTER.md) — come si gioca la vertical slice e come avviare il server.
- [Sicurezza](SECURITY.md) — come segnalare una vulnerabilità.

## Stato

- Fase 0 (fondamenta) completata.
- Fase 1 completata (motore economico offline): economia circolare con mercato causale, filiera dei 9 settori, consumi delle persone, banca, tasse, macroeconomia, eventi e simulatore con bot.
- Fase 2 completata: competenze, carriere, ore e benessere, reputazione, tratti, salto di classe, attrezzature, quote delle società, prestiti tra giocatori, immobili; classi bilanciate (20–30% della top 10 ciascuna).
- Fase 3 (vertical slice giocabile) sviluppata: server autoritativo sicuro con PostgreSQL, web app responsive IT/EN, rapporto mensile con "Perché?", carte decisione, pilota automatico. Prossimo passo: test con 10–30 tester.

## Struttura

```
packages/
  config/   parametri di bilanciamento (balance/*.json) + schema di validazione
  engine/   motore di simulazione puro e deterministico
  sim/      bot, simulatore Monte Carlo e report di bilanciamento
  server/   server HTTP autoritativo (autenticazione, coda dei comandi, tick, persistenza)
  web/      web app React responsive (IT/EN)
e2e/        test end-to-end con Playwright
docs/       GDD, piano di implementazione, guida tester, screenshot
```

## Sviluppo

Requisiti: Node.js 22 (vedi `.nvmrc`).

```sh
npm install
npm run check        # lint + formato + tipi + test
npm test             # solo i test
npm run format       # formatta il codice
npm run sim -- --seasons 20 --out report.md   # simula 20 stagioni con i bot
npm run build        # compila la web app
npm run e2e          # test end-to-end (compila e avvia il server da sé)
```

Per giocare in locale: `npm run build`, poi
`ADMIN_TOKEN=$(openssl rand -hex 24) WEB_DIST=../web/dist npm start` e apri http://127.0.0.1:3000.
Senza `DATABASE_URL` lo stato resta in memoria. In sviluppo si può usare anche
`npm run dev -w @business-game/web` (Vite con proxy verso il server sulla porta 3000).

Il simulatore gioca stagioni complete con 200 bot (dipendenti, liberi professionisti,
imprenditori, investitori con strategie prudenti, aggressive e casuali) e confronta i risultati
con gli obiettivi di salute del GDD (Appendice A.3). Esce con codice 1 se un obiettivo è fuori
intervallo. Ogni notte il CI ne esegue 50 (workflow "Bilanciamento").

Regole del motore:

- i Crediti sono interi (1 Cr = 100 unità) e si muovono solo tramite il registro a partita doppia;
- niente `Math.random` né ora di sistema: si usa il generatore con seed del tick (controllato dal lint);
- ogni tick verifica le invarianti monetarie e fallisce senza confermare nulla se non reggono;
- i parametri di bilanciamento stanno in `packages/config/balance/` e vengono validati all'avvio.

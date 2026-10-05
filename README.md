# Business-Game

Gioco di strategia economica multiplayer online, persistente, basato sulle logiche del cashflow. Quattro classi (Dipendente, Libero professionista, Imprenditore, Investitore) competono e collaborano in un'economia circolare e causale per il primo posto in classifica.

## Documentazione

- [Game Design Document](docs/GDD.md) — design completo, parametri di bilanciamento.
- [Piano di implementazione](docs/PIANO_IMPLEMENTAZIONE.md) — architettura, fasi, sicurezza, test.
- [Sicurezza](SECURITY.md) — come segnalare una vulnerabilità.

## Stato

Fase 0 (fondamenta) completata: configurazione di bilanciamento validata e scheletro del motore deterministico.

## Struttura

```
packages/
  config/   parametri di bilanciamento (balance/*.json) + schema di validazione
  engine/   motore di simulazione puro e deterministico
docs/       GDD e piano di implementazione
```

## Sviluppo

Requisiti: Node.js 22 (vedi `.nvmrc`).

```sh
npm install
npm run check        # lint + formato + tipi + test
npm test             # solo i test
npm run format       # formatta il codice
```

Regole del motore:

- i Crediti sono interi (1 Cr = 100 unità) e si muovono solo tramite il registro a partita doppia;
- niente `Math.random` né ora di sistema: si usa il generatore con seed del tick (controllato dal lint);
- ogni tick verifica le invarianti monetarie e fallisce senza confermare nulla se non reggono;
- i parametri di bilanciamento stanno in `packages/config/balance/` e vengono validati all'avvio.

# Business Game — Piano di implementazione

> Versione 0.1. Si basa sul [Game Design Document](./GDD.md); i riferimenti "§" rimandano alle sue sezioni.
> I tempi sono indicativi per un **team piccolo (3–5 sviluppatori + 1 game designer)** e vanno ricalibrati quando sapremo chi sviluppa (GDD §22, domanda 3).

---

## 1. Strategia

1. **Prima il motore, poi il gioco.**
   - L'economia è il prodotto: va costruita e bilanciata **offline**, con bot, prima di qualsiasi interfaccia.
   - Un motore sbagliato non si salva con una bella interfaccia.
2. **Validare il divertimento presto.**
   - Subito dopo il motore base si fa una **vertical slice giocabile**: poche funzioni, ma complete dall'inizio alla fine.
   - Si gioca internamente e si decide se le basi sono divertenti prima di costruire il resto.
3. **Crescita a strati.**
   - Ogni fase aggiunge un sistema del GDD con criteri di completamento misurabili.
   - L'ordine segue le dipendenze: mercato → persone → lavoro → finanza → conflitti → consorzi.
4. **Tutto data-driven.**
   - Ogni numero del GDD (Appendice A e voci [P]) vive in configurazione, versionata insieme al codice.
   - Il bilanciamento non richiede di modificare il codice.

---

## 2. Architettura proposta

### 2.1 Stack (da confermare)
| Componente | Proposta | Motivo |
|---|---|---|
| Linguaggio | **TypeScript** ovunque | Un solo linguaggio per motore, server e client; il motore è condiviso |
| Organizzazione del codice | Monorepo (pnpm workspaces) | Pacchetti separati ma versionati insieme |
| Motore | Libreria TypeScript pura, **deterministica**, senza I/O | Testabile, riproducibile, eseguibile sia nel server sia nel simulatore |
| Server | Node.js + Fastify, WebSocket | Comandi dei giocatori, notifiche in tempo reale |
| Database | PostgreSQL | Stato delle città, registro dei comandi, classifiche |
| Code e scheduler | Redis + BullMQ | Tick a orari fissi (UTC), lavori asincroni |
| Client | React Native + Expo (web, iOS, Android) | Mobile e computer con una sola base di codice (GDD §22, domanda 2) |
| Analisi del bilanciamento | Script del simulatore + report (CSV/HTML) | Monte Carlo sulle stagioni |

### 2.2 Struttura del repository
```
/packages
  /engine        # motore di simulazione puro (nessuna dipendenza da server o database)
  /config        # parametri di bilanciamento (JSON + schema di validazione)
  /sim           # bot, simulatore Monte Carlo, report di bilanciamento
  /shared        # tipi, comandi, eventi, validazione condivisi tra client e server
/apps
  /server        # API, WebSocket, scheduler dei tick, persistenza
  /client        # app Expo (web + mobile)
  /admin         # pannello di amministrazione e moderazione
/docs            # GDD, piano, decisioni
```

### 2.3 Principi del motore
- **Deterministico**: `nuovoStato = tick(stato, comandi, seed)`. Generatore casuale con seed per città e per tick.
- **Comandi, non modifiche dirette**:
  - i giocatori inviano comandi validati (es. `ImpostaPrezzo`, `InviaOrdineBorsa`, `LanciaOPA`);
  - il motore li applica al tick (o subito, per borsa e contratti);
  - ogni comando è registrato, quindi le partite sono ricostruibili per audit, anti-abuso e debug.
- **Una città = un processo logico**: lo stato di una città viene elaborato in modo seriale; città diverse in parallelo.
- **Conservazione del denaro**: ogni movimento di Crediti è una scrittura in partita doppia. Un'invariante verificata a ogni tick: la variazione della massa monetaria è uguale alle entrate meno le uscite di denaro nel sistema (GDD §13.1).
- **Borsa separata dal tick**: il motore della borsa gira in continuo; il tick ne legge i prezzi e aggiorna i fondamentali ogni trimestre.

### 2.4 Modello dati (entità principali)
- **Città**: data di gioco, indicatori macro, seed, parametri.
- **Giocatore**: classi attive, classe d'origine, competenze, tratti, reputazione, network, rating, benessere, ore, livello di vita, curriculum.
- **Azienda**: forma giuridica, settore, sedi, soci e quote, personale, budget per area, stock (brand, qualità, ricerca e sviluppo), clienti, bilancio, brevetti.
- **Sede/posizione**: caratteristiche, proprietario, affittuario.
- **Contratto**: tipo, parti, clausole, calendario di esecuzione, stato.
- **Mercato** (città × settore): clienti per azienda, prezzo di riferimento, domanda.
- **Titolo quotato**: registro degli ordini, storico dei prezzi, azionisti.
- **Fondo**: gestore, clienti, quote, valore patrimoniale, massimo storico (high-water mark).
- **Causa**: parti, tipo, fondatezza, investimenti delle parti, scadenze, esito.
- **OPA**: offerente o cordata, bersaglio, prezzo, copertura, adesioni, scadenze.
- **Consorzio**: membri, ruoli, cassa, livello, vantaggi.
- **Movimento contabile**: partita doppia per tutti i flussi.
- **Evento del Giornale.**

### 2.5 Pipeline del tick
**Tick settimanale (4 al giorno)**
1. Applicare i comandi in coda (prezzi, budget, assunzioni, contratti firmati).
2. Aggiornare macroeconomia ed eventi attivi.
3. Mercato del lavoro: preavvisi scaduti, dimissioni (churn sul morale), assunzioni effettive.
4. Calcolare la capacità produttiva di ogni azienda.
5. Approvvigionamento: contratti → mercato spot → operatore cittadino; consegne della logistica.
6. Produzione (limitata da capacità e input).
7. Mercati tra aziende, poi mercati verso le persone (inclusi panieri e popolazione gestita dal computer): attrattività → quote → churn → vendite → soddisfazione.
8. Contabilità settimanale (ricavi, costi variabili), aggiornamento di brand, qualità e ricerca e sviluppo.
9. Contratti in scadenza nel tick, appalti, controlli di insolvenza.

**Chiusura mensile (in aggiunta all'ultimo tick)**
1. Stipendi, affitti, rate, interessi, paniere personale, sussidi.
2. Tasse; dividendi deliberati; commissioni dei fondi (high-water mark).
3. Esperienza e livelli, tratti, reputazione, rating, benessere.
4. Banca centrale (tasso di riferimento), stabilizzatore monetario.
5. Valutazioni, Valore Economico, classifiche.
6. Ricarica delle ore; generazione del rapporto mensile e delle carte decisione.
7. Verifica delle invarianti (conservazione del denaro, nessun saldo impossibile).

**Continui (fuori dal tick)**: borsa, marketplace, firma dei contratti, chat, OPA e cause (con scadenze in tempo reale).

---

## 3. Fasi

Ogni fase ha **obiettivi**, **cose da consegnare** e **criteri di completamento**. Una fase è chiusa solo quando i criteri sono soddisfatti.

### Fase 0 — Fondamenta (2–3 settimane)
- **Obiettivi**: impostare il progetto in modo che tutto il resto sia veloce e sicuro.
- **Cose da consegnare**:
  - monorepo, lint, formattazione, CI (test a ogni push);
  - pacchetto `config` con schema di validazione e i parametri dell'Appendice A;
  - scheletro del motore: tipi base, generatore casuale con seed, contabilità a partita doppia, loop del tick vuoto;
  - framework di test (unitari + property-based) e test dell'invariante monetaria.
- **Completamento**: CI verde; un tick vuoto deterministico (stesso seed → stesso risultato); invariante monetaria verificata.

### Fase 1 — Motore economico base, offline (6–8 settimane)
- **Obiettivi**: l'economia circolare funziona senza giocatori umani.
- **Cose da consegnare**:
  - modello di mercato completo (§8): attrattività, flussi di clienti, churn, capacità, soddisfazione, brand, qualità, overhead;
  - filiera dei 9 settori con matrice degli input e operatore cittadino (§6);
  - persone e paniere personale, popolazione gestita dal computer con domanda minima (§7);
  - aziende base (ditta individuale e SRL), budget per area, lavoratori gestiti dal computer;
  - banca gestita dal computer, rating, tasse, banca centrale, eventi, stabilizzatore (§12.1, §13);
  - **simulatore con bot** per ciascuna classe (strategie semplici: prudente, aggressiva, casuale);
  - **report di bilanciamento** con gli obiettivi di salute dell'Appendice A.3.
- **Completamento**:
  - 1.000 stagioni simulate senza errori né violazioni dell'invariante;
  - inflazione e disoccupazione entro gli obiettivi;
  - nessun settore sistematicamente morto;
  - il test di causalità passa: un'azienda con fattori migliori cresce più delle altre.

### Fase 2 — Classi, progressione e personaggio (4–5 settimane)
- **Cose da consegnare**:
  - competenze, esperienza, carriere interne (§5.2);
  - tratti con gradi (§5.3);
  - salto di classe e cumulo con vincolo di ore (§5.4);
  - benessere, reputazione, network (§3);
  - condizioni di partenza per classe (§4.1) e talento d'origine;
  - fallimento (aziende e persone) (§9.5);
  - focus mensile del dipendente (§4.3).
- **Completamento**:
  - nelle simulazioni ogni classe d'origine finisce in top 10 tra il 20% e il 30% delle volte;
  - tempi medi di progressione entro gli obiettivi (§5.5).

### Fase 3 — Vertical slice giocabile (5–6 settimane) ⟶ **punto di decisione**
- **Obiettivi**: provare il divertimento con persone vere, sul ciclo quotidiano.
- **Ambito ridotto**:
  - 1 città;
  - 4 settori (Materie prime, Manifattura, Commercio, Ristorazione) + operatore cittadino per gli altri;
  - le 4 classi, livelli iniziali;
  - mercato del lavoro base, marketplace base.
- **Cose da consegnare**:
  - server autoritativo (autenticazione, comandi, scheduler dei tick, persistenza);
  - client mobile-first: panoramica, rapporto mensile con "Perché?", carte decisione, agenda delle ore, azienda, mercato, classifica;
  - pilota automatico base.
- **Completamento**:
  - 20–40 tester interni per 2 settimane (14 mesi di gioco);
  - questionario: chiarezza, desiderio di tornare il giorno dopo, percezione della causalità.
- **Decisione**: continuare, correggere il ciclo quotidiano, oppure rivedere il design prima di andare avanti.

### Fase 4 — Mercati tra giocatori completi (4–5 settimane)
- **Cose da consegnare**:
  - sistema contrattuale completo (§16) con esecuzione automatica;
  - mercato del lavoro completo con dirigenti, pacchetti retributivi, consiglieri (§10);
  - servizi professionali con incarichi, cumulo, tetti (§11);
  - posizioni e sedi, Edilizia su misura, affitti (§6.2);
  - tutti i 9 settori; brevetti e licenze (§9.3);
  - modalità di acquisto (spot, abbonamento, consorzio) e regole del pilota automatico (§7.3).
- **Completamento**: nelle simulazioni con bot "sociali" almeno il 50% della spesa dei giocatori va ad aziende di giocatori entro il mese 24 (città da 200).

### Fase 5 — Finanza (6–8 settimane)
- **Cose da consegnare**:
  - borsa: registro degli ordini, ordini con limite e al mercato, market maker, trader gestiti dal computer (value, momentum, indice, rumore), sospensioni, vendite allo scoperto con margine (§12.3);
  - quotazione in borsa;
  - fondi degli investitori con high-water mark, preavviso e limiti di strategia (§12.4);
  - prestiti tra giocatori;
  - settore Finanziario: banca (leva, corsa agli sportelli, garanzia sui depositi), assicurazione, gestione del risparmio, banca d'affari (§12.5).
- **Completamento**:
  - i prezzi convergono verso i fondamentali in assenza di flussi;
  - i test di manipolazione (pump-and-dump simulati) non producono guadagni sistematici;
  - nessuna banca simulata crea denaro fuori dalle regole.

### Fase 6 — Conflitti: OPA/OPAS e cause legali (4–5 settimane)
- **Cose da consegnare**:
  - soglie di comunicazione, OPA volontaria e obbligatoria, OPS/OPAS, copertura, controfferte, esiti, uscita dalla borsa, antitrust (§14.2);
  - cordate con patto vincolante;
  - difese;
  - paracadute;
  - cause: tipi, fondatezza calcolata dal sistema, stima dell'avvocato, istruttoria, probabilità, esiti, accordi (§14.3);
  - scudo da principiante;
  - finestra minima di 24 ore garantita.
- **Completamento**:
  - test di scenario per ogni percorso di OPA e di causa;
  - nessun modo di attaccare senza finestra di difesa;
  - cause temerarie in perdita attesa.

### Fase 7 — Consorzi (3–4 settimane)
- **Cose da consegnare**: creazione, ruoli e permessi, cassa comune, prestiti interni, sconti interni, sinergia di filiera, esperienza e vantaggi, joint venture, patto di difesa, uscita ed espulsione, chat del consorzio (§15).
- **Completamento**: nelle simulazioni i consorzi misti superano quelli monoclasse senza dominare (media del VE dei migliori consorzi ≤ 1,5 volte la media dei giocatori singoli bravi).

### Fase 8 — Informazione, Giornale ed esperienza completa (4–5 settimane)
- **Cose da consegnare**:
  - livelli di visibilità delle informazioni (§17);
  - report a pagamento;
  - Giornale;
  - curriculum pubblici;
  - notifiche push (§19.6);
  - tutorial a missioni per classe (§19.4);
  - glossario e "Perché?" ovunque;
  - interfaccia per computer (sessione strategica);
  - comunicazione e moderazione (§19.7, §20).
- **Completamento**: un nuovo tester completa le missioni della prima settimana senza aiuto esterno.

### Fase 9 — Stagioni, classifiche, integrità (3–4 settimane)
- **Cose da consegnare**:
  - Valore Economico con valutazioni (§18.1);
  - tutte le classifiche e gli albi;
  - ciclo di stagione: fine, chiusura d'ufficio, albo d'oro, pausa, reset, scioglimento dei consorzi;
  - anti-abuso (fascia di prezzo, grafo delle transazioni, limiti agli account nuovi);
  - pannello di amministrazione;
  - più istanze di città.
- **Completamento**: stagione completa simulata a velocità accelerata (60 mesi) con passaggio alla stagione successiva senza errori.

### Fase 10 — Alpha chiusa → Beta → Lancio
- **Alpha chiusa**:
  - 1 città, 100–200 giocatori, una stagione intera (60 giorni);
  - telemetria su tutti gli obiettivi di salute;
  - ribilanciamento tra le settimane (solo configurazione).
- **Beta aperta**: più città, test di carico (500 giocatori per città, picchi ai tick), moderazione attiva.
- **Lancio**: versione 1.0. La monetizzazione si progetta in parallelo alla beta (GDD §21) e si attiva solo dopo.

**Durata indicativa complessiva fino all'alpha**: circa 12–15 mesi per il team ipotizzato. Le fasi 4–8 possono in parte sovrapporsi se il team è più grande.

---

## 4. Strategia di test

| Livello | Cosa verifica |
|---|---|
| Unitari | Ogni formula del GDD (attrattività, churn, tasse, rating, probabilità delle cause, high-water mark) |
| Property-based | Invarianti: conservazione del denaro, nessuna quota oltre il 100%, nessun saldo di ore negativo, contratti eseguiti esattamente una volta |
| Scenario | Storie complete: "OPA con controfferta", "causa temeraria", "corsa agli sportelli", "fallimento di una ditta individuale" |
| Regressione | Seed fissi con risultati salvati: ogni modifica al motore che cambia i numeri deve essere intenzionale |
| Bilanciamento | Monte Carlo nel CI notturno: report degli obiettivi di salute; avviso se un indicatore esce dalla fascia |
| Carico | Tick di una città da 500 giocatori in meno di 30 secondi; borsa con 50 ordini al secondo |
| Gioco reale | Playtest in vertical slice, alpha e beta con questionari e telemetria |

---

## 5. Telemetria per il bilanciamento
Si raccolgono fin dalla vertical slice:
- distribuzione del VE per classe;
- tempi di progressione;
- tassi di fallimento;
- quote di mercato e concentrazione per settore;
- inflazione e disoccupazione;
- uso del pilota automatico;
- durata e frequenza delle sessioni;
- abbandono per classe;
- esiti di OPA e cause;
- composizione dei consorzi.

---

## 6. Rischi principali e mitigazioni

| Rischio | Mitigazione |
|---|---|
| Economia instabile (inflazione, crolli) | Fase 1 offline con invarianti e stabilizzatore; parametri modificabili senza rilasci |
| Troppa complessità per i nuovi | Leve sbloccate gradualmente, tutorial a missioni, pilota automatico, test della vertical slice |
| Una classe dominante | Obiettivo 20–30% in top 10 per classe, verificato in CI e in alpha |
| Effetto valanga dei primi | Rendimenti decrescenti, overhead, antitrust, stagioni con reset |
| Città vuote o poco popolate | Operatore cittadino e popolazione gestita dal computer, capienza delle istanze |
| Account multipli e abusi | Fascia di prezzo, grafo delle transazioni, limiti agli account nuovi, registro dei comandi |
| Prestazioni ai tick | Città elaborate in parallelo, profiling dalla Fase 1, test di carico |
| Tossicità nella chat | Moderazione, filtri, segnalazioni; eventualmente chat limitata al lancio |

---

## 7. Prossimi passi immediati
1. Rispondere alle domande aperte del GDD (§22) e rivedere le voci [P].
2. Confermare lo stack (§2.1).
3. Avviare la Fase 0.

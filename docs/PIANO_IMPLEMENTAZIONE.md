# Business Game — Piano di implementazione

> Versione 0.2. Si basa sul [Game Design Document](./GDD.md); i riferimenti "§" rimandano alle sue sezioni.
> Calibrato per **una sola persona** che sviluppa, con l'aiuto di strumenti di AI per scrivere codice. Le durate indicate sono per un impegno **a tempo pieno**: a tempo parziale vanno circa raddoppiate.

---

## 1. Strategia

1. **Prima il motore, poi il gioco.**
   - L'economia è il prodotto: va costruita e bilanciata **offline**, con bot, prima di qualsiasi interfaccia.
   - Un motore sbagliato non si salva con una bella interfaccia.
2. **Validare il divertimento presto.**
   - Dopo il motore base si fa una **vertical slice giocabile**: poche funzioni, ma complete dall'inizio alla fine.
   - La provano amici e conoscenti prima di costruire il resto.
3. **Due alpha invece di una.**
   - Per una persona sola, aspettare che tutto sia pronto è troppo lungo.
   - **Alpha 1**: economia reale, classi, lavoro, servizi, consorzi, stagioni.
   - **Alpha 2**: borsa, fondi, settore Finanziario, OPA e cause.
4. **Tutto data-driven.** Ogni numero del GDD vive in configurazione: il bilanciamento non richiede di modificare il codice.
5. **Semplicità operativa.**
   - Un solo linguaggio, un solo servizio da mettere online, un solo database.
   - Niente infrastruttura che una persona sola non riesce a mantenere.

---

## 2. Architettura

### 2.1 Stack
| Componente | Scelta | Motivo |
|---|---|---|
| Linguaggio | **TypeScript** ovunque | Motore condiviso tra server, simulatore e client |
| Organizzazione del codice | Monorepo con npm workspaces | Pacchetti separati, un solo repository |
| Motore | Libreria TypeScript pura, **deterministica**, senza I/O | Testabile, riproducibile, eseguibile nel simulatore e nel server |
| Server | Node.js + Fastify, un unico servizio (monolite) | Facile da gestire da soli |
| Database | PostgreSQL | Stato, registro dei comandi, classifiche |
| Scheduler e code | **pg-boss** (code su PostgreSQL) | Tick a orari fissi senza aggiungere Redis |
| Tempo reale | WebSocket dal server | Aggiornamenti di borsa, notifiche, messaggi |
| Client | **React + Vite, web app responsive** con rilevamento del dispositivo, installabile (PWA) | Una sola interfaccia per mobile e computer, senza app native |
| Lingue | i18next, italiano e inglese dal primo giorno | Aggiungere le traduzioni dopo costa molto di più |
| Amministrazione | Sezione riservata della stessa web app | Nessuna app in più da mantenere |
| Hosting | Una piattaforma gestita (server + PostgreSQL gestito) | Niente server da amministrare a mano |

### 2.2 Struttura del repository
```
/packages
  /engine        # motore di simulazione puro
  /config        # parametri di bilanciamento (JSON + schema di validazione)
  /sim           # bot, simulatore Monte Carlo, report di bilanciamento
  /shared        # tipi, comandi, eventi, validazione condivisi
/apps
  /server        # API, WebSocket, scheduler, persistenza
  /web           # web app responsive (giocatori + sezione admin)
/docs            # GDD, piano
```

### 2.3 Principi del motore
- **Deterministico**: `nuovoStato = tick(stato, comandi, seed)`. Generatore casuale con seed per città e per tick.
- **Comandi, non modifiche dirette**:
  - i giocatori inviano comandi validati (es. `ImpostaPrezzo`, `InviaOrdineBorsa`, `LanciaOPA`);
  - il motore li applica al tick (o subito, per borsa e contratti);
  - ogni comando è registrato: le partite sono ricostruibili per audit, anti-abuso e debug.
- **Una città = un processo logico**: elaborazione seriale per città; città diverse in parallelo.
- **Conservazione del denaro**: ogni movimento di Crediti è una scrittura in partita doppia. Un'invariante verificata a ogni tick: la variazione della massa monetaria è uguale alle entrate meno le uscite di denaro nel sistema (GDD §13.1).
- **Borsa separata dal tick**: gira in continuo; il tick ne legge i prezzi e aggiorna i fondamentali ogni trimestre.

### 2.4 Modello dati (entità principali)
- **Città**: data di gioco, indicatori macro, seed, parametri.
- **Giocatore**: classi attive, classe d'origine, competenze, tratti, reputazione, network, rating, benessere, ore, livello di vita, curriculum, lingua.
- **Azienda**: forma giuridica, settore, sedi, soci e quote, fascia di apertura del capitale (§14.2.1), personale, budget per area, stock (brand, qualità, ricerca e sviluppo), clienti, bilancio, brevetti.
- **Sede/posizione**: caratteristiche, proprietario, affittuario.
- **Contratto**: tipo, parti, clausole, calendario di esecuzione, stato, **filo di messaggi della trattativa**.
- **Mercato** (città × settore): clienti per azienda, prezzo di riferimento, domanda.
- **Titolo quotato**: registro degli ordini, storico dei prezzi, azionisti.
- **Fondo**: gestore, clienti, quote, valore patrimoniale, high-water mark.
- **Causa**: parti, tipo, fondatezza, investimenti delle parti, scadenze, esito.
- **OPA**: offerente o cordata, bersaglio, prezzo, copertura, adesioni, scadenze.
- **Consorzio**: membri, ruoli, cassa, livello, vantaggi, chat.
- **Movimento contabile**: partita doppia per tutti i flussi.
- **Evento del Giornale.**

### 2.5 Pipeline del tick
**Tick settimanale (4 al giorno, 00/06/12/18 UTC)**
1. Applicare i comandi in coda (prezzi, budget, assunzioni, contratti firmati).
2. Aggiornare macroeconomia ed eventi attivi.
3. Mercato del lavoro: preavvisi scaduti, dimissioni (churn sul morale), assunzioni effettive.
4. Calcolare la capacità produttiva di ogni azienda.
5. Approvvigionamento: contratti → mercato spot → operatore cittadino; consegne della logistica.
6. Produzione (limitata da capacità e input).
7. Mercati tra aziende, poi mercati verso le persone (panieri dei giocatori e popolazione gestita dal computer): attrattività → quote → churn → vendite → soddisfazione.
8. Contabilità settimanale, aggiornamento di brand, qualità e ricerca e sviluppo.
9. Contratti in scadenza, appalti, controlli di insolvenza.

**Chiusura mensile (in aggiunta al tick delle 00:00)**
1. Stipendi, affitti, rate, interessi, paniere personale, sussidi.
2. Tasse; dividendi; commissioni dei fondi (high-water mark).
3. Esperienza e livelli, tratti, reputazione, rating, benessere.
4. Fasce di apertura del capitale delle quotate (§14.2.1).
5. Banca centrale, stabilizzatore monetario.
6. Valutazioni, Valore Economico, classifiche.
7. Ricarica delle ore; rapporto mensile e carte decisione.
8. Verifica delle invarianti.

**Continui (fuori dal tick)**: borsa, marketplace, firma dei contratti, chat del consorzio e messaggi delle trattative, OPA e cause (scadenze in tempo reale).

---

## 3. Fasi

Ogni fase ha **cose da consegnare** e **criteri di completamento** misurabili.

### Fase 0 — Fondamenta (1–2 settimane)
- **Cose da consegnare**:
  - monorepo, lint, formattazione, CI (test a ogni push);
  - pacchetto `config` con schema di validazione e parametri dell'Appendice A;
  - scheletro del motore: tipi base, generatore casuale con seed, contabilità a partita doppia, loop del tick vuoto;
  - test unitari e property-based; test dell'invariante monetaria.
- **Completamento**: CI verde; tick deterministico (stesso seed → stesso risultato); invariante verificata.

### Fase 1 — Motore economico base, offline (2–3 mesi)
- **Cose da consegnare**:
  - modello di mercato completo (§8);
  - filiera dei 9 settori con matrice degli input e operatore cittadino (§6);
  - persone, paniere personale e popolazione gestita dal computer con domanda minima (§7);
  - aziende base (ditta individuale e SRL), budget per area, lavoratori gestiti dal computer;
  - banca gestita dal computer, rating, tasse, banca centrale, eventi, stabilizzatore (§12.1, §13);
  - **simulatore con bot** per ciascuna classe (strategie prudente, aggressiva, casuale);
  - **report di bilanciamento** sugli obiettivi dell'Appendice A.3.
- **Completamento**:
  - 1.000 stagioni simulate senza errori né violazioni dell'invariante;
  - inflazione e disoccupazione entro gli obiettivi;
  - nessun settore sistematicamente morto;
  - test di causalità superato: un'azienda con fattori migliori cresce più delle altre.

### Fase 2 — Classi, progressione e personaggio (1–1,5 mesi)
- **Cose da consegnare**: competenze, carriere, tratti, salto di classe con vincolo di ore, benessere, reputazione, network, condizioni di partenza, talento d'origine, fallimento, focus mensile del dipendente (§3–§5, §9.5).
- **Completamento**:
  - nelle simulazioni ogni classe d'origine finisce in top 10 tra il 20% e il 30% delle volte;
  - tempi di progressione entro gli obiettivi (§5.5).

### Fase 3 — Vertical slice giocabile (2 mesi) ⟶ **punto di decisione**
- **Ambito ridotto**:
  - 1 città;
  - 4 settori (Materie prime, Manifattura, Commercio, Ristorazione) + operatore cittadino per gli altri;
  - le 4 classi ai livelli iniziali;
  - mercato del lavoro e marketplace base.
- **Cose da consegnare**:
  - server (accesso, comandi, scheduler, persistenza);
  - web app responsive: panoramica, rapporto mensile con "Perché?", carte decisione, agenda delle ore, azienda, mercato, classifica;
  - pilota automatico base;
  - italiano e inglese.
- **Completamento**:
  - 10–30 tester (amici, conoscenti, community) per 2 settimane (14 mesi di gioco);
  - questionario: chiarezza, voglia di tornare il giorno dopo, percezione della causalità.
- **Decisione**: continuare, correggere il ciclo quotidiano, oppure rivedere il design.

### Fase 4 — Mercati tra giocatori completi (2 mesi)
- **Cose da consegnare**:
  - contratti completi con esecuzione automatica e messaggi delle trattative (§16, §19.7);
  - mercato del lavoro con dirigenti, pacchetti retributivi, consiglieri (§10);
  - servizi professionali (§11);
  - posizioni, sedi su misura, affitti (§6.2);
  - tutti i 9 settori; brevetti e licenze (§9.3);
  - modalità di acquisto e pilota automatico completo (§7.3, §19.3).
- **Completamento**: nelle simulazioni con bot "sociali", almeno il 50% della spesa dei giocatori va ad aziende di giocatori entro il mese 24.

### Fase 5 — Consorzi (1 mese)
- **Cose da consegnare**: creazione, ruoli, cassa, prestiti interni, sconti, sinergia di filiera, vantaggi, joint venture, uscita ed espulsione, chat del consorzio (§15). Il patto di difesa arriva in Fase 8 con le OPA.
- **Completamento**: nelle simulazioni i consorzi misti superano quelli monoclasse senza dominare.

### Fase 6 — Informazione, Giornale, esperienza (1,5 mesi)
- **Cose da consegnare**:
  - livelli di visibilità (§17), report a pagamento, Giornale, curriculum pubblici;
  - notifiche (§19.6);
  - tutorial a missioni (§19.4), glossario e "Perché?";
  - layout per computer della sessione strategica;
  - moderazione di chat del consorzio e trattative (§20).
- **Completamento**: un nuovo tester completa le missioni della prima settimana senza aiuto.

### Fase 7 — Stagioni, classifiche, integrità (1–1,5 mesi) ⟶ **ALPHA 1**
- **Cose da consegnare**:
  - Valore Economico (§18.1), classifiche e albi;
  - ciclo di stagione: fine, chiusura d'ufficio, albo d'oro, pausa, reset, scioglimento dei consorzi;
  - anti-abuso: fascia di prezzo, grafo delle transazioni, limiti agli account nuovi;
  - sezione admin.
- **In Alpha 1 l'investitore ha già**: prestiti tra giocatori, immobili e sedi, quote di SRL, fondi indice gestiti dal computer.
- **Alpha 1**: 1 città, 50–150 giocatori, una stagione intera (60 giorni), telemetria, ribilanciamento solo da configurazione.

**Tempo indicativo fino all'Alpha 1: circa 12–15 mesi a tempo pieno.**

### Fase 8 — Finanza e conflitti (3–4 mesi) ⟶ **ALPHA 2**
- **Cose da consegnare**:
  - **borsa**: registro degli ordini, market maker e trader gestiti dal computer, sospensioni, vendite allo scoperto (§12.3);
  - quotazione in borsa e **fasce di apertura del capitale con i loro bonus** (§14.2.1);
  - **fondi** degli investitori (§12.4);
  - **settore Finanziario** e licenza (§12.5);
  - **OPA/OPAS**: soglie, cordate, difese, patto di difesa del consorzio, paracadute (§14.2);
  - **cause legali** (§14.3).
- **Completamento**:
  - i prezzi convergono ai fondamentali in assenza di flussi;
  - i pump-and-dump simulati non producono guadagni sistematici;
  - test di scenario per ogni percorso di OPA e di causa;
  - le cause temerarie sono in perdita attesa.
- **Alpha 2**: nuova stagione completa con tutte le funzioni.

### Fase 9 — Beta e lancio
- Più istanze di città.
- Test di carico: 500 giocatori per città, picchi ai tick.
- Rifinitura dell'interfaccia.
- La monetizzazione si progetta durante la beta (GDD §21) e si attiva solo dopo il lancio.

**Tempo indicativo totale fino al lancio: circa 18–22 mesi a tempo pieno.**

---

## 4. Consigli pratici per lo sviluppo da soli
- **Il motore va scritto e testato prima di tutto.** Con test solidi, l'AI può generare grandi parti di codice senza rompere l'economia.
- **Una fase alla volta.** Non iniziare la successiva finché i criteri di completamento non sono soddisfatti.
- **Configurazione al posto del codice**: ogni dubbio di bilanciamento si risolve cambiando un numero, non una funzione.
- **Community presto.** Un piccolo gruppo di tester dalla Fase 3 vale più di qualsiasi stima.
- **Tagliare, non rimandare all'infinito.** Se una fase sfora del 50%, si riduce l'ambito e si sposta il resto dopo il lancio.

---

## 5. Strategia di test
| Livello | Cosa verifica |
|---|---|
| Unitari | Ogni formula del GDD (attrattività, churn, tasse, rating, cause, high-water mark, fasce di apertura) |
| Property-based | Conservazione del denaro, quote ≤ 100%, ore mai negative, contratti eseguiti esattamente una volta |
| Scenario | "OPA con controfferta", "causa temeraria", "corsa agli sportelli", "fallimento di una ditta individuale" |
| Regressione | Seed fissi con risultati salvati: ogni cambio dei numeri deve essere intenzionale |
| Bilanciamento | Monte Carlo notturno nel CI, con avviso se un obiettivo di salute esce dalla fascia |
| Carico | Tick di una città da 500 giocatori in meno di 30 secondi |
| Gioco reale | Vertical slice, Alpha 1, Alpha 2: questionari e telemetria |

---

## 6. Telemetria per il bilanciamento
Si raccolgono fin dalla vertical slice:
- distribuzione del VE per classe;
- tempi di progressione;
- fallimenti;
- concentrazione dei settori;
- inflazione e disoccupazione;
- uso del pilota automatico;
- durata e frequenza delle sessioni;
- abbandono per classe;
- esiti di OPA e cause;
- composizione dei consorzi;
- distribuzione delle fasce di apertura del capitale.

---

## 7. Rischi principali e mitigazioni
| Rischio | Mitigazione |
|---|---|
| Tempi lunghi per una persona sola | Due alpha, ambito tagliabile, AI per il codice ripetitivo, test che proteggono il motore |
| Economia instabile | Fase 1 offline con invarianti e stabilizzatore; parametri modificabili senza rilasci |
| Troppa complessità per i nuovi | Leve sbloccate gradualmente, tutorial a missioni, pilota automatico |
| Una classe dominante | Obiettivo 20–30% in top 10 per classe, verificato in CI e in alpha |
| Effetto valanga dei primi | Rendimenti decrescenti, overhead, antitrust, stagioni con reset |
| Città poco popolate | Operatore cittadino e popolazione gestita dal computer |
| Abusi e account multipli | Fascia di prezzo, grafo delle transazioni, registro dei comandi |
| Moderazione | Solo chat del consorzio e messaggi delle trattative al lancio |
| Manutenzione dell'infrastruttura | Un solo servizio, PostgreSQL gestito, niente Redis |

---

## 8. Prossimo passo
Avviare la **Fase 0**.

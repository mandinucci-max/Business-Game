# Business Game — Game Design Document

> Titolo provvisorio. Versione 0.4 — documento vivo.
> Riferimento unico per design e sviluppo. Il piano di implementazione è in [`PIANO_IMPLEMENTAZIONE.md`](./PIANO_IMPLEMENTAZIONE.md).

**Convenzioni**

- Tutti i numeri sono **segnaposto di bilanciamento**: andranno validati con le simulazioni (vedi piano, Fase 1). Nel codice vivranno in file di configurazione, mai cablati.
- Le proposte aggiunte nella revisione dei buchi di analisi (v0.1, segnate [P]) sono state **approvate** in v0.2 e fanno parte del design.
- La moneta di gioco è il **Credito (Cr)**.

---

## Indice

1. [Visione e pilastri](#1-visione-e-pilastri)
2. [Formato, tempo e ritmo](#2-formato-tempo-e-ritmo)
3. [Risorse del giocatore](#3-risorse-del-giocatore)
4. [Le 4 classi](#4-le-4-classi)
5. [Competenze, carriere, tratti e salto di classe](#5-competenze-carriere-tratti-e-salto-di-classe)
6. [Settori e filiera](#6-settori-e-filiera)
7. [Economia circolare e consumi personali](#7-economia-circolare-e-consumi-personali)
8. [Modello di mercato (causalità)](#8-modello-di-mercato-causalità)
9. [Aziende: gestione, forme giuridiche, fallimento](#9-aziende-gestione-forme-giuridiche-fallimento)
10. [Mercato del lavoro e dirigenti](#10-mercato-del-lavoro-e-dirigenti)
11. [Servizi professionali](#11-servizi-professionali)
12. [Finanza: banca, borsa, fondi, settore finanziario](#12-finanza-banca-borsa-fondi-settore-finanziario)
13. [Macroeconomia della città](#13-macroeconomia-della-città)
14. [Competizione: silenziosa, OPA/OPAS, cause legali](#14-competizione-silenziosa-opaopas-cause-legali)
15. [Consorzi](#15-consorzi)
16. [Contratti](#16-contratti)
17. [Informazione e Giornale](#17-informazione-e-giornale)
18. [Classifica e stagioni](#18-classifica-e-stagioni)
19. [Esperienza del giocatore](#19-esperienza-del-giocatore)
20. [Integrità, anti-abuso e moderazione](#20-integrità-anti-abuso-e-moderazione)
21. [Fuori scope al lancio / espansioni](#21-fuori-scope-al-lancio--espansioni)
22. [Domande aperte](#22-domande-aperte)
23. [Appendice A — Parametri di bilanciamento iniziali](#appendice-a--parametri-di-bilanciamento-iniziali)
24. [Appendice B — Glossario](#appendice-b--glossario)

---

## 1. Visione e pilastri

Gioco di strategia economica **multiplayer online, persistente**, in cui ogni giocatore sceglie una classe (Dipendente, Libero professionista, Imprenditore, Investitore) e compete per il primo posto in classifica in un'economia **circolare e causale**, interamente fatta dalle scelte e dalle relazioni tra giocatori.

**Pilastri**

1. **Cashflow realistico** — entrate attive vs passive, asset vs passività, leva, rischio. L'obiettivo emotivo è l'indipendenza finanziaria.
2. **Interdipendenza tra classi** — nessuna classe prospera da sola: ognuna produce ciò che serve alle altre.
3. **Causalità** — ogni risultato ha cause leggibili (prezzo, qualità, capacità, persone, filiera). Chi ha l'insieme di fattori migliore prospera.
4. **Competizione e cooperazione** — competizione silenziosa sul mercato, scontri dichiarati solo tramite OPA/OPAS e cause legali, alleanze tramite consorzi.
5. **Strategico e competitivo, ma educativo** — meccaniche ispirate al mondo reale, ogni numero ha un "Perché?".
6. **Equità** — nessun pay-to-win, stagioni con reset, patrimonio iniziale uguale per tutti.

**Pubblico**: giocatori di strategia/gestionali, appassionati di business e finanza personale. Ambientazione internazionale (regole generiche, non legate a un paese); lingue al lancio italiano e inglese.

---

## 2. Formato, tempo e ritmo

| Elemento         | Decisione                                                                                                                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Piattaforme      | **Web app responsive**: rileva se sei da mobile e adatta l'interfaccia. Stesso account. Mobile per il ciclo quotidiano, computer per la sessione strategica. Installabile sulla schermata home (PWA) |
| Lingue al lancio | Italiano e inglese                                                                                                                                                                                   |
| Mondo            | Persistente e asincrono                                                                                                                                                                              |
| Città            | **Una città** per istanza di gioco, circa 200–500 giocatori                                                                                                                                          |
| Tempo            | **1 giorno reale = 1 mese di gioco**                                                                                                                                                                 |
| Tick             | **4 tick settimanali** al giorno (circa ogni 6 ore) + **chiusura mensile**                                                                                                                           |
| Stagione         | **Esattamente 5 anni di gioco = 60 mesi = 60 giorni reali**                                                                                                                                          |
| Ingresso         | Si può entrare in qualsiasi momento della stagione, sempre con lo stesso pacchetto iniziale                                                                                                          |

**Orari fissi in UTC** (pubblico internazionale): tick alle 00:00, 06:00, 12:00, 18:00 UTC. La chiusura mensile coincide con il tick delle 00:00.

**Città piena**: raggiunta la capienza, si apre una nuova istanza (città separata, economia indipendente). Il giocatore sceglie la città a inizio stagione. Le classifiche sono per città, più una classifica globale solo onorifica.

**Cosa succede a ogni tick settimanale**: produzione, approvvigionamento, vendite, flussi di clienti, dimissioni e assunzioni, contabilità settimanale.
**Cosa succede alla chiusura mensile**: stipendi, affitti, paniere personale, interessi, tasse, dividendi, commissioni dei fondi, esperienza e tratti, reputazione, rating, Valore Economico e classifica, ricarica delle ore, benessere.
**Continuo**: borsa (24/7), marketplace, chat, firma dei contratti.

La pipeline esatta è nel piano di implementazione (§ Pipeline del tick).

**Più tempo passi, più sei premiato**, ma il tempo reale dà **più occasioni, non più ore di gioco**:

- più momenti di decisione (puoi correggere prezzi e produzione a ogni tick);
- occasioni a tempo (appalti pubblici, offerte a prezzo di saldo, beni messi in vendita sotto prezzo);
- più informazione (Giornale, bilanci, movimenti di borsa);
- più relazioni (trattative, consorzi).

**Unico paletto**: ogni evento ostile (OPA, causa) concede **almeno 24 ore reali** per reagire. **Nessuna modalità ferie**: chi è assente va avanti col pilota automatico e peggiora lentamente.

---

## 3. Risorse del giocatore

| Risorsa               | Descrizione                                                                   | Note                                                                                               |
| --------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Crediti (Cr)**      | Liquidità, unico mezzo di scambio                                             | Non sono l'unica risorsa: tutto ciò che si usa va comprato da qualcuno (§7)                        |
| **Tempo**             | **200 ore/mese** per tutti, fino a 260 pagando in benessere                   | Le ore non usate si perdono. Le ore libere non assegnate diventano riposo (+benessere)             |
| **Competenze**        | 6 competenze, livelli 1–10                                                    | §5                                                                                                 |
| **Reputazione**       | 0–100, personale; le aziende hanno una propria reputazione                    | Fattore della classifica (±10%)                                                                    |
| **Network**           | Numero e qualità dei contatti                                                 | Cresce con contratti conclusi, consorzio, mentoring; sblocca la visibilità delle offerte riservate |
| **Rating di credito** | AAA → D                                                                       | Determina accesso e costo del debito (§12.1)                                                       |
| **Benessere**         | 0–100                                                                         | Influisce su produttività e ore efficaci                                                           |
| **Beni**              | Aziende, quote, immobili, posizioni, fondi, brevetti, proprietà intellettuale | Concorrono al patrimonio                                                                           |

### 3.1 Benessere

- Parte da 70.
- Ogni ora oltre le 200 costa −0,3 di benessere.
- La qualità del paniere personale (§7) dà da −10 a +10 al mese; il riposo da 0 a +10.
- Sotto 40: produttività −10%. Sotto 20: **burnout**, produttività −30% e 60 ore di riposo forzato il mese successivo.

### 3.2 Reputazione

Sale con risultati misurati: aziende in utile, clienti soddisfatti, contratti rispettati, cause vinte, fondi positivi.
Scende con insolvenze, cause perse, cause temerarie, fallimenti, licenziamenti di massa.
Decade lentamente verso 50 se si resta inattivi.

---

## 4. Le 4 classi

### 4.1 Condizioni di partenza (stesso patrimonio netto: 10.000 Cr)

|                 | **Dipendente**                                                                   | **Libero professionista**                                 | **Imprenditore**                                        | **Investitore**                                                   |
| --------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------- |
| Liquidità       | 10.000                                                                           | 6.000                                                     | 5.000                                                   | 100.000                                                           |
| Altri beni      | –                                                                                | 4.000 (attrezzatura)                                      | Ditta da 30.000                                         | –                                                                 |
| Debiti          | –                                                                                | –                                                         | 25.000 (prestito d'avviamento)                          | 90.000 (capitale dei soci, 3%/anno, restituzione a fine stagione) |
| Reddito         | Stipendio sicuro 2.200/mese (posto garantito in un'azienda gestita dal computer) | Circa 2.800/mese da 2 clienti, variabile                  | Utile da −1.000 a +2.000/mese                           | Nessuno                                                           |
| Rating          | A                                                                                | B                                                         | BB                                                      | A                                                                 |
| Competenze      | Ruolo 2                                                                          | Professione 4 + abilitazione                              | Gestione 3                                              | Finanza 4                                                         |
| Ore libere      | Circa 40                                                                         | 200 flessibili                                            | Circa 120                                               | 200                                                               |
| Scelta iniziale | Ruolo: Operativo, Tecnico, Commerciale, Amministrativo                           | Professione: Legale, Fiscale, Marketing, Tecnico, Finanza | Settore: Ristorazione, Commercio, Tecnologia, Logistica | –                                                                 |

**Talento d'origine** (permanente, non acquisibile da altri): +15% di esperienza nelle competenze tipiche della classe di partenza.

**Perché l'investitore parte con più capitale (Fase 2).** Le simulazioni hanno mostrato che, a parità di patrimonio netto, chi parte senza reddito è svantaggiato: lo stipendio del dipendente vale come capitale umano. L'investitore riceve quindi più capitale dei soci (90.000 Cr al 3%, da restituire a fine stagione). Il patrimonio netto resta 10.000 Cr, ma ha la massa critica per usare i soldi degli altri, che è il suo mestiere.

### 4.2 Cosa fa ogni classe

| Classe                    | Azioni esclusive                                                                                                          | Dipende da                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| **Dipendente**            | Carriera (Junior → Dirigente), focus mensile, stock option, incarichi da consigliere indipendente, mutuo agevolato        | Aziende che assumono                            |
| **Libero professionista** | Fissa la tariffa, accetta incarichi che danno bonus alle aziende (§11), apre uno studio, crea un prodotto con royalty     | Clienti (aziende, investitori, persone)         |
| **Imprenditore**          | Fonda e gestisce aziende, prezzi e budget per area, assunzioni, quotazione in borsa, fusioni e acquisizioni, OPA          | Dipendenti, professionisti, capitale, fornitori |
| **Investitore**           | Borsa (anche allo scoperto), quote di SRL, prestiti tra giocatori, immobili e posizioni, fondi per i risparmi altrui, OPA | Aziende, inquilini, professionisti              |

### 4.3 Focus mensile del dipendente

Per dare decisioni attive anche al dipendente, ogni mese sceglie un **focus** che modifica il suo contributo e i tratti che può guadagnare:

| Focus        | Effetto                                           |
| ------------ | ------------------------------------------------- |
| Produttività | +10% di produttività                              |
| Innovazione  | Contributo alla qualità e alla ricerca e sviluppo |
| Relazioni    | +network, +morale della squadra                   |
| Crescita     | +esperienza, −5% di produttività                  |

Inoltre il dipendente decide su straordinari, studio, offerte ricevute, rinnovi e risparmi (fondi, banca, borsa).

---

## 5. Competenze, carriere, tratti e salto di classe

### 5.1 Competenze

Sono 6, con livelli da 1 a 10: **Tecnica, Commerciale, Legale, Contabilità e fisco, Finanza, Gestione e leadership**.

**Come si guadagna esperienza**:

- **studio**: costa ore e Cr; i corsi possono essere venduti da professionisti;
- **pratica**: lavorare nel ruolo;
- **mentoring**: piccolo bonus.

**Ritmo indicativo** per un giocatore attivo: livello 3 in circa 3 mesi, livello 6 in circa 12, livello 10 in circa 36.
**Curva**: esperienza cumulata per il livello n = 100 × n².

### 5.2 Carriere interne

**Dipendente** (il ruolo si ottiene solo se un'azienda ti assume):

| Livello             | Requisiti                             | Effetto                                                                        |
| ------------------- | ------------------------------------- | ------------------------------------------------------------------------------ |
| Junior              | All'inizio                            | Stipendio base                                                                 |
| Senior              | Competenza di ruolo 4 + 6 mesi        | Stipendio ×1,5                                                                 |
| Manager             | Ruolo 6 + Gestione 4 + reputazione 40 | Stipendio ×2,5, +10% di produttività alla squadra (max 10 persone)             |
| Dirigente (C-level) | Ruolo 7 + Gestione 7 + reputazione 60 | Stipendio ×4+, bonus a tutta l'azienda, stock option, incarichi da consigliere |

**Libero professionista:**

| Livello   | Requisiti                           | Effetto                                                                      |
| --------- | ----------------------------------- | ---------------------------------------------------------------------------- |
| Abilitato | All'inizio                          | Tariffa base                                                                 |
| Affermato | 10 clienti serviti + reputazione 40 | Tariffa massima più alta                                                     |
| Studio    | Gestione 3                          | Fino a 5 collaboratori, guadagna anche sulle loro ore                        |
| Prodotto  | Professione 8                       | Crea un prodotto proprio (corso, software, metodo) che rende royalty passive |

**Imprenditore:**

| Livello           | Requisiti                                                  | Effetto                                                             |
| ----------------- | ---------------------------------------------------------- | ------------------------------------------------------------------- |
| Ditta individuale | All'inizio                                                 | 1 sede, max 5 dipendenti, **responsabilità personale illimitata**   |
| SRL               | 10.000 Cr di capitale + Gestione 4                         | Responsabilità limitata, max 50 dipendenti, 3 sedi, quote vendibili |
| SPA               | 100.000 Cr di capitale + Gestione 6 + 4 trimestri in utile | Nessun limite, può quotarsi                                         |
| Holding           | Controllo di almeno 3 aziende                              | Sinergie, fusioni e acquisizioni                                    |

**Investitore:**

| Livello             | Requisiti                        | Effetto                                                                          |
| ------------------- | -------------------------------- | -------------------------------------------------------------------------------- |
| Risparmiatore       | All'inizio                       | Fondi indice gestiti dal computer, borsa, prestiti tra giocatori fino a 5.000 Cr |
| Business angel      | Finanza 4 + patrimonio 50.000    | Quote di SRL                                                                     |
| Gestore             | Finanza 5 + 6 mesi di storico    | Può aprire un fondo (§12.4)                                                      |
| VC / immobiliarista | Finanza 6 + patrimonio 250.000   | Affari grandi a debito, sedi su misura                                           |
| Raider              | Finanza 8 + patrimonio 1.000.000 | Può guidare un'OPA                                                               |

Il livello "Gestore" è stato inserito per collocare l'apertura dei fondi nella scala dell'investitore.

### 5.3 Tratti (tutte le classi)

- Si guadagnano **solo con risultati misurati dal sistema**, mai con recensioni dei giocatori.
- Migliorano ciò che porti agli altri (efficacia, fiducia, condizioni), mai la fortuna.
- Sono visibili nel curriculum pubblico.

| Classe         | Tratto                  | Come si ottiene                              | Effetto                                                 |
| -------------- | ----------------------- | -------------------------------------------- | ------------------------------------------------------- |
| Dipendente     | Specialista di settore  | ≥12 mesi nello stesso settore                | Bonus in quel settore                                   |
| Dipendente     | Turnaround              | Ha riportato in utile un'azienda in perdita  | Bonus grande in aziende in difficoltà                   |
| Dipendente     | Crescita                | Ha guidato un'azienda in forte espansione    | Bonus nelle fasi di scalata                             |
| Dipendente     | Calamita di talenti     | Ha attirato e trattenuto talenti             | +attrattività dell'azienda sul mercato del lavoro       |
| Dipendente     | Negoziatore             | Molti contratti chiusi bene                  | Condizioni migliori con fornitori e clienti             |
| Professionista | Imbattuto (Legale)      | Alta percentuale di cause vinte              | +efficacia in tribunale                                 |
| Professionista | Esperto OPA (Legale)    | OPA o difese concluse con successo           | Bonus nelle scalate                                     |
| Professionista | Ottimizzatore (Fiscale) | Molte tasse risparmiate ai clienti           | Risparmio fiscale maggiore                              |
| Professionista | Lanciatore (Marketing)  | Clienti cresciuti dopo le sue campagne       | +acquisizione di clienti                                |
| Professionista | Innovatore (Tecnico)    | Salti di qualità nei clienti                 | +qualità                                                |
| Professionista | Dealmaker (Finanza)     | Quotazioni e OPA riuscite                    | Condizioni migliori nelle operazioni                    |
| Professionista | Clienti fedeli (tutte)  | Alta permanenza dei clienti                  | Può alzare la tariffa                                   |
| Imprenditore   | Fondatore di successo   | Un'azienda ha superato una soglia di valore  | Le nuove aziende ereditano parte di reputazione e brand |
| Imprenditore   | Exit                    | Ha venduto o quotato un'azienda              | Capitale a condizioni migliori                          |
| Imprenditore   | Specialista di settore  | Più aziende di successo nello stesso settore | Avvio più rapido e costi iniziali più bassi             |
| Imprenditore   | Scalatore               | Ha portato un'azienda fino a SPA             | Costi di gestione della crescita più bassi              |
| Imprenditore   | Lezione imparata        | Un fallimento                                | Piccolo bonus; il rating resta segnato                  |
| Investitore    | Rendimento costante     | Fondo positivo con poca oscillazione         | Visibilità, fiducia, tetto gestito più alto             |
| Investitore    | Batte il mercato        | Rendimento superiore all'indice della città  | Come sopra                                              |
| Investitore    | Anticrisi               | Positivo anche in recessione                 | Come sopra + strumenti di analisi                       |

**Regole generali**:

- ogni tratto ha 3 gradi (I–III), con effetto da +3% a +10% per grado;
- un giocatore può avere al massimo 5 tratti attivi;
- tratti e curriculum restano nell'albo d'oro tra le stagioni, ma **non danno effetti** nella stagione successiva.

### 5.4 Salto di classe

Si sceglie una **classe d'origine**. Le altre classi si sbloccano con dei requisiti e si possono **cumulare**: il limite è il tempo (200 ore).

| Classe da sbloccare     | Requisiti                                                                  |
| ----------------------- | -------------------------------------------------------------------------- |
| Imprenditore            | 10.000 Cr di capitale (o un investitore che ti finanzia) + Gestione 3      |
| Libero professionista   | Competenza specialistica 4 + esame (40 ore + 2.000 Cr) + reputazione 30    |
| Investitore             | 50.000 Cr investibili + Finanza 3                                          |
| Dipendente              | Sempre, se qualcuno ti assume                                              |
| **Licenza finanziaria** | Imprenditore e Investitore attivi + Finanza 7 + SPA con capitale ≥ 500.000 |

**Disattivazione**: una classe si può disattivare liberamente. Riattivarla richiede di soddisfare ancora i requisiti, ma senza ripetere l'esame.

### 5.5 Ritmo di progressione desiderato

- **Mesi 0–6**: imparare la propria classe.
- **Mesi 6–18**: primo salto o seconda classe.
- **Mesi 18–36**: due classi attive, beni importanti, possibile indipendenza finanziaria.
- **Mesi 36–60**: livello massimo (SPA, OPA, licenza finanziaria) solo per i migliori.

---

## 6. Settori e filiera

Ogni settore produce **un bene astratto** con **qualità** e **prezzo**, in un **unico segmento** di mercato.

| Livello        | Settore           | Vende a                                         | Si apre con       | Capitale   | Lavoro          | Fattore chiave               |
| -------------- | ----------------- | ----------------------------------------------- | ----------------- | ---------- | --------------- | ---------------------------- |
| Primario       | **Energia**       | Tutti                                           | SPA               | Molto alto | Basso           | Prezzo, affidabilità         |
| Primario       | **Materie prime** | Manifattura, Edilizia, Ristorazione             | SRL               | Medio-alto | Medio           | Prezzo (molto sensibile)     |
| Trasformazione | **Manifattura**   | Commercio, Edilizia                             | SRL               | Alto       | Alto            | Qualità, capacità            |
| Trasformazione | **Edilizia**      | Investitori, aziende (immobili, sedi su misura) | SRL               | Medio      | Alto            | Tassi, liquidità             |
| Servizi        | **Logistica**     | Tutte le filiere fisiche                        | Ditta individuale | Medio      | Alto            | Affidabilità, capacità       |
| Servizi        | **Tecnologia**    | Aziende (+produttività) e persone               | Ditta individuale | Basso      | Tecnici costosi | Innovazione, ricerca         |
| Servizi        | **Commercio**     | Persone                                         | Ditta individuale | Medio      | Medio           | Prezzo, brand, posizione     |
| Servizi        | **Ristorazione**  | Persone                                         | Ditta individuale | Basso      | Molto alto      | Qualità, servizio, posizione |
| Finanza        | **Finanziario**   | Tutti                                           | SPA + licenza     | Alto       | Medio           | Fiducia, tassi, rendimento   |

### 6.1 Filiera e input

Ogni unità prodotta richiede input da altri settori. **Matrice degli input iniziale** (frazione del costo di produzione):

| Produttore ↓ / Input → | Energia | Materie prime | Manifattura  | Logistica | Tecnologia |
| ---------------------- | ------- | ------------- | ------------ | --------- | ---------- |
| Energia                | –       | 0,30          | 0,10         | 0,05      | 0,05       |
| Materie prime          | 0,20    | –             | 0,05         | 0,15      | 0,05       |
| Manifattura            | 0,15    | 0,40          | –            | 0,10      | 0,05       |
| Edilizia               | 0,05    | 0,25          | 0,25         | 0,10      | 0,05       |
| Logistica              | 0,25    | –             | 0,05         | –         | 0,10       |
| Tecnologia             | 0,10    | –             | 0,05         | –         | –          |
| Commercio              | 0,05    | –             | 0,50 (merci) | 0,15      | 0,05       |
| Ristorazione           | 0,10    | 0,35          | –            | 0,05      | 0,05       |
| Finanziario            | 0,03    | –             | –            | –         | 0,15       |

Il resto del costo è lavoro, sede e budget delle aree aziendali.

**La Tecnologia acquistata** non è consumata come input fisico: dà un **moltiplicatore di produttività** (e, per le persone, di efficienza delle ore).

**Fornitori gestiti dal computer** (operatore cittadino) per ogni settore:

- prezzo **+30%** sull'indice di settore;
- qualità bassa;
- capacità illimitata.

Garantiscono che il gioco funzioni anche con settori vuoti, e ogni buco è un'occasione per i giocatori.

**Logistica**: le merci fisiche viaggiano tramite un fornitore logistico. La sua affidabilità si propaga: consegne in ritardo riducono gli input disponibili, quindi la capacità, quindi la soddisfazione dei clienti.

### 6.2 Posizioni (sedi)

**Illimitate ma tutte diverse.** Cercando una sede, la città propone 3–4 opzioni generate al momento, con:

- flusso di persone e visibilità (Commercio, Ristorazione);
- dimensione, che limita la capacità (Manifattura, Logistica, Energia);
- prestigio della zona, che attira talenti (Tecnologia, Finanziario);
- prezzo d'acquisto o affitto.

Le posizioni eccellenti sono rare. Ripetere la ricerca costa 5 ore + 200 Cr.
**Edilizia**: costruisce sedi su misura con caratteristiche scelte, oltre il massimo delle posizioni casuali, a costo e tempo maggiori.
Gli investitori comprano posizioni e le affittano: si crea un mercato immobiliare vero.

### 6.2.1 Immobili (Fase 2)

- **Due tipi di unità:** residenziali, affittate alle persone (la quota "casa" del paniere), e commerciali, affittate alle aziende (l'affitto della sede).
- **Affitto di mercato:** 100 Cr al mese per un'unità residenziale e 400 per una commerciale, indicizzati ai costi.
- **Prezzo:** affitto netto annuo diviso per il rendimento richiesto (7,5% + metà dello scostamento dei tassi dal neutrale). Con tassi alti i prezzi scendono.
- **Mercato degli affitti:** gli affitti passano da un conto di compensazione. La quota corrispondente alle unità dei giocatori va ai proprietari (meno il 10% di manutenzione), il resto all'operatore cittadino. Se i giocatori possiedono più unità di quante ne servano, l'occupazione scende.
- **Chi compra:** solo gli investitori, entro un numero di unità che dipende dal livello (risparmiatore 2, business angel 10, venture 100, raider 1.000). Compravendita con la città, commissione del 3%.

### 6.3 Barriere e visibilità

All'inizio l'interfaccia mostra solo i settori accessibili (ditta individuale). Gli altri compaiono con SRL, SPA e licenza.

---

## 7. Economia circolare e consumi personali

I **Crediti sono solo il mezzo di scambio**: ogni risorsa usata è prodotta da qualcuno e va comprata.

### 7.1 Paniere personale

Il costo della vita non si paga "alla città" ma è un **paniere di beni e servizi** comprato dai settori:

| Voce               | Fornitore                                                           | Effetto della qualità                                              |
| ------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Cibo e pasti       | Ristorazione, Commercio                                             | Benessere                                                          |
| Casa               | Investitori/immobili (prodotti dall'Edilizia) o operatore cittadino | Benessere, reputazione                                             |
| Energia            | Energia                                                             | Necessaria, nessun bonus                                           |
| Beni di consumo    | Commercio                                                           | Benessere                                                          |
| Strumenti digitali | Tecnologia                                                          | **Efficienza delle ore**: le azioni costano meno ore (fino a −10%) |
| Servizi bancari    | Finanziario                                                         | Interessi sui depositi, costo del credito                          |

**Livello di vita** (5 livelli: base, comodo, agiato, lusso, élite): determina dimensione e costo del paniere (base circa 1.200 Cr/mese), benessere e reputazione. Gonfiare lo stile di vita è una trappola del cashflow, ed è voluto.

**Mancato pagamento del paniere**: se la liquidità non basta, il paniere scende automaticamente al livello base. Se nemmeno quello è coperto, scatta il debito verso l'operatore cittadino (rating −1 gradino, benessere −15).

### 7.2 Consumi di professionisti e aziende

- **Professionisti**: strumenti (Tecnologia), ufficio (immobili), energia, servizi.
- **Aziende**: input della filiera (§6.1), sede, personale, budget per area (§9.2).

### 7.3 Da chi comprare

**Fonti**: offerte delle aziende dei giocatori, oppure l'operatore cittadino (+30%, qualità bassa).

**Modalità**:

- **spot**;
- **abbonamento/contratto** (prezzo e quantità bloccati, eventuale esclusiva);
- **interno al consorzio**: sconto 0–20% scelto dal venditore, niente commissione.

**Pilota automatico** con regola a scelta: "fornitore abituale", "il più conveniente", "migliore qualità/prezzo", "prima il consorzio".

### 7.4 Domanda dei personaggi gestiti dal computer

Ogni settore ha un **minimo fisso di domanda** gestito dal computer, quanto basta perché domanda e offerta si muovano anche con pochi giocatori:

- per i settori che vendono alle persone è la popolazione cittadina;
- per quelli che vendono alle aziende è l'industria cittadina (calibrazione Fase 1: senza questa domanda materie prime, manifattura e logistica restano vuote in una città piccola).

**I consumi dei giocatori e gli acquisti delle aziende dei giocatori si sommano sopra.**

La spesa della popolazione cresce con il monte stipendi pagato in città (moltiplicatore 0,8–1,2), così salari più alti significano più consumi: effetto keynesiano.

---

## 8. Modello di mercato (causalità)

Un **mercato** = (città, settore). Lo stesso modello vale per i mercati tra aziende, quelli verso le persone e il mercato del lavoro (§10).

### 8.1 Attrattività

```
A_i = Q_i^a · B_i^b · S_i^c · R_i^d · L_i^e · (P_rif / P_i)^ε
```

- **Q** qualità, **B** brand, **S** servizio, **R** reputazione dell'azienda, **L** posizione (vale 1 dove non conta). Sono indici normalizzati, dove 1 = media di mercato.
- **P_rif** è il prezzo di riferimento del settore.
- **ε** è l'elasticità al prezzo del settore. Esponenti per settore in Appendice A.

### 8.2 Flusso clienti (per tick)

1. **Clienti in cerca**: `U = nuovi entranti + clienti persi da tutti + quota di dormienti`.
2. **Visibilità**: `V_i = f(brand) + ρ · C_i · max(0, Sod_i − soglia)`. Il secondo termine è il passaparola.
3. **Quota acquisita**: `share_i = A_i·V_i / (A_0 + Σ_j A_j·V_j)`. A_0 è l'opzione esterna (operatore cittadino o rinuncia): se tutte le aziende sono scarse, il mercato si restringe.
4. **Churn**: `churn_i = c_base · exp(−γ·(Sod_i − Sod_media)) · (1 + δ · max(0, A_max − A_i)/A_max)`
5. **Clienti**: `C_i(t+1) = C_i·(1 − churn_i) + share_i·U`
6. **Vendite**: `min(domanda dei clienti, capacità produttiva, input disponibili)`.
7. **Soddisfazione**: `Sod_i = f(qualità/prezzo rispetto alle attese, quota di domanda servita)`. Domanda non servita fa scendere la soddisfazione, che fa salire il churn al tick successivo.

### 8.3 Stock che evolvono

- **Brand**: `B(t+1) = B(t)·(1 − δ_B) + η · ln(1 + M/M_rif)`, con M = spesa in marketing. Rendimenti decrescenti e decadimento.
- **Qualità**: `Q = f(stock R&S con decadimento, competenza tecnica del personale, qualità degli input, servizi tecnici, brevetti)`.
- **Capacità**: `Σ produttività_k · ore_k · moltiplicatore_tecnologia · morale · (1 − overhead(N))`.
- **Overhead**: `overhead(N) = o · (N / N_rif)^1,3`, ridotto da CEO, COO e Manager.

### 8.4 Freni all'effetto valanga

- Marketing logaritmico e brand che decade.
- Overhead che cresce più che proporzionalmente con la dimensione.
- Capacità vincolata da persone e input.
- **Antitrust**: sopra il 40% di quota di un settore, niente acquisizioni in quel settore e i prezzi sotto costo diventano causa fondata.

### 8.5 Mercati tra aziende

Stesso modello, con due differenze:

- la domanda è derivata dalla produzione dei clienti;
- i contratti di fornitura riservano volumi fuori dal mercato spot (churn più basso, prezzo bloccato).

---

## 9. Aziende: gestione, forme giuridiche, fallimento

### 9.1 Fondazione

Si scelgono settore e sede; si versa il capitale (o lo si raccoglie da investitori).
Una ditta nuova parte con una **piccola clientela pari alla sua capacità iniziale**, sottratta all'operatore cittadino, come chi rileva un'attività avviata (calibrazione Fase 1).
Tempo di avvio: 1 mese di gioco (ridotto dai tratti "Specialista di settore" e "Fondatore di successo").

### 9.2 Leve dell'imprenditore

**Leve**: prezzo; budget per area; assunzioni e licenziamenti; fornitori e contratti; sedi; dividendi; raccolta di capitale.

| Area di budget      | Fattore che alimenta           |
| ------------------- | ------------------------------ |
| Marketing           | Brand (B), visibilità          |
| Ricerca e sviluppo  | Qualità (Q), brevetti          |
| Formazione          | Produttività, morale           |
| Qualità degli input | Qualità (Q)                    |
| Tecnologia          | Moltiplicatore di produttività |
| Servizio clienti    | Servizio (S)                   |

**Ore del fondatore**: gestire un'azienda piccola costa 40 ore al mese, che scendono a 10 con un CEO.
**Senza gestione** (meno ore del necessario e nessun CEO): l'azienda va in pilota automatico con −10% di efficienza.

**Remunerazione del fondatore**: stipendio (reddito attivo, tassato come persona) oppure dividendi (passivi, tassati al 20%). È una scelta educativa.

### 9.2.1 Attrezzature e quote (Fase 2)

- **Attrezzature:** ogni lavoratore richiede attrezzature con un costo per settore (da 3.000 Cr nella tecnologia a 50.000 nell'energia). Si comprano quando si assume e si ammortizzano dell'1% al mese (costo in conto economico). Se mancano, i lavoratori rendono meno (fino al 50%). Crescere richiede capitale: credito bancario, prestiti tra giocatori o quote.
- **Quote:** SRL e SPA possono vendere quote agli investitori. Il denaro entra nella società come aumento di capitale, tutte le quote esistenti vengono diluite, e il titolare deve restare sopra il 50%. Dividendi e valore della società si dividono in proporzione alle quote.
- **Fondazione di nuove aziende:** serve la classe Imprenditore attiva, il capitale minimo della forma giuridica (ditta 5.000, SRL 10.000, SPA 100.000, licenza finanziaria 500.000) e 40 ore al mese di gestione.
- **Trasformazione:** ditta → SRL con Gestione 4 e 10.000 Cr in cassa; SRL → SPA con Gestione 6, 100.000 Cr di patrimonio e 12 mesi in utile.

### 9.3 Brevetti

- Quando lo stock di ricerca e sviluppo supera una soglia, si può registrare un brevetto (costo + professionista Legale).
- Effetto: +qualità protetta per 24 mesi.
- Un concorrente che raggiunge una qualità equivalente senza licenza rende fondata una causa per violazione.
- Il titolare può concedere **licenze** a royalty, che contano come cashflow passivo.

### 9.4 Forme giuridiche

Ditta individuale → SRL → SPA → Holding (§5.2).

- **SRL**: quote cedibili con accordo dei soci.
- **SPA**: azioni; può quotarsi (§12.3).

### 9.5 Fallimento

**Quando**: liquidità negativa per 2 tick consecutivi senza credito disponibile → procedura di insolvenza.

**Ordine di pagamento dei creditori**:

1. dipendenti;
2. fisco;
3. banche e prestatori con garanzia;
4. fornitori;
5. altri;
6. soci.

**Conseguenze**:

- **Ditta individuale**: il debito residuo passa alla persona.
- **SRL/SPA**: si perde l'azienda.
- **Fallimento personale**: rating D, liquidità azzerata, debiti in parte cancellati; si continua a giocare nella stessa stagione.

---

## 10. Mercato del lavoro e dirigenti

### 10.1 Mercato del lavoro

Usa lo stesso modello del §8.

**Attrattività di un posto di lavoro**:

```
A_job = salario^a · ambiente^b · prestigio^c · carriera^d
```

- **ambiente** = morale e cultura aziendale;
- **prestigio** = brand, zona della sede, tratto "Calamita di talenti".

**Dimissioni**: seguono la formula del churn applicata al **morale**.

```
morale = f(salario / media di mercato, carico di ore, leadership, benessere)
```

**Lavoratori gestiti dal computer**: disponibili al salario di mercato finché ci sono disoccupati in città, con produttività al 70% e nessun bonus.

**Lavoro presso datori gestiti dal computer**: chiunque non abbia un lavoro può accettarne uno al salario base del dipendente, indicizzato ai costi.

**Disoccupazione**: chi perde il lavoro riceve un sussidio dalla città pari al 60% dell'ultimo stipendio per 6 mesi (massimo 3.000 Cr/mese). In Fase 1 il sussidio è attivo dopo il fallimento personale, pari al 60% del salario base del dipendente.

### 10.2 Bonus del dipendente giocatore

| Livello   | Effetto                                    | Stipendio indicativo (Cr/mese)    |
| --------- | ------------------------------------------ | --------------------------------- |
| Junior    | Produttività 100%                          | 2.000–2.500                       |
| Senior    | 130% + 1 tratto                            | 3.000–4.000                       |
| Manager   | +10% alla squadra (fino a 10 persone)      | 5.000–8.000                       |
| Dirigente | Bonus a tutta l'azienda nella propria area | 10.000–30.000 + variabile + quote |

### 10.3 Ruoli dirigenziali (uno per ruolo per azienda)

| Ruolo | Competenza            | Effetto                                                               |
| ----- | --------------------- | --------------------------------------------------------------------- |
| CEO   | Gestione e leadership | +5–10% su tutto, overhead −30%, +morale, ore del fondatore da 40 a 10 |
| CFO   | Finanza               | Tassi più bassi, gestione della cassa, bonus in OPA e quotazioni      |
| CTO   | Tecnica               | +qualità, ricerca e sviluppo più efficiente                           |
| CMO   | Commerciale           | +acquisizione clienti, +brand                                         |
| COO   | Gestione              | +capacità, −sprechi                                                   |

### 10.4 Pacchetto retributivo

- **Fisso.**
- **Variabile** sui risultati, calcolato in automatico (percentuale dell'utile o premio sulla crescita).
- **Stock option** con maturazione progressiva (25% ogni 12 mesi).
- **Paracadute**, pagato in caso di licenziamento **o di OPA riuscita**: chi acquisisce eredita i contratti.
- **Patto di non concorrenza**: se violato, causa fondata.
- **Preavviso** di dimissioni o licenziamento: 1 mese di gioco (personalizzabile nel contratto).

### 10.5 Rischio condiviso e incarichi multipli

- La reputazione del dirigente sale e scende con i risultati dell'azienda.
- **Consigliere d'amministrazione indipendente**: circa 10 ore al mese per incarico, compenso fisso, piccolo bonus di governance. Massimo 3 incarichi.

---

## 11. Servizi professionali

### 11.1 Incarico

Un incarico è un contratto (§16) che specifica:

- tipo di servizio;
- ore richieste;
- prezzo (tariffa × ore o forfait);
- durata;
- obiettivo.

**Effetto sul cliente**:

```
effetto = base(professione) · f(competenza) · f(ore) · (1 + bonus tratti)
```

| Professione | Effetto tipico                                                 |
| ----------- | -------------------------------------------------------------- |
| Legale      | Difesa/attacco in cause e OPA; contratti più solidi            |
| Fiscale     | −% di tasse dell'azienda o della persona                       |
| Marketing   | +% di acquisizione clienti per N mesi                          |
| Tecnico     | +qualità, ricerca e sviluppo più efficiente                    |
| Finanza     | Migliori condizioni di credito, quotazioni, OPA, due diligence |

**Cumulo**: un secondo servizio dello stesso tipo nella stessa azienda vale il 50%, il terzo il 25%. Tetto massimo per effetto (Appendice A).

**Valutazione**: il risultato è misurato dal sistema (es. clienti acquisiti, tasse risparmiate), alimenta i tratti e la reputazione.

**Professionisti gestiti dal computer**: costano 1,5 volte e rendono meno.

### 11.2 Informazione come servizio

I professionisti (Finanza, Marketing) possono vendere **report sui concorrenti** in tempo reale (§17). Costo e precisione dipendono dalla competenza.

---

## 12. Finanza: banca, borsa, fondi, settore finanziario

### 12.1 Banca gestita dal computer e rating

**Tasso** = tasso di riferimento (§13) + spread del rating.

**Rating**: punteggio 0–1000 da stabilità del reddito, rapporto debito/reddito, storico dei pagamenti e patrimonio, convertito in classi AAA…D.

**Spread indicativi**:

| Rating | AAA | AA    | A   | BBB | BB    | B     | CCC  | D              |
| ------ | --- | ----- | --- | --- | ----- | ----- | ---- | -------------- |
| Spread | +1% | +1,5% | +2% | +3% | +4,5% | +6,5% | +10% | nessun credito |

**Prodotti**: depositi, prestiti, mutui (agevolati per i dipendenti con contratto stabile), fidi alle aziende.

### 12.2 Prestiti tra giocatori

Implementati in Fase 2:

- **Offerte:** l'investitore pubblica un'offerta (importo, tasso, durata) entro il limite del suo livello; l'importo viene **accantonato su un conto di garanzia**, quindi un'offerta è sempre coperta. Ritirandola, il denaro torna disponibile.
- **Accettazione:** chiunque può accettarla, per sé o per la propria azienda, se le rate restano sostenibili rispetto al reddito (come per la banca).
- **Rate:** il sistema le paga in automatico al prestatore. Se il debitore non paga, **nessuno copre il buco**: dopo 3 mesi di insolvenza il prestito è perso, il debitore perde reputazione.
- **Fallimento del debitore:** la liquidazione ripaga il prestatore per quanto possibile.
- **Prestito sul portafoglio (solo investitori):** la banca presta fino al 50% del valore degli investimenti (fondo, immobili, quote di società altrui, crediti), indipendentemente dal reddito. È la leva tipica dell'investitore.

### 12.3 Borsa

- **Quotazione (IPO)**:
  - requisiti: SPA, almeno il 25% delle azioni sul mercato;
  - prezzo basato sulla valutazione, con sconto del 10–15%;
  - raccolta degli ordini per 1 giorno reale (giocatori + personaggi gestiti dal computer);
  - commissione della banca d'affari 3–5%.
- **Registro degli ordini reale**: ordini con limite di prezzo o al prezzo di mercato, da giocatori e personaggi gestiti dal computer. Ogni operazione muove il prezzo.
- **Trader gestiti dal computer**:
  - "value": comprano sotto il valore fondamentale (utili, crescita);
  - "momentum": seguono la tendenza;
  - fondi indice;
  - "rumore": movimento casuale.
- **Market maker**: liquidità sempre garantita, con uno scarto tra acquisto e vendita.
- **Prezzo** = fondamentali + umore dei flussi reali. I risultati trimestrali riallineano il prezzo.
- **Vendite allo scoperto**: permesse. Margine del 150%, costo del prestito titoli, chiusura forzata se il margine non basta.
- **Contro la manipolazione**: sospensione per 6 ore dopo un movimento di ±20% in 24 ore; medie a 30 giorni per la classifica; trader "value" che correggono le bolle.
- **Commissioni**: 0,2% per operazione.
- **Dati pubblici**: volumi, indice della città, partecipazioni sopra il 5%, bilanci trimestrali.

### 12.4 Fondi degli investitori

**Requisiti**: livello Gestore (Finanza 5 + 6 mesi di storico).
**Tetto di capitale gestito**: 10 volte il patrimonio del gestore.

**Il gestore sceglie**:

- la **percentuale trattenuta sui guadagni** dei clienti;
- la strategia (rischio basso, medio o alto, con limiti di composizione fatti rispettare dal sistema).

**Tutele per i clienti**:

- **commissione solo sui guadagni nuovi** (high-water mark);
- storico pubblico: rendimento netto, oscillazioni, peggior perdita;
- ritiro dei soldi con 1 mese di preavviso;
- il fondo non può comprare beni personali del gestore né fare affari con lui.

**Per i clienti**: i guadagni del fondo sono **cashflow passivo**.
**Tratti del gestore**: danno visibilità, fiducia, tetto più alto e strumenti di analisi. **Non aumentano i rendimenti.**

### 12.5 Settore Finanziario (aziende)

**Requisito**: licenza finanziaria (§5.4).

**Attività**:

1. **Banca**: raccoglie depositi e presta, in concorrenza con la banca gestita dal computer.
   - **Leva massima**: prestiti ≤ 10 volte il capitale.
   - **Insolvenze**: riducono il capitale.
   - **Corsa agli sportelli**: se la fiducia crolla, i depositanti ritirano i soldi tutti insieme.
   - **Garanzia sui depositi** della città fino a un tetto (50.000 Cr per depositante).
2. **Assicurazione**: copre rischi (eventi di settore, crisi energetica, **spese legali**) in cambio di un premio.
3. **Gestione del risparmio**: fondi senza il tetto personale.
4. **Banca d'affari**: quotazioni, OPA, cordate, con commissioni.

---

## 13. Macroeconomia della città

**Indicatori**: PIL, disoccupazione, inflazione (indice dei prezzi del paniere), tasso di riferimento, indice di borsa.

**Banca centrale** gestita dal computer:

```
tasso = 2% + 1,5·(inflazione − 2%) − 0,5·(disoccupazione − 5%)
```

Limiti tra 0% e 10%; variazione massima ±0,25 punti al mese.

**Cicli ed eventi**: espansione e recessione, eventi di settore (crisi energetica, raccolto scarso, bolla tecnologica, boom edilizio).
Circa 1 evento al mese, annunciato dal Giornale; effetti su domanda, costi o tassi per 3–12 mesi.

**Tasse** (generiche, internazionali):

| Imposta                                         | Aliquota |
| ----------------------------------------------- | -------- |
| Reddito delle persone, fino a 2.000 Cr/mese     | 15%      |
| Reddito delle persone, da 2.000 a 6.000 Cr/mese | 28%      |
| Reddito delle persone, oltre 6.000 Cr/mese      | 40%      |
| Società                                         | 22%      |
| Dividendi, interessi, plusvalenze               | 20%      |

Nessuna IVA al lancio.

**Appalti pubblici**: la città pubblica gare in orari casuali (Edilizia, Tecnologia, Logistica, Energia).

- Offerte in busta chiusa, finestra di 12 ore reali.
- Punteggio: prezzo, qualità e reputazione.

### 13.1 Equilibrio monetario

| Entrate di denaro nel sistema                  | Uscite di denaro dal sistema              |
| ---------------------------------------------- | ----------------------------------------- |
| Domanda della popolazione gestita dal computer | Tasse                                     |
| Appalti pubblici                               | Acquisti dall'operatore cittadino         |
| Sussidi di disoccupazione                      | Commissioni (marketplace, borsa)          |
| Interessi pagati dalla banca sui depositi      | Interessi alla banca gestita dal computer |
| Credito creato dalle banche                    | Spese legali e multe                      |

**Stabilizzatore automatico**: obiettivo di inflazione 2% annuo, perseguito tramite il tasso di riferimento e l'adeguamento graduale della domanda della popolazione e degli appalti. Gli indicatori di salute sono monitorati dalle simulazioni.

### 13.2 Dinamiche macro (decise durante la calibrazione della Fase 1)

Le simulazioni con i bot hanno mostrato che servono questi meccanismi perché l'economia resti stabile e credibile:

- **Indice dei costi e curva di Phillips.** Salari di mercato, prezzi dell'operatore cittadino, affitti, stipendi e sussidi dei datori gestiti dal computer crescono con un indice dei costi:
  ```
  inflazione dei costi = obiettivo + 0,5 × (disoccupazione obiettivo − disoccupazione)
  ```
  limitata tra −2% e +10% annuo. L'inflazione nasce così dalla tensione sul mercato del lavoro. Senza questo meccanismo i prezzi restano fermi e banca centrale e stabilizzatore non hanno nulla da correggere.
- **Shock trasmessi lungo la filiera.** Il prezzo dell'operatore di un settore incorpora gli shock sugli input, pesati per quota. Esempio: con il raccolto scarso anche i pasti dell'operatore costano di più, quindi le ditte non vengono schiacciate tra input più cari e un tetto di prezzo fermo.
- **Forza lavoro che si adatta (migrazione).** Una città con poca disoccupazione attira lavoratori, una con troppa li perde: ±1% al mese al massimo, proporzionale alla distanza dall'obiettivo (6%).
- **Stabilizzatore legato al lavoro.** Aggiunge domanda solo se l'inflazione è bassa **e** c'è disoccupazione sopra l'obiettivo; la toglie solo se l'inflazione è alta **e** il lavoro scarseggia. Intervallo ±10%.
- **Effetto keynesiano moderato.** Gli stipendi pagati dalle aziende dei giocatori aumentano la domanda della popolazione al massimo del 5%.
- **Occupazione.** È calcolata dalla produzione: lavoratori delle aziende dei giocatori + lavoratori necessari all'operatore per servire la domanda rimasta a lui. Quando un giocatore conquista clienti, i posti di lavoro si spostano dall'operatore alla sua azienda.
- **Eventi.** Circa uno ogni quattro mesi; recessione ed espansione non possono essere attive insieme.

---

## 14. Competizione: silenziosa, OPA/OPAS, cause legali

Solo **due** azioni ostili dichiarate: **OPA/OPAS** e **cause legali**. Tutto il resto è competizione silenziosa.

### 14.1 Competizione silenziosa

Nessun pulsante "attacca" e nessuna notifica "sei sotto attacco".

| Mossa                                   | Effetto sul concorrente        | Come se ne accorge           |
| --------------------------------------- | ------------------------------ | ---------------------------- |
| Prezzi più bassi o qualità più alta     | Perde clienti, il churn sale   | Cala la quota di mercato     |
| Stipendi più alti                       | I suoi talenti se ne vanno     | Aumentano le dimissioni      |
| Contratto in esclusiva con un fornitore | Paga di più gli input          | Salgono i costi              |
| Comprare l'immobile dove ha sede        | Affitto più alto al rinnovo    | Proposta di rinnovo più cara |
| Marketing aggressivo                    | Brand relativamente più debole | Cala la visibilità           |

### 14.2 OPA / OPAS

- **Solo su aziende quotate.** Quotarsi è un compromesso: più capitale, ma si diventa scalabili.
- **Soglie**:
  1. fino al 5%: rastrellamento anonimo;
  2. oltre il 5%: obbligo di comunicazione pubblica (e a ogni ulteriore +5%);
  3. oltre il 30%: OPA obbligatoria, con premio rispetto al prezzo di mercato.
- **OPA volontaria**: si può lanciare in qualsiasi momento, anche senza aver superato il 30%.
- **Prezzo minimo dell'offerta**: il più alto tra la media dei 30 giorni e il prezzo massimo pagato dall'offerente negli ultimi 12 mesi.
- **Copertura obbligatoria**: al lancio dell'offerta, contanti bloccati o finanziamento impegnato da una banca.
- **Pagamento**: contanti (OPA), azioni proprie (OPS) o misto (OPAS).
- **Durata**: 3 giorni reali (minimo 24 ore per la difesa garantito).
- **Controfferte**: almeno +5% sull'offerta precedente; riaprono la finestra di 24 ore.
- **Esito sopra il 50%**: controllo. **Il fondatore o chi aveva il controllo è obbligato a vendere tutto al prezzo dell'offerta.** Gli altri soci di minoranza scelgono se restare.
- **Sopra il 90%**: l'acquirente può togliere l'azienda dalla borsa e comprare il resto al prezzo dell'offerta.
- **Esito sotto il 50%**: l'acquirente resta socio di minoranza e ha speso commissioni.
- **Antitrust**: un'OPA che porta la quota di settore oltre il 40% è bloccata.
- **Difese**:
  - cavaliere bianco (alleati o membri del consorzio, finanziati anche dalla cassa comune);
  - patto di sindacato;
  - riacquisto di azioni proprie;
  - aumento di capitale riservato;
  - convincere gli azionisti con i risultati;
  - ricorso legale.
- **Cordate**: le quote dei membri si sommano per tutte le soglie. Prima di partire si firma un **patto vincolante** (chi mette quanto, chi controlla dopo, divisione di utili e costi); nessuno esce durante l'offerta senza penale.
- **Fine stagione**: niente nuove OPA negli ultimi 3 giorni reali.
- **Paracadute**: i dirigenti dell'azienda acquisita lo incassano secondo contratto.

### 14.2.1 Bonus della società aperta

Una scalata ostile riesce solo se chi controlla l'azienda ha meno del 50%. Per rendere conveniente aprire il capitale, le società quotate ricevono **bonus tangibili in base alla quota del primo azionista**:

| Fascia             | Quota del primo azionista | Bonus                                                                                                                                                                                                | Rischio                                           |
| ------------------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **Controllata**    | ≥ 50%                     | Nessuno                                                                                                                                                                                              | Non scalabile                                     |
| **Aperta**         | 30–50%                    | Valore fondamentale +5%; rating aziendale +1 gradino; inclusione nell'indice della città (i fondi indice gestiti dal computer comprano il titolo); +5% di attrattività sul mercato del lavoro        | Scalabile con OPA                                 |
| **Public company** | < 30%                     | Valore fondamentale +10%; rating aziendale +1 gradino; inclusione nell'indice; +10% di attrattività sul mercato del lavoro; reputazione aziendale +5; costi di quotazione e aumenti di capitale −50% | Scalabile; OPA obbligatoria facile da raggiungere |

**Perché sono tangibili**:

- il valore fondamentale più alto è quello su cui comprano i trader "value" gestiti dal computer (§12.3), quindi spinge in su il prezzo di borsa e il VE di tutti gli azionisti, fondatore compreso (§18.1);
- il rating migliore abbassa il costo del debito;
- l'inclusione nell'indice porta domanda stabile sul titolo;
- l'attrattività aiuta a trattenere e assumere talenti.

**Contro gli aggiramenti**: per calcolare la fascia si sommano le quote di chi agisce insieme al primo azionista:

- partecipanti a un patto di sindacato;
- membri dello stesso consorzio;
- società controllate dal primo azionista.

Un fondatore al 45% con un amico del consorzio al 10% conta quindi come **Controllata**.

La fascia si ricalcola a ogni chiusura mensile.

### 14.3 Cause legali

**Serve un fondamento verificabile dal sistema**:

| Tipo                       | Quando è fondata                                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Violazione di brevetto     | Il concorrente raggiunge una qualità protetta da un tuo brevetto senza licenza                                  |
| Inadempimento contrattuale | Un contratto (§16) non è stato rispettato                                                                       |
| Concorrenza sleale         | Prezzi sotto costo da parte di chi ha più del 40% del mercato; assunzione di chi ha un patto di non concorrenza |
| Ricorso contro un'OPA      | Irregolarità nella procedura                                                                                    |

**Procedura**:

1. **Deposito**: 2% della richiesta, minimo 2.000 Cr, più le ore dell'avvocato.
2. **Stima della fondatezza**: prima del deposito l'avvocato stima la fondatezza (F tra 0,1 e 0,9). La precisione della stima cresce con la competenza Legale.
3. **Istruttoria**: 3–7 giorni reali, durante i quali entrambe le parti investono in avvocati e perizie.
4. **Probabilità di vittoria**:
   ```
   P(vittoria) = limitata tra 0,05 e 0,95 di [ F + 0,3 · (L_att − L_dif) / (L_att + L_dif) ]
   ```
   L = forza legale (competenza, ore, tratti, assicurazione per le spese legali).
5. **Esiti**: risarcimento, blocco di un prodotto o di un'operazione per N mesi, oppure rigetto.
6. **Costi**: chi perde paga le spese. Una causa con F < 0,2 è "temeraria": costi doppi e −reputazione.
7. **Accordo** possibile in qualsiasi momento: diventa una trattativa tra giocatori.

**Scudo da principiante (7 giorni)**: non si può essere citati in giudizio, salvo per contratti firmati. Lo scudo termina prima se si lancia una causa o un'OPA, o se si supera una soglia di patrimonio (50.000 Cr).

---

## 15. Consorzi

| Elemento            | Decisione                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Membri              | Max 20; un consorzio per giocatore                                                                                                    |
| Fondazione          | 5.000 Cr + reputazione 30                                                                                                             |
| Ruoli               | Presidente, Tesoriere, Consiglieri, Membri                                                                                            |
| Beni                | **Tutti dei singoli membri**: il consorzio non possiede beni                                                                          |
| Cassa comune        | Prestiti interni, finanziamento delle cordate (prestando ai membri), acquisto dei vantaggi. Spese sopra soglia votate dai consiglieri |
| Uscita              | Si recupera la propria quota di cassa −20%, attesa di 3 giorni, non durante una cordata attiva                                        |
| Espulsione          | Il membro tiene i propri beni e le proprie quote                                                                                      |
| Sinergia di filiera | Bonus crescente con il numero di classi presenti (pieno con tutte e 4) + piccolo extra per settore coperto                            |
| Vendite interne     | Sconto 0–20% scelto dal venditore, niente commissione, esperienza al consorzio                                                        |
| Patto di difesa     | Cavaliere bianco con prestiti della cassa; ufficio legale                                                                             |
| Guerre dichiarate   | Nessuna: le rivalità sono emergenti                                                                                                   |
| Fine stagione       | **I consorzi vengono sciolti** e vanno rifondati; il piazzamento resta nell'albo d'oro                                                |

**Vantaggi** (tutti moderati, 3–10%; non si possono avere tutti, quindi ogni consorzio si specializza):

- Centrale acquisti: −5% sugli input;
- Ufficio legale condiviso: +10% nella difesa;
- Fondo di garanzia: rating dei membri +1 gradino;
- Accademia: +10% di esperienza dallo studio;
- Osservatorio di mercato: report sui concorrenti in tempo reale;
- Cordata rapida: costi di preparazione delle OPA ridotti.

Esperienza del consorzio da: scambi interni, joint venture, obiettivi raggiunti. 1 punto vantaggio per livello, livello massimo 10.

**Joint venture**: aziende possedute da più membri (quote personali), con decisioni in proporzione alle quote.

**Consiglio comunale**: rimandato (vedi §21).

---

## 16. Contratti

Tutti gli accordi tra giocatori sono **contratti gestiti ed eseguiti dal sistema**: si può cooperare senza fiducia cieca.

| Tipo                   | Contenuto principale                                                          |
| ---------------------- | ----------------------------------------------------------------------------- |
| Lavoro                 | Ruolo, fisso, variabile, stock option, paracadute, non concorrenza, preavviso |
| Fornitura              | Bene, quantità per tick, prezzo, durata, esclusiva, penali                    |
| Servizio professionale | §11.1                                                                         |
| Prestito               | Capitale, tasso, rate, garanzie                                               |
| Affitto                | Sede, canone, durata, rinnovo, indicizzazione                                 |
| Quote / patto tra soci | Cessione di quote, diritti di voto, patto di sindacato                        |
| Cordata                | §14.2                                                                         |
| Mandato di gestione    | Adesione a un fondo (§12.4)                                                   |
| Licenza di brevetto    | Royalty, durata                                                               |

**Esecuzione automatica**: pagamenti e consegne avvengono ai tick.
**Mancata esecuzione** (soldi o capacità insufficienti): penale prevista dal contratto, rating −1, causa per inadempimento automaticamente fondata (F = 0,8).

---

## 17. Informazione e Giornale

| Informazione                                                 | Visibilità                                               |
| ------------------------------------------------------------ | -------------------------------------------------------- |
| Propri KPI completi                                          | Privata, in tempo reale                                  |
| Report di mercato del settore (quote, prezzo medio, domanda) | Gratis, **con 1 mese di ritardo**                        |
| Dati in tempo reale sui concorrenti                          | A pagamento (professionisti, Osservatorio del consorzio) |
| Bilanci trimestrali delle SPA quotate                        | Pubblici                                                 |
| Partecipazioni oltre il 5%, OPA, quotazioni                  | Pubbliche (Giornale)                                     |
| Cause depositate e sentenze                                  | Pubbliche                                                |
| Curriculum e tratti dei giocatori                            | Pubblici                                                 |
| Storico dei fondi                                            | Pubblico                                                 |
| Dati delle SRL e delle ditte                                 | Privati (solo stime a pagamento)                         |
| Indicatori macro, eventi, appalti                            | Pubblici                                                 |

**Giornale della città**: feed di notizie pubbliche, risalto settimanale ai migliori, racconto delle rivalità. È la fonte gratuita per "accorgersi" di ciò che succede.

---

## 18. Classifica e stagioni

### 18.1 Valore Economico (VE)

```
VE = (Patrimonio netto + Cashflow passivo mensile × 24) × Fattore reputazione (0,9 – 1,1)
```

**Patrimonio netto** = beni − debiti, con valutazioni:

- azioni quotate: prezzo medio degli ultimi 30 giorni;
- SRL e ditte: utile medio degli ultimi 12 mesi × multiplo di settore (Appendice A), con un minimo pari al valore di bilancio;
- immobili e sedi: valore stimato;
- stock option: solo quelle maturate;
- capitale dei soci dell'investitore: conta come debito.

**Cashflow passivo**:

- conta per intero: dividendi, affitti, interessi, royalty, guadagni dei fondi;
- conta al 50%: compensi da consigliere;
- **non conta**: stipendi e parcelle.
- **Si misura sull'incassato (Fase 2):** media dei redditi passivi effettivamente ricevuti negli ultimi 12 mesi.
- **I dividendi della società che si controlla non contano:** per il titolare sono un prelievo, e il valore della società è già nel suo patrimonio.

Il VE si ricalcola a ogni chiusura mensile.

### 18.2 Classifiche

- **Generale**: è quella che decide chi vince la stagione.
- **Per classe d'origine.**
- **Albi di specialità**:
  - Miglior CEO: crescita del valore delle aziende guidate;
  - Miglior professionista: fatturato e risultati misurati;
  - Miglior investitore: **rendimento %**;
  - Imprenditore dell'anno: valore creato.
- **Consorzi**: **media del VE di tutti i membri**; minimo 5 membri per entrare in classifica.
- Nessuna classifica esordienti.

### 18.3 Stagione

- **Durata**: 60 mesi di gioco (5 anni esatti).
- **Fine stagione**:
  - la classifica si congela alla chiusura del mese 60;
  - si fa un'ultima valutazione di tutti i beni;
  - contratti, fondi e posizioni vengono chiusi d'ufficio.
- **Reset**: tutti ripartono da 10.000 Cr e possono cambiare classe.
- **Cosa resta**: titoli, oggetti estetici, albo d'oro, curriculum storico. Nessun potere.
- **Premi**: riconoscimenti per top 1, 10 e 100 (generale, per classe, per albo, per consorzio). Il valore dei premi si definisce con la monetizzazione.

**Tra una stagione e l'altra**: pausa di 2 giorni reali con riepilogo, statistiche, scelta della nuova classe e formazione anticipata dei consorzi (che diventano attivi al via).

---

## 19. Esperienza del giocatore

### 19.1 Principi

1. La complessità cresce col giocatore (le leve compaiono quando si sbloccano).
2. Si decide, non si fa microgestione.
3. Il mondo gira anche quando non ci sei (pilota automatico).
4. Niente vantaggi di riflessi negli eventi ostili (finestra minima di 24 ore).

### 19.2 Sessione quotidiana (10–15 minuti, mobile)

1. **Rapporto del mese**: cashflow netto, patrimonio, posizione in classifica, più i 3 eventi chiave con il loro "perché". Mostra solo cause interne e segnali generali di mercato, mai chi ti sta facendo concorrenza.
2. **Carte decisione**: da 3 a 5, ordinate per importanza, più l'agenda delle ore.
3. **Mercato e rapporti**: offerte, contratti, chat, marketplace.
4. **Regole del pilota automatico**: valgono finché non torni.

**Sessione strategica** (30–60 minuti, computer): analisi, OPA, cause, quotazioni, consorzio.

### 19.3 Pilota automatico

| Regola            | Opzioni di default                                           |
| ----------------- | ------------------------------------------------------------ |
| Prezzo            | Segue la media del settore ±X%                               |
| Personale         | Sostituisce chi si dimette                                   |
| Rinnovi           | Accetta aumenti fino a +Y%                                   |
| Paniere           | Fornitore abituale                                           |
| Dividendi         | Reinvesti                                                    |
| Borsa             | Nessuna azione automatica, salvo ordini con limite di prezzo |
| Offerte di lavoro | Ignora                                                       |

Il pilota automatico non è mai brillante quanto un giocatore attivo.

### 19.4 Primi passi

- **Ingresso nella città vera**, con scudo da principiante di 7 giorni (§14.3), prezzi agevolati dai fornitori gestiti dal computer e prestito iniziale a tasso basso.
- **Scelta della classe** con anteprima "un mese nei panni di…".
- **Tutorial a missioni di carriera** nella prima settimana. 5–7 missioni per classe, ognuna con una piccola ricompensa in esperienza.
- **Mentori**: i veterani guadagnano reputazione e bonus di esperienza.
- **Lato educativo**: pulsante "Perché?" su ogni numero, glossario integrato, "lezione" di una riga a fine mese.

### 19.5 Schermate principali

Panoramica e cashflow · Agenda delle ore · Azienda/Portafoglio · Mercato (beni, lavoro, servizi, immobili) · Borsa · Rete e consorzio · Giornale · Classifica · Profilo/curriculum.

### 19.6 Notifiche

Push solo per:

- eventi ostili (OPA, causa);
- offerte di lavoro o di acquisto rivolte a te;
- scadenze entro 6 ore;
- appalti nel tuo settore;
- rapporto mensile.

Tutte configurabili.

### 19.7 Comunicazione

Al lancio solo due canali:

- **chat del consorzio**;
- **messaggi dentro le trattative**: ogni offerta (lavoro, fornitura, quote, prestiti, OPA) ha il suo filo di messaggi tra le parti.

Niente chat della città né messaggi privati liberi: meno moderazione, meno tossicità. Il Giornale fa da "piazza" pubblica. Segnalazioni e filtri come da §20.

---

## 20. Integrità, anti-abuso e moderazione

**Account multipli**:

- verifica dell'account (email + dispositivo);
- limiti ai trasferimenti verso account nuovi;
- scambi tra giocatori ammessi solo dentro una fascia di prezzo di mercato (±30%; fuori fascia servono motivazione e revisione);
- sconti tra membri del consorzio limitati al 20%.

**Rilevamento**: grafo delle transazioni per individuare flussi unidirezionali ripetuti tra gli stessi account; revisione manuale.

**Server autoritativo**: tutte le regole si applicano sul server. Il client invia solo intenzioni (comandi); tutto è registrato e riproducibile.

**Vietati**: vendita di account e di Crediti per denaro reale.

**Sicurezza informatica**: modello delle minacce, contromisure e controlli per fase sono nel piano di implementazione (§5).

**Moderazione**: segnalazioni, filtri su chat del consorzio e messaggi delle trattative, sanzioni progressive.

---

## 21. Fuori scope al lancio / espansioni

- Monetizzazione (negozio premium, pass stagionale). Vincolo già deciso: **nessun pay-to-win**; i bonus acquistabili non devono essere davvero differenzianti.
- Più città o paesi collegati (commercio estero, dazi, valute).
- Segmenti di mercato (economico, medio, premium).
- Consiglio comunale e politica economica votata dai consorzi.
- Prodotti specifici dentro i settori.
- IVA e regimi fiscali avanzati.

---

## 22. Domande aperte

Nessuna domanda aperta bloccante.

**Decisioni registrate in v0.2**:

- lingue al lancio: italiano e inglese;
- web app responsive con rilevamento del dispositivo (installabile come PWA), nessuna app nativa al lancio;
- sviluppo da parte di una sola persona: piano ricalibrato (vedi piano di implementazione);
- nomi provvisori "Business Game" e "Crediti" confermati per ora;
- bonus per le società con primo azionista sotto il 50% (§14.2.1);
- comunicazione limitata a chat del consorzio e messaggi delle trattative (§19.7);
- tutte le proposte [P] della v0.1 approvate.

---

## Appendice A — Parametri di bilanciamento iniziali

Valori di partenza per le simulazioni. Nel codice: `config/balance/*.json`.

### A.1 Parametri di settore

| Settore       | ε (elasticità) | c_base (churn/mese) | a (qualità)            | b (brand) | e (posizione) | Multiplo di valutazione |
| ------------- | -------------- | ------------------- | ---------------------- | --------- | ------------- | ----------------------- |
| Energia       | 0,6            | 1%                  | 0,3                    | 0,2       | 0             | 6×                      |
| Materie prime | 2,0            | 4%                  | 0,3                    | 0,1       | 0             | 4×                      |
| Manifattura   | 1,2            | 3%                  | 0,8                    | 0,4       | 0             | 5×                      |
| Edilizia      | 1,0            | – (a progetto)      | 0,7                    | 0,4       | 0             | 5×                      |
| Logistica     | 1,5            | 3%                  | 0,6 (affidabilità)     | 0,2       | 0             | 5×                      |
| Tecnologia    | 0,8            | 6%                  | 1,0                    | 0,6       | 0             | 8×                      |
| Commercio     | 1,6            | 5%                  | 0,5                    | 0,6       | 0,8           | 5×                      |
| Ristorazione  | 1,0            | 7%                  | 0,9                    | 0,4       | 0,9           | 4×                      |
| Finanziario   | 0,7            | 2%                  | 0,4 (rendimento/tasso) | 0,5       | 0,2           | 7×                      |

La ditta individuale è valutata a 2,5× l'utile annuo in tutti i settori (calibrazione Fase 2). Gli altri parametri economici aggiornati (attrezzature per lavoratore, affitti, overhead) sono in `packages/config/balance/`.

### A.2 Parametri globali

| Parametro                                             | Valore                          |
| ----------------------------------------------------- | ------------------------------- |
| Ore al mese                                           | 200 (max 260)                   |
| Sovrapprezzo operatore cittadino                      | +30%                            |
| Produttività lavoratori gestiti dal computer          | 70%                             |
| Costo e efficacia professionisti gestiti dal computer | ×1,5 il costo, ×0,7 l'efficacia |
| Soglia antitrust                                      | 40%                             |
| γ (sensibilità del churn alla soddisfazione)          | 2,0                             |
| δ (pressione dei concorrenti migliori)                | 0,5                             |
| δ_B (decadimento del brand)                           | 5% al mese                      |
| Esponente overhead                                    | 1,3                             |
| Commissione marketplace                               | 3%                              |
| Commissione borsa                                     | 0,2%                            |
| Sospensione titolo                                    | ±20% in 24 ore                  |
| Moltiplicatore cashflow passivo nel VE                | 24                              |
| Fattore reputazione nel VE                            | 0,9 – 1,1                       |
| Leva massima banche                                   | 10×                             |
| Tetto fondi personali                                 | 10× il patrimonio               |
| Penale di uscita dal consorzio                        | 20%                             |
| Sconto massimo interno al consorzio                   | 20%                             |
| Tetto per singolo effetto di servizio professionale   | +25%                            |

### A.3 Obiettivi di salute (validati dalle simulazioni)

| Indicatore                                                | Obiettivo                         |
| --------------------------------------------------------- | --------------------------------- |
| Presenza di ogni classe d'origine nella top 10            | 20–30% ciascuna                   |
| Inflazione annua                                          | 0–5%                              |
| Disoccupazione                                            | 3–12%                             |
| Settori con almeno un'azienda di giocatori (città da 200) | ≥ 7 su 9 entro il mese 24         |
| Fallimenti di aziende                                     | 10–25% delle aziende per stagione |
| Tempo medio al primo salto di classe/livello              | 6–18 mesi                         |
| Disuguaglianza del VE (Gini) a fine stagione              | 0,5–0,75                          |

---

## Appendice B — Glossario

- **Cashflow**: differenza tra entrate e uscite in un periodo.
- **Cashflow passivo**: entrate che non richiedono il tuo tempo (dividendi, affitti, interessi, royalty).
- **Churn**: percentuale di clienti (o dipendenti) persi in un periodo.
- **Retention**: 1 − churn.
- **Leva**: uso del debito per aumentare il capitale investito.
- **OPA / OPS / OPAS**: offerta pubblica di acquisto (in contanti), di scambio (in azioni), di acquisto e scambio (mista).
- **Cavaliere bianco**: alleato che fa una controfferta per difendere un'azienda scalata.
- **Patto di sindacato**: accordo tra soci a non vendere o a votare insieme.
- **High-water mark**: il gestore incassa commissioni solo sui guadagni oltre il massimo valore precedente.
- **Flottante**: quota di azioni scambiabile liberamente in borsa.
- **Market maker**: soggetto che garantisce sempre un prezzo di acquisto e di vendita.
- **Due diligence**: analisi approfondita prima di un investimento o di un'acquisizione.

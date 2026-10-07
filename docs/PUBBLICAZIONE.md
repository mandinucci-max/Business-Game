# Pubblicare il gioco gratis (Render + Neon + cron-job.org)

Combinazione gratuita per il test con 10–30 tester, senza carta di credito:

| Pezzo               | Servizio                             | Piano gratuito                                                                    |
| ------------------- | ------------------------------------ | --------------------------------------------------------------------------------- |
| Server + web app    | [Render](https://render.com)         | 750 ore al mese, 512 MB; si spegne dopo 15 minuti senza traffico                  |
| Database PostgreSQL | [Neon](https://neon.com)             | 1 GB, 100 ore di calcolo al mese; non scade (quello di Render sì, dopo 30 giorni) |
| Orologio dei tick   | [cron-job.org](https://cron-job.org) | gratuito                                                                          |

Il server di Render si addormenta quando nessuno lo usa, quindi il suo timer interno non basta:
i tick li lancia cron-job.org alle 00, 06, 12 e 18 UTC (modalità `TICK_SCHEDULER=external`), e un
secondo job lo tiene sveglio ogni 10 minuti (circa 720 ore al mese: rientra nelle 750 gratuite,
ma allora nello stesso account Render non ci sta un secondo servizio gratuito sempre acceso).

## 1. Database su Neon

1. Crea un account su Neon e un progetto (regione: Europa, es. Frankfurt).
2. In **Connect** scegli la stringa di connessione **diretta** (disattiva "Connection pooling":
   l'host **non** deve contenere `-pooler`). Il server usa un lock di sessione che il pooler non
   supporta. La stringa è del tipo
   `postgresql://utente:password@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require`.
3. Tienila da parte: è un segreto, non va mai nel repository.

Le tabelle le crea il server al primo avvio.

## 2. Server su Render

1. Crea un account su Render collegando GitHub e dai accesso al repository `Business-Game`.
2. **New → Blueprint**, scegli il repository e il branch da pubblicare: Render legge
   [`render.yaml`](../render.yaml) e propone il servizio `business-game` sul piano free.
3. Compila le due variabili richieste:
   - `DATABASE_URL`: la stringa di Neon del punto 1;
   - `PUBLIC_ORIGIN`: l'indirizzo che Render assegna al servizio, es.
     `https://business-game.onrender.com` (se non lo conosci ancora, metti un valore provvisorio,
     poi correggilo in **Environment** e rifai il deploy).
4. Avvia il deploy (3–5 minuti). `ADMIN_TOKEN` lo genera Render: lo trovi in **Environment**, ti
   serve per cron-job.org. Non condividerlo.
5. Apri `https://<tuo-servizio>.onrender.com`: deve comparire la pagina di accesso.

Ogni push sul branch scelto ripubblica il gioco da solo. Lo stato della città resta nel database.

## 3. Tick e risveglio con cron-job.org

Crea un account su cron-job.org e imposta il fuso orario dell'account su **UTC**. Poi crea due job:

**Job "sveglia"** (tiene acceso il server):

- URL: `https://<tuo-servizio>.onrender.com/api/health`
- Pianificazione: ogni 10 minuti
- Metodo: GET

**Job "tick"** (fa avanzare la città di una settimana):

- URL: `https://<tuo-servizio>.onrender.com/admin/tick`
- Pianificazione: personalizzata, minuto `0`, ore `0,6,12,18`, tutti i giorni
- Avanzate → Metodo: **POST**
- Avanzate → Header: `Authorization` = `Bearer <ADMIN_TOKEN>`
- Attiva le notifiche in caso di errore.

Prova il job "tick" con **Test run**: la risposta deve essere `{"summary":{"tick":...}}`.
Con 4 tick al giorno passa un mese di gioco al giorno; la stagione intera dura 60 giorni.

## 4. Controlli prima di invitare i tester

- Registra un account di prova, entra in città, prendi una decisione, lancia un tick dal job e
  verifica che in "Ultime decisioni" risulti applicata.
- In Panoramica, "Prossimo aggiornamento" deve indicare uno degli orari 00/06/12/18 UTC (mostrato
  nell'ora locale del browser).
- Manda ai tester il link e [`GUIDA_TESTER.md`](./GUIDA_TESTER.md).

## Limiti da sapere

- Dopo un deploy o un'interruzione, la prima apertura può richiedere circa un minuto.
- Una sola istanza: è voluto (il server rifiuta di partire se un'altra gestisce già la città).
- I log di Render gratuiti durano poco: per un'indagine guardali entro qualche giorno.
- Neon conserva solo 6 ore di storico per il ripristino: per sicurezza, ogni tanto esporta il
  database (Neon → Backup & Restore, oppure `pg_dump` con la stringa diretta).
- Se cambi piattaforma, servono le stesse variabili d'ambiente: vedi `packages/server/.env.example`.

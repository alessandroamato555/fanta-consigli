# Come aggiornare `giornata.json`

Istruzioni per Claude (attività programmata). L'app legge solo questo file: se è sbagliato, le formazioni consigliate sono sbagliate.

## Cosa fare
1. Trova la **prossima giornata di Serie A non ancora iniziata** (o quella in corso, se la prima partita non è ancora cominciata).
2. Cerca online: calendario e orari della giornata, probabili formazioni di **tutte e 20 le squadre** (fantacalcio.it, fantamaster.it, sosfanta, gazzetta), infortunati, squalificati, ballottaggi, forma recente (ultime 3-5 partite, anche Champions/coppe).
3. Riscrivi `app/data/giornata.json` con lo schema qui sotto. Tieni i nomi **come li scrive fantacalcio.it** (es. "Martinez Jo.", "Esposito F.P.", "Thuram K."): l'app abbina i giocatori delle rose usando quei nomi.
4. Controlla che il file sia JSON valido (`python3 -m json.tool app/data/giornata.json > /dev/null`).

## Schema
```json
{
  "giornata": 12,
  "aggiornato": "2026-11-10T09:00:00+01:00",
  "fonti": ["fantacalcio.it", "fantamaster.it"],
  "squadre": ["Atalanta", "..."],
  "partite": [{ "casa": "Inter", "trasferta": "Como", "inizio": "2026-11-08T18:00:00+01:00" }],
  "giocatori": [
    { "nome": "Barella", "squadra": "Inter", "ruolo": "C", "stato": "titolare", "prob": 90, "fv": 6.6, "nota": "" }
  ]
}
```

- `squadre`: le 20 squadre di Serie A, scritte come su fantacalcio.it.
- `partite`: tutte e 10, orario d'inizio con fuso italiano (`+01:00` d'inverno, `+02:00` d'estate). Dalla prima partita l'app calcola la scadenza.
- `giocatori`: almeno tutti i **probabili titolari**, tutti i **ballottaggi** e tutti gli **indisponibili** di ogni squadra (circa 300 righe). Chi manca viene considerato in panchina (10%).
  - `ruolo`: P, D, C, A (ruoli Classic di fantacalcio.it)
  - `stato`: `titolare`, `ballottaggio`, `dubbio`, `panchina`, `infortunato`, `squalificato`, `fuori`
  - `prob`: probabilità di partire titolare, 0-100 (0 per infortunati, squalificati, fuori)
  - `fv`: fantavoto previsto **se gioca**, già pesato su forma recente, avversario, casa/trasferta, rigori e potenziale bonus. Riferimento: portiere 5.5-6.5, difensore 5.8-6.8, centrocampista 6-7, attaccante 6.2-7.8.
  - `nota`: facoltativa, massimo 8 parole, solo se utile (es. "Rigorista", "Torna dall'infortunio", "MOTM in Champions").

## Lista di tutti i giocatori (`listone.json`)
Serve all'app per far scegliere i giocatori toccandoli. Aggiornala **una volta al giorno** (alle 9):
```bash
curl -sL -A "Mozilla/5.0" -o "$SCRATCH/quot.html" https://www.fantacalcio.it/quotazioni-fantacalcio
python3 -I ../strumenti/listone.py "$SCRATCH/quot.html" data/giornata.json "$(date +%F)" data/listone.json
```
(da dentro `app/`; `$SCRATCH` = una cartella temporanea). Deve stampare circa 600 giocatori e nessuna squadra non riconosciuta; se ne trova meno di 500 non salvare e lascia il file vecchio.
Usa questi stessi nomi anche in `giornata.json`.

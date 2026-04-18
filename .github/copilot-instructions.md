# Project Guidelines

## Obiettivo
- Mantieni il progetto modulare, leggibile e coerente con la struttura già presente nella repository.
- Preferisci modifiche piccole e locali, evitando di mescolare responsabilità diverse nello stesso file.

## Struttura Del Repository
- `app/main.py`: entry point del backend.
- `app/core/`: configurazione e supporto condiviso del backend.
- `app/modules/<dominio>/`: logica backend per dominio, con separazione tra `router.py`, `schemas.py` e `service.py`.
- `frontend/src/app/`: bootstrap e composizione principale del frontend.
- `frontend/src/features/<dominio>/`: logica di feature del frontend.
- `frontend/src/features/<dominio>/components/`: componenti UI della feature.
- `frontend/src/features/<dominio>/services/`: chiamate HTTP e integrazioni della feature.
- `frontend/src/features/<dominio>/utils/`: helper locali della feature.
- `frontend/src/features/<dominio>/styles/`: stili della feature.
- `frontend/src/shared/`: moduli riusabili tra più feature.
- `frontend/src/styles/`: stili globali.

## Convenzioni Architetturali
- Mantieni i nomi delle cartelle già presenti nella repo; non introdurre nuove convenzioni generiche se non sono davvero necessarie.
- Nel backend, mantieni la logica di dominio dentro `app/modules/...` e non spostarla in cartelle generiche fuori modulo.
- Nel frontend, tieni la logica specifica di una feature dentro `frontend/src/features/...` e usa `frontend/src/shared/...` solo per codice realmente condiviso.
- Se una modifica introduce una responsabilità distinta, valuta un nuovo file nella cartella già corretta; se la responsabilità appartiene chiaramente al file corrente, estendilo senza frammentare inutilmente.
- Mantieni separate UI, accesso ai dati, utility e stili.

## Modalità Di Modifica
- Prima di implementare, indica brevemente quali file toccherai e perché.
- Evita duplicazioni e refactor non collegati al task richiesto.
- Mantieni nomi coerenti, descrittivi e allineati al dominio esistente.
- Se una feature cresce troppo, estrai moduli dedicati senza cambiare la struttura di cartelle già adottata dal progetto.

## Build E Validazione
- Backend: `python app/main.py`
- Frontend statico: `cd frontend && python -m http.server 4173`
- Per controlli rapidi sui file JavaScript modificati, preferisci `node --check <file>`.
- Dopo la prima modifica sostanziale, esegui la validazione più stretta disponibile per il file o il flusso toccato.
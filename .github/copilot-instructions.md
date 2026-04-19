# Copilot Repository Instructions

## Obiettivo
Mantieni il progetto modulare, leggibile e coerente con la struttura già presente nella repository.

Preferisci modifiche piccole, locali e direttamente collegate al task richiesto. Evita refactor ampi, spostamenti non necessari e cambiamenti che mescolano responsabilità diverse nello stesso file.

---

## Principi Generali
- Segui la struttura attuale del repository.
- Mantieni nomi coerenti, descrittivi e allineati al dominio esistente.
- Evita duplicazioni.
- Evita refactor non richiesti dal task.
- Se una modifica introduce una responsabilità distinta, valuta un nuovo file nella cartella già corretta.
- Se la responsabilità appartiene chiaramente al file corrente, estendilo senza frammentare inutilmente.
- Mantieni separate UI, accesso ai dati, utility e stili.
- Non introdurre nuove convenzioni generiche se non sono davvero necessarie.

---

## Struttura Del Repository

### Backend
- `app/main.py`: entry point del backend.
- `app/core/`: configurazione e supporto condiviso del backend.
- `app/modules/<dominio>/`: logica backend per dominio.
- In ogni modulo backend, mantieni la separazione tra:
  - `router.py`
  - `schemas.py`
  - `service.py`

### Frontend
- `frontend/src/app/`: bootstrap e composizione principale del frontend.
- `frontend/src/features/<dominio>/`: logica di feature del frontend.
- `frontend/src/features/<dominio>/components/`: componenti UI della feature.
- `frontend/src/features/<dominio>/services/`: chiamate HTTP e integrazioni della feature.
- `frontend/src/features/<dominio>/utils/`: helper locali della feature.
- `frontend/src/features/<dominio>/styles/`: stili della feature.
- `frontend/src/shared/`: moduli riusabili tra più feature.
- `frontend/src/styles/`: stili globali.

---

## Convenzioni Architetturali

### Backend
- Mantieni la logica di dominio dentro `app/modules/...`.
- Non spostare logica di dominio in cartelle generiche fuori modulo.
- Mantieni separate route, schemi e servizi.

### Frontend
- Mantieni la logica specifica di una feature dentro `frontend/src/features/...`.
- Usa `frontend/src/shared/...` solo per codice realmente condiviso tra più feature.
- Mantieni separate UI, servizi, utility e stili.
- Non spostare codice in shared se è usato da una sola feature.

---

## Modalità Di Modifica
- Prima di implementare, indica brevemente quali file toccherai e perché.
- Mantieni le modifiche limitate all’ambito del task.
- Non modificare file non correlati salvo reale necessità tecnica.
- Se una feature cresce troppo, estrai moduli dedicati senza cambiare la struttura di cartelle già adottata dal progetto.
- Preferisci soluzioni semplici, leggibili e facili da mantenere.

---

## Validazione
- Backend: `python app/main.py`
- Frontend statico: `cd frontend && python -m http.server 4173`
- Per controlli rapidi sui file JavaScript modificati, usa `node --check <file>`
- Dopo una modifica sostanziale, esegui la validazione più stretta disponibile per il file o il flusso toccato.

---

## Cosa Evitare
- Refactor ampi non richiesti
- Duplicazioni di logica
- File con responsabilità miste
- Nuove convenzioni strutturali non necessarie
- Spostamenti di codice fuori dalla gerarchia di dominio già adottata
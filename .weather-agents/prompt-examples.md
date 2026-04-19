# Prompt Examples

Questi prompt servono per richiamare rapidamente i subagent del progetto in VS Code, nella tab Chat o Codex.

---

## frontend-ui-agent

### 1. Migliorare la dashboard su mobile
Usa il profilo definito in `.weather-agents/frontend-ui-agent.md`.

Task:
Analizza la dashboard meteo e migliora la leggibilità su schermi mobili.

Vincoli:
- non toccare il backend
- mantieni la struttura attuale del repository
- fai modifiche piccole e locali
- migliora solo i file strettamente necessari

Output desiderato:
- file da modificare
- problemi UI trovati
- proposta di miglioramento
- eventuali modifiche a componenti e stili

---

### 2. Migliorare loading, error e empty state
Usa il profilo definito in `.weather-agents/frontend-ui-agent.md`.

Task:
Controlla gli stati di loading, error e empty state del frontend e migliorali per chiarezza visiva e UX.

Vincoli:
- non modificare la logica backend
- mantieni separate UI e servizi
- evita refactor estesi

Output desiderato:
- elenco stati da migliorare
- file coinvolti
- proposta UI per ogni stato

---

## weather-data-agent

### 1. Verificare il mapping dei dati meteo
Usa il profilo definito in `.weather-agents/weather-data-agent.md`.

Task:
Verifica se il mapping dei dati meteo tra backend e frontend è coerente e segnala eventuali incongruenze.

Vincoli:
- non concentrarti sull’estetica
- mantieni strutture dati semplici
- evidenzia edge case e fallback

Output desiderato:
- flusso dati coinvolto
- punti fragili
- campi incoerenti
- proposta di fix

---

### 2. Gestire dati mancanti o incompleti
Usa il profilo definito in `.weather-agents/weather-data-agent.md`.

Task:
Analizza come il progetto gestisce dati meteo mancanti, null o incompleti e proponi miglioramenti locali.

Vincoli:
- non introdurre strutture dati complesse
- non modificare il layout se non strettamente necessario
- privilegia robustezza e chiarezza

Output desiderato:
- casi limite trovati
- file coinvolti
- fallback consigliati
- proposta di modifica

---

## python-backend-agent

### 1. Rifinire la logica Python del backend
Usa il profilo definito in `.weather-agents/python-backend-agent.md`.

Task:
Analizza la logica backend Python relativa al recupero o alla preparazione dei dati meteo e proponi un refactor leggero per migliorarne struttura e manutenibilità.

Vincoli:
- mantieni la logica di dominio in `app/modules/...`
- non introdurre nuove dipendenze
- evita refactor ampi

Output desiderato:
- file da toccare
- problemi tecnici trovati
- proposta di refactor locale
- verifiche minime da eseguire

---

### 2. Migliorare error handling e validazione
Usa il profilo definito in `.weather-agents/python-backend-agent.md`.

Task:
Controlla il backend Python e migliora gestione errori, validazione input/output e logging nei punti più fragili.

Vincoli:
- mantieni separate route, schemi e servizi
- non cambiare il frontend
- fai solo modifiche mirate

Output desiderato:
- punti fragili individuati
- file coinvolti
- miglioramenti consigliati
- impatto atteso

---

## test-and-debug-agent

### 1. Analizzare un bug runtime
Usa il profilo definito in `.weather-agents/test-and-debug-agent.md`.

Task:
Analizza questo bug runtime e trova la root cause. Proponi un fix minimo e affidabile.

Dettagli del problema:
[incolla qui errore, stack trace o descrizione]

Vincoli:
- non fare refactor ampi
- tocca solo i file necessari
- distingui tra causa certa e ipotesi

Output desiderato:
- sintomo
- root cause o causa probabile
- file/funzioni coinvolti
- fix minimo
- test o verifiche consigliate

---

### 2. Verificare regressioni dopo una modifica
Usa il profilo definito in `.weather-agents/test-and-debug-agent.md`.

Task:
Controlla il flusso toccato da questa modifica e identifica possibili regressioni o edge case.

Dettagli della modifica:
[descrivi qui la modifica]

Vincoli:
- concentrati solo sul flusso interessato
- evita test generici
- suggerisci verifiche concrete

Output desiderato:
- aree a rischio
- casi limite
- test o check manuali consigliati
- eventuali punti deboli del fix

---

## docs-and-product-agent

### 1. Migliorare il README
Usa il profilo definito in `.weather-agents/docs-and-product-agent.md`.

Task:
Riscrivi o migliora il README del progetto per renderlo più chiaro per un nuovo sviluppatore.

Vincoli:
- usa la struttura reale del repository
- documenta solo ciò che è coerente con il progetto
- privilegia chiarezza e onboarding

Output desiderato:
- struttura proposta del README
- testo pronto da copiare
- eventuali informazioni mancanti da aggiungere

---

### 2. Trasformare un’idea in task tecnici
Usa il profilo definito in `.weather-agents/docs-and-product-agent.md`.

Task:
Trasforma questa idea di feature in task tecnici concreti, con checklist e acceptance criteria.

Idea:
[descrivi qui la feature]

Vincoli:
- mantieni i task piccoli e implementabili
- allinea i task alla struttura del repository
- evita descrizioni vaghe

Output desiderato:
- elenco task
- checklist
- acceptance criteria
- eventuali dipendenze o ordine consigliato

---

## project-orchestrator

### 1. Scegliere il subagent corretto
Usa il profilo definito in `.weather-agents/project-orchestrator.md`.

Task:
Analizza questa richiesta e dimmi quale subagent usare, quali file saranno probabilmente coinvolti e come divideresti il lavoro.

Richiesta:
[incolla qui il task]

Output desiderato:
- subagent principale
- eventuali subagent secondari
- piano breve
- aree del repository coinvolte

---

### 2. Dividere un task multi-area
Usa il profilo definito in `.weather-agents/project-orchestrator.md`.

Task:
Questo lavoro coinvolge sia backend che frontend. Dividilo in fasi e assegna a ogni fase il subagent più adatto.

Richiesta:
[incolla qui il task]

Vincoli:
- mantieni modifiche piccole e locali
- evita refactor trasversali non necessari
- rispetta la struttura attuale del progetto

Output desiderato:
- fasi del lavoro
- subagent per fase
- file o cartelle probabili da toccare
- ordine consigliato di esecuzione
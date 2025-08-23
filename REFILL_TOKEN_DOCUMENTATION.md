# Sistema di Refill Token - Documentazione Completa

## Panoramica
Il sistema di refill token permette agli utenti di aggiungere crediti ai token esistenti, sia per token di prodotto che per token master.

## Tipi di Token

### 1. Product Token
- **Definizione**: Token legati a un prodotto specifico con un tasso di conversione USD/Credits
- **Esempio**: Un prodotto con `value_credits_usd = 0.01` significa che 1 credito costa $0.01
- **Modalità di Refill**: Supporta sia modalità USD che Credits

### 2. Master Token
- **Definizione**: Token universali con tasso fisso di conversione
- **Tasso**: 1 credito = $0.001 (1000 crediti = $1)
- **Modalità di Refill**: Solo modalità USD

## Modalità di Refill

### Modalità USD
L'utente specifica quanto USD vuole spendere per aggiungere crediti.

**Formula per Product Token:**
```
credits_to_add = floor((usd_amount - fee) / value_credits_usd)
usd_spent = usd_amount
```

**Formula per Master Token:**
```
credits_to_add = floor((usd_amount - fee) / 0.001)
usd_spent = usd_amount
```

### Modalità Credits
L'utente specifica quanti crediti vuole aggiungere.

**Formula per Product Token:**
```
credits_to_add = credits_amount
usd_spent = (credits_amount * value_credits_usd) + fee
```

**Nota**: Master Token non supporta questa modalità.

## Costi e Commissioni

### Fee Fisso
- **Importo**: $0.0001 per ogni operazione di refill
- **Applicazione**: Sottratto dall'importo disponibile per i crediti

### Calcolo Esempi

#### Esempio 1: Product Token - USD Mode
- **Input**: $10 USD, `value_credits_usd = 0.01`
- **Calcolo**: 
  - Fee: $0.0001
  - Disponibile per crediti: $9.9999
  - Crediti aggiunti: floor(9.9999 / 0.01) = 999
  - USD speso: $10

#### Esempio 2: Product Token - Credits Mode
- **Input**: 100 crediti, `value_credits_usd = 0.01`
- **Calcolo**:
  - Costo crediti: 100 * 0.01 = $1
  - Fee: $0.0001
  - USD speso: $1.0001
  - Crediti aggiunti: 100

#### Esempio 3: Master Token - USD Mode
- **Input**: $5 USD
- **Calcolo**:
  - Fee: $0.0001
  - Disponibile per crediti: $4.9999
  - Crediti aggiunti: floor(4.9999 / 0.001) = 4999
  - USD speso: $5

## Validazioni

### Validazioni Generali
1. **Token esistente**: Il token deve esistere e appartenere all'utente
2. **Importo positivo**: L'importo di refill deve essere > 0
3. **Bilancio sufficiente**: L'utente deve avere USD sufficienti

### Validazioni Specifiche
1. **Master Token**: Solo modalità USD supportata
2. **Importo minimo**: Deve coprire almeno il fee + costo di 1 credito
3. **Product Token**: Deve avere dati prodotto validi

## Flusso di Esecuzione

### 1. Autenticazione
- Verifica token JWT dall'header Authorization
- Estrazione user ID dal token

### 2. Validazione Input
- Controllo campi obbligatori
- Validazione importi e modalità

### 3. Recupero Dati
- Fetch dati token dal database
- Fetch dati prodotto (se product token)
- Calcolo bilancio utente

### 4. Calcoli
- Calcolo crediti da aggiungere
- Calcolo USD da spendere
- Verifica bilancio sufficiente

### 5. Transazioni Database
- Creazione record `refill_transactions`
- Aggiornamento crediti del token
- Aggiornamento opzionale HUB API

### 6. Risposta
- Conferma successo con dettagli
- Gestione errori con messaggi chiari

## Gestione Errori

### Errori Comuni
1. **401 Unauthorized**: Token JWT mancante o invalido
2. **400 Bad Request**: Input invalido o validazioni fallite
3. **404 Not Found**: Token o prodotto non trovato
4. **500 Internal Server Error**: Errori di database o server

### Messaggi di Errore
- **Chiaro e specifico**: Ogni errore ha un messaggio descrittivo
- **Dettagli tecnici**: Logging completo per debugging
- **User-friendly**: Messaggi comprensibili per l'utente finale

## Sicurezza

### Autenticazione
- JWT token obbligatorio
- Verifica proprietà token (user_id match)

### Autorizzazione
- Solo proprietari del token possono fare refill
- Service role per operazioni database

### Validazione Input
- Sanitizzazione di tutti gli input
- Controlli di tipo e range

## Performance

### Ottimizzazioni
- Query database ottimizzate
- Transazioni atomiche
- Aggiornamento HUB API asincrono

### Monitoraggio
- Logging dettagliato
- Metriche di performance
- Gestione errori robusta

## Integrazione HUB API

### Funzionalità
- Aggiornamento automatico crediti su sistema esterno
- Fallback graceful se HUB non disponibile
- Supporto per entrambi i tipi di token

### Configurazione
- Variabili ambiente per URL e chiavi
- Gestione errori non critica
- Logging delle operazioni

## Test e Validazione

### Test Cases
1. **Happy Path**: Refill normale con importi validi
2. **Edge Cases**: Importi minimi e massimi
3. **Error Cases**: Input invalidi e situazioni di errore
4. **Security**: Autenticazione e autorizzazione

### Validazione Logica
- Calcoli matematici corretti
- Gestione fee e commissioni
- Arrotondamenti appropriati

## Manutenzione

### Aggiornamenti
- Modifiche alla logica di calcolo
- Aggiunta nuovi tipi di token
- Modifiche alle commissioni

### Monitoring
- Log delle operazioni
- Metriche di utilizzo
- Alert per errori critici

## Conclusioni

Il sistema di refill token è progettato per essere:
- **Robusto**: Gestione errori completa
- **Sicuro**: Autenticazione e autorizzazione rigorose
- **Scalabile**: Performance ottimizzate
- **Manutenibile**: Codice pulito e ben documentato
- **User-friendly**: Messaggi chiari e validazioni intuitive

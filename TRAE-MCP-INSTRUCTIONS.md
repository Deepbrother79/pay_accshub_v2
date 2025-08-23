# Istruzioni per Configurare MCP Supabase in Trae

## Passo 1: Creazione del Personal Access Token

Prima di configurare MCP in Trae, devi creare un Personal Access Token (PAT) in Supabase:

1. Vai al tuo dashboard Supabase: https://supabase.com/dashboard
2. Clicca sul tuo avatar in alto a destra
3. Seleziona "Access Tokens" dal menu
4. Clicca "Generate new token"
5. Dai un nome al token (es. "Trae MCP Server")
6. Seleziona gli scope necessari (almeno "Read" per progetti e database)
7. Copia il token generato (non potrai vederlo di nuovo!)

**NOTA**: Il server MCP Supabase verrà scaricato automaticamente da npm quando necessario, non serve installarlo manualmente.

## Passo 2: Configurazione in Trae

### Opzione A: Configurazione Base (Solo Lettura Sicura)

1. Apri le impostazioni di Trae
2. Vai alla sezione MCP
3. Aggiungi una nuova configurazione server con questi dettagli:

```json
{
  "supabase": {
    "command": "cmd",
    "args": [
      "/c",
      "npx",
      "-y",
      "@supabase/mcp-server-supabase@latest",
      "--read-only",
      "--project-ref=raqwrslwuefyikijlbma"
    ],
    "env": {
      "SUPABASE_ACCESS_TOKEN": "IL_TUO_PERSONAL_ACCESS_TOKEN_QUI"
    }
  }
}
```

### Opzione B: Configurazione Avanzata (Con Accesso Completo)

**⚠️ ATTENZIONE: Usa questa configurazione solo se hai bisogno di operazioni di scrittura sul database**

1. Usa il tuo Personal Access Token creato nel Passo 1
2. Rimuovi il flag `--read-only` per permettere operazioni di scrittura
3. Usa questa configurazione in Trae:

```json
{
  "supabase-admin": {
    "command": "cmd",
    "args": [
      "/c",
      "npx",
      "-y",
      "@supabase/mcp-server-supabase@latest",
      "--project-ref=raqwrslwuefyikijlbma"
    ],
    "env": {
      "SUPABASE_ACCESS_TOKEN": "IL_TUO_PERSONAL_ACCESS_TOKEN_QUI"
    }
  }
}
```

## Passo 3: Verifica della Configurazione

Dopo aver aggiunto la configurazione MCP in Trae:

1. Riavvia Trae
2. Verifica che il server MCP sia connesso (dovrebbe apparire nella lista dei server attivi)
3. Prova a fare una query di test come: "Mostrami tutte le tabelle nel database"

## Esempi di Query che Puoi Fare

Una volta configurato, potrai chiedere a Trae cose come:

- "Mostrami tutti i prodotti disponibili"
- "Quanti utenti hanno il ruolo admin?"
- "Qual è lo storico dei pagamenti dell'ultimo mese?"
- "Crea una query per trovare tutti i token non utilizzati"
- "Mostrami la struttura della tabella transactions"

## Risoluzione Problemi

### Errore: "Server MCP non trovato" o "Package not found"
- Verifica che Node.js sia installato e aggiornato: `node --version`
- Assicurati che npm sia funzionante: `npm --version`
- Il pacchetto `@supabase/mcp-server-supabase` verrà scaricato automaticamente

### Errore: "Accesso negato" o "Authentication failed"
- Verifica che il Personal Access Token sia corretto
- Controlla che il token abbia i permessi necessari (almeno "Read" per progetti)
- Assicurati di aver sostituito `[INSERISCI_QUI_IL_TUO_PERSONAL_ACCESS_TOKEN]` con il token reale

### Errore: "Project not found"
- Verifica che il project-ref `raqwrslwuefyikijlbma` sia corretto
- Controlla che il tuo token abbia accesso a questo progetto specifico

### Errore: "Timeout di connessione"
- Verifica la connessione internet
- Controlla che il progetto Supabase sia attivo e accessibile

## Sicurezza

- La configurazione base usa il flag `--read-only` per limitare l'accesso alla sola lettura
- Il Personal Access Token ha i permessi che hai specificato durante la creazione
- Non condividere mai il tuo Personal Access Token
- Usa sempre il flag `--project-ref` per limitare l'accesso a un singolo progetto
- Per ambienti di produzione, considera di creare token con permessi minimi necessari

## Struttura del Database

Il tuo database Supabase contiene queste tabelle principali:

- **payment_history**: Storico pagamenti
- **products**: Catalogo prodotti
- **profiles**: Profili utente
- **tokens**: Token generati
- **transactions**: Transazioni
- **user_roles**: Gestione ruoli

Ogni tabella ha le sue relazioni e vincoli definiti nello schema TypeScript.
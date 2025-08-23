# Configurazione MCP per Supabase in Trae

Questo progetto include una configurazione MCP (Model Context Protocol) per integrare il database Supabase con Trae AI.

## File di Configurazione

- `mcp-supabase-config.json`: Configurazione MCP per Supabase

## Informazioni del Database

### URL del Progetto
```
https://raqwrslwuefyikijlbma.supabase.co
```

### ID Progetto
```
raqwrslwuefyikijlbma
```

### Tabelle Disponibili

1. **payment_history**: Storico dei pagamenti
   - Campi: amount_crypto, amount_usd, currency, status, user_id, order_id, pay_currency

2. **products**: Prodotti disponibili
   - Campi: name, product_id, value_credits_usd

3. **profiles**: Profili utente
   - Campi: email, id, created_at, updated_at

4. **tokens**: Token generati
   - Campi: batch_tx_id, credits, token_string, user_id, product_id

5. **transactions**: Transazioni
   - Campi: credits, credits_per_token, fee_usd, mode, product_id, token_count, token_type, total_credits, usd_spent, user_id

6. **user_roles**: Ruoli utente
   - Campi: role (admin/moderator/user), user_id

### Funzioni Disponibili

- `get_complete_schema()`: Ottiene lo schema completo del database
- `has_role(_role, _user_id)`: Verifica se un utente ha un ruolo specifico

### Enum

- `app_role`: "admin" | "moderator" | "user"

## Come Utilizzare in Trae

1. Copia il contenuto di `mcp-supabase-config.json`
2. Aggiungi questa configurazione alle impostazioni MCP di Trae
3. Trae potrà ora accedere e interrogare il tuo database Supabase

## Sicurezza

La configurazione utilizza la chiave pubblica (anon key) che ha accesso limitato secondo le Row Level Security (RLS) policies configurate in Supabase.

## Note

- Assicurati che le RLS policies siano configurate correttamente in Supabase
- La chiave anon ha accesso limitato e sicuro ai dati
- Per operazioni amministrative, potresti aver bisogno di una service key separata
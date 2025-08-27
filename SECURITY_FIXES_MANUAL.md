# 🔒 SECURITY FIXES - MANUALE DI IMPLEMENTAZIONE

## ⚠️ CRITICHE DA RISOLVERE IMMEDIATAMENTE

### 1. 🚨 **PRIORITÀ MASSIMA: RLS su Notification_Webapp**

**ESEGUI SUBITO questo file di migrazione:**
```bash
# Naviga nella directory del progetto
cd supabase

# Esegui la migrazione di sicurezza
supabase db reset --linked
# OPPURE esegui manualmente il file SQL:
```

**Oppure esegui manualmente nel SQL Editor di Supabase:**
```sql
-- Il contenuto è nel file: supabase/migrations/fix_notification_webapp_security.sql
```

### 2. 🟡 **CONFIGURAZIONI AUTH (Pannello Supabase)**

**Vai su Supabase Dashboard > Authentication > Settings:**

1. **OTP Email Expiry:**
   - Vai su "Email" settings
   - Imposta "OTP expiry" a **3600** secondi (1 ora) o meno
   - Consigliato: **1800** secondi (30 minuti)

2. **Password Security:**
   - Vai su "Password" settings
   - Abilita **"Leaked password protection"**
   - Abilita **"Minimum password strength"**

### 3. 🔧 **FUNZIONE SEARCH PATH (SQL Editor)**

```sql
-- Esegui nel SQL Editor di Supabase
ALTER FUNCTION public.get_complete_schema() SET search_path = '';
```

## ✅ **VERIFICA POST-IMPLEMENTAZIONE**

### Test RLS Notification_Webapp:

1. **Test utente normale:**
```sql
-- Come utente normale, dovresti vedere solo notifiche visible=true
SELECT * FROM public."Notification_Webapp";
```

2. **Test inserimento (dovrebbe fallire per utenti normali):**
```sql
-- Questo dovrebbe fallire se non sei admin
INSERT INTO public."Notification_Webapp" ("Title", "Content") 
VALUES ('Test', 'Questo dovrebbe fallire');
```

3. **Test admin (se hai ruolo admin):**
```sql
-- Come admin, dovresti vedere tutto e poter inserire
SELECT * FROM public."Notification_Webapp";
INSERT INTO public."Notification_Webapp" ("Title", "Content") 
VALUES ('Admin Test', 'Questo dovrebbe funzionare');
```

## 🎯 **RISULTATI ATTESI**

Dopo l'implementazione:
- ✅ RLS abilitato su Notification_Webapp
- ✅ Solo admin possono gestire notifiche
- ✅ Utenti normali vedono solo notifiche visible=true
- ✅ OTP email con scadenza sicura
- ✅ Protezione password compromesse attiva
- ✅ Funzioni con search_path sicuro

## 🚨 **URGENZA IMPLEMENTAZIONE**

| Fix | Priorità | Tempo | Criticità |
|-----|----------|-------|-----------|
| RLS Notification_Webapp | 🔴 CRITICA | 5 min | Esposizione dati |
| Auth Settings | 🟡 MEDIA | 2 min | Attacchi brute force |
| Search Path | 🟡 BASSA | 1 min | SQL injection |

**IMPLEMENTA IMMEDIATAMENTE IL FIX RLS** - È la vulnerabilità più critica!

## 📞 **SUPPORTO**

Se hai problemi nell'implementazione:
1. Controlla i log di Supabase per errori
2. Verifica i permessi admin nel database
3. Testa con utente normale dopo l'implementazione
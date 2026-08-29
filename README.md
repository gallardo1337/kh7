# KH7 Dashboard

Persönliche Startseite mit Google-Suche, Wetter, zentral gespeicherten Kacheln und einem geschützten Adminbereich.

## Supabase-Einrichtung

1. Ein eigenes Supabase-Projekt erstellen.
2. `supabase/schema.sql` als Migration ausführen.
3. Über „Erstes Admin-Konto einrichten“ genau das gewünschte Konto anlegen.
4. Die Nutzer-ID dieses Kontos einmal als Administrator eintragen:

   ```sql
   insert into public.admin_users (user_id)
   values ('NUTZER-ID-AUS-SUPABASE');
   ```

5. Danach `allowSignup` in `config.js` auf `false` setzen. Projekt-URL und Publishable Key dürfen dort stehen; niemals einen Secret- oder `service_role`-Key hinterlegen.

Die Datenbankrichtlinien erlauben unangemeldeten Besuchern ausschließlich öffentliche Kacheln. Nur das explizit eingetragene Admin-Konto darf geschützte Kacheln sehen, Kacheln anlegen oder löschen und die Reihenfolge verändern.

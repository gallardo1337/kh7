# KH7 Dashboard

Persönliche Startseite mit Google-Suche, Wetter und zentral gespeicherten Kacheln in einem geschützten Adminbereich.

## Supabase-Einrichtung

1. Ein eigenes Supabase-Projekt erstellen.
2. Unter **Authentication → URL Configuration** die veröffentlichte Seite als Site URL und erlaubte Redirect URL eintragen.
3. `supabase/schema.sql` als Migration ausführen.
4. Über „Erstes Admin-Konto einrichten“ genau das gewünschte Konto anlegen.
5. Die Nutzer-ID dieses Kontos einmal als Administrator eintragen:

   ```sql
   insert into public.admin_users (user_id)
   values ('NUTZER-ID-AUS-SUPABASE');
   ```

6. Danach `allowSignup` in `config.js` auf `false` setzen. Projekt-URL und Publishable Key dürfen dort stehen; niemals einen Secret- oder `service_role`-Key hinterlegen.

Die Datenbankrichtlinien geben unangemeldeten Besuchern keine Kacheln aus. Nur das explizit eingetragene Admin-Konto darf Kacheln sehen, anlegen, löschen oder ihre Reihenfolge verändern.

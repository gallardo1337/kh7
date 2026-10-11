# KH7 Dashboard

Persönliche Startseite mit Google-Suche, Wetter und zentral gespeicherten Kacheln in einem geschützten Adminbereich. Kacheln lassen sich hinzufügen, bearbeiten, löschen, sortieren und nach farbigen Kategorien filtern. Neue Kacheln erhalten automatisch einen passenden Kategorie-Vorschlag, der im Dialog geändert werden kann.

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

Die Datenbankrichtlinien geben unangemeldeten Besuchern keine Kacheln aus. Nur das explizit eingetragene Admin-Konto darf Kacheln sehen, anlegen, bearbeiten, löschen oder ihre Reihenfolge verändern.

## Module

Nach der Anmeldung über das Plus oben wählen, ob eine Link-Kachel, Notizen, ein Krypto-Portfolio oder CS2-Inventare hinzugefügt werden sollen. Weitere Notizen können jederzeit erneut über Plus → Notizen hinzugefügt werden (bis zu 50). Bereits aktivierte Portfolio- und Inventarmodule werden in der Auswahl kenntlich gemacht. Ausblenden löscht keine Eingaben. Notiztexte, individuelle Farben und Klappzustände werden pro Konto in Supabase gespeichert und beim Anmelden geladen. Portfolio-Mengen und Steam-Profillisten bleiben pro Konto im lokalen Browser. Beim Abmelden verschwinden sie vom Dashboard, bleiben aber im Browser gespeichert.

Die Haftnotizen stehen links unter dem Wetter oder rechts neben den Kacheln. Am Griff im Kopfbereich lassen sie sich per Drag-and-drop zwischen den Seiten verschieben und durch Ablegen auf einer anderen Notiz davor einsortieren. Ein Klick auf den Griff wechselt die Seite; mit den Pfeiltasten links/rechts geht das ebenfalls. Seite und Reihenfolge werden im Konto gespeichert. Jede Notiz lässt sich einzeln zu- und aufklappen; zugeklappt zeigt sie die erste Textzeile als Vorschau. Notizen werden beim Schreiben mit kurzer Verzögerung im Konto gespeichert; der Status zeigt Lade- und Speicherfehler an. Eine lokale Sicherung hält nicht synchronisierte Entwürfe fest. Bestehende Browser-Notizen werden automatisch übernommen, wenn im Konto noch keine Notiz vorhanden ist. Bei gleichzeitigen Änderungen gewinnt die zuletzt gespeicherte Version. Für neue Installationen `supabase/notes.sql` und anschließend `supabase/multiple-notes.sql` ausführen. Bestehende Installationen benötigen nur die zweite Migration; die bisherige Notiz bleibt erhalten. Rechts neben dem Wetter zeigt ein aufklappbarer Portfolio-Button den Gesamtwert; darin stehen die einzelnen Coins. Das Portfolio akzeptiert Coin-Kürzel und Mengen mit Dezimalpunkt oder Dezimalkomma (ohne Tausendertrennzeichen). Erneutes Hinzufügen desselben Coins ersetzt die Menge. Kurse stammen von Kraken; nur Coins mit einem direkten EUR-/USD-Markt werden unterstützt. Preise werden beim Öffnen und alle fünf Minuten bei sichtbarer Seite aktualisiert. Bei Fehlern wird der letzte Stand kenntlich beibehalten; fehlende Kurse zählen nicht zur Teilsumme.

Rechts neben dem Portfolio steht für jedes gespeicherte Profil eine eigene CS2-Anzeige mit Profilname und Wert. Die Anzeigen stehen nebeneinander und brechen bei wenig Platz um. Ein Klick auf den Wert öffnet dessen SteamAnalyst-Inventar in einem neuen Tab. Jede Anzeige verlinkt direkt das zugehörige SteamAnalyst-Inventar. Das Zahnrad öffnet die Profilverwaltung und Bewertung. Der Direktlink benötigt eine SteamID64 oder einen numerischen /profiles/-Link; bei benutzerdefinierten /id/-Links wird zunächst die Verwaltung geöffnet. Vor dem ersten erfolgreichen Abruf zeigt KH7 „—“. SteamAnalyst kann trotzdem direkt geöffnet werden.

CS2 erlaubt bis zu zehn Profile (SteamID64, SteamAnalyst-Inventarlink oder Steam-Profillink). Die aktive Bewertung über Supabase benötigt eine numerische SteamID64. Inventarwerte werden auf Knopfdruck abgerufen. KH7 liest das öffentliche CS2-Inventar von Steam und summiert die SteamAnalyst-Fair-Prices in USD. EUR wird mit dem EZB-Referenzkurs über Frankfurter umgerechnet. Das ist eine Schätzung aus Itempreisen, kein aus der SteamAnalyst-Webseite ausgelesener Gesamtwert; individuelle Float-, Pattern- und Sticker-Aufpreise werden nicht berechnet.

### SteamAnalyst-Key geschützt eintragen

1. Im bestehenden Supabase-Projekt die [Edge Function Secrets](https://supabase.com/dashboard/project/rmcwbhhwsxyoqohhgzhe/functions/secrets) öffnen.
2. Secret mit Name `STEAMANALYST_API_KEY` und deinem Key als Wert speichern. Den Key niemals in GitHub, Browsercode oder Chat eintragen.
3. Auf KH7 anmelden, CS2 über das Zahnrad öffnen und „Inventarwerte aktualisieren“ wählen. Ein redeploy der Funktion ist nach dem Speichern des Keys nicht nötig.

Der Dienst `cs2-inventory` ist bereits im bestehenden Supabase-Projekt bereitgestellt und benötigt keinen PHP-Server. Er validiert den Benutzer bei Supabase Auth und prüft anschließend die aktive Admin-Sitzung. Der Schlüssel wird ausschließlich auf dem Server verwendet. Cache- und Budgettabellen sind für normale Benutzer und anonyme Besucher gesperrt. Die Datenbankmigration liegt in `supabase/steamanalyst.sql`, die Funktion in `supabase/functions/cs2-inventory`.

Zum Schutz des kostenlosen Tarifs reserviert die Datenbank atomar maximal 100 SteamAnalyst-Preisabfragen in rollierenden 24 Stunden sowie 25 pro Minute. Pro Inventarabruf werden höchstens 20 neue Itempreise abgefragt; vorhandene Preise aus dem 24-Stunden-Cache zählen nicht erneut. Wiederholte Inventarabrufe sind je Account für 30 Sekunden begrenzt. Ergebnisse können bis zu 15 Minuten im Server-Zwischenspeicher stehen. Fehlende Preise und erreichte Limits werden als Teilwert mit ≈ und Anzahl fehlender Items angezeigt. Ein weiterer Abruf kann nach 30 Sekunden zusätzliche Preise ergänzen, soweit das Tagesbudget reicht. Bei rein unbekannten Preisen wird kein scheinbarer Nullwert ausgegeben. Das Budget berücksichtigt nur Abfragen über KH7; andere Anwendungen mit demselben Key verbrauchen zusätzlich Anbieter-Kontingent.

Die frühere PHP-Anbindung in `api/inventory.php` ist eine ungenutzte Alternative für SteamWebAPI. Die GitHub-Pages-Seite ruft jetzt ausschließlich die Supabase-Funktion auf.

Quellen: [SteamAnalyst API](https://api.steamanalyst.com/), [Supabase Secrets](https://supabase.com/docs/guides/functions/secrets), [Frankfurter Wechselkurse](https://frankfurter.dev/).

### Prüfung

`node tests/modules.test.cjs` prüft die Moduloberfläche mit einem simulierten DOM und festen API-Antworten: Speicherung, Dezimaleingabe, Mengenänderungen, Portfolio-Summen, Preisfehler, mehrere Profile, Teilwerte und Abmeldung. Ergänzend `node --check app.js`, `node --check modules.js` und `git diff --check` ausführen. Diese Prüfungen ersetzen keinen Test echter API-Antworten oder der PHP-Anbindung. Vor Veröffentlichung PHP-Syntax, HTTP 401 ohne Sitzung, HTTP 403 für Nicht-Admins und einen echten Inventarabruf auf dem Zielserver prüfen.

## Hostinger-Veröffentlichung

Die statischen Webdateien werden direkt in `public_html` entpackt. Die enthaltene `.htaccess` setzt `index.html` als Startseite. Vorhandene Verzeichnisse wie `public_html/uploads` bleiben dabei unverändert und dürfen beim Hochladen nicht gelöscht werden.

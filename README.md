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

Nach der Anmeldung über das Plus oben wählen, ob eine Link-Kachel, Notizen, ein Krypto-Portfolio oder CS2-Inventare hinzugefügt werden sollen. Bereits aktivierte Module werden in der Auswahl kenntlich gemacht. Ausblenden löscht keine Eingaben. Einstellungen und Inhalte werden pro angemeldetem Konto ausschließlich im lokalen Browser gespeichert; keine Synchronisierung zwischen Geräten. Beim Abmelden verschwinden sie vom Dashboard, bleiben aber im Browser gespeichert.

Notizen werden beim Schreiben gespeichert. Das Portfolio akzeptiert Coin-Kürzel und Mengen mit Dezimalpunkt oder Dezimalkomma (ohne Tausendertrennzeichen). Erneutes Hinzufügen desselben Coins ersetzt die Menge. Kurse stammen von Kraken; nur Coins mit einem direkten EUR-/USD-Markt werden unterstützt. Preise werden beim Öffnen und alle fünf Minuten bei sichtbarer Seite aktualisiert. Bei Fehlern wird der letzte Stand kenntlich beibehalten; fehlende Kurse zählen nicht zur Teilsumme.

CS2 erlaubt bis zu zehn Profile (SteamID64 oder HTTPS-Profillink). Inventarwerte werden auf Knopfdruck abgerufen. Steam-Marktwerte und Drittanbieter-Marktwerte sind getrennt wählbar. Die vorbereitete Anbindung verwendet SteamWebAPI, nicht SteamAnalyst; ihre Schätzungen können voneinander abweichen. Es wird nur das öffentlich sichtbare Inventar bewertet, ohne Gebühren und individuelle Sticker-Aufpreise. Items ohne Preis werden gesondert gezählt. Serverantworten werden 15 Minuten zwischengespeichert; zusätzlich kann der Anbieter eigene Caches verwenden.

### Automatische CS2-Bewertung auf Hostinger einrichten

1. PHP 8.1 oder neuer mit cURL aktivieren und den Ordner `api` mit hochladen. GitHub Pages kann PHP nicht ausführen.
2. Einen API-Zugang mit Inventar- und Preisabfragen bei [SteamWebAPI](https://www.steamwebapi.com/) einrichten. Planbedingungen und Kosten dort prüfen.
3. `kh7-secrets.example.php` als `kh7-secrets.php` **eine Ebene oberhalb von `public_html`** ablegen und dort `steamwebapiKey` eintragen. Alternativ die Server-Umgebungsvariable `KH7_STEAMWEBAPI_KEY` setzen. Schlüssel niemals in `config.js`, Git oder ZIP-Dateien aufnehmen.
4. Bei verändertem Supabase-Projekt die beiden öffentlichen Supabase-Konfigurationswerte in `api/inventory.php` an `config.js` angleichen. Es wird kein Service-Role-Key benötigt. Der Abruf prüft die Sitzung und die vorhandene Admin-Mitgliedschaft über die bestehenden Datenbankrichtlinien.
5. Anmelden, ein öffentliches Steam-Profil hinzufügen und „Inventarwerte aktualisieren“ wählen. Ohne Preiszugang wird ein klarer Einrichtungshinweis angezeigt. Ohne Anmeldung liefert der Endpunkt HTTP 401.

Der Endpunkt folgt großen Inventaren über `last_assetid`, erkennt wiederholte Seiten und zählt Asset-IDs nur einmal. Bis zu zehn Seiten pro Profil werden zugelassen; bei unvollständigem Abruf wird kein scheinbarer Gesamtwert ausgegeben. Pro Admin werden maximal zehn neue Profilabfragen je Minute zugelassen. API-Schlüssel und Rohinventare werden nicht an den Browser ausgeliefert.

Quellen: [Kraken-Kurse](https://docs.kraken.com/api-reference/market-data/get-ticker-information), [SteamWebAPI-Inventardokumentation](https://www.steamwebapi.com/api/steam/documentation).

### Prüfung

`node tests/modules.test.cjs` prüft die Moduloberfläche mit einem simulierten DOM und festen API-Antworten: Speicherung, Dezimaleingabe, Mengenänderungen, Portfolio-Summen, Preisfehler, mehrere Profile, Teilwerte und Abmeldung. Ergänzend `node --check app.js`, `node --check modules.js` und `git diff --check` ausführen. Diese Prüfungen ersetzen keinen Test echter API-Antworten oder der PHP-Anbindung. Vor Veröffentlichung PHP-Syntax, HTTP 401 ohne Sitzung, HTTP 403 für Nicht-Admins und einen echten Inventarabruf auf dem Zielserver prüfen.

## Hostinger-Veröffentlichung

Die statischen Webdateien werden direkt in `public_html` entpackt. Die enthaltene `.htaccess` setzt `index.html` als Startseite. Vorhandene Verzeichnisse wie `public_html/uploads` bleiben dabei unverändert und dürfen beim Hochladen nicht gelöscht werden.

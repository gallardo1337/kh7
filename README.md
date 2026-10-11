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

Nach der Anmeldung über das Plus oben wählen, ob eine Link-Kachel, Notizen, ein Krypto-Portfolio oder CS2-Inventare hinzugefügt werden sollen. Weitere Notizen können jederzeit erneut über Plus → Notizen hinzugefügt werden (bis zu 50). Bereits aktivierte Portfolio- und Inventarmodule werden in der Auswahl kenntlich gemacht. Ausblenden löscht keine Eingaben. Notiztexte, individuelle Farben und Klappzustände werden pro Konto in Supabase gespeichert und beim Anmelden geladen. Auch Portfolio-Mengen, Steam-Profile, Währung und aktivierte Module werden im Konto gespeichert und auf anderen Geräten beim Anmelden geladen. Neue Dashboarddaten werden nicht in localStorage geschrieben.

Die Haftnotizen stehen links unter dem Wetter oder rechts neben den Kacheln. Am Griff im Kopfbereich lassen sie sich per Drag-and-drop zwischen den Seiten verschieben und durch Ablegen auf einer anderen Notiz davor einsortieren. Ein Klick auf den Griff wechselt die Seite; mit den Pfeiltasten links/rechts geht das ebenfalls. Seite und Reihenfolge werden im Konto gespeichert. Der Griff an der unteren inneren Ecke ändert Breite und Höhe; die Spalten wachsen innerhalb des verfügbaren Bildschirmplatzes mit. Die Größe liegt ebenfalls im Konto. Pfeiltasten oben/unten am Verschiebegriff sortieren innerhalb der jeweiligen Spalte, am Größen-Griff verändern Pfeiltasten die Abmessungen. Zugeklappte Notizen behalten ihre gespeicherte Größe für das erneute Öffnen. Jede Notiz lässt sich einzeln zu- und aufklappen; zugeklappt zeigt sie die erste Textzeile als Vorschau. Notizen werden beim Schreiben mit kurzer Verzögerung im Konto gespeichert; der Status zeigt Lade- und Speicherfehler an. Bei Verbindungsfehlern bleiben Änderungen nur im Arbeitsspeicher der geöffneten Seite; ein automatischer Neuversuch erfolgt alle 30 Sekunden und bei Rückkehr der Internetverbindung. Beim Schließen mit ungespeicherten Änderungen erscheint die normale Browser-Rückfrage. Bestehende Browserdaten werden einmalig übernommen und erst nach erfolgreicher Speicherung im Konto aus dem Browser entfernt. Bereits migrierte Kontodaten haben Vorrang vor alten Browserdaten. Bei gleichzeitigen Änderungen gewinnt die zuletzt gespeicherte Version. Für neue Installationen `supabase/notes.sql` und anschließend `supabase/multiple-notes.sql` ausführen. Für die Online-Modulkonfiguration zusätzlich `supabase/module-settings.sql` ausführen. Bestehende Installationen benötigen die fehlenden Erweiterungen; die bisherige Notiz bleibt erhalten. Rechts neben dem Wetter zeigt ein aufklappbarer Portfolio-Button den Gesamtwert; darin stehen die einzelnen Coins. Das Portfolio akzeptiert Coin-Kürzel und Mengen mit Dezimalpunkt oder Dezimalkomma (ohne Tausendertrennzeichen). Erneutes Hinzufügen desselben Coins ersetzt die Menge. Kurse stammen von Kraken; nur Coins mit einem direkten EUR-/USD-Markt werden unterstützt. Preise werden beim Öffnen und alle fünf Minuten bei sichtbarer Seite aktualisiert. Bei Fehlern wird der letzte Stand kenntlich beibehalten; fehlende Kurse zählen nicht zur Teilsumme.

Rechts neben dem Portfolio steht für jedes gespeicherte Profil eine eigene CS2-Anzeige mit Profilname und Wert. Die Anzeigen stehen nebeneinander und brechen bei wenig Platz um. Ein Klick auf den Wert öffnet dessen SteamAnalyst-Inventar in einem neuen Tab. Jede Anzeige verlinkt direkt das zugehörige SteamAnalyst-Inventar. Das Zahnrad öffnet die Profilverwaltung und Bewertung. Der Direktlink benötigt eine SteamID64 oder einen numerischen /profiles/-Link; bei benutzerdefinierten /id/-Links wird zunächst die Verwaltung geöffnet. Vor dem ersten erfolgreichen Abruf zeigt KH7 „—“. SteamAnalyst kann trotzdem direkt geöffnet werden.

CS2 übernimmt ausschließlich den SA Price-Gesamtwert von der verlinkten SteamAnalyst-Inventarseite. Der Server liest das als SA Price gekennzeichnete value-amount-Feld; CS.Money und Premium-Schätzungen werden ignoriert. Der Wert erscheint wie auf SteamAnalyst in EUR zum EZB-Referenzkurs. Es gibt keine Einzelpreisberechnung und keinen Dateiimport mehr. Der SteamAnalyst-Stand wird angezeigt, wenn er auf der Seite erkennbar ist. Webseitenabrufe werden zehn Minuten zwischengespeichert. Der vorhandene API-Key wird hierfür nicht benötigt und bleibt unveröffentlicht in Supabase Secrets.

Der Dienst cs2-inventory ist im bestehenden Supabase-Projekt bereitgestellt. Er prüft Benutzer und aktive Admin-Sitzung, erlaubt nur feste SteamAnalyst-Inventar-URLs aus numerischen SteamIDs und ruft keine frei eingegebenen URLs ab. Änderungen am Seitenaufbau oder Schutzseiten ergeben einen Fehler statt eines geratenen Werts. Die alten Preis- und Budgettabellen sowie die PHP-Alternative werden von diesem Dienst nicht mehr verwendet.

### Prüfung

`node tests/modules.test.cjs` prüft die Moduloberfläche mit einem simulierten DOM und festen API-Antworten: einmalige Datenübernahme, ausschließlich Online-Schreibvorgänge, Wiederherstellung aller Module auf einem frischen Gerät, Dezimaleingabe, Mengenänderungen, mehrere Profile, Notizfarben, Klappzustände, Drag-and-drop, Löschen, automatische Neuversuche und Kontotrennung. Ergänzend `node --check app.js`, `node --check modules.js` und `git diff --check` ausführen. Die Tests inventory-function.test.cjs prüfen die Erkennung des SA-Price-Feldes, den Ausschluss anderer Werte, Anmeldung, Cache und Fehler. Ein echter Seitenabruf kann wegen Anbieter-Schutzmaßnahmen gesondert scheitern.

## Hostinger-Veröffentlichung

Die statischen Webdateien werden direkt in `public_html` entpackt. Die enthaltene `.htaccess` setzt `index.html` als Startseite. Vorhandene Verzeichnisse wie `public_html/uploads` bleiben dabei unverändert und dürfen beim Hochladen nicht gelöscht werden.

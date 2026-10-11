<?php
declare(strict_types=1);

// PHP 8.1+ with cURL. Secrets live outside public_html, never in browser assets.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
ini_set('display_errors', '0');
$deadline = microtime(true) + 35;

function respond(array $body, int $status = 200): never {
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    exit;
}

function requestJson(string $url, array $headers = []): array {
    global $deadline;
    $remaining = (int) floor($deadline - microtime(true));
    if ($remaining < 2) throw new RuntimeException('Zeitlimit erreicht.');
    $handle = curl_init($url);
    if ($handle === false) throw new RuntimeException('Datenquelle nicht verfügbar.');
    $responseHeaders = [];
    curl_setopt_array($handle, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => min(8, $remaining),
        CURLOPT_TIMEOUT => min(25, $remaining),
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_HTTPHEADER => array_merge(['Accept: application/json'], $headers),
        CURLOPT_USERAGENT => 'KH7-Dashboard/2.2',
        CURLOPT_HEADERFUNCTION => static function ($curl, string $line) use (&$responseHeaders): int {
            $parts = explode(':', $line, 2);
            if (count($parts) === 2) $responseHeaders[strtolower(trim($parts[0]))] = trim($parts[1]);
            return strlen($line);
        },
    ]);
    $raw = curl_exec($handle);
    $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
    curl_close($handle);
    if ($raw === false || $status === 0) throw new RuntimeException('Datenquelle derzeit nicht erreichbar.');
    $data = json_decode($raw, true);
    return ['status' => $status, 'data' => $data, 'headers' => $responseHeaders];
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    respond(['error' => 'Bitte POST verwenden.'], 405);
}
if (!extension_loaded('curl')) respond(['error' => 'Der Server benötigt die PHP-cURL-Erweiterung.'], 503);
$authorization = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
if (!preg_match('/^Bearer ([A-Za-z0-9_.-]{20,8192})$/D', $authorization, $match)) respond(['error' => 'Bitte anmelden.'], 401);
$token = $match[1];
$secretsPath = dirname(__DIR__, 2) . '/kh7-secrets.php';
$secrets = is_file($secretsPath) ? require $secretsPath : [];
if (!is_array($secrets)) $secrets = [];
$supabaseUrl = 'https://rmcwbhhwsxyoqohhgzhe.supabase.co';
$publishableKey = 'sb_publishable_iTWeyhfns_LHBF7KGrQCRw_cTFi1Dth';
$key = getenv('KH7_STEAMWEBAPI_KEY') ?: ($secrets['steamwebapiKey'] ?? '');

try {
    // The auth server validates the JWT; membership is checked through existing RLS.
    $authHeaders = ['apikey: ' . $publishableKey, 'Authorization: Bearer ' . $token];
    $user = requestJson($supabaseUrl . '/auth/v1/user', $authHeaders);
    $userId = $user['data']['id'] ?? '';
    if ($user['status'] !== 200 || !preg_match('/^[a-f0-9-]{36}$/D', $userId)) respond(['error' => 'Sitzung abgelaufen. Bitte erneut anmelden.'], 401);
    $membership = requestJson($supabaseUrl . '/rest/v1/admin_users?select=user_id&user_id=eq.' . rawurlencode($userId), $authHeaders);
    if ($membership['status'] !== 200 || empty($membership['data'][0]['user_id'])) respond(['error' => 'Keine Adminrechte.'], 403);
    if (!is_string($key) || $key === '') respond(['error' => 'Preis- und Inventardienst noch nicht eingerichtet. Ein SteamWebAPI-Schlüssel muss auf dem Server hinterlegt werden.'], 503);
    if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 2048) respond(['error' => 'Anfrage zu groß.'], 413);
    $body = json_decode(file_get_contents('php://input', false, null, 0, 2049), true);
    if (!is_array($body)) respond(['error' => 'Ungültige Anfrage.'], 400);
    $profile = $body['profile'] ?? '';
    if (!is_string($profile) || !preg_match('~^(765\d{14}|https://steamcommunity\.com/(?:profiles/765\d{14}|id/[A-Za-z0-9_-]{1,80})/?)$~D', $profile)) respond(['error' => 'Ungültiges Steam-Profil.'], 400);
    $currency = $body['currency'] ?? 'EUR';
    $valuation = $body['valuation'] ?? 'steam';
    if (!in_array($currency, ['EUR', 'USD'], true) || !in_array($valuation, ['steam', 'cash'], true)) respond(['error' => 'Ungültige Preisoption.'], 400);
    $cacheId = hash('sha256', $userId . '|' . $profile . '|' . $currency . '|' . $valuation);
    $cacheDir = sys_get_temp_dir() . '/kh7-inventory-cache';
    if (!is_dir($cacheDir) && !mkdir($cacheDir, 0700, true) && !is_dir($cacheDir)) throw new RuntimeException('Zwischenspeicher nicht verfügbar.');
    $cachePath = $cacheDir . '/' . $cacheId . '.json';
    if (is_file($cachePath) && time() - filemtime($cachePath) < 900) {
        $cached = json_decode(file_get_contents($cachePath), true);
        if (is_array($cached)) respond($cached);
    }
    // Serialize refreshes per admin and cap paid upstream requests to once per minute.
    $lock = fopen($cacheDir . '/' . hash('sha256', $userId) . '.lock', 'c+');
    if ($lock === false || !flock($lock, LOCK_EX | LOCK_NB)) respond(['error' => 'Ein Inventarabruf läuft bereits. Bitte kurz warten.'], 429);
    $ratePath = $cacheDir . '/' . hash('sha256', $userId) . '.rate';
    $rate = is_file($ratePath) ? json_decode(file_get_contents($ratePath), true) : [];
    $recent = array_values(array_filter(is_array($rate) ? $rate : [], static fn($t): bool => is_int($t) && $t > time() - 60));
    if (count($recent) >= 10) respond(['error' => 'Bitte eine Minute warten, bevor weitere Profile geladen werden.'], 429);
    $recent[] = time(); file_put_contents($ratePath, json_encode($recent), LOCK_EX);

    $total = 0.0; $count = 0; $unpriced = 0; $seen = []; $cursor = null; $visited = [];
    for ($page = 0; $page < 10; $page++) {
        $query = [
            'steam_id' => $profile, 'game' => 'cs2', 'parse' => '1', 'currency' => $currency,
            'group' => '0', 'limit' => '10000', 'with_no_tradable' => '1',
            'trade_locked' => '0', 'state' => 'active', 'production' => '1',
            'select' => 'assetid,markethashname,count,pricelatest,pricereal',
        ];
        if ($cursor !== null) $query['start_assetid'] = $cursor;
        $response = requestJson('https://www.steamwebapi.com/steam/api/inventory?' . http_build_query($query), ['X-Api-Key: ' . $key]);
        if ($response['status'] === 410 && $page === 0) { $response['data'] = []; $response['status'] = 200; }
        if ($response['status'] !== 200) {
            $error = match ($response['status']) {
                401, 402 => 'Der Preiszugang ist ungültig, ausgeschöpft oder unterstützt diese Abfrage nicht.',
                403 => 'Das Inventar ist privat oder nicht zugänglich.',
                404 => 'Steam-Profil nicht gefunden.',
                429 => 'Die Datenquelle begrenzt Anfragen. Bitte später erneut versuchen.',
                default => 'Inventar derzeit nicht verfügbar.',
            };
            respond(['error' => $error], 502);
        }
        $items = $response['data'];
        if (!is_array($items) || !array_is_list($items)) throw new RuntimeException('Ungültige Antwort des Inventardienstes.');
        foreach ($items as $item) {
            if (!is_array($item) || !isset($item['assetid'])) throw new RuntimeException('Ungültiger Inventargegenstand.');
            $assetId = (string) $item['assetid'];
            if (isset($seen[$assetId])) continue;
            $seen[$assetId] = true;
            $quantity = $item['count'] ?? 1;
            if (!is_numeric($quantity) || (float) $quantity < 1 || floor((float) $quantity) !== (float) $quantity || (float) $quantity > 1000000) throw new RuntimeException('Ungültige Item-Menge.');
            $quantity = (int) $quantity;
            $price = $item[$valuation === 'cash' ? 'pricereal' : 'pricelatest'] ?? null;
            $count += $quantity;
            if (!is_numeric($price) || !is_finite((float) $price) || (float) $price <= 0) { $unpriced += $quantity; continue; }
            $total += (float) $price * $quantity;
        }
        $cursor = $response['headers']['last_assetid'] ?? null;
        if (!$cursor) break;
        if (!preg_match('/^\d{1,30}$/D', $cursor) || isset($visited[$cursor]) || $page === 9) throw new RuntimeException('Das Inventar konnte nicht vollständig geladen werden. Es wird kein unvollständiger Gesamtwert angezeigt.');
        $visited[$cursor] = true;
    }
    $result = ['total' => round($total, 2), 'itemCount' => $count, 'unpricedCount' => $unpriced, 'currency' => $currency, 'valuation' => $valuation, 'source' => 'SteamWebAPI', 'updatedAt' => gmdate('c')];
    file_put_contents($cachePath, json_encode($result, JSON_THROW_ON_ERROR), LOCK_EX);
    flock($lock, LOCK_UN); fclose($lock);
    respond($result);
} catch (Throwable $error) {
    // Never return upstream URLs, headers, secrets or arbitrary exception details.
    respond(['error' => 'Inventarabruf fehlgeschlagen. Bitte später erneut versuchen.'], 502);
}

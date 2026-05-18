<?php
// Redirect do encurtador de URL proprio: sonnarjobs.com.br/v/<code>.
//
// O .htaccess da raiz reescreve /v/<code> para /v/index.php?c=<code>.
// Este script resolve o codigo pela edge function resolve-short-link
// (que registra o clique) e faz o 302 para a URL de destino.
//
// Fica em apps/web/public/v/ -> o Vite copia public/ para dist/ -> o
// deploy FTP leva o arquivo para /public_html/v/index.php na Hostinger.

declare(strict_types=1);

const RESOLVE_ENDPOINT =
    'https://cqiaiwpjrxqxvhvmcgfs.supabase.co/functions/v1/resolve-short-link';
const FALLBACK_URL = 'https://sonnarjobs.com.br/';

function fail_to_home(): void
{
    http_response_code(404);
    header('Location: ' . FALLBACK_URL, true, 302);
    exit;
}

$code = isset($_GET['c']) ? trim((string) $_GET['c']) : '';
if ($code === '' || !preg_match('/^[A-Za-z0-9]{1,16}$/', $code)) {
    fail_to_home();
}

$ch = curl_init(RESOLVE_ENDPOINT . '?code=' . urlencode($code));
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 8,
    CURLOPT_HTTPHEADER     => ['Accept: application/json'],
]);
$response = curl_exec($ch);
$status   = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

$target = '';
if ($response !== false && $status === 200) {
    $data = json_decode((string) $response, true);
    if (is_array($data) && !empty($data['url'])) {
        $target = (string) $data['url'];
    }
}

// So redireciona para http/https; qualquer outra coisa cai na home.
if ($target !== '' && preg_match('#^https?://#i', $target)) {
    header('Location: ' . $target, true, 302);
    exit;
}

fail_to_home();

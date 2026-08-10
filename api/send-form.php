<?php
/**
 * Kontakt forma — prima POST s ime/email/telefon/poruka i šalje mail.
 * Radi na svakom cPanel shared hostingu (koristi PHP mail()).
 */

header('Content-Type: application/json; charset=utf-8');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'method_not_allowed']);
    exit;
}

// honeypot: popunjeno = bot
if (!empty($_POST['website'])) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'message' => 'bot']);
    exit;
}

function clip($value, $max)
{
    $value = trim((string) $value);
    if (function_exists('mb_substr')) {
        return mb_substr($value, 0, $max, 'UTF-8');
    }
    return substr($value, 0, $max);
}

$name    = clip($_POST['ime'] ?? ($_POST['name'] ?? ''), 200);
$email   = clip($_POST['email'] ?? ($_POST['mail'] ?? ''), 320);
$phone   = clip($_POST['telefon'] ?? ($_POST['phone'] ?? ''), 50);
$message = clip($_POST['poruka'] ?? ($_POST['message'] ?? ''), 5000);

if ($email === '' || $message === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'missing_fields']);
    exit;
}

$to      = 'info@unimath.hr';
$subject = 'Upit s web stranice';

$body = "Ime i prezime: $name\n"
      . "Email: $email\n"
      . "Telefon: $phone\n\n"
      . $message;

$domain = preg_replace('/^www\./', '', $_SERVER['SERVER_NAME'] ?? 'unimath.hr');
$from   = 'no-reply@' . $domain;

$headers = implode("\r\n", [
    'From: Unimath <' . $from . '>',
    'Reply-To: ' . $email,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
]);

$encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';

$sent = @mail($to, $encodedSubject, $body, $headers, '-f' . $from);
if (!$sent) {
    // neki hostinzi ne dopuštaju -f parametar
    $sent = @mail($to, $encodedSubject, $body, $headers);
}

if ($sent) {
    echo json_encode(['ok' => true]);
} else {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'send_failed']);
}

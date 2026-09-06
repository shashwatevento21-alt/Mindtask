<?php
// Placeholder defaults — safe to keep in Git, never used once config.local.php exists.
$DB_HOST = 'localhost';
$DB_NAME = 'u123456789_mindtask';
$DB_USER = 'u123456789_mindtask';
$DB_PASS = 'CHANGE_ME';

// Your real database credentials live in config.local.php, which sits only
// on the server and is excluded from Git (see .gitignore). That means
// redeploying from GitHub updates the app's UI/logic files but never
// touches or wipes your real password — you only set it up once.
// See config.local.example.php for the format.
$localConfig = __DIR__ . '/config.local.php';
if (file_exists($localConfig)) {
    require $localConfig;
}

try {
    $pdo = new PDO(
        "mysql:host=$DB_HOST;dbname=$DB_NAME;charset=utf8mb4",
        $DB_USER,
        $DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
} catch (PDOException $e) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Database connection failed. Check api/config.local.php credentials.']);
    exit;
}

<?php
// Fill these in with the MySQL database Hostinger gives you (hPanel > Databases).
// Database name / user are usually prefixed with your hosting username, e.g. u123456789_mindtask
$DB_HOST = 'localhost';
$DB_NAME = 'u123456789_mindtask';
$DB_USER = 'u123456789_mindtask';
$DB_PASS = 'CHANGE_ME';

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
    echo json_encode(['error' => 'Database connection failed. Check api/config.php credentials.']);
    exit;
}

<?php
require __DIR__ . '/config.php';
header('Content-Type: application/json');

// Batched position save used by the auto-layout engine: [{id, position_x, position_y}, ...]
$items = json_decode(file_get_contents('php://input'), true) ?? [];

if (!is_array($items) || empty($items)) {
    echo json_encode(['success' => true, 'updated' => 0]);
    exit;
}

$stmt = $pdo->prepare('UPDATE tasks SET position_x = :x, position_y = :y WHERE id = :id');
$pdo->beginTransaction();
$count = 0;
foreach ($items as $item) {
    if (!isset($item['id'])) continue;
    $stmt->execute([
        ':x'  => $item['position_x'] ?? 0,
        ':y'  => $item['position_y'] ?? 0,
        ':id' => $item['id'],
    ]);
    $count++;
}
$pdo->commit();

echo json_encode(['success' => true, 'updated' => $count]);

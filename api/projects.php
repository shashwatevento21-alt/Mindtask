<?php
require __DIR__ . '/config.php';
header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'];

function input() {
    return json_decode(file_get_contents('php://input'), true) ?? [];
}

switch ($method) {

    case 'GET':
        $stmt = $pdo->query('SELECT * FROM projects ORDER BY created_at ASC');
        echo json_encode($stmt->fetchAll());
        break;

    case 'POST':
        $d = input();
        $stmt = $pdo->prepare('INSERT INTO projects (name) VALUES (:name)');
        $stmt->execute([':name' => $d['name'] ?? 'New Project']);
        $id = $pdo->lastInsertId();
        $stmt = $pdo->prepare('SELECT * FROM projects WHERE id = ?');
        $stmt->execute([$id]);
        echo json_encode($stmt->fetch());
        break;

    case 'PUT':
        $d = input();
        if (empty($d['id']) || empty($d['name'])) {
            http_response_code(400);
            echo json_encode(['error' => 'id and name are required']);
            break;
        }
        $stmt = $pdo->prepare('UPDATE projects SET name = ? WHERE id = ?');
        $stmt->execute([$d['name'], $d['id']]);
        $stmt = $pdo->prepare('SELECT * FROM projects WHERE id = ?');
        $stmt->execute([$d['id']]);
        echo json_encode($stmt->fetch());
        break;

    case 'DELETE':
        parse_str(file_get_contents('php://input'), $del);
        $id = $_GET['id'] ?? $del['id'] ?? null;
        if (empty($id)) {
            http_response_code(400);
            echo json_encode(['error' => 'id is required']);
            break;
        }
        $count = (int) $pdo->query('SELECT COUNT(*) FROM projects')->fetchColumn();
        if ($count <= 1) {
            http_response_code(400);
            echo json_encode(['error' => 'Cannot delete the last remaining project']);
            break;
        }
        // FK is ON DELETE CASCADE, so all of this project's tasks go with it.
        $stmt = $pdo->prepare('DELETE FROM projects WHERE id = ?');
        $stmt->execute([$id]);
        echo json_encode(['success' => true]);
        break;

    default:
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
}

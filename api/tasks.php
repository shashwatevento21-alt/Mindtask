<?php
require __DIR__ . '/config.php';
header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'];

function input() {
    return json_decode(file_get_contents('php://input'), true) ?? [];
}

switch ($method) {

    case 'GET':
        $stmt = $pdo->query('SELECT * FROM tasks ORDER BY created_at ASC');
        echo json_encode($stmt->fetchAll());
        break;

    case 'POST':
        $d = input();
        $stmt = $pdo->prepare(
            'INSERT INTO tasks (parent_id, title, description, priority, start_date, deadline, assignee_name, status, is_expanded, position_x, position_y)
             VALUES (:parent_id, :title, :description, :priority, :start_date, :deadline, :assignee_name, :status, :is_expanded, :position_x, :position_y)'
        );
        $stmt->execute([
            ':parent_id'     => $d['parent_id'] ?? null,
            ':title'         => $d['title'] ?? 'Untitled Task',
            ':description'   => $d['description'] ?? null,
            ':priority'      => $d['priority'] ?? 'Medium',
            ':start_date'    => $d['start_date'] ?? null,
            ':deadline'      => $d['deadline'] ?? null,
            ':assignee_name' => $d['assignee_name'] ?? null,
            ':status'        => $d['status'] ?? 'Not Started',
            ':is_expanded'   => $d['is_expanded'] ?? 1,
            ':position_x'    => $d['position_x'] ?? 0,
            ':position_y'    => $d['position_y'] ?? 0,
        ]);
        $id = $pdo->lastInsertId();
        $stmt = $pdo->prepare('SELECT * FROM tasks WHERE id = ?');
        $stmt->execute([$id]);
        echo json_encode($stmt->fetch());
        break;

    case 'PUT':
        $d = input();
        if (empty($d['id'])) {
            http_response_code(400);
            echo json_encode(['error' => 'id is required']);
            break;
        }
        $fields = ['parent_id','title','description','priority','start_date','deadline','assignee_name','status','is_expanded','position_x','position_y'];
        $set = [];
        $params = [':id' => $d['id']];
        foreach ($fields as $f) {
            if (array_key_exists($f, $d)) {
                $set[] = "$f = :$f";
                $params[":$f"] = $d[$f];
            }
        }
        if (empty($set)) {
            echo json_encode(['error' => 'nothing to update']);
            break;
        }
        $sql = 'UPDATE tasks SET ' . implode(', ', $set) . ' WHERE id = :id';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $stmt = $pdo->prepare('SELECT * FROM tasks WHERE id = ?');
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
        // FK is ON DELETE CASCADE, so children are removed automatically.
        $stmt = $pdo->prepare('DELETE FROM tasks WHERE id = ?');
        $stmt->execute([$id]);
        echo json_encode(['success' => true]);
        break;

    default:
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
}

-- MindTask migration: adds multiple Projects on top of an EXISTING database.
-- Run this ONCE via phpMyAdmin > your database > SQL tab, paste and Go.
-- Safe for a database that already has tasks in it — all your existing
-- tasks get moved into one project called "My Tasks" automatically.

CREATE TABLE IF NOT EXISTS projects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO projects (name)
SELECT 'My Tasks' WHERE NOT EXISTS (SELECT 1 FROM projects);

ALTER TABLE tasks ADD COLUMN project_id INT NULL AFTER id;

UPDATE tasks SET project_id = (SELECT id FROM projects ORDER BY id LIMIT 1)
WHERE project_id IS NULL;

ALTER TABLE tasks MODIFY project_id INT NOT NULL;

ALTER TABLE tasks
  ADD CONSTRAINT fk_tasks_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

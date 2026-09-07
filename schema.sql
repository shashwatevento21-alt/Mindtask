-- MindTask database schema (fresh install)
-- Import this once via phpMyAdmin (Hostinger hPanel > Databases > phpMyAdmin) on your MySQL database.
-- Already have a MindTask database running? Use migration_v2_projects.sql instead — do NOT run this file on it.

CREATE TABLE IF NOT EXISTS projects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO projects (name) VALUES ('My Tasks');

CREATE TABLE IF NOT EXISTS tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  parent_id INT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  priority ENUM('High','Medium','Low') NOT NULL DEFAULT 'Medium',
  start_date DATE NULL,
  deadline DATE NULL,
  assignee_name VARCHAR(100) NULL,
  status ENUM('Not Started','In Progress','Done') NOT NULL DEFAULT 'Not Started',
  is_expanded TINYINT(1) NOT NULL DEFAULT 1,
  position_x FLOAT NOT NULL DEFAULT 0,
  position_y FLOAT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS team_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  role VARCHAR(100) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE DATABASE IF NOT EXISTS `planit_db` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `planit_db`;

-- Drop tables if they exist (for clean setup)
DROP TABLE IF EXISTS `event_tasks`;
DROP TABLE IF EXISTS `events`;
DROP TABLE IF EXISTS `users`;

-- Create users table
CREATE TABLE `users` (
    `id` INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
    `username` VARCHAR(50) NOT NULL,
    `email` VARCHAR(255) NOT NULL UNIQUE,
    `password` VARCHAR(255) NOT NULL,
    `address` VARCHAR(255) NOT NULL,
    `contact` VARCHAR(20) NOT NULL,
    `role` VARCHAR(20) NOT NULL DEFAULT 'member',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create events table
CREATE TABLE `events` (
    `event_id` INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
    `user_id` INT NOT NULL,
    `title` VARCHAR(100) NOT NULL,
    `description` TEXT NOT NULL,
    `event_date` DATE NOT NULL,
    `event_time` TIME NOT NULL,
    `location` VARCHAR(255) NOT NULL,
    `category` VARCHAR(50) NOT NULL, -- e.g., Wedding, Birthday, Corporate, Social, Other
    `status` VARCHAR(20) NOT NULL DEFAULT 'Planning', -- e.g., Planning, Active, Completed, Cancelled
    `budget` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

-- Create event_tasks table
CREATE TABLE `event_tasks` (
    `task_id` INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
    `event_id` INT NOT NULL,
    `task_name` VARCHAR(100) NOT NULL,
    `due_date` DATE NOT NULL,
    `assigned_to` VARCHAR(100) NOT NULL,
    `cost` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `status` VARCHAR(20) NOT NULL DEFAULT 'Pending', -- e.g., Pending, In Progress, Completed
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`event_id`) REFERENCES `events` (`event_id`) ON DELETE CASCADE
);

-- Seed users (using SHA1 passwords as taught in C237)
-- admin123 -> SHA1('admin123') -> f865b53623b121fd34ee4d1d882b11b514d93ac0
-- user123  -> SHA1('user123')  -> 5baa61e4c9b93f3f0682250b6cf8331b7ee68fd8
INSERT INTO `users` (`id`, `username`, `email`, `password`, `address`, `contact`, `role`) VALUES
(1, 'Admin', 'admin@planit.com', 'f865b53623b121fd34ee4d1d882b11b514d93ac0', '123 Admin Lane, Singapore', '98765432', 'admin'),
(2, 'john_doe', 'user@planit.com', '5baa61e4c9b93f3f0682250b6cf8331b7ee68fd8', '456 User St, Singapore', '87654321', 'member');

-- Seed events for user 2 (john_doe)
-- Note: Date set to future relative to July 2026
INSERT INTO `events` (`event_id`, `user_id`, `title`, `description`, `event_date`, `event_time`, `location`, `category`, `status`, `budget`) VALUES
(1, 2, 'Silver Wedding Anniversary', 'Celebrating 25 years of marriage with friends and family.', '2026-07-28', '18:30:00', 'Grand Copthorne Waterfront', 'Wedding', 'Planning', 15000.00),
(2, 2, '21st Birthday Bash', 'Milestone birthday celebration for Sarah with friends.', '2026-08-15', '19:00:00', 'Sentosa Beach Villa', 'Birthday', 'Planning', 5000.00),
(3, 2, 'Tech Innovation Seminar 2026', 'Annual product release seminar and networking event.', '2026-10-10', '09:00:00', 'Suntec Convention Centre', 'Corporate', 'Planning', 25000.00);

-- Seed tasks/expenses for events
INSERT INTO `event_tasks` (`task_id`, `event_id`, `task_name`, `due_date`, `assigned_to`, `cost`, `status`) VALUES
-- Event 1: Anniversary tasks
(1, 1, 'Hotel Ballroom Booking', '2026-07-15', 'John', 8000.00, 'Completed'),
(2, 1, 'Catering & Beverages', '2026-07-20', 'Hotel', 4500.00, 'Completed'),
(3, 1, 'Photography & Videography', '2026-07-22', 'SnapShot Studio', 1500.00, 'In Progress'),
(4, 1, 'Floral Decorations & Stage Setup', '2026-07-27', 'Fairy Florist', 1200.00, 'Pending'),
-- Event 2: Birthday tasks
(5, 2, 'Villa Venue Rental', '2026-08-01', 'John', 3000.00, 'Completed'),
(6, 2, 'DJ and Sound System Rental', '2026-08-10', 'AudioPulse', 800.00, 'Pending'),
(7, 2, 'Custom Birthday Cake', '2026-08-14', 'SweetTreats Bakery', 250.00, 'Completed'),
(8, 2, 'Catering Finger Food', '2026-08-14', 'TastyCater', 1200.00, 'In Progress'),
-- Event 3: Corporate Seminar tasks
(9, 3, 'Auditorium Booking', '2026-09-01', 'CorpTeam', 12000.00, 'Completed'),
(10, 3, 'AV Equipment Setup', '2026-10-01', 'TechSound Inc', 5000.00, 'Pending'),
(11, 3, 'Catering Buffet Lunch', '2026-10-05', 'CateringCo', 4000.00, 'Pending');

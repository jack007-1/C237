CREATE DATABASE IF NOT EXISTS `rp_market_db` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `rp_market_db`;

-- Drop tables in dependency order
DROP TABLE IF EXISTS `flags`;
DROP TABLE IF EXISTS `reservations`;
DROP TABLE IF EXISTS `listings`;
DROP TABLE IF EXISTS `users`;

-- Create users table
CREATE TABLE `users` (
  `id` INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  `username` VARCHAR(50) NOT NULL UNIQUE,
  `email` VARCHAR(100) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `contact_info` VARCHAR(100) NOT NULL,
  `role` ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create listings table
CREATE TABLE `listings` (
  `id` INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  `seller_id` INT NOT NULL,
  `title` VARCHAR(100) NOT NULL,
  `description` TEXT NOT NULL,
  `category` ENUM('textbook', 'calculator', 'lab_coat', 'notes', 'electronics', 'others') NOT NULL,
  `module_code` VARCHAR(10) NULL,
  `price` DECIMAL(6,2) NOT NULL CHECK (`price` >= 0),
  `item_condition` ENUM('new', 'like_new', 'used', 'worn') NOT NULL,
  `status` ENUM('available', 'reserved', 'sold') NOT NULL DEFAULT 'available',
  `image` VARCHAR(255) NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`seller_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

-- Create reservations table
CREATE TABLE `reservations` (
  `id` INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  `listing_id` INT NOT NULL,
  `buyer_id` INT NOT NULL,
  `status` ENUM('active', 'completed', 'released') NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`listing_id`) REFERENCES `listings` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`buyer_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

-- Create flags table
CREATE TABLE `flags` (
  `id` INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  `listing_id` INT NOT NULL,
  `reporter_id` INT NOT NULL,
  `reason` VARCHAR(255) NOT NULL,
  `status` ENUM('open', 'resolved') NOT NULL DEFAULT 'open',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`listing_id`) REFERENCES `listings` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`reporter_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

-- Seed users
-- admin123   -> SHA1: f865b53623b121fd34ee4d1d882b11b514d93ac0
-- student123 -> SHA1: 7110eda4d09e062aa5e4a390b0a572ac0d2c0220
INSERT INTO `users` (`id`, `username`, `email`, `password`, `contact_info`, `role`) VALUES
(1, 'admin', 'admin@rp.edu.sg', 'f865b53623b121fd34ee4d1d882b11b514d93ac0', 'Admin Office (91234567)', 'admin'),
(2, 'student1', 'student1@rp.edu.sg', '7110eda4d09e062aa5e4a390b0a572ac0d2c0220', 'student1@rp.edu.sg / 81234567', 'user'),
(3, 'student2', 'student2@rp.edu.sg', '7110eda4d09e062aa5e4a390b0a572ac0d2c0220', 'student2@rp.edu.sg / 82345678', 'user');

-- Seed listings (16 listings across all categories and statuses)
INSERT INTO `listings` (`id`, `seller_id`, `title`, `description`, `category`, `module_code`, `price`, `item_condition`, `status`, `image`) VALUES
(1, 2, 'C237 Software Development Textbook', 'Official C237 textbook in excellent condition. Minimal highlighting.', 'textbook', 'C237', 25.00, 'like_new', 'available', NULL),
(2, 3, 'C207 Financial Accounting Guide', 'Used guide for C207. Has some folded pages but fully readable.', 'textbook', 'C207', 15.00, 'used', 'available', NULL),
(3, 2, 'Texas Instruments TI-84 Plus CE', 'Graphing calculator CE edition. Color screen, comes with USB charger.', 'calculator', NULL, 80.00, 'like_new', 'available', NULL),
(4, 3, 'Standard RP Lab Coat Size L', 'White lab coat for science modules. Size L. Clean, no stains.', 'lab_coat', NULL, 10.00, 'used', 'available', NULL),
(5, 2, 'C237 CA1 Study Notes Summary', 'Handwritten PDF summary notes for CA1. Will send via email.', 'notes', 'C237', 5.00, 'new', 'available', NULL),
(6, 3, 'iPad Air 4th Gen 64GB', 'Space Gray, WiFi model. Perfect for taking notes. Glass screen protector applied.', 'electronics', NULL, 350.00, 'used', 'available', NULL),
(7, 2, 'Scientific Calculator Casio fx-97SG X', 'Approved scientific calculator for exams. Good working condition.', 'calculator', NULL, 20.00, 'used', 'available', NULL),
(8, 3, 'C303 Enterprise Java Notes', 'Printout of C303 notes with annotations and tips from A-grade student.', 'notes', 'C303', 8.00, 'new', 'available', NULL),
(9, 2, 'Logistics Management Textbook', 'Slightly worn cover but pages are clean. Used in Year 1.', 'textbook', 'B216', 30.00, 'worn', 'available', NULL),
(10, 3, 'Standard Safety Glasses', 'For chemistry/physics labs. Scratch-resistant.', 'others', NULL, 3.00, 'used', 'available', NULL),
(11, 2, 'C237 Mobile App Dev Guide', 'Reference book for mobile application programming.', 'textbook', 'C237', 18.00, 'used', 'reserved', NULL),
(12, 3, 'RP Lab Coat Size M', 'Science lab coat, size M. Slightly worn on the sleeves.', 'lab_coat', NULL, 8.00, 'worn', 'reserved', NULL),
(13, 2, 'Arduino Starter Kit', 'Uno board, breadboard, resistors, LEDs. Used for C200 IoT module.', 'electronics', 'C200', 25.00, 'like_new', 'sold', NULL),
(14, 3, 'C225 Data Structures Notes', 'Summary notes on lists, stacks, trees. Very helpful.', 'notes', 'C225', 4.00, 'new', 'sold', NULL),
(15, 2, 'Laptop Stand Portable', 'Foldable aluminum laptop stand. Great ergonomics.', 'others', NULL, 12.00, 'like_new', 'available', NULL),
(16, 3, 'Calculus and Analytical Geometry', 'Reference book for B104 Mathematics module.', 'textbook', 'B104', 22.00, 'used', 'available', NULL);

-- Seed reservations
-- Listing 11 is reserved by student2 (id=3)
-- Listing 12 is reserved by student1 (id=2)
INSERT INTO `reservations` (`id`, `listing_id`, `buyer_id`, `status`) VALUES
(1, 11, 3, 'active'),
(2, 12, 2, 'active');

-- Seed flags
-- Listing 9 is flagged by student2 (id=3)
INSERT INTO `flags` (`id`, `listing_id`, `reporter_id`, `reason`, `status`) VALUES
(1, 9, 3, 'Overpriced for a worn book.', 'open');

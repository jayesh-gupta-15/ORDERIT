-- Disable foreign key checks temporarily for seamless batch execution
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- 1. Insert 25 Addresses (Used by Users and Riders)
-- ---------------------------------------------------------------------
INSERT INTO addresses (flat_number, building_name, landmark, pincode) VALUES
('101', 'Sunrise Heights', 'Near Central Park', 400601),
('202', 'Emerald Court', 'Opposite City Mall', 400602),
('303', 'Royal Palms', 'Behind Metro Station', 400603),
('404', 'Ocean Breeze', 'Near Marine Drive', 400604),
('505', 'Green Acres', 'Next to Lotus Hospital', 400605),
('606', 'Silver Oak Apartments', 'Opposite Axis Bank', 400606),
('707', 'Orchid Towers', 'Near St. Xavier School', 400607),
('808', 'Skyline Residency', 'Behind Grand Hotel', 400608),
('909', 'Whispering Pines', 'Near Lake View Park', 400609),
('1001', 'Prestige Enclave', 'Opposite Silicon Tech Park', 400610),
('102', 'Sunlight Villas', 'Near Main Market', 400601),
('203', 'Diamond Park', 'Opposite Bus Stand', 400602),
('304', 'Pearl Regency', 'Behind Fire Station', 400603),
('405', 'Golden Nest', 'Near Railway Station', 400604),
('506', 'Palm Grove', 'Next to City Library', 400605),
('607', 'Cedar Crest', 'Opposite Town Hall', 400606),
('708', 'Maple Leaf', 'Near Sports Complex', 400607),
('809', 'Willow Woods', 'Behind Civil Hospital', 400608),
('910', 'Aspen Heights', 'Near IT Plaza', 400609),
('1002', 'Valley View', 'Opposite Green Club', 400610),
('1101', 'Rivera Suites', 'Near Riverfront', 400611),
('1102', 'Harbor View', 'Near Sea Port', 400612),
('1103', 'Summit Pointe', 'Near Hilltop Garden', 400613),
('1104', 'Meadowlands', 'Near Bypass Road', 400614),
('1105', 'Highland Park', 'Opposite Clock Tower', 400615);

-- ---------------------------------------------------------------------
-- 2. Insert 20 Users
-- ---------------------------------------------------------------------
INSERT INTO users (full_name, phone_number, email) VALUES
('Aarav Sharma', '+919876543210', 'aarav.sharma@example.com'),
('Ananya Iyer', '+919876543211', 'ananya.iyer@example.com'),
('Rohan Mehta', '+919876543212', 'rohan.mehta@example.com'),
('Priya Patel', '+919876543213', 'priya.patel@example.com'),
('Vikram Singh', '+919876543214', 'vikram.singh@example.com'),
('Neha Verma', '+919876543215', 'neha.verma@example.com'),
('Aditya Nair', '+919876543216', 'aditya.nair@example.com'),
('Kavya Rao', '+919876543217', 'kavya.rao@example.com'),
('Rahul Gupta', '+919876543218', 'rahul.gupta@example.com'),
('Sneha Joshi', '+919876543219', 'sneha.joshi@example.com'),
('Siddharth Deshmukh', '+919876543220', 'siddharth.d@example.com'),
('Pooja Kulkarni', '+919876543221', 'pooja.k@example.com'),
('Amitav Chatterjee', '+919876543222', 'amitav.c@example.com'),
('Riya Sen', '+919876543223', 'riya.sen@example.com'),
('Karan Malhotra', '+919876543224', 'karan.m@example.com'),
('Divya Menon', '+919876543225', 'divya.m@example.com'),
('Varun Reddy', '+919876543226', 'varun.reddy@example.com'),
('Ishita Bansal', '+919876543227', 'ishita.b@example.com'),
('Gaurav Saxena', '+919876543228', 'gaurav.s@example.com'),
('Meera Pillai', '+919876543229', 'meera.p@example.com');

-- ---------------------------------------------------------------------
-- 3. Insert 40 User-Address Relations (2 Addresses per User)
-- ---------------------------------------------------------------------
INSERT INTO user_addresses (user_id, address_id) VALUES
(1, 1), (1, 2),
(2, 2), (2, 3),
(3, 3), (3, 4),
(4, 4), (4, 5),
(5, 5), (5, 6),
(6, 6), (6, 7),
(7, 7), (7, 8),
(8, 8), (8, 9),
(9, 9), (9, 10),
(10, 10), (10, 11),
(11, 11), (11, 12),
(12, 12), (12, 13),
(13, 13), (13, 14),
(14, 14), (14, 15),
(15, 15), (15, 16),
(16, 16), (16, 17),
(17, 17), (17, 18),
(18, 18), (18, 19),
(19, 19), (19, 20),
(20, 20), (20, 1);

-- ---------------------------------------------------------------------
-- 4. Insert 10 Vegetarian Categories
-- ---------------------------------------------------------------------
INSERT INTO categories (name) VALUES
('Veg Starters & Appetizers'),
('Main Course - North Indian Veg'),
('Main Course - South Indian Veg'),
('Chinese & Pan-Asian Veg'),
('Italian & Pasta Veg'),
('Gourmet Veg Burgers & Sandwiches'),
('Artisanal Veg Pizzas'),
('Ice Creams & Desserts'),
('Non-Alcoholic Beverages'),
('Indian Breads & Sides');

-- ---------------------------------------------------------------------
-- 5. Insert 30 Vegetarian Food Items (With 0%, 5%, 18%, and 40% GST)
-- ---------------------------------------------------------------------
INSERT INTO food_items (category_id, name, unit_price, gst_rate, stock_quantity) VALUES
-- Starters
(1, 'Paneer Tikka Subzi Roll', 240.00, 5.00, 50),
(1, 'Crispy Corn & Pepper Fry', 210.00, 5.00, 45),
(1, 'Veg Spring Rolls', 180.00, 5.00, 60),

-- Main Course - North Indian
(2, 'Paneer Butter Masala', 320.00, 5.00, 40),
(2, 'Dal Makhani', 240.00, 5.00, 50),
(2, 'Kadhai Mushroom', 290.00, 5.00, 35),

-- Main Course - South Indian
(3, 'Special Masala Dosa', 130.00, 5.00, 80),
(3, 'Steamed Rice Idli (4 pcs)', 90.00, 5.00, 100),
(3, 'Hyderabadi Veg Biryani', 270.00, 5.00, 45),

-- Chinese & Pan-Asian
(4, 'Veg Hakka Noodles', 190.00, 5.00, 55),
(4, 'Veg Manchurian Gravy', 230.00, 5.00, 40),
(4, 'Exotic Veg Dim Sum (6 pcs)', 220.00, 5.00, 30),

-- Italian
(5, 'Penne Pasta in Creamy Sauce', 290.00, 5.00, 30),
(5, 'Classic Mushroom Stroganoff', 310.00, 5.00, 25),
(5, 'Spinach & Ricotta Ravioli', 340.00, 5.00, 20),

-- Burgers & Sandwiches
(6, 'Grilled Veg Club Sandwich', 160.00, 5.00, 70),
(6, 'Crispy Paneer Burger', 190.00, 5.00, 50),
(6, 'Double Cheese Veggie Burger', 210.00, 5.00, 40),

-- Pizzas
(7, 'Classic Margherita Pizza 10"', 320.00, 5.00, 40),
(7, 'Farmhouse Veggie Overload 10"', 390.00, 5.00, 30),
(7, 'Paneer Supreme Pizza 10"', 420.00, 5.00, 25),

-- Ice Creams & Desserts (Includes 18% GST and 40% GST Premium Artisan items)
(8, 'Vanilla Bean Ice Cream Scoop', 90.00, 18.00, 100),
(8, 'Chocolate Lava Sundae', 180.00, 18.00, 50),
(8, 'Artisanal Gold Foil Chocolate Ice Cream', 350.00, 40.00, 15), -- 40% GST

-- Non-Alcoholic Beverages (Includes 18% and 40% GST Caffeinated Energy Drinks)
(9, 'Fresh Lime Soda', 70.00, 18.00, 120),
(9, 'Cold Coffee with Vanilla Scoop', 140.00, 18.00, 60),
(9, 'Virgin Mint Mojito', 160.00, 18.00, 50),
(9, 'Premium Caffeinated Energy Drink 250ml', 150.00, 40.00, 80), -- 40% GST

-- Breads
(10, 'Butter Naan', 50.00, 5.00, 150),
(10, 'Garlic Naan', 60.00, 5.00, 130);

-- ---------------------------------------------------------------------
-- 6. Insert 5 Riders
-- ---------------------------------------------------------------------
INSERT INTO riders (address_id, full_name, phone_number, email, status) VALUES
(21, 'Rajesh Kumar', '+919900011101', 'rajesh.rider@example.com', 'Available'),
(22, 'Suresh Yadav', '+919900011102', 'suresh.rider@example.com', 'Busy'),
(23, 'Amit Verma', '+919900011103', 'amit.rider@example.com', 'Available'),
(24, 'Manoj Patil', '+919900011104', 'manoj.rider@example.com', 'Offline'),
(25, 'Deepak Shinde', '+919900011105', 'deepak.rider@example.com', 'Available');

-- ---------------------------------------------------------------------
-- 7. Insert 2 Delivery Managers
-- ---------------------------------------------------------------------
INSERT INTO delivery_managers (full_name, status) VALUES
('Anil Kapoor', 'Active'),
('Sunita Sharma', 'Active');

-- ---------------------------------------------------------------------
-- 8. Proportional Operational Data: Orders
-- ---------------------------------------------------------------------
INSERT INTO orders (order_id, user_id, address_id, status, created_at) VALUES
(1, 1, 1, 'Delivered', '2026-10-10 12:30:00'),
(2, 2, 3, 'Delivered', '2026-10-10 13:15:00'),
(3, 3, 4, 'Delivered', '2026-10-10 18:45:00'),
(4, 4, 5, 'Rider Assigned', '2026-10-11 11:20:00'),
(5, 5, 6, 'Payment Successful', '2026-10-11 12:00:00'),
(6, 6, 7, 'In Progress', '2026-10-11 12:15:00'),
(7, 7, 8, 'Delivered', '2026-10-10 19:10:00'),
(8, 8, 9, 'Delivered', '2026-10-10 20:05:00'),
(9, 9, 10, 'Delivered', '2026-10-10 20:30:00'),
(10, 10, 11, 'Delivered', '2026-10-11 10:00:00');

-- ---------------------------------------------------------------------
-- 9. Order Items (Snapshots from Food Items)
-- ---------------------------------------------------------------------
INSERT INTO order_items (order_id, food_item_id, quantity, unit_price, gst_rate) VALUES
-- Order 1 (Paneer Tikka Roll + Garlic Naan)
(1, 1, 1, 240.00, 5.00),
(1, 30, 2, 60.00, 5.00),

-- Order 2 (Paneer Butter Masala + Garlic Naan + Fresh Lime Soda)
(2, 4, 1, 320.00, 5.00),
(2, 30, 2, 60.00, 5.00),
(2, 25, 2, 70.00, 18.00),

-- Order 3 (Margherita Pizza + Cold Coffee + 40% GST Ice Cream)
(3, 19, 1, 320.00, 5.00),
(3, 26, 1, 140.00, 18.00),
(3, 24, 1, 350.00, 40.00),

-- Order 4 (Veg Hakka Noodles + Veg Manchurian)
(4, 10, 2, 190.00, 5.00),
(4, 11, 1, 230.00, 5.00),

-- Order 5 (Special Masala Dosa + Premium Caffeinated Energy Drink - 40% GST)
(5, 7, 2, 130.00, 5.00),
(5, 28, 2, 150.00, 40.00),

-- Order 6 (Crispy Paneer Burger + Chocolate Lava Sundae)
(6, 17, 2, 190.00, 5.00),
(6, 23, 1, 180.00, 18.00),

-- Order 7 (Dal Makhani + Butter Naan)
(7, 5, 1, 240.00, 5.00),
(7, 29, 4, 50.00, 5.00),

-- Order 8 (Penne Pasta + Virgin Mint Mojito)
(8, 13, 1, 290.00, 5.00),
(8, 27, 2, 160.00, 18.00),

-- Order 9 (Hyderabadi Veg Biryani + Vanilla Ice Cream)
(9, 9, 2, 270.00, 5.00),
(9, 22, 2, 90.00, 18.00),

-- Order 10 (Farmhouse Veggie Pizza + Fresh Lime Soda)
(10, 20, 1, 390.00, 5.00),
(10, 25, 1, 70.00, 18.00);

-- ---------------------------------------------------------------------
-- 10. Payments (Pre-calculated exact sums including GST)
-- ---------------------------------------------------------------------
INSERT INTO payments (order_id, payment_method, amount, paid_at) VALUES
(1, 'UPI', 378.00, '2026-10-10 12:31:00'),
(2, 'Credit Card', 627.20, '2026-10-10 13:16:00'),
(3, 'Debit Card', 891.20, '2026-10-10 18:46:00'),
(4, 'UPI', 640.50, '2026-10-11 11:21:00'),
(5, 'Net Banking', 693.00, '2026-10-11 12:01:00'),
(7, 'UPI', 462.00, '2026-10-10 19:11:00'),
(8, 'Cash on Delivery', 682.10, '2026-10-10 20:06:00'),
(9, 'UPI', 779.40, '2026-10-10 20:31:00'),
(10, 'Credit Card', 492.10, '2026-10-11 10:01:00');

-- ---------------------------------------------------------------------
-- 11. Deliveries (For orders that reached dispatch phase)
-- ---------------------------------------------------------------------
INSERT INTO deliveries (order_id, rider_id, delivery_manager_id, assigned_at, expected_time, picked_up_at, delivered_at) VALUES
(1, 1, 1, '2026-10-10 12:35:00', '00:30:00', '2026-10-10 12:45:00', '2026-10-10 13:05:00'),
(2, 2, 1, '2026-10-10 13:20:00', '00:35:00', '2026-10-10 13:30:00', '2026-10-10 13:52:00'),
(3, 3, 2, '2026-10-10 18:50:00', '00:25:00', '2026-10-10 19:00:00', '2026-10-10 19:22:00'),
(4, 2, 2, '2026-10-11 11:25:00', '00:30:00', NULL, NULL),
(7, 1, 1, '2026-10-10 19:15:00', '00:30:00', '2026-10-10 19:25:00', '2026-10-10 19:43:00'),
(8, 3, 1, '2026-10-10 20:10:00', '00:40:00', '2026-10-10 20:20:00', '2026-10-10 20:48:00'),
(9, 5, 2, '2026-10-10 20:35:00', '00:30:00', '2026-10-10 20:42:00', '2026-10-10 21:02:00'),
(10, 5, 2, '2026-10-11 10:05:00', '00:25:00', '2026-10-11 10:15:00', '2026-10-11 10:33:00');

-- Re-enable foreign key checks
SET FOREIGN_KEY_CHECKS = 1;


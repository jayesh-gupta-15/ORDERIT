

-- ---------------------------------------------------------------------
-- users Table
-- ---------------------------------------------------------------------
CREATE TABLE users(
    user_id       INT   NOT NULL AUTO_INCREMENT,
    full_name     VARCHAR(255)  NOT NULL,
    phone_number  VARCHAR(255)  NOT NULL,
    email         VARCHAR(255)  NOT NULL,
    CONSTRAINT pk_users               PRIMARY KEY (user_id),
    CONSTRAINT uq_users_phone_number  UNIQUE (phone_number),
    CONSTRAINT uq_users_email         UNIQUE (email)
);


-- ---------------------------------------------------------------------
-- addresses Table
-- ---------------------------------------------------------------------
CREATE TABLE addresses (
    address_id     INT   NOT NULL AUTO_INCREMENT,
    flat_number    VARCHAR(255)  NOT NULL,
    building_name  VARCHAR(255)  NOT NULL,
    landmark       VARCHAR(255)  NOT NULL,
    pincode        INT   NOT NULL,
    CONSTRAINT pk_addresses PRIMARY KEY (address_id)
);


-- ---------------------------------------------------------------------
-- user_addresses Many to Many Relationship of Users and Addresses
-- ---------------------------------------------------------------------
CREATE TABLE user_addresses (
    user_id     INT  NOT NULL,
    address_id  INT  NOT NULL,
    CONSTRAINT pk_user_addresses           PRIMARY KEY (user_id, address_id),
    CONSTRAINT fk_user_addresses_users     FOREIGN KEY (user_id)
        REFERENCES users (user_id)         ON DELETE CASCADE,
    CONSTRAINT fk_user_addresses_addresses FOREIGN KEY (address_id)
        REFERENCES addresses (address_id)  ON DELETE CASCADE
);


-- ---------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------
CREATE TABLE categories (
    category_id  INT   NOT NULL AUTO_INCREMENT,
    name         VARCHAR(255)  NOT NULL,
    CONSTRAINT pk_categories      PRIMARY KEY (category_id),
    CONSTRAINT uq_categories_name UNIQUE (name)
);


-- ---------------------------------------------------------------------
-- food_items(Displaying Tax Exclusive)
-- ---------------------------------------------------------------------
CREATE TABLE food_items (
    food_item_id    INT    NOT NULL AUTO_INCREMENT,
    category_id     INT    NOT NULL,
    name            VARCHAR(255)   NOT NULL,
    unit_price      DECIMAL(10,2)  NOT NULL,
    gst_rate        DECIMAL(5,2)   NOT NULL,
    stock_quantity  INT            NOT NULL,
    CONSTRAINT pk_food_items            PRIMARY KEY (food_item_id),
    CONSTRAINT fk_food_items_categories FOREIGN KEY (category_id)
        REFERENCES categories (category_id) ON DELETE RESTRICT,
    CONSTRAINT ck_food_items_unit_price     CHECK (unit_price >= 0),
    CONSTRAINT ck_food_items_gst_rate CHECK (gst_rate IN (0, 5, 18, 40)),
    CONSTRAINT ck_food_items_stock_quantity CHECK (stock_quantity >= 0)
);


-- ---------------------------------------------------------------------
-- riders
-- ---------------------------------------------------------------------
CREATE TABLE riders (
    rider_id      INT   NOT NULL AUTO_INCREMENT,
    address_id    INT   NOT NULL,
    full_name     VARCHAR(255)  NOT NULL,
    phone_number  VARCHAR(255)  NOT NULL,
    email         VARCHAR(255)  NOT NULL,
    status        VARCHAR(255)  NOT NULL DEFAULT 'Available',
    CONSTRAINT pk_riders              PRIMARY KEY (rider_id),
    CONSTRAINT uq_riders_phone_number UNIQUE (phone_number),
    CONSTRAINT uq_riders_email        UNIQUE (email),
    CONSTRAINT fk_riders_addresses    FOREIGN KEY (address_id)
        REFERENCES addresses (address_id) ON DELETE RESTRICT,
    CONSTRAINT ck_riders_status
        CHECK (status IN ('Available', 'Busy', 'Offline'))
);


-- ---------------------------------------------------------------------
-- delivery_managers
-- ---------------------------------------------------------------------
CREATE TABLE delivery_managers (
    delivery_manager_id  INT   NOT NULL AUTO_INCREMENT,
    full_name            VARCHAR(255)  NOT NULL,
    status               VARCHAR(255)  NOT NULL DEFAULT 'Active',
    CONSTRAINT pk_delivery_managers PRIMARY KEY (delivery_manager_id),
    CONSTRAINT ck_delivery_managers_status
        CHECK (status IN ('Active', 'Inactive'))
);


-- ---------------------------------------------------------------------
-- orders  (no stored total: it is derived from order_items)
-- address_id is NULL until the customer picks an address at checkout
-- ---------------------------------------------------------------------
CREATE TABLE orders (
    order_id    INT   NOT NULL AUTO_INCREMENT,
    user_id     INT   NOT NULL,
    address_id  INT   NULL,
    status      VARCHAR(255)  NOT NULL DEFAULT 'In Progress',
    created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_orders           PRIMARY KEY (order_id),
    CONSTRAINT fk_orders_users     FOREIGN KEY (user_id)
        REFERENCES users (user_id)        ON DELETE RESTRICT,
    CONSTRAINT fk_orders_addresses FOREIGN KEY (address_id)
        REFERENCES addresses (address_id) ON DELETE RESTRICT,
    CONSTRAINT ck_orders_status CHECK (status IN (
        'In Progress', 'Payment Processing', 'Payment Successful',
        'Rider Assigned', 'Delivered'))
);


-- ---------------------------------------------------------------------
-- order_items  (unit_price and gst_rate are snapshots taken when the
-- item is added, so later menu changes never alter past orders)
-- ---------------------------------------------------------------------
CREATE TABLE order_items (
    order_id      INT    NOT NULL,
    food_item_id  INT    NOT NULL,
    quantity      INT    NOT NULL,
    unit_price    DECIMAL(10,2)  NOT NULL,
    gst_rate      DECIMAL(5,2)   NOT NULL,
    CONSTRAINT pk_order_items            PRIMARY KEY (order_id, food_item_id),
    CONSTRAINT fk_order_items_orders     FOREIGN KEY (order_id)
        REFERENCES orders (order_id)          ON DELETE CASCADE,
    CONSTRAINT fk_order_items_food_items FOREIGN KEY (food_item_id)
        REFERENCES food_items (food_item_id)  ON DELETE RESTRICT,
    CONSTRAINT ck_order_items_quantity   CHECK (quantity > 0),
    CONSTRAINT ck_order_items_unit_price CHECK (unit_price >= 0),
    CONSTRAINT ck_order_items_gst_rate CHECK (gst_rate IN (0, 5, 18, 40))
);


-- ---------------------------------------------------------------------
-- payments  (amount = the single stored total: what was actually charged)
-- ---------------------------------------------------------------------
CREATE TABLE payments (
    payment_id      INT    NOT NULL AUTO_INCREMENT,
    order_id        INT    NOT NULL,
    payment_method  VARCHAR(255)   NOT NULL,
    amount          DECIMAL(10,2)  NOT NULL,
    paid_at         TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_payments          PRIMARY KEY (payment_id),
    CONSTRAINT uq_payments_order_id UNIQUE (order_id),
    CONSTRAINT fk_payments_orders   FOREIGN KEY (order_id)
        REFERENCES orders (order_id) ON DELETE RESTRICT,
    CONSTRAINT ck_payments_amount   CHECK (amount >= 0)
);


-- ---------------------------------------------------------------------
-- deliveries  (one per order: order_id is both PK and FK)
-- ---------------------------------------------------------------------
CREATE TABLE deliveries (
    order_id             INT   NOT NULL,
    rider_id             INT   NOT NULL,
    delivery_manager_id  INT   NOT NULL,
    assigned_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expected_time        TIME          NOT NULL,
    picked_up_at         TIMESTAMP     NULL DEFAULT NULL,
    delivered_at         TIMESTAMP     NULL DEFAULT NULL,
    CONSTRAINT pk_deliveries PRIMARY KEY (order_id),
    CONSTRAINT fk_deliveries_orders   FOREIGN KEY (order_id)
        REFERENCES orders (order_id)   ON DELETE RESTRICT,
    CONSTRAINT fk_deliveries_riders   FOREIGN KEY (rider_id)
        REFERENCES riders (rider_id)   ON DELETE RESTRICT,
    CONSTRAINT fk_deliveries_delivery_managers FOREIGN KEY (delivery_manager_id)
        REFERENCES delivery_managers (delivery_manager_id) ON DELETE RESTRICT
);


-- ---------------------------------------------------------------------
-- order_totals  (replaces the removed orders.total_price column)
-- GST is rounded per line, as on a tax invoice.
-- ---------------------------------------------------------------------
CREATE VIEW order_totals AS
SELECT
    order_id,
    SUM(quantity * unit_price)                                  AS subtotal,
    SUM(ROUND(quantity * unit_price * gst_rate / 100, 2))       AS gst_total,
    SUM(quantity * unit_price)
      + SUM(ROUND(quantity * unit_price * gst_rate / 100, 2))   AS grand_total
FROM order_items
GROUP BY order_id;


--Function to calculate Total Payable Amount
DELIMITER $$


CREATE FUNCTION fn_get_order_payable_amount(p_order_id INT UNSIGNED)
RETURNS DECIMAL(10,2)
READS SQL DATA
BEGIN
    DECLARE v_payable DECIMAL(10,2);


    SELECT COALESCE(
               SUM(quantity * unit_price
                   + ROUND(quantity * unit_price * gst_rate / 100, 2)),
               0.00)
      INTO v_payable
      FROM order_items
     WHERE order_id = p_order_id;


    RETURN v_payable;
END$$


DELIMITER ;




# OrderFlow — System Architecture & Relational Data Model

## 1. System Overview & User Flows

### Customer Flow:
1. **Browse Catalog:** View available products, real-time stock levels, and server-validated pricing.
2. **Product Details:** Open product modal to inspect technical specifications and live inventory.
3. **Cart Management:** Add items to cart, adjust quantities, or remove line items.
4. **Mock Checkout:** Provide shipping details and place an order (server re-validates stock and computes final totals).

### Admin Flow:
1. **Order Dashboard:** View list of customer orders with live status badges.
2. **Lifecycle Transitions:** Update order state: `Pending` → `Confirmed` → `Fulfilled` (or `Cancelled`).
3. **Stock Monitoring:** Monitor inventory levels; cancelled orders safely restore available stock.

---

## 2. Relational Database Schema (`orderflow.db`)

### `products` Table
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique product identifier |
| `name` | TEXT | NOT NULL | Product title |
| `category` | TEXT | NOT NULL | Department / category |
| `price` | REAL | NOT NULL | Unit price in USD (canonical server price) |
| `stock` | INTEGER | NOT NULL DEFAULT 0 | Available units in inventory |
| `description` | TEXT | NOT NULL | Technical summary and specs |
| `icon` | TEXT | DEFAULT '📦' | Emoji or visual identifier |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Creation timestamp |

### `orders` Table
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique order reference |
| `customer_name` | TEXT | NOT NULL | Full name of recipient |
| `customer_email`| TEXT | NOT NULL | Contact email address |
| `shipping_address`| TEXT | NOT NULL | Delivery address destination |
| `total_amount` | REAL | NOT NULL | Server-calculated total order value |
| `status` | TEXT | CHECK(`status` IN ('Pending', 'Confirmed', 'Fulfilled', 'Cancelled')) | Lifecycle state |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Order placement timestamp |

### `order_items` Table
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Line item identifier |
| `order_id` | INTEGER | FOREIGN KEY REFERENCES `orders(id)` ON DELETE CASCADE | Parent order link |
| `product_id` | INTEGER | FOREIGN KEY REFERENCES `products(id)` | Ordered product link |
| `quantity` | INTEGER | NOT NULL CHECK(`quantity` > 0) | Quantity purchased |
| `unit_price` | REAL | NOT NULL | Historical price snapshot at purchase |
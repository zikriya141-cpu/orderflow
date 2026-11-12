# OrderFlow — Mini E-Commerce & Order Management System

OrderFlow is a full-stack mini e-commerce storefront and admin order-management system built with Node.js, Express, and SQLite for Week 03 of the Stack & Scale Internship.

## Features
- **Customer Storefront:** Browse 6 hardware products, check live stock, manage cart quantities, and place orders.
- **Server-Side Security:** Server validates stock (prevents overselling) and calculates totals from SQLite database prices (ignores client prices).
- **Admin Portal:** View order stats and update status (`Pending` -> `Confirmed` -> `Fulfilled` or `Cancelled`). Cancelling an order automatically restores stock.
- **Reliability Tests:** Built-in UI test buttons and automated API test script.

## How to Run
1. Install packages: `npm install`
2. Start server: `node server.js`
3. Open in browser: `http://localhost:3000`
4. Run automated tests: `node api-test.js`

## Limitations
- Mock checkout only (no real payments or shipping).
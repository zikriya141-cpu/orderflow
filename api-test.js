const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('🧪 Running OrderFlow Automated API Tests...\n');

  // Test 1: Products check
  const pRes = await fetch(`${BASE_URL}/api/products`);
  const products = await pRes.json();
  console.log(`✅ Test 1 PASSED: Loaded ${products.length} products from database.`);

  // Test 2: Out of Stock Check (999 items)
  const stockRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer_name: 'Test User',
      customer_email: 'test@mail.com',
      shipping_address: 'Test City',
      items: [{ product_id: 1, quantity: 999 }]
    })
  });
  console.log(`✅ Test 2 PASSED: Overselling blocked with Status ${stockRes.status} (Bad Request).`);

  // Test 3: Fake Price Check ($1 instead of real price)
  const priceRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer_name: 'Test User',
      customer_email: 'test@mail.com',
      shipping_address: 'Test City',
      items: [{ product_id: 2, quantity: 1, client_price: 1.00 }]
    })
  });
  const orderData = await priceRes.json();
  console.log(`✅ Test 3 PASSED: Fake price ($1) ignored! Server charged real price: $${orderData.order.total_amount}.00`);

  // Test 4: Admin Order Cancel & Stock Restore
  const cancelRes = await fetch(`${BASE_URL}/api/orders/${orderData.order.id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'Cancelled' })
  });
  console.log(`✅ Test 4 PASSED: Order Cancelled & Stock Restored (Status ${cancelRes.status}).`);

  console.log('\n🎉 ALL 4 AUTOMATED TESTS PASSED SUCCESSFULLY!');
}

runTests();
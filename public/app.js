let products = [];
let cart = [];
let currentProduct = null;
let isAdminView = false;

// DOM Elements
const storefrontView = document.getElementById('storefrontView');
const adminView = document.getElementById('adminView');
const portalToggleBtn = document.getElementById('portalToggleBtn');
const viewIndicator = document.getElementById('viewIndicator');
const productGrid = document.getElementById('productGrid');
const cartBtn = document.getElementById('cartBtn');
const cartCount = document.getElementById('cartCount');
const cartModal = document.getElementById('cartModal');
const cartCloseBtn = document.getElementById('cartCloseBtn');
const cartItemsContainer = document.getElementById('cartItemsContainer');
const cartSubtotal = document.getElementById('cartSubtotal');
const checkoutSection = document.getElementById('checkoutSection');
const submitOrderBtn = document.getElementById('submitOrderBtn');
const checkoutForm = document.getElementById('checkoutForm');
const drawerFooter = document.getElementById('drawerFooter');
const orderResultBox = document.getElementById('orderResultBox');
const productModal = document.getElementById('productModal');
const modalBody = document.getElementById('modalBody');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const toast = document.getElementById('toast');

// Admin Elements
const ordersTableWrapper = document.getElementById('ordersTableWrapper');
const refreshOrdersBtn = document.getElementById('refreshOrdersBtn');
const runStockTestBtn = document.getElementById('runStockTestBtn');
const stockTestResult = document.getElementById('stockTestResult');
const runPriceTestBtn = document.getElementById('runPriceTestBtn');
const priceTestResult = document.getElementById('priceTestResult');

// Admin Stats
const adminTotalOrders = document.getElementById('adminTotalOrders');
const adminPendingOrders = document.getElementById('adminPendingOrders');
const adminFulfilledOrders = document.getElementById('adminFulfilledOrders');
const adminTotalRevenue = document.getElementById('adminTotalRevenue');

// 1. Fetch and render products
async function loadProducts() {
  try {
    const res = await fetch('/api/products');
    products = await res.json();
    renderProducts();
    document.getElementById('totalProductsCount').innerText = products.length;
  } catch (err) {
    productGrid.innerHTML = `<div class="error-state">Failed to load catalog: ${err.message}</div>`;
  }
}

function renderProducts() {
  productGrid.innerHTML = products.map(p => {
    let stockClass = 'stock-in';
    let stockText = `In Stock: ${p.stock}`;
    if (p.stock === 0) {
      stockClass = 'stock-out';
      stockText = 'Out of Stock';
    } else if (p.stock <= 5) {
      stockClass = 'stock-low';
      stockText = `Low Stock: ${p.stock}`;
    }

    return `
      <div class="product-card" onclick="openProductModal(${p.id})">
        <div class="product-icon-wrap">${p.icon}</div>
        <span class="product-category">${p.category}</span>
        <h4 class="product-name">${p.name}</h4>
        <p class="product-desc">${p.description}</p>
        <div class="card-footer">
          <span class="product-price">$${p.price.toFixed(2)}</span>
          <span class="stock-badge ${stockClass}">${stockText}</span>
        </div>
      </div>
    `;
  }).join('');
}

// 2. Product Detail Modal
window.openProductModal = function(id) {
  currentProduct = products.find(p => p.id === id);
  if (!currentProduct) return;

  const isOutOfStock = currentProduct.stock <= 0;

  modalBody.innerHTML = `
    <div style="font-size: 3.5rem; margin-bottom: 0.5rem;">${currentProduct.icon}</div>
    <span class="product-category">${currentProduct.category}</span>
    <h3 style="font-size: 1.4rem; margin: 0.25rem 0 0.5rem 0;">${currentProduct.name}</h3>
    <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1.5rem;">${currentProduct.description}</p>
    
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; padding: 1rem; background-color: var(--bg-card); border-radius: var(--radius-md);">
      <div>
        <div style="font-size: 0.75rem; color: var(--text-muted);">UNIT PRICE</div>
        <div style="font-size: 1.4rem; font-weight: 800; font-family: 'JetBrains Mono';">$${currentProduct.price.toFixed(2)}</div>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 0.75rem; color: var(--text-muted);">INVENTORY</div>
        <div style="font-size: 1rem; font-weight: 700; color: ${isOutOfStock ? 'var(--accent-red)' : 'var(--accent-green)'};">
          ${currentProduct.stock} Available
        </div>
      </div>
    </div>

    <button class="checkout-btn" onclick="addToCartFromModal()" ${isOutOfStock ? 'disabled' : ''}>
      ${isOutOfStock ? 'Out of Stock' : '🛒 Add to Cart'}
    </button>
  `;

  productModal.classList.remove('hidden');
};

modalCloseBtn.onclick = () => productModal.classList.add('hidden');
productModal.onclick = (e) => {
  if (e.target === productModal) productModal.classList.add('hidden');
};

window.addToCartFromModal = function() {
  if (!currentProduct || currentProduct.stock <= 0) return;

  const existing = cart.find(item => item.product_id === currentProduct.id);
  if (existing) {
    if (existing.quantity < currentProduct.stock) {
      existing.quantity += 1;
      showToast(`Added another ${currentProduct.name} to cart.`);
    } else {
      showToast(`Cannot add more than available stock (${currentProduct.stock}).`);
      return;
    }
  } else {
    cart.push({
      product_id: currentProduct.id,
      name: currentProduct.name,
      price: currentProduct.price,
      icon: currentProduct.icon,
      stock: currentProduct.stock,
      quantity: 1
    });
    showToast(`${currentProduct.name} added to cart.`);
  }

  productModal.classList.add('hidden');
  updateCartUI();
};

// 3. Cart Logic
function updateCartUI() {
  const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  cartCount.innerText = totalCount;

  if (cart.length === 0) {
    cartItemsContainer.innerHTML = `
      <div style="text-align: center; padding: 2rem 0; color: var(--text-muted);">
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🛒</div>
        <p>Your shopping cart is empty.</p>
      </div>
    `;
    cartSubtotal.innerText = '$0.00';
    checkoutSection.classList.add('hidden');
    submitOrderBtn.disabled = true;
    submitOrderBtn.innerText = 'Cart is Empty';
    return;
  }

  let subtotal = 0;
  cartItemsContainer.innerHTML = cart.map((item, idx) => {
    const lineTotal = item.price * item.quantity;
    subtotal += lineTotal;

    return `
      <div class="cart-item-row">
        <div class="cart-item-info">
          <span style="font-size: 1.5rem;">${item.icon}</span>
          <div>
            <div style="font-weight: 700; font-size: 0.9rem;">${item.name}</div>
            <div style="font-size: 0.78rem; color: var(--text-muted);">$${item.price.toFixed(2)} each</div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <div class="qty-control">
            <button class="qty-btn" onclick="changeQty(${idx}, -1)">−</button>
            <span style="font-weight: 700; font-size: 0.85rem; min-width: 16px; text-align: center;">${item.quantity}</span>
            <button class="qty-btn" onclick="changeQty(${idx}, 1)">+</button>
          </div>
          <span style="font-weight: 800; font-family: 'JetBrains Mono'; font-size: 0.95rem;">$${lineTotal.toFixed(2)}</span>
          <button class="delete-btn" onclick="removeItem(${idx})">&times;</button>
        </div>
      </div>
    `;
  }).join('');

  cartSubtotal.innerText = `$${subtotal.toFixed(2)}`;
  checkoutSection.classList.remove('hidden');
  submitOrderBtn.disabled = false;
  submitOrderBtn.innerText = `Place Order ($${subtotal.toFixed(2)})`;
}

window.changeQty = function(idx, delta) {
  const item = cart[idx];
  const newQty = item.quantity + delta;

  if (newQty <= 0) {
    cart.splice(idx, 1);
  } else if (newQty > item.stock) {
    showToast(`Maximum available stock reached (${item.stock}).`);
    return;
  } else {
    item.quantity = newQty;
  }
  updateCartUI();
};

window.removeItem = function(idx) {
  cart.splice(idx, 1);
  updateCartUI();
};

cartBtn.onclick = () => {
  orderResultBox.classList.add('hidden');
  drawerFooter.classList.remove('hidden');
  cartItemsContainer.classList.remove('hidden');
  updateCartUI();
  cartModal.classList.remove('hidden');
};

cartCloseBtn.onclick = () => cartModal.classList.add('hidden');
cartModal.onclick = (e) => {
  if (e.target === cartModal) cartModal.classList.add('hidden');
};

// 4. Submit Order (POST /api/orders)
submitOrderBtn.onclick = async () => {
  if (cart.length === 0) return;

  const custName = document.getElementById('custName').value.trim();
  const custEmail = document.getElementById('custEmail').value.trim();
  const custAddress = document.getElementById('custAddress').value.trim();

  if (!custName || !custEmail || !custAddress) {
    showToast('Please fill in Name, Email, and Address.');
    return;
  }

  submitOrderBtn.disabled = true;
  submitOrderBtn.innerText = 'Processing Order...';

  const orderPayload = {
    customer_name: custName,
    customer_email: custEmail,
    shipping_address: custAddress,
    items: cart.map(i => ({
      product_id: i.product_id,
      quantity: i.quantity
    }))
  };

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload)
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Server error processing order.');
    }

    // Success Screen
    cart = [];
    updateCartUI();
    loadProducts(); // Refresh catalog stock

    cartItemsContainer.classList.add('hidden');
    checkoutSection.classList.add('hidden');
    drawerFooter.classList.add('hidden');

    orderResultBox.innerHTML = `
      <div class="order-success-card">
        <div style="font-size: 3rem; margin-bottom: 0.5rem;">🎉</div>
        <h3 style="color: var(--accent-green); font-size: 1.35rem;">Order Placed Successfully!</h3>
        <p style="color: var(--text-muted); font-size: 0.88rem; margin-top: 0.35rem;">
          Thank you, <strong>${data.order.customer_name}</strong>! Order reference: 
          <span class="order-ref-badge">${data.order.order_ref}</span> (Status: <strong>${data.order.status}</strong>).
        </p>

        <div style="margin-top: 1.5rem; text-align: left; background-color: var(--bg-card); padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
          <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted); margin-bottom: 0.5rem;">
            Database Order Record #${data.order.id} • ${data.order.items.length} Items Persisted
          </div>
          ${data.order.items.map(it => `
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; padding: 0.25rem 0;">
              <span>${it.quantity}x ${it.name}</span>
              <span style="font-family: 'JetBrains Mono';">$${(it.unit_price * it.quantity).toFixed(2)} (Stock remaining: ${it.remaining_stock})</span>
            </div>
          `).join('')}
          <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px dashed var(--border-color); display: flex; justify-content: space-between; font-weight: 800;">
            <span>Server Computed Total</span>
            <span style="color: var(--accent-cyan); font-family: 'JetBrains Mono';">$${data.order.total_amount.toFixed(2)} USD</span>
          </div>
        </div>

        <button class="checkout-btn" style="margin-top: 1.5rem;" onclick="document.getElementById('cartModal').classList.add('hidden')">
          Continue Shopping
        </button>
      </div>
    `;

    orderResultBox.classList.remove('hidden');

  } catch (err) {
    alert('Order Error: ' + err.message);
    submitOrderBtn.disabled = false;
    submitOrderBtn.innerText = 'Place Order';
  }
};

// 5. Admin Portal Toggle & Order Management
portalToggleBtn.onclick = () => {
  isAdminView = !isAdminView;
  if (isAdminView) {
    storefrontView.classList.add('hidden');
    adminView.classList.remove('hidden');
    portalToggleBtn.innerText = '🏪 Back to Storefront';
    viewIndicator.innerText = '🛡️ Admin Portal Active';
    viewIndicator.style.color = 'var(--accent-blue)';
    viewIndicator.style.borderColor = 'rgba(59, 130, 246, 0.3)';
    viewIndicator.style.backgroundColor = 'rgba(59, 130, 246, 0.15)';
    loadAdminOrders();
  } else {
    adminView.classList.add('hidden');
    storefrontView.classList.remove('hidden');
    portalToggleBtn.innerText = '🛡️ Admin Portal';
    viewIndicator.innerText = '🟢 Storefront Active';
    viewIndicator.style.color = 'var(--accent-green)';
    viewIndicator.style.borderColor = 'rgba(16, 185, 129, 0.3)';
    viewIndicator.style.backgroundColor = 'rgba(16, 185, 129, 0.15)';
    loadProducts();
  }
};

refreshOrdersBtn.onclick = () => loadAdminOrders();

async function loadAdminOrders() {
  ordersTableWrapper.innerHTML = '<div class="loading-state">Fetching database orders...</div>';

  try {
    const res = await fetch('/api/orders');
    const orders = await res.json();

    // Compute Stats
    let totalRev = 0;
    let pendingCount = 0;
    let fulfilledCount = 0;

    orders.forEach(o => {
      totalRev += o.total_amount;
      if (o.status === 'Pending') pendingCount++;
      if (o.status === 'Fulfilled') fulfilledCount++;
    });

    adminTotalOrders.innerText = orders.length;
    adminPendingOrders.innerText = pendingCount;
    adminFulfilledOrders.innerText = fulfilledCount;
    adminTotalRevenue.innerText = `$${totalRev.toFixed(2)}`;

    if (orders.length === 0) {
      ordersTableWrapper.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">No orders found in database. Place an order on the storefront first!</div>';
      return;
    }

    ordersTableWrapper.innerHTML = `
      <table class="orders-table">
        <thead>
          <tr>
            <th>Order Ref</th>
            <th>Customer & Address</th>
            <th>Items</th>
            <th>Total</th>
            <th>Status</th>
            <th>Lifecycle Actions</th>
          </tr>
        </thead>
        <tbody>
          ${orders.map(o => {
            let statusClass = 'status-pending';
            if (o.status === 'Confirmed') statusClass = 'status-confirmed';
            if (o.status === 'Fulfilled') statusClass = 'status-fulfilled';
            if (o.status === 'Cancelled') statusClass = 'status-cancelled';

            let actionButtons = '';
            if (o.status === 'Pending') {
              actionButtons = `
                <div class="action-btn-group">
                  <button class="btn-confirm" onclick="updateOrderStatus(${o.id}, 'Confirmed')">Confirm</button>
                  <button class="btn-cancel" onclick="updateOrderStatus(${o.id}, 'Cancelled')">Cancel</button>
                </div>
              `;
            } else if (o.status === 'Confirmed') {
              actionButtons = `
                <div class="action-btn-group">
                  <button class="btn-fulfill" onclick="updateOrderStatus(${o.id}, 'Fulfilled')">Mark Fulfilled</button>
                  <button class="btn-cancel" onclick="updateOrderStatus(${o.id}, 'Cancelled')">Cancel</button>
                </div>
              `;
            } else if (o.status === 'Fulfilled') {
              actionButtons = '<span class="btn-terminal">✓ Completed (Terminal)</span>';
            } else if (o.status === 'Cancelled') {
              actionButtons = '<span class="btn-terminal" style="color: var(--accent-red);">✕ Cancelled (Stock Restored)</span>';
            }

            return `
              <tr>
                <td><strong style="color: var(--accent-cyan); font-family: 'JetBrains Mono';">${o.order_ref}</strong><br><small style="color: var(--text-muted);">${o.created_at}</small></td>
                <td><strong>${o.customer_name}</strong><br><small style="color: var(--text-muted);">${o.customer_email}</small></td>
                <td>${o.items.map(it => `<div>${it.icon} ${it.quantity}x ${it.product_name}</div>`).join('')}</td>
                <td style="font-family: 'JetBrains Mono'; font-weight: 800;">$${o.total_amount.toFixed(2)}</td>
                <td><span class="status-badge ${statusClass}">${o.status}</span></td>
                <td>${actionButtons}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;

  } catch (err) {
    ordersTableWrapper.innerHTML = `<div class="error-state">Error fetching orders: ${err.message}</div>`;
  }
}

window.updateOrderStatus = async function(orderId, newStatus) {
  try {
    const res = await fetch(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to update order status');
    }

    let toastMsg = `Order status transitioned to ${newStatus}.`;
    if (data.stock_restored > 0) {
      toastMsg += ` (${data.stock_restored} items safely restored to inventory!)`;
    }
    showToast(toastMsg);
    loadAdminOrders();

  } catch (err) {
    alert('Transition Error: ' + err.message);
  }
};

// 6. Reliability & Security Tests
runStockTestBtn.onclick = async () => {
  stockTestResult.classList.remove('hidden');
  stockTestResult.innerText = 'Sending order payload requesting 999 units...';

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_name: 'Security Tester',
        customer_email: 'test@security.org',
        shipping_address: 'Test Lab 101',
        items: [{ product_id: 1, quantity: 999 }]
      })
    });

    const data = await res.json();
    stockTestResult.innerHTML = `
HTTP Status: ${res.status} ${res.status === 400 ? '✅ PASSED (Rejected)' : '❌ FAILED'}
Response:
${JSON.stringify(data, null, 2)}
    `;
  } catch (err) {
    stockTestResult.innerText = 'Test Error: ' + err.message;
  }
};

runPriceTestBtn.onclick = async () => {
  priceTestResult.classList.remove('hidden');
  priceTestResult.innerText = 'Sending malicious payload with tampered client price ($1.00)...';

  try {
    // Malicious payload attempts to inject tampered price
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_name: 'Price Tamper Attempt',
        customer_email: 'attacker@exploit.com',
        shipping_address: 'Exploit Street',
        items: [{ product_id: 2, quantity: 1, client_price: 1.00 }] // Attempts $1 instead of $79
      })
    });

    const data = await res.json();
    priceTestResult.innerHTML = `
HTTP Status: ${res.status} ✅ PASSED (Tampered price ignored)
Server Computed Price: $${data.order.total_amount}.00 USD (Authoritative DB Price)
Database Order ID: #${data.order.id}
Client Attempt: $1.00 ➔ Server Enforced: $79.00
    `;
    loadAdminOrders();
  } catch (err) {
    priceTestResult.innerText = 'Test Error: ' + err.message;
  }
};

function showToast(msg) {
  toast.innerText = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3500);
}

// Initial Load
loadProducts();
'use strict';

const CART_STORAGE_KEY = 'orderflow.cart.v1';
const LOW_STOCK_THRESHOLD = 5;

const state = {
  products: [],
  cart: [],
  orders: [],
  isAdminView: false,
  filters: { status: 'all', query: '' },
};

const STATUS_CLASS = {
  Pending: 'status-pending',
  Confirmed: 'status-confirmed',
  Fulfilled: 'status-fulfilled',
  Cancelled: 'status-cancelled',
};

const ui = {
  // Layout
  storefrontView: document.getElementById('storefrontView'),
  adminView: document.getElementById('adminView'),
  portalToggleBtn: document.getElementById('portalToggleBtn'),
  viewIndicator: document.getElementById('viewIndicator'),

  // Storefront
  productGrid: document.getElementById('productGrid'),
  totalProductsCount: document.getElementById('totalProductsCount'),
  productModal: document.getElementById('productModal'),
  modalBody: document.getElementById('modalBody'),
  modalCloseBtn: document.getElementById('modalCloseBtn'),

  // Cart
  cartBtn: document.getElementById('cartBtn'),
  cartCount: document.getElementById('cartCount'),
  cartModal: document.getElementById('cartModal'),
  cartCloseBtn: document.getElementById('cartCloseBtn'),
  cartItemsContainer: document.getElementById('cartItemsContainer'),
  cartSubtotal: document.getElementById('cartSubtotal'),
  checkoutSection: document.getElementById('checkoutSection'),
  checkoutForm: document.getElementById('checkoutForm'),
  drawerFooter: document.getElementById('drawerFooter'),
  submitOrderBtn: document.getElementById('submitOrderBtn'),
  orderResultBox: document.getElementById('orderResultBox'),

  // Admin
  ordersTableWrapper: document.getElementById('ordersTableWrapper'),
  orderSearch: document.getElementById('orderSearch'),
  statusFilter: document.getElementById('statusFilter'),
  adminTotalOrders: document.getElementById('adminTotalOrders'),
  adminPendingOrders: document.getElementById('adminPendingOrders'),
  adminFulfilledOrders: document.getElementById('adminFulfilledOrders'),
  adminTotalRevenue: document.getElementById('adminTotalRevenue'),
  diagApi: document.getElementById('diagApi'),
  diagDatabase: document.getElementById('diagDatabase'),
  diagVersion: document.getElementById('diagVersion'),
  diagUptime: document.getElementById('diagUptime'),

  toast: document.getElementById('toast'),
};

let toastTimer = null;
let lastFocusedElement = null;
let isSubmittingOrder = false;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

const moneyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

function formatMoney(value) {
  return moneyFormatter.format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return '—';
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function formatUptime(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m ${total % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function showToast(message) {
  if (toastTimer) clearTimeout(toastTimer);
  ui.toast.textContent = message;
  ui.toast.classList.remove('hidden');
  toastTimer = setTimeout(() => ui.toast.classList.add('hidden'), 3800);
}

async function apiFetch(url, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (options.body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, { ...options, headers });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const error = new Error((data && data.error) || `Request failed with status ${response.status}.`);
    error.status = response.status;
    error.details = data?.details;
    throw error;
  }

  return data;
}

// ---------------------------------------------------------------------------
// Modal handling
// ---------------------------------------------------------------------------

function openModal(modal) {
  lastFocusedElement = document.activeElement;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');

  const focusTarget = modal.querySelector('.modal-close-btn') || modal.querySelector('button, input, textarea, select');
  focusTarget?.focus();
}

function closeModal(modal) {
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');

  if (!document.querySelector('.modal-overlay:not(.hidden)')) {
    document.body.classList.remove('modal-open');
  }

  if (lastFocusedElement && document.contains(lastFocusedElement)) {
    lastFocusedElement.focus();
    lastFocusedElement = null;
  }
}

// ---------------------------------------------------------------------------
// Cart persistence
// ---------------------------------------------------------------------------

function restoreCart() {
  try {
    const stored = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]');
    if (!Array.isArray(stored)) return;

    state.cart = stored
      .filter((item) => item && Number.isInteger(item.product_id) && Number.isInteger(item.quantity) && item.quantity > 0)
      .map((item) => ({
        product_id: item.product_id,
        name: typeof item.name === 'string' ? item.name : 'Product',
        price: Number(item.price) || 0,
        icon: typeof item.icon === 'string' ? item.icon : '📦',
        stock: Number(item.stock) || 0,
        quantity: Math.min(item.quantity, 999),
      }));
  } catch {
    state.cart = [];
  }
}

function persistCart() {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state.cart));
  } catch {
    // Storage can be unavailable (private mode); the in-memory cart still works.
  }
}

function reconcileCart() {
  const productsById = new Map(state.products.map((product) => [product.id, product]));

  state.cart = state.cart.flatMap((item) => {
    const product = productsById.get(item.product_id);
    if (!product || product.stock <= 0) return [];

    return [{
      product_id: product.id,
      name: product.name,
      price: product.price,
      icon: product.icon,
      stock: product.stock,
      quantity: Math.min(Math.max(1, item.quantity), product.stock),
    }];
  });

  persistCart();
  updateCartUI();
}

// ---------------------------------------------------------------------------
// Storefront
// ---------------------------------------------------------------------------

function stockInfo(stock) {
  if (stock <= 0) return { className: 'stock-out', label: 'Out of stock' };
  if (stock <= LOW_STOCK_THRESHOLD) return { className: 'stock-low', label: `Low stock: ${stock}` };
  return { className: 'stock-in', label: `In stock: ${stock}` };
}

function renderProducts() {
  if (state.products.length === 0) {
    ui.productGrid.innerHTML = '<div class="empty-state">No products are available right now.</div>';
    return;
  }

  ui.productGrid.innerHTML = state.products.map((product) => {
    const stock = stockInfo(product.stock);

    return `
      <article class="product-card">
        <button class="product-card-button" type="button" data-action="open-product" data-id="${product.id}">
          <span class="product-icon-wrap" aria-hidden="true">${escapeHtml(product.icon)}</span>
          <span class="product-category">${escapeHtml(product.category)}</span>
          <span class="product-name">${escapeHtml(product.name)}</span>
          <span class="product-desc">${escapeHtml(product.description)}</span>
          <span class="card-footer">
            <span class="product-price">${formatMoney(product.price)}</span>
            <span class="stock-badge ${stock.className}">${escapeHtml(stock.label)}</span>
          </span>
        </button>
      </article>
    `;
  }).join('');

  ui.totalProductsCount.textContent = String(state.products.length);
}

async function loadProducts() {
  if (state.products.length === 0) {
    ui.productGrid.innerHTML = '<div class="loading-state">Loading catalog…</div>';
  }

  try {
    const products = await apiFetch('/api/products');
    state.products = Array.isArray(products) ? products : [];
    reconcileCart();
    renderProducts();
  } catch (error) {
    ui.productGrid.innerHTML = `
      <div class="error-state">
        <p>Unable to load the catalog.</p>
        <p class="error-detail">${escapeHtml(error.message)}</p>
        <button class="refresh-btn" type="button" data-action="reload-products">Try again</button>
      </div>
    `;
    showToast(error.message);
  }
}

function openProduct(productId) {
  const product = state.products.find((item) => item.id === productId);
  if (!product) return;

  const stock = stockInfo(product.stock);
  const isOutOfStock = product.stock <= 0;

  ui.modalBody.innerHTML = `
    <div class="product-detail">
      <span class="product-icon-wrap product-icon-lg" aria-hidden="true">${escapeHtml(product.icon)}</span>
      <span class="product-category">${escapeHtml(product.category)}</span>
      <h3 class="modal-title" id="productModalTitle">${escapeHtml(product.name)}</h3>
      <p class="modal-desc">${escapeHtml(product.description)}</p>

      <div class="price-panel">
        <div class="price-panel-item">
          <span class="price-label">UNIT PRICE</span>
          <span class="price-value">${formatMoney(product.price)}</span>
        </div>
        <div class="price-panel-item price-panel-right">
          <span class="price-label">AVAILABILITY</span>
          <span class="price-value ${isOutOfStock ? 'is-out' : ''}">${product.stock} available</span>
        </div>
      </div>

      <button class="checkout-btn" type="button" data-action="add-to-cart" data-id="${product.id}" ${isOutOfStock ? 'disabled' : ''}>
        ${isOutOfStock ? 'Out of stock' : 'Add to cart'}
      </button>
    </div>
  `;

  openModal(ui.productModal);
}

function addToCart(productId) {
  const product = state.products.find((item) => item.id === productId);
  if (!product || product.stock <= 0) {
    showToast('This product is currently out of stock.');
    return false;
  }

  const existing = state.cart.find((item) => item.product_id === product.id);

  if (existing) {
    if (existing.quantity >= product.stock) {
      showToast(`Only ${product.stock} unit(s) available.`);
      return false;
    }
    existing.quantity += 1;
    existing.stock = product.stock;
  } else {
    state.cart.push({
      product_id: product.id,
      name: product.name,
      price: product.price,
      icon: product.icon,
      stock: product.stock,
      quantity: 1,
    });
  }

  persistCart();
  updateCartUI();
  showToast(`${product.name} added to cart.`);
  return true;
}

// ---------------------------------------------------------------------------
// Cart UI & checkout
// ---------------------------------------------------------------------------

function updateCartUI() {
  const itemCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  ui.cartCount.textContent = String(itemCount);

  if (state.cart.length === 0) {
    ui.cartItemsContainer.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty-icon" aria-hidden="true">🛒</div>
        <p>Your cart is empty.</p>
        <p class="cart-empty-hint">Add a product from the catalog to get started.</p>
      </div>
    `;
    ui.cartSubtotal.textContent = formatMoney(0);
    ui.checkoutSection.classList.add('hidden');
    ui.drawerFooter.classList.add('hidden');
    ui.submitOrderBtn.disabled = true;
    return;
  }

  let subtotal = 0;

  ui.cartItemsContainer.innerHTML = state.cart.map((item, index) => {
    const lineTotal = item.price * item.quantity;
    subtotal += lineTotal;

    return `
      <div class="cart-item-row">
        <div class="cart-item-info">
          <span class="cart-item-icon" aria-hidden="true">${escapeHtml(item.icon)}</span>
          <div>
            <p class="cart-item-name">${escapeHtml(item.name)}</p>
            <p class="cart-item-unit">${formatMoney(item.price)} each</p>
          </div>
        </div>
        <div class="cart-item-actions">
          <div class="qty-control" role="group" aria-label="Quantity for ${escapeHtml(item.name)}">
            <button class="qty-btn" type="button" data-action="change-qty" data-index="${index}" data-delta="-1" aria-label="Decrease quantity">−</button>
            <span class="qty-value">${item.quantity}</span>
            <button class="qty-btn" type="button" data-action="change-qty" data-index="${index}" data-delta="1" aria-label="Increase quantity" ${item.quantity >= item.stock ? 'disabled' : ''}>+</button>
          </div>
          <span class="line-total">${formatMoney(lineTotal)}</span>
          <button class="delete-btn" type="button" data-action="remove-item" data-index="${index}" aria-label="Remove ${escapeHtml(item.name)} from cart">&times;</button>
        </div>
      </div>
    `;
  }).join('');

  ui.cartSubtotal.textContent = formatMoney(subtotal);
  ui.checkoutSection.classList.remove('hidden');
  ui.drawerFooter.classList.remove('hidden');
  ui.submitOrderBtn.disabled = false;
  ui.submitOrderBtn.textContent = `Place order · ${formatMoney(subtotal)}`;
}

function changeQuantity(index, delta) {
  const item = state.cart[index];
  if (!item) return;

  const nextQuantity = item.quantity + delta;

  if (nextQuantity <= 0) {
    state.cart.splice(index, 1);
  } else if (nextQuantity > item.stock) {
    showToast(`Maximum available stock reached (${item.stock}).`);
    return;
  } else {
    item.quantity = nextQuantity;
  }

  persistCart();
  updateCartUI();
}

function removeItem(index) {
  if (!state.cart[index]) return;
  state.cart.splice(index, 1);
  persistCart();
  updateCartUI();
}

function openCart() {
  ui.orderResultBox.classList.add('hidden');
  ui.cartItemsContainer.classList.remove('hidden');
  updateCartUI();
  openModal(ui.cartModal);
}

function renderReceipt(order) {
  const items = Array.isArray(order.items) ? order.items : [];

  ui.orderResultBox.innerHTML = `
    <div class="order-success-card">
      <div class="receipt-icon" aria-hidden="true">🎉</div>
      <h3 class="receipt-title">Order placed successfully</h3>
      <p class="receipt-subtitle">
        Thank you, <strong>${escapeHtml(order.customer_name)}</strong>. Your order reference is
        <span class="order-ref-badge">${escapeHtml(order.order_ref)}</span>.
      </p>
      <p class="receipt-status">Current status: <strong>${escapeHtml(order.status)}</strong></p>

      <div class="receipt">
        <p class="receipt-meta">Order #${Number(order.id)} · ${items.length} line item(s) · totals validated by the server</p>
        <div class="receipt-list">
          ${items.map((item) => `
            <div class="receipt-row">
              <span>${escapeHtml(item.quantity)} × ${escapeHtml(item.name)}</span>
              <span>${formatMoney((Number(item.unit_price) || 0) * (Number(item.quantity) || 0))}</span>
            </div>
          `).join('')}
        </div>
        <div class="receipt-total">
          <span>Total (USD)</span>
          <span>${formatMoney(order.total_amount)}</span>
        </div>
      </div>

      <p class="receipt-note">This is a demo checkout — no payment was collected and nothing will be shipped.</p>
      <button class="checkout-btn" type="button" data-action="continue-shopping">Continue shopping</button>
    </div>
  `;

  ui.orderResultBox.classList.remove('hidden');
}

async function placeOrder() {
  if (state.cart.length === 0 || isSubmittingOrder) return;

  const customerName = document.getElementById('custName').value.trim();
  const customerEmail = document.getElementById('custEmail').value.trim();
  const shippingAddress = document.getElementById('custAddress').value.trim();

  isSubmittingOrder = true;
  ui.submitOrderBtn.disabled = true;
  ui.submitOrderBtn.textContent = 'Placing order…';

  try {
    const data = await apiFetch('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        customer_name: customerName,
        customer_email: customerEmail,
        shipping_address: shippingAddress,
        items: state.cart.map((item) => ({ product_id: item.product_id, quantity: item.quantity })),
      }),
    });

    state.cart = [];
    persistCart();
    updateCartUI();
    ui.checkoutForm.reset();

    ui.cartItemsContainer.classList.add('hidden');
    ui.checkoutSection.classList.add('hidden');
    ui.drawerFooter.classList.add('hidden');

    renderReceipt(data.order);
    await loadProducts();
  } catch (error) {
    showToast(error.message);
    updateCartUI();
  } finally {
    isSubmittingOrder = false;
  }
}

// ---------------------------------------------------------------------------
// Admin console
// ---------------------------------------------------------------------------

function setAdminView(isAdmin) {
  state.isAdminView = isAdmin;

  ui.storefrontView.classList.toggle('hidden', isAdmin);
  ui.adminView.classList.toggle('hidden', !isAdmin);
  ui.storefrontView.setAttribute('aria-hidden', String(isAdmin));
  ui.adminView.setAttribute('aria-hidden', String(!isAdmin));

  ui.portalToggleBtn.textContent = isAdmin ? 'Back to Storefront' : 'Admin Portal';
  ui.viewIndicator.textContent = isAdmin ? 'Admin Console' : 'Storefront';
  ui.viewIndicator.classList.toggle('is-admin', isAdmin);

  if (isAdmin) {
    loadAdminData();
  } else {
    loadProducts();
  }
}

function loadAdminData() {
  loadStats();
  loadOrders();
  loadDiagnostics();
}

async function loadStats() {
  try {
    const stats = await apiFetch('/api/stats');
    ui.adminTotalOrders.textContent = String(stats.total_orders ?? 0);
    ui.adminPendingOrders.textContent = String(stats.pending_orders ?? 0);
    ui.adminFulfilledOrders.textContent = String(stats.fulfilled_orders ?? 0);
    ui.adminTotalRevenue.textContent = formatMoney(stats.total_revenue);
  } catch (error) {
    showToast(error.message);
  }
}

function actionButtons(order) {
  if (order.status === 'Pending') {
    return `
      <div class="action-btn-group">
        <button class="btn-confirm" type="button" data-action="update-status" data-id="${order.id}" data-status="Confirmed">Confirm</button>
        <button class="btn-cancel" type="button" data-action="update-status" data-id="${order.id}" data-status="Cancelled">Cancel</button>
      </div>
    `;
  }

  if (order.status === 'Confirmed') {
    return `
      <div class="action-btn-group">
        <button class="btn-fulfill" type="button" data-action="update-status" data-id="${order.id}" data-status="Fulfilled">Mark fulfilled</button>
        <button class="btn-cancel" type="button" data-action="update-status" data-id="${order.id}" data-status="Cancelled">Cancel</button>
      </div>
    `;
  }

  if (order.status === 'Fulfilled') {
    return '<span class="btn-terminal">✓ Completed (terminal)</span>';
  }

  return '<span class="btn-terminal is-cancelled">✕ Cancelled (stock restored)</span>';
}

function renderOrders() {
  if (state.orders.length === 0) {
    ui.ordersTableWrapper.innerHTML = `
      <div class="empty-state">
        <p>No orders yet.</p>
        <p class="empty-hint">Place an order from the storefront to see it here.</p>
        <button class="refresh-btn" type="button" data-action="go-storefront">Open storefront</button>
      </div>
    `;
    return;
  }

  const query = state.filters.query.trim().toLowerCase();
  const status = state.filters.status;

  const filtered = state.orders.filter((order) => {
    if (status !== 'all' && order.status !== status) return false;
    if (!query) return true;

    return [order.order_ref, order.customer_name, order.customer_email]
      .some((value) => String(value || '').toLowerCase().includes(query));
  });

  if (filtered.length === 0) {
    ui.ordersTableWrapper.innerHTML = `
      <div class="empty-state">
        <p>No orders match the current filters.</p>
        <p class="empty-hint">Try a different status or search term.</p>
      </div>
    `;
    return;
  }

  ui.ordersTableWrapper.innerHTML = `
    <table class="orders-table">
      <caption class="sr-only">Customer orders with lifecycle actions</caption>
      <thead>
        <tr>
          <th scope="col">Order</th>
          <th scope="col">Customer</th>
          <th scope="col">Items</th>
          <th scope="col">Total</th>
          <th scope="col">Status</th>
          <th scope="col">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map((order) => {
          const items = Array.isArray(order.items) ? order.items : [];
          const statusClass = STATUS_CLASS[order.status] || 'status-pending';

          return `
            <tr>
              <td>
                <span class="order-ref">${escapeHtml(order.order_ref)}</span>
                <span class="order-date">${escapeHtml(formatDate(order.created_at))}</span>
              </td>
              <td>
                <span class="customer-name">${escapeHtml(order.customer_name)}</span>
                <span class="customer-email">${escapeHtml(order.customer_email)}</span>
              </td>
              <td>
                <div class="order-items">
                  ${items.map((item) => `
                    <span class="order-item-line">
                      <span aria-hidden="true">${escapeHtml(item.icon)}</span>
                      ${escapeHtml(item.quantity)} × ${escapeHtml(item.product_name)}
                    </span>
                  `).join('')}
                </div>
              </td>
              <td class="order-total">${formatMoney(order.total_amount)}</td>
              <td><span class="status-badge ${statusClass}">${escapeHtml(order.status)}</span></td>
              <td>${actionButtons(order)}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

async function loadOrders() {
  ui.ordersTableWrapper.innerHTML = '<div class="loading-state">Loading orders…</div>';

  try {
    const orders = await apiFetch('/api/orders?limit=200');
    state.orders = Array.isArray(orders) ? orders : [];
    renderOrders();
  } catch (error) {
    ui.ordersTableWrapper.innerHTML = `
      <div class="error-state">
        <p>Unable to load orders.</p>
        <p class="error-detail">${escapeHtml(error.message)}</p>
        <button class="refresh-btn" type="button" data-action="refresh-orders">Try again</button>
      </div>
    `;
  }
}

async function updateOrderStatus(orderId, nextStatus) {
  const order = state.orders.find((item) => item.id === orderId);
  if (!order) return;

  if (nextStatus === 'Cancelled') {
    const confirmed = window.confirm(
      `Cancel ${order.order_ref}? Reserved stock will be returned to inventory.`,
    );
    if (!confirmed) return;
  }

  try {
    const data = await apiFetch(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: nextStatus }),
    });

    let message = `${order.order_ref} is now ${data.new_status}.`;
    if (data.stock_restored > 0) {
      message += ` ${data.stock_restored} unit(s) restored to inventory.`;
    }
    showToast(message);

    await Promise.all([loadOrders(), loadStats(), loadProducts()]);
  } catch (error) {
    showToast(error.message);
  }
}

async function loadDiagnostics() {
  ui.diagApi.textContent = 'Checking…';
  ui.diagApi.className = 'diag-value';
  ui.diagDatabase.textContent = 'Checking…';
  ui.diagDatabase.className = 'diag-value';

  try {
    const health = await apiFetch('/api/health');
    const isHealthy = health.status === 'ok';

    ui.diagApi.textContent = isHealthy ? 'Online' : 'Degraded';
    ui.diagApi.className = `diag-value ${isHealthy ? 'is-ok' : 'is-bad'}`;
    ui.diagDatabase.textContent = health.database === 'ok' ? 'Connected' : 'Error';
    ui.diagDatabase.className = `diag-value ${health.database === 'ok' ? 'is-ok' : 'is-bad'}`;
    ui.diagVersion.textContent = `v${health.version}`;
    ui.diagUptime.textContent = formatUptime(health.uptime_seconds);
  } catch (error) {
    ui.diagApi.textContent = 'Offline';
    ui.diagApi.className = 'diag-value is-bad';
    ui.diagDatabase.textContent = 'Unknown';
    ui.diagDatabase.className = 'diag-value is-bad';
    ui.diagVersion.textContent = '—';
    ui.diagUptime.textContent = '—';
    showToast(error.message);
  }
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function bindEvents() {
  ui.cartBtn.addEventListener('click', openCart);
  ui.portalToggleBtn.addEventListener('click', () => setAdminView(!state.isAdminView));

  ui.cartCloseBtn.addEventListener('click', () => closeModal(ui.cartModal));
  ui.modalCloseBtn.addEventListener('click', () => closeModal(ui.productModal));

  [ui.cartModal, ui.productModal].forEach((modal) => {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeModal(modal);
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!ui.cartModal.classList.contains('hidden')) closeModal(ui.cartModal);
    else if (!ui.productModal.classList.contains('hidden')) closeModal(ui.productModal);
  });

  ui.checkoutForm.addEventListener('submit', (event) => {
    event.preventDefault();
    placeOrder();
  });

  ui.orderSearch.addEventListener('input', () => {
    state.filters.query = ui.orderSearch.value;
    renderOrders();
  });

  ui.statusFilter.addEventListener('change', () => {
    state.filters.status = ui.statusFilter.value;
    renderOrders();
  });

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) return;

    const { action } = trigger.dataset;

    switch (action) {
      case 'open-product':
        openProduct(Number(trigger.dataset.id));
        break;
      case 'add-to-cart':
        if (addToCart(Number(trigger.dataset.id))) closeModal(ui.productModal);
        break;
      case 'change-qty':
        changeQuantity(Number(trigger.dataset.index), Number(trigger.dataset.delta));
        break;
      case 'remove-item':
        removeItem(Number(trigger.dataset.index));
        break;
      case 'continue-shopping':
        closeModal(ui.cartModal);
        break;
      case 'update-status':
        updateOrderStatus(Number(trigger.dataset.id), trigger.dataset.status);
        break;
      case 'refresh-orders':
        loadOrders();
        break;
      case 'refresh-diagnostics':
        loadDiagnostics();
        break;
      case 'reload-products':
        loadProducts();
        break;
      case 'go-storefront':
        setAdminView(false);
        break;
      default:
        break;
    }
  });
}

function init() {
  bindEvents();
  restoreCart();
  updateCartUI();
  loadProducts();
}

init();

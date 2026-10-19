// Browser cart. Prices here are estimates; the supplier confirms the final quote.
let cart = [];
function formatCurrency(amount) {
  return 'UGX ' + Number(amount || 0).toLocaleString('en-UG', { maximumFractionDigits: 0 });
}
function cartNotice(message) {
  let el = document.getElementById('cart-feedback');
  if (!el) {
    el = document.createElement('p');
    el.id = 'cart-feedback';
    el.setAttribute('role', 'status');
    el.style.cssText = 'padding:12px 20px;background:#fff3cd;color:#513b00;overflow-wrap:anywhere';
    const header = document.getElementById('header');
    if (header) header.after(el); else document.body.prepend(el);
  }
  el.textContent = message;
}
function saveCart() {
  try { localStorage.setItem('kikuuboCart', JSON.stringify(cart)); return true; }
  catch (error) { cartNotice('Your browser cannot save the cart. Keep this page open and copy your order request before leaving.'); return false; }
}
function reconcileCartItem(item) {
  if (!item || typeof item !== 'object' || item.id == null) return null;
  const product = typeof getOrderProduct === 'function' ? getOrderProduct(item.id) : null;
  // Explicit owner-approved correction: reprice only the known Jik legacy identity.
  const legacyJikNames = ['Jik 3ltr', 'Jik Big', 'Jik Bleach', 'Jik Bleach Jik 3ltr', 'Jik 2.5L'];
  if (product && product.id === 13 && legacyJikNames.includes(item.name) &&
      (!item.image || String(item.image).split('/').pop().match(/^n5\.(webp|jpg|png)$/))) {
    return { ...product, quantity: item.quantity };
  }
  const sameImage = !item.image || !product || String(item.image).split('/').pop() === product.image.split('/').pop();
  // Owner-approved MONIN correction, restricted to known identities and prices.
  const moninPureeIds = [480, 481, 482, 483, 484, 485, 486, 499];
  if (product && moninPureeIds.includes(product.id) && sameImage &&
      [product.name, product.name.replace('Fruit Purée', 'Fruit Preparation'),
       'MONIN ' + product.name, 'MONIN ' + product.name.replace('Fruit Purée', 'Fruit Preparation')].includes(item.name) &&
      [75000, 105000].includes(Number(item.price))) {
    return { ...product, quantity: item.quantity };
  }
  const changedIdentity = product && (!sameImage || (item.name && item.name !== product.name));
  const changedPrice = product && !product.quoteOnly && Number(item.price) !== product.price;
  const resolvedLegacyQuote = product && !product.quoteOnly &&
    item.quoteOnly === true &&
    item.price == null &&
    !changedIdentity &&
    (item.reviewReason === 'Homepage and catalogue prices differ' ||
     item.quoteReason === 'Homepage and catalogue prices differ');

  const reason = !product ? 'Saved product is no longer in the catalogue' :
    changedIdentity ? 'Saved product identity requires confirmation' :
    resolvedLegacyQuote ? '' :
    item.reviewReason || (changedPrice ? 'Saved price requires confirmation' : '');
  if (reason) {
    return { id: String(item.id).slice(0,100), name: String(item.name || 'Saved product').slice(0,200),
      brand: String(item.brand || '').slice(0,100), image: sameImage && product ? product.image : '',
      quantity: item.quantity, price: null, quoteOnly: true, quoteReason: reason, reviewReason: reason };
  }
  return { ...product, quantity: item.quantity };
}
function loadCart() {
  try {
    const saved = localStorage.getItem('kikuuboCart');
    if (!saved) { cart = []; return; }
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) throw new Error('Invalid cart');
    cart = parsed.map(reconcileCartItem).filter(Boolean);
    if (cart.length !== parsed.length || cart.some(item => item.reviewReason || !validOrderQuantity(item.quantity))) {
      cartNotice('Please review your saved basket. Uncertain items need a supplier quotation; invalid quantities must be corrected.');
    }
  } catch (error) {
    // Do not overwrite a saved basket that could not be read.
    cartNotice('The saved cart could not be read. Keep this page open or contact the supplier if items are missing.');
  }
}
function cartChanged() {
  saveCart(); updateCartDisplay(); updateCartCount();
  document.dispatchEvent(new Event('cart:changed'));
}
function addToCart(input) {
  const product = typeof getOrderProduct === 'function' ? getOrderProduct(input.id) : null;
  const quantity = input.quantity === undefined ? 1 : Number(input.quantity);
  if (!product || !validOrderQuantity(input.quantity === undefined ? 1 : input.quantity)) {
    cartNotice('Choose a valid catalogue product and a whole quantity from 1 to 9,999.'); return false;
  }
  const existing = cart.find(item => String(item.id) === String(product.id));
  if (existing && existing.reviewReason) {
    cartNotice('This saved item needs review. Remove it before adding the current catalogue product.'); return false;
  }
  const totalQuantity = existing ? Number(existing.quantity) + quantity : quantity;
  if (!validOrderQuantity(totalQuantity) || (!product.quoteOnly && !Number.isSafeInteger(product.price * totalQuantity))) {
    cartNotice('This quantity is too large. Please contact the supplier.'); return false;
  }
  if (existing) Object.assign(existing, product, { quantity: totalQuantity });
  else cart.push({ ...product, quantity });
  cartChanged(); showNotification(product.name + ' added to cart.'); return true;
}
function removeFromCart(id) {
  cart = cart.filter(item => String(item.id) !== String(id)); cartChanged();
}
function updateQuantity(id, value) {
  const item = cart.find(item => String(item.id) === String(id));
  if (!item) return false;
  if (!validOrderQuantity(value)) {
    cartNotice('Enter a whole quantity from 1 to 9,999. Use Remove to delete an item.');
    updateCartDisplay(); return false;
  }
  item.quantity = Number(value); cartChanged(); return true;
}
function getCartItems() { return cart.map(item => ({ ...item })); }
function getCartTotal() {
  return cart.reduce((total, item) => total + (!item.quoteOnly && validOrderQuantity(item.quantity) ? item.price * item.quantity : 0), 0);
}
function getCartItemCount() {
  return cart.reduce((count, item) => count + (validOrderQuantity(item.quantity) ? Number(item.quantity) : 0), 0);
}
function getCartEstimateLabel() {
  if (cart.some(item => !validOrderQuantity(item.quantity))) return 'Check quantities';
  const total = getCartTotal();
  if (!Number.isSafeInteger(total)) return 'Supplier quotation required';
  return cart.some(item => item.quoteOnly) ? formatCurrency(total) + ' + items awaiting quotation' : formatCurrency(total);
}
function updateCartCount() {
  document.querySelectorAll('.cart-count').forEach(el => {
    el.textContent = getCartItemCount(); el.style.display = cart.length ? 'inline-flex' : 'none';
  });
}
function updateCartDisplay() {
  const tbody = document.getElementById('cart-items');
  if (!tbody) return;
  tbody.replaceChildren();
  const empty = document.getElementById('empty-cart-msg'), table = document.getElementById('cart-table');
  if (empty) empty.style.display = cart.length ? 'none' : 'block';
  if (table) table.style.display = cart.length ? 'table' : 'none';
  cart.forEach(item => {
    const row = document.createElement('tr'); row.dataset.id = String(item.id);
    const cell = () => row.appendChild(document.createElement('td'));
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'cart-remove-btn';
    remove.textContent = 'Remove'; remove.setAttribute('aria-label', 'Remove ' + item.name);
    remove.addEventListener('click', () => removeFromCart(item.id)); cell().appendChild(remove);
    const imageCell = cell();
    if (/^image\/[\w/.-]+$/.test(item.image || '')) {
      const img = document.createElement('img'); img.src = item.image; img.alt = item.name; imageCell.appendChild(img);
    }
    const name = cell(); name.className = 'cart-product-name'; name.textContent = productLabel(item);
    if (item.quoteOnly) { const note = document.createElement('small'); note.textContent = ' — ' + item.quoteReason; name.appendChild(note); }
    cell().textContent = item.quoteOnly ? 'Quotation required' : formatCurrency(item.price);
    const input = document.createElement('input'); input.type = 'number'; input.min = '1'; input.max = '9999'; input.step = '1';
    input.value = validOrderQuantity(item.quantity) ? item.quantity : ''; input.setAttribute('aria-label', 'Quantity for ' + item.name);
    input.inputMode = 'numeric';
    const controls = document.createElement('div'); controls.className = 'quantity-controls';
    const stepButton = (text, delta) => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = text;
      button.setAttribute('aria-label', (delta < 0 ? 'Decrease' : 'Increase') + ' quantity for ' + item.name);
      button.disabled = !validOrderQuantity(item.quantity) || Number(item.quantity) + delta < 1 || Number(item.quantity) + delta > 9999;
      button.addEventListener('click', () => {
        if (updateQuantity(item.id, Number(item.quantity) + delta)) {
          const updated = [...tbody.rows].find(row => row.dataset.id === String(item.id));
          updated?.querySelectorAll('.quantity-controls button')[delta < 0 ? 0 : 1]?.focus();
        }
      }); return button;
    };
    input.addEventListener('change', () => updateQuantity(item.id, input.value));
    controls.append(stepButton('−', -1), input, stepButton('+', 1)); cell().appendChild(controls);
    cell().textContent = item.quoteOnly ? 'Quotation required' : validOrderQuantity(item.quantity) ? formatCurrency(item.price * item.quantity) : 'Check quantity';
    tbody.appendChild(row);
  });
  ['cart-subtotal', 'cart-total'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = getCartEstimateLabel(); });
}
function showNotification(message) {
  const el = document.createElement('div'); el.className = 'cart-notification'; el.textContent = message;
  el.setAttribute('role','status');
  el.style.cssText = 'position:fixed;top:100px;right:12px;left:12px;max-width:420px;margin-left:auto;background:#088178;color:white;padding:15px;border-radius:10px;z-index:10000';
  document.body.appendChild(el); setTimeout(() => el.remove(), 3000);
}
// Capture handles both existing and dynamically rendered product cards, once.
document.addEventListener('click', function(event) {
  const button = event.target.closest('.pro .cart, .pro a');
  if (!button || (!button.matches(".cart") && !button.querySelector(".cart"))) return;
  event.preventDefault(); event.stopPropagation();
  const card = button.closest('.pro');
  const match = (card.getAttribute('onclick') || '').match(/viewProduct\(['"]?([\w-]+)['"]?\)/);
  addToCartWithFeedback(button.closest('button') || button, { id: card.dataset.productId || (match && match[1]) });
}, true);
document.addEventListener('DOMContentLoaded', function() { loadCart(); updateCartDisplay(); updateCartCount(); });
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.updateQuantity = updateQuantity;
window.clearCart = function() { cart = []; cartChanged(); };
window.getCartItems = getCartItems;

// Gate the originating control, leaving deliberate quantity edits unrestricted.
const addingControls = new WeakSet();
function addToCartWithFeedback(button, input) {
  if (addingControls.has(button)) return false;
  addingControls.add(button);
  if (!addToCart(input)) { addingControls.delete(button); return false; }
  const original = button.innerHTML;
  button.textContent = '✓ Added!'; button.setAttribute('aria-disabled', 'true');
  document.querySelectorAll('.cart-count').forEach(el => {
    el.classList.remove('cart-pulse'); void el.offsetWidth; el.classList.add('cart-pulse');
  });
  setTimeout(() => { button.innerHTML = original; addingControls.delete(button); button.removeAttribute('aria-disabled'); }, 900);
  return true;
}

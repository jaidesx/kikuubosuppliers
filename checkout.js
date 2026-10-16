let selectedPaymentMethod = 'mtn';
function updateCheckoutSummary() {
  ['summary-subtotal', 'summary-total'].forEach(id => {
    const el = document.getElementById(id); if (el) el.textContent = getCartEstimateLabel();
  });
}
function showCheckout() {
  if (!getCartItems().length) { cartNotice('Your cart is empty.'); return; }
  document.getElementById('checkout-section').style.display = 'block';
  document.getElementById('cart').style.display = 'none';
  document.getElementById('cart-add').style.display = 'none';
  updateCheckoutSummary();
  document.getElementById('cust-name').focus();
}
function hideCheckout() {
  document.getElementById('checkout-section').style.display = 'none';
  document.getElementById('cart').style.display = 'block';
  document.getElementById('cart-add').style.display = 'flex';
}
function invalidateOrderRequest() {
  const draft = document.getElementById('order-handoff');
  draft.hidden = true;
  document.getElementById('whatsapp-order-link').removeAttribute('href');
  document.getElementById('order-message').value = '';
  document.getElementById('copy-status').textContent = '';
}
function selectPayment(method) {
  if (!orderingConfig.payments[method]) return;
  selectedPaymentMethod = method;
  document.querySelectorAll('.payment-option').forEach(el => {
    el.classList.toggle('active', el.querySelector('input').value === method);
  });
  const payment = orderingConfig.payments[method];
  document.getElementById('payment-instructions').textContent = `${payment.label}: ${payment.number}. Registered recipient: ${payment.recipientName}. ` +
    '1. Submit your WhatsApp order request. ' +
    '2. Wait for the supplier to confirm availability, delivery charges and the final total. ' +
    '3. Pay using the confirmed Mobile Money details. ' +
    `4. Before authorizing payment, verify that the recipient name shown is ${payment.recipientName}. ` +
    '5. Await manual payment confirmation from the supplier. This website does not process or automatically verify payments. Never share your PIN or OTP.';
  invalidateOrderRequest();
}
function submitOrder() {
  const error = document.getElementById('checkout-error'); error.textContent = '';
  invalidateOrderRequest();
  try {
    const request = buildOrderRequest(getCartItems(), {
      name: document.getElementById('cust-name').value,
      phone: document.getElementById('cust-phone').value,
      location: document.getElementById('cust-location').value,
      notes: document.getElementById('cust-notes').value
    }, selectedPaymentMethod);
    saveCart(); // Best effort only; never clear the basket during handoff.
    document.getElementById('order-message').value = request.message;
    const longMessage = request.url.length > 8000;
    document.getElementById('whatsapp-order-link').href = longMessage ? `https://wa.me/${orderingConfig.whatsapp}` : request.url;
    document.getElementById('handoff-help').textContent = longMessage ?
      'This is a large order. Copy the request below, open WhatsApp, paste it and press Send. Your cart is retained.' :
      'Review the request, open WhatsApp and press Send there. Opening WhatsApp does not submit or confirm an order or payment. Your cart is retained.';
    document.getElementById('order-handoff').hidden = false;
    document.getElementById('whatsapp-order-link').focus();
    return true;
  } catch (problem) {
    error.textContent = problem.message;
    error.focus(); return false;
  }
}
async function copyOrderRequest() {
  const text = document.getElementById('order-message');
  try {
    await navigator.clipboard.writeText(text.value);
    document.getElementById('copy-status').textContent = 'Request copied. Paste it into WhatsApp and press Send.';
  } catch (error) {
    text.focus(); text.select();
    document.getElementById('copy-status').textContent = 'Select and copy the request above, then paste it into WhatsApp.';
  }
}
document.addEventListener('DOMContentLoaded', function() {
  selectPayment('mtn'); updateCheckoutSummary();
  document.getElementById('checkout-form').addEventListener('submit', event => { event.preventDefault(); submitOrder(); });
  document.getElementById('checkout-form').addEventListener('input', invalidateOrderRequest);
  document.getElementById('copy-order-btn').addEventListener('click', copyOrderRequest);
});
document.addEventListener('cart:changed', function() { updateCheckoutSummary(); invalidateOrderRequest(); });

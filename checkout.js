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
let pendingOrderKey = null;
let pendingOrderFingerprint = null;
let checkoutSubmitting = false;
let registeredOrderFingerprint = null;
let registeredOrderReference = null;

function createOrderKey() {
  if (!globalThis.crypto || !crypto.randomUUID) {
    throw new Error('Secure order identification is unavailable. Please use WhatsApp ordering.');
  }
  return crypto.randomUUID();
}

function showWhatsAppHandoff(request, reference = null) {
  const message = reference
    ? `Kikuubo order reference: ${reference}\\n\\n${request.message}`
    : request.message;

  document.getElementById('order-message').value = message;

  const url = `https://wa.me/${orderingConfig.whatsapp}?text=${encodeURIComponent(message)}`;
  const longMessage = url.length > 8000;

  const link = document.getElementById('whatsapp-order-link');
  link.href = longMessage
    ? `https://wa.me/${orderingConfig.whatsapp}`
    : url;

  const statusMessage = reference
    ? `Order ${reference} was registered successfully and is awaiting supplier review.`
    : 'The online order was not confirmed as registered.';

  document.getElementById('handoff-help').textContent = longMessage
    ? `${statusMessage} This is a large order. Copy the message below, open WhatsApp, paste it and press Send. Your cart is retained.`
    : `${statusMessage} Review the request, open WhatsApp and press Send. Do not pay until the supplier confirms the final amount.`;

  document.getElementById('order-handoff').hidden = false;
  link.focus();
}

async function submitOrder() {
  if (checkoutSubmitting) return false;

  const error = document.getElementById('checkout-error');
  const button = document.getElementById('confirm-checkout-btn');

  error.textContent = '';
  invalidateOrderRequest();

  if (getCartItems().some(item => item.reviewReason)) {
    error.textContent =
      'Your cart contains a saved product that needs review. Remove it and add the correct product from the current catalogue before ordering.';
    error.focus();
    return false;
  }

  let request;

  try {
    request = buildOrderRequest(getCartItems(), {
      name: document.getElementById('cust-name').value,
      phone: document.getElementById('cust-phone').value,
      location: document.getElementById('cust-location').value,
      notes: document.getElementById('cust-notes').value
    }, selectedPaymentMethod);
  } catch (problem) {
    error.textContent = problem.message;
    error.focus();
    return false;
  }

  const payload = {
    customer: {
      name: document.getElementById('cust-name').value.trim(),
      phone: document.getElementById('cust-phone').value.trim(),
      location: document.getElementById('cust-location').value.trim(),
      notes: document.getElementById('cust-notes').value.trim()
    },
    payment_method: selectedPaymentMethod,
    items: getCartItems().map(item => ({
      product_id: item.id,
      quantity: Number(item.quantity)
    }))
  };

  const fingerprint = JSON.stringify(payload);

  if (fingerprint === registeredOrderFingerprint && registeredOrderReference) {
    showWhatsAppHandoff(request, registeredOrderReference);
    return true;
  }

  try {
    if (fingerprint !== pendingOrderFingerprint) {
      pendingOrderKey = createOrderKey();
      pendingOrderFingerprint = fingerprint;
    }
  } catch (problem) {
    error.textContent = problem.message;
    showWhatsAppHandoff(request);
    return false;
  }

  checkoutSubmitting = true;
  button.disabled = true;
  button.textContent = 'Registering order...';

  try {
    const response = await fetch('/api/v1/orders/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': pendingOrderKey
      },
      body: fingerprint
    });

    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error('The order server returned an unexpected response.');
    }

    if (response.status === 429) {
      throw new Error('Too many requests. Please wait before retrying.');
    }

    if (response.status === 409) {
      throw new Error('This request conflicts with an earlier order. Contact the supplier before submitting again.');
    }

    if (response.status === 400) {
      throw new Error('Please review your order details.');
    }

    if (!response.ok) {
      throw new Error('The order service is temporarily unavailable.');
    }

    if (!result.order_reference || result.payment_status !== 'NOT_INITIATED') {
      throw new Error('The order server returned an incomplete response.');
    }

    registeredOrderFingerprint = fingerprint;
    registeredOrderReference = result.order_reference;
    saveCart();
    showWhatsAppHandoff(request, result.order_reference);
    return true;
  } catch (problem) {
    error.textContent = problem.message +
      ' If the request reached the server, retrying with unchanged details will use the same order key. You may also contact the supplier through WhatsApp.';
    showWhatsAppHandoff(request);
    return false;
  } finally {
    checkoutSubmitting = false;
    button.disabled = false;
    button.textContent = 'Register order and prepare WhatsApp request';
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
  document.getElementById('checkout-form').addEventListener('submit', event => { event.preventDefault(); void submitOrder(); });
  document.getElementById('checkout-form').addEventListener('input', invalidateOrderRequest);
  document.getElementById('copy-order-btn').addEventListener('click', copyOrderRequest);
});
document.addEventListener('cart:changed', function() { updateCheckoutSummary(); invalidateOrderRequest(); });

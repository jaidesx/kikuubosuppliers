window.productLabel = function(product) {
  const brand = product.brand || '', name = product.name || '';
  return (name.toLowerCase().includes(brand.toLowerCase()) || name.toLowerCase().startsWith(brand.toLowerCase().split(' ')[0] + ' ')) ? name : [brand, name].filter(Boolean).join(' ');
};

// Public payment details confirmed by the business owner. This is not payment verification.
window.orderingConfig = Object.freeze({
  whatsapp: "256756158466",
  payments: Object.freeze({
    mtn: Object.freeze({ label: "MTN Mobile Money", number: "0770975409", recipientName: "Ssewanyana Arthur" }),
    airtel: Object.freeze({ label: "Airtel Money", number: "0756158466", recipientName: "Ssewanyana Arthur" })
  }),
  // Technical guardrail; larger orders should be discussed with the supplier.
  maxQuantity: 9999
});

// Do not change these prices until the business resolves the source conflicts.
window.quotationReasons = Object.freeze({
  15: "Size and price range require confirmation",
  19: "Size and price range require confirmation",
  67: "Product card and catalogue prices differ",
  90: "Displayed price notation requires confirmation",
  100: "Displayed price notation requires confirmation",
  108: "UGX 149 requires business approval",
  394: "Unit / dozen pricing requires confirmation",
  429: "Legacy homepage identity conflicts with this catalogue ID"
});

window.getOrderProduct = function(id) {
  // Preserve the existing homepage inquiry without inventing a pack or price.
  if (String(id) === "ketchup-unverified") {
    return { id: "ketchup-unverified", name: "Ketchup (pack to confirm)",
      brand: "American Garden", price: null, quoteOnly: true,
      quoteReason: "Product identity, pack and price require confirmation",
      category: "Cooking Essentials", image: "image/Products/f9.webp", images: ["f9"],
      description: "Ask the supplier to confirm the available pack and price." };
  }
  if (typeof products === "undefined" || !/^\d+$/.test(String(id))) return null;
  const product = products.find(item => item.id === Number(id));
  if (!product) return null;
  const reason = window.quotationReasons[product.id];
  const validPrice = Number.isSafeInteger(product.price) && product.price > 0;
  return { ...product, price: reason || !validPrice ? null : product.price,
    quoteOnly: Boolean(reason) || !validPrice,
    quoteReason: reason || (!validPrice ? "Price requires confirmation" : "") };
};

window.validOrderQuantity = function(value) {
  return /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) &&
    Number(value) >= 1 && Number(value) <= window.orderingConfig.maxQuantity;
};

window.buildOrderRequest = function(items, customer, paymentMethod) {
  if (!items.length) throw new Error("Your cart is empty.");
  const clean = value => String(value || "").trim();
  const name = clean(customer.name), location = clean(customer.location);
  const phone = clean(customer.phone).replace(/[\s()-]/g, "");
  const notes = clean(customer.notes);
  if (name.length < 2 || name.length > 100 || /[\r\n\x00-\x1f]/.test(name)) {
    throw new Error("Enter your full name (2–100 characters).");
  }
  if (!/^(?:0[37]\d{8}|\+?256[37]\d{8})$/.test(phone)) {
    throw new Error("Enter a valid Ugandan mobile number, such as 0756158466 or +256756158466.");
  }
  if (location.length < 3 || location.length > 300) throw new Error("Enter a delivery location (3–300 characters).");
  if (notes.length > 1000) throw new Error("Keep additional notes within 1,000 characters.");
  const payment = window.orderingConfig.payments[paymentMethod];
  if (!payment) throw new Error("Select MTN Mobile Money or Airtel Money.");
  let subtotal = 0;
  const lines = items.map(item => {
    if (!window.validOrderQuantity(item.quantity)) throw new Error("Check all cart quantities before continuing.");
    if (!item.quoteOnly && (!Number.isSafeInteger(item.price) || item.price <= 0 ||
        !Number.isSafeInteger(item.price * item.quantity))) throw new Error("A product price needs supplier review.");
    const lineTotal = item.quoteOnly ? 0 : item.price * item.quantity;
    subtotal += lineTotal;
    if (!Number.isSafeInteger(subtotal)) throw new Error("The order total is too large. Please contact the supplier.");
    const label = window.productLabel(item) + (item.packageSize ? ` (Pack: ${item.packageSize})` : '');
    return `- [${item.id}] ${label} | Qty: ${item.quantity} | ` +
      (item.quoteOnly ? `Quotation required (${item.quoteReason || "supplier review"})` :
        `Unit: UGX ${item.price.toLocaleString("en-UG")} | Line: UGX ${lineTotal.toLocaleString("en-UG")}`);
  });
  const hasQuotes = items.some(item => item.quoteOnly);
  const message = ["ORDER REQUEST — KIKUUBO SUPPLIERS", "", `Customer: ${name}`,
    `Phone: ${phone}`, `Delivery location: ${location}`, `Preferred payment: ${payment.label}`,
    "", ...lines, "", `${hasQuotes ? "Priced items subtotal (excludes quotation items)" : "Estimated items subtotal"}: UGX ${subtotal.toLocaleString("en-UG")}`,
    "Delivery charges and final payable amount: awaiting supplier confirmation.",
    "Please confirm availability, item prices / packs, delivery charges and verified payment recipient details before I pay.",
    "Payment status: not verified. This request is not proof of payment.", `Notes: ${notes || "None"}`].join("\n");
  return { message, url: `https://wa.me/${window.orderingConfig.whatsapp}?text=${encodeURIComponent(message)}` };
};

// Keep displayed prices consistent without changing the underlying business data.
document.addEventListener("DOMContentLoaded", function() {
  document.querySelectorAll(".pro[onclick]").forEach(card => {
    const match = card.getAttribute("onclick").match(/viewProduct\(['"]?([\w-]+)['"]?\)/);
    const product = match && window.getOrderProduct(match[1]);
    if (!product) return;
    card.dataset.productId = String(product.id);
    const price = card.querySelector(".des h4");
    if (price) price.textContent = product.quoteOnly ? "Price on quotation" : "UGX " + product.price.toLocaleString("en-UG");
  });
});

// A quotation request never implies an agreed wholesale price or a payment.
window.buildWholesaleRequest = function(details) {
  const clean = (value, max) => {
    const text = String(value || '').trim();
    if (text.length > max) throw new Error('Please shorten the enquiry to fit the field limits.');
    return text;
  };
  const product = clean(details.product, 200), packaging = clean(details.packaging, 200);
  if (product.length < 2) throw new Error('Enter the product you would like quoted.');
  if (!validOrderQuantity(details.quantity)) throw new Error('Enter a whole quantity from 1 to 9,999.');
  const name = clean(details.name, 100), contact = clean(details.contact, 150);
  const location = clean(details.location, 300), notes = clean(details.notes, 1000);
  const message = ['WHOLESALE QUOTATION REQUEST — KIKUUBO SUPPLIERS', '',
    `Product: ${product}`, `Requested variant / packaging: ${packaging || 'Please confirm available packs'}`,
    `Requested quantity: ${Number(details.quantity)} (of the requested pack; please confirm)`,
    `Customer: ${name || 'Not supplied'}`, `Contact: ${contact || 'Reply on WhatsApp'}`,
    `Delivery location: ${location || 'To be confirmed'}`, `Additional instructions: ${notes || 'None'}`, '',
    'Please confirm packaging, availability, unit price, line subtotal and final quotation total.',
    'Delivery fees: pending confirmation.', 'Payment status: not verified. No payment is confirmed by this request.'
  ].join('\n');
  return { message, url: `https://wa.me/${orderingConfig.whatsapp}?text=${encodeURIComponent(message)}` };
};

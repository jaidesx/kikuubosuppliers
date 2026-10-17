const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
let dom, win;
function script(file) {
  const el = win.document.createElement('script'); el.textContent = read(file); win.document.head.appendChild(el);
}
async function setup(page = 'cart.html', url = 'http://localhost/cart.html', saved) {
  // Never fetch external scripts, submit forms or open WhatsApp in tests.
  dom = new JSDOM(read(page).replace(/<script\b[\s\S]*?<\/script>/gi, ''), { url, runScripts: 'dangerously' });
  win = dom.window;
  win.IntersectionObserver = class { observe() {} };
  win.HTMLElement.prototype.scrollIntoView = () => {};
  win.matchMedia = () => ({ matches: false });

  win.crypto.randomUUID = () =>
    '123e4567-e89b-42d3-a456-426614174000';

  win.fetch = jest.fn(async () => ({
    ok: true,
    status: 201,
    json: async () => ({
      order_reference: 'KKS-1234567890ABCDEF',
      order_status: 'PENDING_REVIEW',
      estimated_subtotal_ugx: 9500,
      requires_quotation: false,
      replayed: false,
      payment_status: 'NOT_INITIATED'
    })
  }));

  if (saved) win.localStorage.setItem('kikuuboCart', JSON.stringify(saved));
  script('products_array.js'); script('ordering.js'); script('cart.js');
  if (page === 'cart.html') script('checkout.js');
  await new Promise(resolve => win.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
}
afterEach(() => dom?.window.close());
const customer = { name: 'Jane & John', phone: '+256 756 158 466', location: 'Kampala #4 & shop 2', notes: '50% stock?\nBring tea ☕' };
function fill(details = customer) {
  for (const key of ['name', 'phone', 'location', 'notes']) win.document.getElementById('cust-' + key).value = details[key] || '';
}

test('uses catalogue identity and price instead of incoming card values', async () => {
  await setup(); win.addToCart({ id: 1, name: 'Fake', price: 1, quantity: 2 });
  expect(win.getCartItems()[0].name).toBe('Pringles'); expect(win.getCartTotal()).toBe(19000);
});
test.each([0, -1, 1.2, '2x', '1e2', Infinity, 10000, ''])('rejects invalid quantity %p without altering the basket', async quantity => {
  await setup(); win.addToCart({id: 1});
  expect(win.addToCart({id: 1, quantity})).toBe(false);
  expect(win.updateQuantity(1, quantity)).toBe(false); expect(win.getCartItemCount()).toBe(1);
});
test('rejects unknown product IDs', async () => {
  await setup(); expect(win.addToCart({id: 99999, price: 100})).toBe(false); expect(win.getCartItems()).toHaveLength(0);
});
test('conflicting prices remain unchanged in source and are quotation-only in orders', async () => {
  await setup();
  expect(win.eval('products.find(p => p.id === 8).price')).toBe(168000);
  Object.keys(win.quotationReasons).forEach(id => expect(win.getOrderProduct(id).quoteOnly).toBe(true));
  win.addToCart({id: 8}); win.addToCart({id: 1});
  const request = win.buildOrderRequest(win.getCartItems(), customer, 'mtn');
  expect(request.message).toContain('Quotation required');
  expect(request.message).toContain('Priced items subtotal (excludes quotation items): UGX 9,500');
  expect(request.message).not.toContain('168,000');
});
test('encodes the complete message once and preserves special characters', async () => {
  await setup(); win.addToCart({id:1,quantity:2});
  const request = win.buildOrderRequest(win.getCartItems(), customer, 'airtel');
  const url = new URL(request.url);
  expect(url.pathname).toBe('/256756158466'); expect([...url.searchParams.keys()]).toEqual(['text']);
  expect(url.searchParams.get('text')).toBe(request.message);
  expect(request.message).toContain(customer.notes); expect(request.message).toContain('Airtel Money');
  expect(request.message).toContain('[1] Snacks Pringles | Qty: 2 | Unit: UGX 9,500 | Line: UGX 19,000');
});
test.each([
  {name:'   '}, {phone:'123'}, {phone:'0756158466&paid=true'}, {location:'  '}, {notes:'a'.repeat(1001)}
])('rejects invalid customer details %p', async invalid => {
  await setup(); win.addToCart({id:1}); fill({...customer,...invalid});
  expect(await win.submitOrder()).toBe(false);
  expect(win.document.getElementById('order-handoff').hidden).toBe(true);
  expect(win.getCartItems()).toHaveLength(1);
});
test('empty carts, invalid providers, negative prices and overflow totals are rejected', async () => {
  await setup(); expect(() => win.buildOrderRequest([],customer,'mtn')).toThrow();
  const item={...win.getOrderProduct(1),quantity:1};
  expect(() => win.buildOrderRequest([item],customer,'invalid')).toThrow();
  expect(() => win.buildOrderRequest([{...item,price:-1}],customer,'mtn')).toThrow();
  expect(() => win.buildOrderRequest([{...item,price:Number.MAX_SAFE_INTEGER,quantity:2}],customer,'mtn')).toThrow();
});
test('handoff and repeat preparation retain the cart and do not claim payment', async () => {
  await setup(); win.addToCart({id:1}); fill(); const before=win.localStorage.getItem('kikuuboCart');
  expect(await win.submitOrder()).toBe(true); expect(await win.submitOrder()).toBe(true);
  expect(win.localStorage.getItem('kikuuboCart')).toBe(before);
  expect(win.getCartItems()).toHaveLength(1);
  expect(win.document.getElementById('order-message').value).toContain('Payment status: not verified');
  expect(win.document.getElementById('processing-overlay')).toBeNull();
});
test('editing customer details, provider or cart invalidates a prepared request', async () => {
  await setup(); win.addToCart({id:1}); fill(); await win.submitOrder();
  win.document.getElementById('cust-location').dispatchEvent(new win.Event('input',{bubbles:true}));
  expect(win.document.getElementById('order-handoff').hidden).toBe(true);
  await win.submitOrder(); win.selectPayment('airtel'); expect(win.document.getElementById('whatsapp-order-link').hasAttribute('href')).toBe(false);
  await win.submitOrder(); win.updateQuantity(1,2); expect(win.document.getElementById('order-handoff').hidden).toBe(true);
});
test('both providers show the confirmed recipient and require manual payment confirmation', async () => {
  await setup();
  for(const [method,number] of [['mtn','0770975409'],['airtel','0756158466']]) {
    win.selectPayment(method); const text=win.document.getElementById('payment-instructions').textContent;
    expect(text).toContain(number); expect(text).toContain('Registered recipient: Ssewanyana Arthur');
    expect(text).toContain('Wait for the supplier to confirm');
    expect(text).toContain('Await manual payment confirmation');
    expect(text).toContain('Before authorizing payment');
    expect(win.orderingConfig.payments[method].recipientName).toBe('Ssewanyana Arthur');
  }
});
test('saved identity collisions retain the original item as a quotation', async () => {
  await setup('cart.html','http://localhost/cart.html',[{id:429,name:'American Garden Ketchup',image:'image/Products/f9.webp',price:35000,quantity:2}]);
  const item=win.getCartItems()[0]; expect(item.name).toBe('American Garden Ketchup'); expect(item.quoteOnly).toBe(true);
  expect(item.name).not.toBe('Glass Cleaner'); expect(win.addToCart({id:429})).toBe(false);
  win.saveCart(); win.loadCart(); expect(win.getCartItems()[0].name).toBe('American Garden Ketchup');
});
test('a changed stored price requires confirmation rather than silently repricing', async () => {
  await setup('cart.html','http://localhost/cart.html',[{id:1,name:'Pringles',image:'image/Products/f1.webp',price:1,quantity:2}]);
  expect(win.getCartItems()[0].quoteOnly).toBe(true); expect(win.getCartTotal()).toBe(0);
});
test('unsafe saved names render as text and never create elements', async () => {
  await setup('cart.html','http://localhost/cart.html',[{id:'<img src=x onerror=alert(1)>',name:'<img src=x onerror=alert(1)>',quantity:1}]);
  expect(win.document.querySelector('#cart-items img')).toBeNull();
  expect(win.document.querySelector('#cart-items').textContent).toContain('<img');
});
test('invalid saved quantities block submission instead of creating negative totals', async () => {
  await setup('cart.html','http://localhost/cart.html',[{id:1,name:'Pringles',price:9500,quantity:-2}]);
  fill(); expect(await win.submitOrder()).toBe(false); expect(win.getCartTotal()).toBe(0);
});
test('unavailable storage leaves in-memory cart usable with a warning', async () => {
  await setup(); jest.spyOn(win.Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('quota');});
  expect(win.addToCart({id:1})).toBe(true); fill(); expect(await win.submitOrder()).toBe(true);
  expect(win.getCartItems()).toHaveLength(1); expect(win.document.getElementById('cart-feedback').textContent).toContain('cannot save');
});
test('large orders have a copy-and-paste fallback without losing items', async () => {
  await setup(); for(let id=1;id<=100;id++) win.addToCart({id}); fill(); await win.submitOrder();
  expect(win.document.getElementById('whatsapp-order-link').href).toBe('https://wa.me/256756158466');
  expect(win.document.getElementById('handoff-help').textContent).toContain('large order'); expect(win.getCartItems()).toHaveLength(100);
});
test('copy failure selects the request for manual copy', async () => {
  await setup(); win.addToCart({id:1}); fill(); await win.submitOrder(); await win.copyOrderRequest();
  expect(win.document.getElementById('copy-status').textContent).toContain('Select and copy');
});
test('homepage anchors and dynamically added featured cards add exactly once using catalogue data', async () => {
  await setup('index.html','http://localhost/index.html');
  const card=win.document.querySelector('.pro'); card.querySelector('a').click();
  expect(win.getCartItemCount()).toBe(1); expect(win.getCartTotal()).toBe(9500);
  const dynamic=card.cloneNode(true); win.document.body.appendChild(dynamic); dynamic.querySelector('.cart').click();
  expect(win.getCartItemCount()).toBe(2);
  const ketchup=win.document.querySelector('[data-product-id="ketchup-unverified"]'); ketchup.querySelector('a').click();
  expect(win.getCartItems().find(p=>p.id==='ketchup-unverified').quoteOnly).toBe(true);
});
test('every conflicted listing displays quotation wording after initialization', async () => {
  await setup('product.html','http://localhost/product.html');
  for(const id of Object.keys(win.quotationReasons)) {
    expect(win.document.querySelector(`[data-product-id="${id}"] .des h4`).textContent).toBe('Price on quotation');
  }
});
test('direct product URL adds the displayed product rather than stored selection', async () => {
  await setup('sproduct.html','http://localhost/sproduct.html?id=2');
  win.localStorage.setItem('selectedProductId','1'); script('script.js');
  const source=read('sproduct.html').match(/<script>\s*let displayedProduct[\s\S]*?<\/script>/)[0];
  const el=win.document.createElement('script'); el.textContent=source.replace(/^<script>|<\/script>$/g,'');win.document.head.appendChild(el);
  win.document.dispatchEvent(new win.Event('DOMContentLoaded'));
  win.document.getElementById('add-to-cart-btn').click(); expect(win.getCartItems()[0].id).toBe(2);
});


test('blocks saved-cart items requiring identity review', async () => {
  await setup('cart.html', 'http://localhost/cart.html', [
    {
      id: 429,
      name: 'American Garden Ketchup',
      image: 'image/Products/f9.webp',
      price: 35000,
      quantity: 2
    }
  ]);

  fill();

  expect(await win.submitOrder()).toBe(false);
  expect(win.fetch).not.toHaveBeenCalled();
  expect(win.document.getElementById('checkout-error').textContent)
    .toContain('needs review');
  expect(win.getCartItems()).toHaveLength(1);
});

test('network failure preserves WhatsApp fallback and cart', async () => {
  await setup();

  win.addToCart({ id: 1 });
  fill();

  win.fetch.mockRejectedValueOnce(new Error('Network unavailable'));

  expect(await win.submitOrder()).toBe(false);

  expect(win.document.getElementById('order-handoff').hidden)
    .toBe(false);

  expect(win.document.getElementById('handoff-help').textContent)
    .toContain('not confirmed as registered');

  expect(win.getCartItems()).toHaveLength(1);
});


// PHASE 3M: CHECKOUT API RELIABILITY TESTS

function mockOrderResponse(status, reference = 'KKS-1234567890ABCDEF') {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({
      order_reference: reference,
      order_status: 'PENDING_REVIEW',
      payment_status: 'NOT_INITIATED',
      estimated_subtotal_ugx: 9500,
      requires_quotation: false
    })
  };
}

test('HTTP 201 registers an order and displays its reference', async () => {
  await setup();
  win.addToCart({ id: 1 });
  fill();

  win.fetch.mockResolvedValueOnce(mockOrderResponse(201));

  expect(await win.submitOrder()).toBe(true);

  expect(win.fetch).toHaveBeenCalledTimes(1);

  const [url, options] = win.fetch.mock.calls[0];

  expect(url).toBe('/api/v1/orders/');
  expect(options.method).toBe('POST');
  expect(options.headers['Content-Type']).toBe('application/json');
  expect(options.headers['Idempotency-Key']).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  );

  const payload = JSON.parse(options.body);

  expect(payload.payment_method).toBe('mtn');
  expect(payload.items).toEqual([{ product_id: 1, quantity: 1 }]);

  expect(win.document.getElementById('order-message').value)
    .toContain('KKS-1234567890ABCDEF');

  expect(win.document.getElementById('handoff-help').textContent)
    .toContain('registered successfully');

  expect(win.getCartItems()).toHaveLength(1);
});

test('HTTP 200 accepts an idempotent replay', async () => {
  await setup();
  win.addToCart({ id: 1 });
  fill();

  win.fetch.mockResolvedValueOnce(mockOrderResponse(200));

  expect(await win.submitOrder()).toBe(true);

  expect(win.document.getElementById('order-message').value)
    .toContain('KKS-1234567890ABCDEF');
});

test('repeat submission after success does not call API twice', async () => {
  await setup();
  win.addToCart({ id: 1 });
  fill();

  expect(await win.submitOrder()).toBe(true);
  expect(await win.submitOrder()).toBe(true);

  expect(win.fetch).toHaveBeenCalledTimes(1);
  expect(win.getCartItems()).toHaveLength(1);
});

test('HTTP 409 does not claim the order was registered', async () => {
  await setup();
  win.addToCart({ id: 1 });
  fill();

  win.fetch.mockResolvedValueOnce(mockOrderResponse(409));

  expect(await win.submitOrder()).toBe(false);

  expect(win.document.getElementById('checkout-error').textContent)
    .toContain('conflicts with an earlier order');

  expect(win.document.getElementById('handoff-help').textContent)
    .toContain('not confirmed as registered');

  expect(win.getCartItems()).toHaveLength(1);
});

test('HTTP 429 displays a retry message and preserves cart', async () => {
  await setup();
  win.addToCart({ id: 1 });
  fill();

  win.fetch.mockResolvedValueOnce(mockOrderResponse(429));

  expect(await win.submitOrder()).toBe(false);

  expect(win.document.getElementById('checkout-error').textContent)
    .toContain('Too many requests');

  expect(win.getCartItems()).toHaveLength(1);
});

test('network failure retry reuses the same idempotency key', async () => {
  await setup();
  win.addToCart({ id: 1 });
  fill();

  win.fetch
    .mockRejectedValueOnce(new Error('Connection interrupted'))
    .mockResolvedValueOnce(mockOrderResponse(200));

  expect(await win.submitOrder()).toBe(false);
  expect(await win.submitOrder()).toBe(true);

  expect(win.fetch).toHaveBeenCalledTimes(2);

  const first = win.fetch.mock.calls[0][1];
  const second = win.fetch.mock.calls[1][1];

  expect(first.headers['Idempotency-Key'])
    .toBe(second.headers['Idempotency-Key']);

  expect(first.body).toBe(second.body);

  expect(win.document.getElementById('order-message').value)
    .toContain('KKS-1234567890ABCDEF');
});

test('changing order details uses a different idempotency key', async () => {
  await setup();
  win.addToCart({ id: 1 });
  fill();

  let counter = 0;
  win.crypto.randomUUID = () =>
    `123e4567-e89b-42d3-a456-${String(++counter).padStart(12, '0')}`;

  expect(await win.submitOrder()).toBe(true);

  win.document.getElementById('cust-location').value =
    'Entebbe, Uganda';

  expect(await win.submitOrder()).toBe(true);

  expect(win.fetch).toHaveBeenCalledTimes(2);

  const first = win.fetch.mock.calls[0][1];
  const second = win.fetch.mock.calls[1][1];

  expect(first.headers['Idempotency-Key'])
    .not.toBe(second.headers['Idempotency-Key']);
});

test('concurrent submit calls do not create multiple API requests', async () => {
  await setup();
  win.addToCart({ id: 1 });
  fill();

  let resolveRequest;

  win.fetch.mockImplementationOnce(() => new Promise(resolve => {
    resolveRequest = resolve;
  }));

  const first = win.submitOrder();
  const second = win.submitOrder();

  expect(await second).toBe(false);
  expect(win.fetch).toHaveBeenCalledTimes(1);

  resolveRequest(mockOrderResponse(201));

  expect(await first).toBe(true);
  expect(win.fetch).toHaveBeenCalledTimes(1);
});

const fs = require('fs');
const { JSDOM } = require('jsdom');
const read = file => fs.readFileSync(file, 'utf8');
const products = new Function(read('products_array.js') + '\nreturn products;')();
const backend = JSON.parse(read('backend/data/catalogue.json'));
const flavours = {480:'Passion Fruit',481:'Strawberry',482:'Blackcurrant',483:'Peach',484:'Raspberry',485:'Kiwi',486:'Coconut',499:'Blueberry'};

test.each(Object.entries(flavours))('MONIN %s has consistent frontend, backend and HTML prices and names', (id, flavour) => {
  const product = products.find(p => p.id === Number(id));
  const name = `${flavour} Fruit Purée`;
  expect(product.name).toBe(name);
  expect(product.price).toBe(105000);
  expect(product.description).toContain('UGX 105,000');
  expect(product.description).not.toMatch(/preparation|75,000/i);
  expect(backend.find(p => p.id === id)).toMatchObject({name, price_ugx:105000, image:product.image});
  for (const page of ['product.html','shop.html']) {
    const dom = new JSDOM(read(page));
    const card = dom.window.document.querySelector(`[data-product-id="${id}"]`);
    if (page === 'product.html') expect(card).not.toBeNull();
    if (card) {
      expect(card.querySelector('h3').textContent).toBe(`MONIN ${name}`);
      expect(card.querySelector('h4').textContent).toBe('UGX 105,000');
      expect(card.querySelector('img').getAttribute('src')).toBe(product.image);
    }
    dom.window.close();
  }
});

test('other MONIN categories retain their existing catalogue details', () => {
  const original = JSON.parse(read('tests/fixtures/monin-unchanged.json'));
  expect(products.filter(p => p.brand === 'MONIN' && !flavours[p.id])).toEqual(original);
  original.forEach(p => expect(backend.find(b => b.id === String(p.id))).toMatchObject({name:p.name,price_ugx:p.price,image:p.image}));
});

test('static cards have decorative stars without ratings or review counts', () => {
  for (const page of ['index.html','product.html','shop.html']) {
    const dom = new JSDOM(read(page));
    expect(dom.window.document.body.textContent).not.toContain('Not yet rated');
    dom.window.document.querySelectorAll('.product-rating').forEach(row => {
      expect(row.textContent).toBe('★★★★★');
      expect(row.getAttribute('aria-hidden')).toBe('true');
      expect(row.classList.contains('decorative-stars')).toBe(true);
      expect(row.hasAttribute('aria-label')).toBe(false);
    });
    dom.window.close();
  }
  expect(read('shop.html')).toContain('Fruit purées at UGX 105,000 per bottle. Syrups and lemonade concentrate also available; see individual product prices.');
});

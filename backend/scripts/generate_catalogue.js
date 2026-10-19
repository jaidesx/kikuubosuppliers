const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');

const source = fs.readFileSync(
  path.join(root, 'products_array.js'),
  'utf8'
);

// Execute the catalogue in an isolated context, without browser APIs.
const context = vm.createContext({});
const products = vm.runInContext(`${source}\nproducts`, context, {
  timeout: 1000
});

if (!Array.isArray(products)) {
  throw new Error('Expected products to be an array');
}

// Keep these rules synchronized with ordering.js.
const quotationReasons = {
  3: 'Homepage and catalogue prices differ',
  7: 'Product card and catalogue prices differ',
  8: 'Homepage and catalogue prices differ',
  15: 'Size and price range require confirmation',
  19: 'Size and price range require confirmation',
  25: 'UGX 149 requires business approval',
  67: 'Product card and catalogue prices differ',
  90: 'Displayed price notation requires confirmation',
  100: 'Displayed price notation requires confirmation',
  108: 'UGX 149 requires business approval',
  366: 'Product card and catalogue prices differ',
  394: 'Unit / dozen pricing requires confirmation',
  429: 'Legacy homepage identity conflicts with this catalogue ID'
};

const seen = new Set();

const catalogue = products.map(product => {
  if (!Number.isSafeInteger(product.id) || product.id <= 0 ||
      seen.has(product.id)) {
    throw new Error(`Invalid or duplicate product ID: ${product.id}`);
  }

  seen.add(product.id);

  if (typeof product.name !== 'string' || !product.name.trim() ||
      typeof product.brand !== 'string') {
    throw new Error(`Invalid product details for ID ${product.id}`);
  }

  const validPrice = Number.isSafeInteger(product.price) &&
    product.price > 0;

  const quoteReason = quotationReasons[product.id] ||
    (!validPrice ? 'Price requires confirmation' : '');

  return {
    id: String(product.id),
    name: product.name,
    brand: product.brand,
    price_ugx: quoteReason ? null : product.price,
    quote_only: Boolean(quoteReason),
    quote_reason: quoteReason
  };
});

for (const id of Object.keys(quotationReasons)) {
  if (!seen.has(Number(id))) {
    throw new Error(`Quotation rule references missing product ${id}`);
  }
}

catalogue.push({
  id: 'ketchup-unverified',
  name: 'Ketchup (pack to confirm)',
  brand: 'American Garden',
  price_ugx: null,
  quote_only: true,
  quote_reason: 'Product identity, pack and price require confirmation'
});

const destination = path.join(root, 'backend/data/catalogue.json');

fs.writeFileSync(
  destination,
  JSON.stringify(catalogue, null, 2) + '\n'
);

console.log(`Generated ${catalogue.length} catalogue entries`);
console.log(`Quotation-only entries: ${catalogue.filter(p => p.quote_only).length}`);

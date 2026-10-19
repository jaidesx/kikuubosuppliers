const fs = require('fs');
const { JSDOM } = require('jsdom');
function setup(body='') {
  const dom = new JSDOM('<!doctype html><body>'+body+'</body>', {url:'http://localhost', runScripts:'outside-only'});
  const w=dom.window;
  w.eval(['products_array.js','ordering.js','cart.js','storefront-ux.js'].map(file=>fs.readFileSync(file,'utf8')).join('\n'));
  return w;
}
test('rating accepts only verified data, renders fractions and accessible counts',()=>{
 const w=setup();
 const unrated = w.renderProductRating({average:4.2,count:18});
  expect(unrated.classList.contains('decorative-stars')).toBe(true);
  expect(unrated.textContent).toBe('★★★★★');
  expect(unrated.getAttribute('aria-hidden')).toBe('true');
  expect(unrated.hasAttribute('aria-label')).toBe(false);
  expect(unrated.querySelector('small')).toBeNull();
 const row=w.renderProductRating({verified:true,average:4.2,count:18});
 expect(row.getAttribute('aria-label')).toBe('4.2 out of 5 stars, 18 reviews');
 expect(row.querySelector('.rating-stars > span').style.width).toBe('84%');
 for(const average of [0,6,NaN]) expect(w.renderProductRating({verified:true,average,count:1}).textContent).toBe('★★★★★');
 w.close();
});
test('wholesale message includes packaging, optional details, encoding and unverified payment',()=>{
 const w=setup();const request=w.buildWholesaleRequest({product:'Jik 2.5L',packaging:'Cartons (contents to confirm)',quantity:12,name:'A & B',location:'Kampala',notes:'Call first'});
 expect(decodeURIComponent(request.url.split('?text=')[1])).toBe(request.message);
 for(const text of ['Jik 2.5L','Cartons','12','A & B','Kampala','Call first','Delivery fees: pending confirmation','Payment status: not verified']) expect(request.message).toContain(text);
 expect(()=>w.buildWholesaleRequest({product:'Jik',quantity:0})).toThrow();
 expect(w.buildWholesaleRequest({product:'Jik',quantity:1}).message).toContain('Reply on WhatsApp');w.close();
});
test('repeated taps add once; failure never shows success',()=>{
 const w=setup('<button id="add">Add</button>');const button=w.document.getElementById('add');
 expect(w.addToCartWithFeedback(button,{id:13})).toBe(true);
 expect(w.addToCartWithFeedback(button,{id:13})).toBe(false);
 expect(w.getCartItems()[0].quantity).toBe(1);expect(button.textContent).toBe('✓ Added!');
 const bad=w.document.createElement('button');bad.textContent='Add';
 expect(w.addToCartWithFeedback(bad,{id:'invalid'})).toBe(false);expect(bad.textContent).toBe('Add');w.close();
});
test('mobile quantity controls update saved cart and totals',()=>{
 const w=setup('<table id="cart-table"><tbody id="cart-items"></tbody></table><span id="cart-total"></span>');
 w.addToCart({id:13});w.document.querySelectorAll('.quantity-controls button')[1].click();
 expect(w.getCartItems()[0].quantity).toBe(2);
 expect(w.document.getElementById('cart-total').textContent).toBe('UGX 44,000');
 expect(JSON.parse(w.localStorage.getItem('kikuuboCart'))[0].quantity).toBe(2);w.close();
});

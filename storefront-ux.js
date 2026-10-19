/* Shared progressive enhancements. Ratings require an explicitly verified data source. */
window.renderProductRating = function(review) {
  const row = document.createElement('div'); row.className = 'product-rating';
  if (!review || review.verified !== true || !Number.isFinite(review.average) ||
      review.average < 1 || review.average > 5 || !Number.isSafeInteger(review.count) || review.count < 1) {
    row.classList.add('decorative-stars');
    row.setAttribute('aria-hidden', 'true');
    row.textContent = '★★★★★';
    return row;
  }
  row.setAttribute('role', 'img');
  row.setAttribute('aria-label', `${review.average} out of 5 stars, ${review.count} reviews`);
  const stars = document.createElement('span'); stars.className = 'rating-stars'; stars.setAttribute('aria-hidden','true'); stars.textContent = '★★★★★';
  const fill = document.createElement('span'); fill.textContent = '★★★★★'; fill.style.width = `${Math.round(review.average * 20 * 100) / 100}%`; stars.append(fill);
  const count = document.createElement('small'); count.setAttribute('aria-hidden','true'); count.textContent = `${review.average} (${review.count})`;
  row.append(stars, count); return row;
};
window.enhanceProductCards = function(root = document) {
  root.querySelectorAll('.pro[data-product-id]').forEach(card => {
    const product = getOrderProduct(card.dataset.productId); if (!product) return;
    const label = productLabel(product), detail = card.querySelector('.des');
    const heading = card.querySelector('h3 a'); if (heading) heading.textContent = label;
    card.querySelectorAll('a').forEach(a => { a.href = 'sproduct.html?id=' + encodeURIComponent(product.id); a.removeAttribute('onclick'); });
    const img = card.querySelector('img'); if (img) img.alt = label;
    if (detail && !detail.querySelector('.product-rating')) {
      const pack = document.createElement('small'); pack.className = 'product-pack';
      pack.textContent = product.packageSize || (product.id === 10 ? 'Pack / photo label: confirm with supplier' : 'Pack / size: confirm with supplier');
      detail.insertBefore(pack, detail.querySelector('h4'));
      // No verified reviews exist in the current catalogue. Do not infer ratings.
      detail.insertBefore(renderProductRating(), detail.querySelector('h4'));
    }
    const add = card.querySelector('.cart');
    if (add) { add.textContent = product.quoteOnly ? '＋ Add for quote' : '＋ Add to cart'; add.setAttribute('aria-label', (product.quoteOnly ? 'Add for quotation: ' : 'Add to cart: ') + label); }
  });
};
document.addEventListener('DOMContentLoaded', () => {
  enhanceProductCards();
  const price = document.getElementById('product-price');
  if (price) price.before(renderProductRating());
});

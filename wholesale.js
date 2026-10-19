(() => {
  const form = document.getElementById('wholesale-form');
  const preview = document.getElementById('quote-preview');
  const output = document.getElementById('quote-output');
  const link = document.getElementById('quote-whatsapp');
  const feedback = document.getElementById('quote-feedback');
  const id = new URLSearchParams(location.search).get('id');
  const product = id && getOrderProduct(id);
  if (product) {
    form.elements.product.value = productLabel(product);
    form.elements.packaging.value = product.packageSize || '';
  }
  form.addEventListener('input', () => { output.hidden = true; link.removeAttribute('href'); feedback.textContent = ''; });
  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      const request = buildWholesaleRequest(Object.fromEntries(new FormData(form)));
      preview.value = request.message; link.href = request.url; output.hidden = false;
      // Large URLs can be rejected by mobile apps; the copyable text remains available.
      link.hidden = request.url.length > 7000;
      feedback.textContent = link.hidden ? 'Request prepared. Copy the message and paste it into WhatsApp.' : 'Request prepared. Review it before opening WhatsApp.';
      preview.focus();
    } catch (error) { output.hidden = true; feedback.textContent = error.message; }
  });
  document.getElementById('quote-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(preview.value); feedback.textContent = 'Quotation request copied.'; }
    catch { preview.focus(); preview.select(); feedback.textContent = 'Select and copy the message, then paste it into WhatsApp.'; }
  });
})();

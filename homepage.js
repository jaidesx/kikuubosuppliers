/* Homepage wiring reuses catalogue, cart, search and ordering services. */
(() => {
  const menu = document.getElementById('navbar');
  const menuButton = document.getElementById('bar');
  const closeMenu = () => {
    menu.classList.remove('active');
    menuButton.setAttribute('aria-expanded', 'false');
  };
  menuButton.addEventListener('click', () => menuButton.setAttribute('aria-expanded', 'true'));
  document.getElementById('close').addEventListener('click', () => { closeMenu(); menuButton.focus(); });
  menu.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
  document.addEventListener('click', event => {
    if (!document.getElementById('header').contains(event.target)) closeMenu();
  });

  const searchButton = document.getElementById('search-open');
  const search = document.getElementById('command-palette');
  const closeSearch = () => { togglePalette(false); searchButton.focus(); };
  searchButton.addEventListener('click', () => togglePalette(true));
  document.querySelector('.search-close').addEventListener('click', closeSearch);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (search.classList.contains('active')) closeSearch();
      if (menu.classList.contains('active')) { closeMenu(); menuButton.focus(); }
      const widget = document.getElementById('whatsapp-chat-widget');
      if (widget.classList.contains('active')) {
        document.getElementById('close-chat').click();
        document.getElementById('floating-whatsapp').focus();
      }
    }
    if (event.key === 'Tab' && search.classList.contains('active')) {
      const controls = [...search.querySelectorAll('button,input,a[href]')].filter(el => !el.hidden);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });

  // All contact actions share the existing platform-aware WhatsApp mechanism.
  document.querySelectorAll('[data-whatsapp]').forEach(link => {
    link.href = `https://wa.me/${window.orderingConfig.whatsapp}`;
    link.addEventListener('click', event => {
      event.preventDefault();
      document.getElementById('start-whatsapp-chat').click();
    });
  });
  const methods = document.getElementById('payment-methods');
  Object.values(window.orderingConfig.payments).forEach(payment => {
    const row = document.createElement('div');
    row.className = 'payment-method';
    const label = document.createElement('span');
    label.textContent = payment.label;
    const number = document.createElement('strong');
    number.textContent = payment.number;
    const recipient = document.createElement('small');
    recipient.textContent = `Recipient: ${payment.recipientName}`;
    row.append(label, number, recipient);
    methods.append(row);
  });
  // Keep static, crawlable cards aligned with approved live catalogue data.
  document.querySelectorAll('.pro[data-product-id]').forEach(card => {
    const product = getOrderProduct(card.dataset.productId);
    if (!product) return;
    card.querySelector('.des > span').textContent = product.brand;
    card.querySelector('h3 a').textContent = productLabel(product);
    card.querySelector('.des h4').textContent = product.quoteOnly ? 'Price on quotation' : `UGX ${product.price.toLocaleString('en-UG')}`;
    card.querySelector('img').src = product.image;
  });
})();

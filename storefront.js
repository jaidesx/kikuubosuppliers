/* Shared behaviour for the premium inner pages. Catalogue and checkout stay in their existing modules. */
(() => {
  const menu = document.getElementById('navbar'), menuButton = document.getElementById('bar');
  const closeMenu = () => { menu?.classList.remove('active'); menuButton?.setAttribute('aria-expanded','false'); };
  menuButton?.addEventListener('click', () => menuButton.setAttribute('aria-expanded','true'));
  document.getElementById('close')?.addEventListener('click', () => { closeMenu(); menuButton?.focus(); });
  document.addEventListener('click', event => { if (!document.getElementById('header')?.contains(event.target)) closeMenu(); });
  const search = document.getElementById('command-palette'), opener = document.getElementById('search-open');
  const closeSearch = () => { togglePalette(false); opener?.focus(); };
  opener?.addEventListener('click', () => togglePalette(true));
  document.querySelector('.search-close')?.addEventListener('click', closeSearch);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { if (search?.classList.contains('active')) closeSearch(); closeMenu(); }
    if (event.key === 'Tab' && search?.classList.contains('active')) {
      const controls = [...search.querySelectorAll('button,input,a[href],[tabindex="0"]')].filter(el => !el.hidden);
      const first=controls[0],last=controls[controls.length-1];
      if (event.shiftKey && document.activeElement===first) { event.preventDefault();last?.focus(); }
      else if (!event.shiftKey && document.activeElement===last) {event.preventDefault();first?.focus();}
    }
  });
  document.querySelectorAll('[data-whatsapp]').forEach(link => {
    link.href='https://wa.me/'+orderingConfig.whatsapp;
    link.setAttribute('aria-label','Contact Kikuubo Suppliers on WhatsApp');
  });
  const container=document.getElementById('products-container');
  if (!container) return;
  const category=document.getElementById('category-select'),searchInput=document.getElementById('search-input'),sort=document.getElementById('sort-select');
  const cards=[...container.querySelectorAll('.pro')];
  let limit=36;
  const params=new URLSearchParams(location.search);
  if ([...category.options].some(o=>o.value===params.get('category'))) category.value=params.get('category');
  searchInput.value=params.get('q')||'';
  const normalise=text=>text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  function filterProducts(reset=true) {
    if(reset)limit=36;
    const query=normalise(searchInput.value.trim());
    let matches=cards.filter(card=>{
      const p=getOrderProduct(card.dataset.productId);
      return p && (category.value==='all'||p.category===category.value) && normalise([p.brand,p.name,p.category].join(' ')).includes(query);
    });
    const price=card=>getOrderProduct(card.dataset.productId).price;
    matches.sort((a,b)=>{
      if(sort.value==='name')return a.querySelector('h3').textContent.localeCompare(b.querySelector('h3').textContent);
      if(sort.value.startsWith('price')){
        const pa=price(a),pb=price(b); if(pa===null)return pb===null?0:1;if(pb===null)return -1;
        return sort.value==='price-low'?pa-pb:pb-pa;
      }
      return sort.value==='newest'?Number(b.dataset.productId)-Number(a.dataset.productId):Number(a.dataset.productId)-Number(b.dataset.productId);
    });
    cards.forEach(card=>{card.hidden=true;});
    matches.forEach((card,index)=>{card.hidden=index>=limit;container.appendChild(card);});
    document.getElementById('product-count').textContent=`${matches.length} products · showing ${Math.min(limit,matches.length)}`;
    document.getElementById('no-results-msg').hidden=matches.length>0;
    document.getElementById('load-more').hidden=matches.length<=limit;
  }
  window.filterProducts=filterProducts;
  [category,sort].forEach(el=>el.addEventListener('change',()=>filterProducts()));
  searchInput.addEventListener('input',()=>filterProducts());
  document.getElementById('load-more').addEventListener('click',()=>{limit+=36;filterProducts(false);});
  document.querySelectorAll('#reset-filters,[data-reset-filters]').forEach(el=>el.addEventListener('click',()=>{category.value='all';searchInput.value='';sort.value='featured';filterProducts();searchInput.focus();}));
  filterProducts();
})();

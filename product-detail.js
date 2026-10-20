let displayedProduct = null;
function displayProduct(product) {
  displayedProduct=product;
  document.getElementById('product-wholesale').href='wholesale.html?id='+encodeURIComponent(product.id);
  const main=document.getElementById('MainImg');main.src=product.image;main.alt=productLabel(product);
  if(product.id===10) document.querySelector('.image-note').textContent='Photo label needs confirmation: the catalogue lists Safa. Ask our team to confirm the brand and pack before ordering.';
  document.getElementById('product-category').textContent=product.category;
  document.getElementById('product-brand').textContent=product.brand;
  document.getElementById('product-name').textContent=productLabel(product);
  document.getElementById('product-price').textContent=product.quoteOnly?'Price on quotation':formatCurrency(product.price);
  document.getElementById('product-pack').textContent=product.packageSize || ('Confirm pack size with the supplier');
  document.getElementById('product-description').textContent=product.description;
  document.title=product.brand+' '+product.name+' | Kikuubo Suppliers';
  const gallery=document.getElementById('product-gallery');gallery.replaceChildren();
  // Never fill unused thumbnails with unrelated products.
  if (product.images.length>1) product.images.forEach((name,index)=>{
    const image=document.createElement('img');image.src=/\.(?:jpe?g|png|webp)$/i.test(name)?'image/Products/'+name:'image/Products/'+name+'.webp';image.alt=product.name+' view '+(index+1);
    const button=document.createElement('button');button.type='button';button.setAttribute('aria-label','Show '+image.alt);button.append(image);button.addEventListener('click',()=>{main.src=image.src;});gallery.append(button);
  });
  const jsonld=document.getElementById('product-jsonld');
  if (product.quoteOnly) {
    jsonld.textContent='';
  } else {
    const url=new URL('sproduct.html?id='+encodeURIComponent(product.id),
      'https://kikuubosuppliersug.com/').href;
    jsonld.textContent=JSON.stringify({
      '@context':'https://schema.org','@type':'Product',
      name:product.brand+' '+product.name,
      image:new URL(product.image,'https://kikuubosuppliersug.com/').href,
      description:product.description,
      brand:{'@type':'Brand',name:product.brand},
      url,
      offers:{
        '@type':'Offer',
        url,
        priceCurrency:'UGX',
        price:product.price
      }
    });
  }
}
function loadFeaturedProducts() {
  const list=products.filter(p=>p.id!==displayedProduct?.id && p.category===displayedProduct?.category).slice(0,4);
  const picks=list.length?list:products.slice(0,4);
  const container=document.getElementById('featured-products');container.replaceChildren();
  picks.forEach(raw=>{
    const p=getOrderProduct(raw.id),article=document.createElement('article');article.className='pro';article.dataset.productId=p.id;
    const imageLink=document.createElement('a');imageLink.href='sproduct.html?id='+p.id;imageLink.className='product-image';
    const image=document.createElement('img');image.src=p.image;image.alt=p.brand+' '+p.name;image.loading='lazy';imageLink.append(image);
    const detail=document.createElement('div');detail.className='des';const brand=document.createElement('span');brand.textContent=p.brand;
    const heading=document.createElement('h3'),link=document.createElement('a');link.href=imageLink.href;link.textContent=p.name;heading.append(link);
    const price=document.createElement('h4');price.textContent=p.quoteOnly?'Price on quotation':formatCurrency(p.price);detail.append(brand,heading,price);
    const add=document.createElement('button');add.type='button';add.className='cart';add.textContent='＋ Add to cart';add.setAttribute('aria-label','Add '+p.brand+' '+p.name+' to cart');
    article.append(imageLink,detail,add);container.append(article);
  });
}
document.addEventListener('DOMContentLoaded',()=>{
  let saved=null;try {saved=localStorage.getItem('selectedProductId');}catch{}
  const params=new URLSearchParams(location.search);const id=params.has('id')?params.get('id'):saved||1;
  const product=getProductById(id);
  if(product)displayProduct(product);
  else {
    document.getElementById('product-name').textContent='Product not found';
    document.getElementById('product-description').textContent='Please choose a product from the catalogue or contact the supplier.';
    document.getElementById('add-to-cart-btn').disabled=true;
    document.getElementById('compare-btn').disabled=true;
  }
  loadFeaturedProducts();
});
document.getElementById('add-to-cart-btn').addEventListener('click',()=>{
  if(displayedProduct)addToCartWithFeedback(document.getElementById('add-to-cart-btn'), {id:displayedProduct.id,quantity:document.getElementById('quantity').value});
});
document.getElementById('compare-btn').addEventListener('click',()=>{
  if(!displayedProduct)return;
  const feedback=document.getElementById('product-feedback');
  try {
    const list=JSON.parse(localStorage.getItem('compareList')||'[]');
    if(list.some(p=>p.id===displayedProduct.id)){feedback.textContent='This product is already saved for comparison.';return;}
    if(list.length>=4){feedback.textContent='You have four products saved for comparison.';return;}
    list.push(displayedProduct);localStorage.setItem('compareList',JSON.stringify(list));feedback.textContent='Saved to your comparison list.';
  }catch {feedback.textContent='Your browser cannot save this comparison. Please keep the product page open.';}
});

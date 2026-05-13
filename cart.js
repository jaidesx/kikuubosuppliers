// =====================
// Shopping Cart System
// =====================

let cart = [];

// Load cart from localStorage on page load
document.addEventListener("DOMContentLoaded", function() {
  loadCart();
  updateCartDisplay();
  updateCartCount();
});

// Save cart to localStorage
function saveCart() {
  localStorage.setItem("kikuuboCart", JSON.stringify(cart));
}

// Load cart from localStorage
function loadCart() {
  const savedCart = localStorage.getItem("kikuuboCart");
  if (savedCart) {
    cart = JSON.parse(savedCart);
  }
}

// Add item to cart
function addToCart(product) {
  const existingItem = cart.find(function(item) { return item.id === product.id; });

  if (existingItem) {
    existingItem.quantity += product.quantity || 1;
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.image,
      brand: product.brand || "",
      quantity: product.quantity || 1
    });
  }

  saveCart();
  updateCartDisplay();
  updateCartCount();
  showNotification(product.name + " added to cart!");
}

// Remove item from cart
function removeFromCart(productId) {
  cart = cart.filter(function(item) { return item.id !== productId; });
  saveCart();
  updateCartDisplay();
  updateCartCount();
}

// Update item quantity
function updateQuantity(productId, newQuantity) {
  const item = cart.find(function(item) { return item.id === productId; });
  if (item) {
    item.quantity = parseInt(newQuantity);
    if (item.quantity <= 0) {
      removeFromCart(productId);
    } else {
      saveCart();
      updateCartDisplay();
      updateCartCount();
    }
  }
}

// Get cart total
function getCartTotal() {
  return cart.reduce(function(total, item) { return total + item.price * item.quantity; }, 0);
}

// Get cart item count
function getCartItemCount() {
  return cart.reduce(function(count, item) { return count + item.quantity; }, 0);
}

// Update cart count display in header
function updateCartCount() {
  const count = getCartItemCount();
  const cartCountElements = document.querySelectorAll(".cart-count");
  cartCountElements.forEach(function(el) {
    if (el) {
      el.textContent = count;
      el.style.display = count > 0 ? "inline" : "none";
    }
  });
}

// Update cart display on cart page
function updateCartDisplay() {
  const cartTableBody = document.querySelector("#cart-items");
  const cartSubtotalEl = document.querySelector("#cart-subtotal");
  const cartTotalEl = document.querySelector("#cart-total");
  const emptyCartMessage = document.querySelector("#empty-cart-msg");
  const cartTable = document.querySelector("#cart-table");

  if (!cartTableBody) return;

  if (cart.length === 0) {
    if (emptyCartMessage) emptyCartMessage.style.display = "block";
    if (cartTable) cartTable.style.display = "none";
    if (cartSubtotalEl) cartSubtotalEl.textContent = "UGX 0.00";
    if (cartTotalEl) cartTotalEl.textContent = "UGX 0.00";
    return;
  }

  if (emptyCartMessage) emptyCartMessage.style.display = "none";
  if (cartTable) cartTable.style.display = "table";

  var html = "";
  cart.forEach(function(item) {
    html += '<tr data-id="' + item.id + '">';
    html += '<td><a href="#" onclick="removeFromCart(' + item.id + '); return false;"><i class="far fa-times-circle"></i></a></td>';
    html += '<td><img src="' + item.image + '" alt="' + item.name + '" style="width:70px;" /></td>';
    html += '<td>' + (item.brand ? "<span>" + item.brand + "</span><br>" : "") + item.name + '</td>';
    html += '<td>UGX ' + item.price.toFixed(2) + '</td>';
    html += '<td><input type="number" value="' + item.quantity + '" min="1" onchange="updateQuantity(' + item.id + ', this.value)" onkeyup="updateQuantity(' + item.id + ', this.value)" /></td>';
    html += '<td>UGX ' + (item.price * item.quantity).toFixed(2) + '</td>';
    html += '</tr>';
  });
  cartTableBody.innerHTML = html;

  const subtotal = getCartTotal();
  if (cartSubtotalEl) cartSubtotalEl.textContent = "UGX " + subtotal.toFixed(2);
  if (cartTotalEl) cartTotalEl.textContent = "UGX " + subtotal.toFixed(2);
}

// Show notification
function showNotification(message) {
  const notification = document.createElement("div");
  notification.className = "cart-notification";
  notification.innerHTML = '<i class="fas fa-check-circle"></i><span>' + message + '</span>';
  notification.style.cssText = "position:fixed;top:100px;right:20px;background:linear-gradient(135deg,#088178,#066b64);color:white;padding:15px 25px;border-radius:10px;display:flex;align-items:center;gap:10px;z-index:10000;animation:slideInRight 0.3s ease,fadeOut 0.3s ease 2.7s forwards;font-weight:500;";
  document.body.appendChild(notification);
  setTimeout(function() { notification.remove(); }, 3000);
}

// Add click handlers to all "Add to Cart" buttons
document.addEventListener("DOMContentLoaded", function() {
  const addToCartButtons = document.querySelectorAll(".pro .cart");

  addToCartButtons.forEach(function(button) {
    button.onclick = function(e) {
      e.preventDefault();
      e.stopPropagation();

      const productCard = this.closest(".pro");
      if (!productCard) return;

      const img = productCard.querySelector("img");
      const nameEl = productCard.querySelector("h5");
      const brand = productCard.querySelector(".des span");
      const priceEl = productCard.querySelector(".des h4");

      let price = 0;
      if (priceEl) {
        const priceText = priceEl.textContent.replace("UGX", "").trim();
        price = parseFloat(priceText) || 0;
      }

      const onclickAttr = productCard.getAttribute("onclick") || "";
      const idMatch = onclickAttr.match(/viewProduct\((\d+)\)/);
      const productId = idMatch ? parseInt(idMatch[1]) : Date.now();

      const product = {
        id: productId,
        name: nameEl ? nameEl.textContent : "Unknown Product",
        price: price,
        image: img ? img.src : "",
        brand: brand ? brand.textContent : ""
      };

      addToCart(product);
    };
  });
});

// Make functions globally available
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.updateQuantity = updateQuantity;
window.clearCart = function() { cart = []; saveCart(); updateCartDisplay(); updateCartCount(); };
window.saveCart = saveCart;
window.loadCart = loadCart;
window.getCartTotal = getCartTotal;
window.getCartItemCount = getCartItemCount;
window.updateCartCount = updateCartCount;
window.updateCartDisplay = updateCartDisplay;

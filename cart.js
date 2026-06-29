// =====================
// Shopping Cart System
// =====================

let cart = [];

function formatCurrency(amount) {
  return "UGX " + Number(amount || 0).toLocaleString("en-UG", {
    maximumFractionDigits: 0
  });
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value == null ? "" : String(value);
  return div.innerHTML;
}

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
    try {
      cart = JSON.parse(savedCart).map(function(item) {
        return {
          id: item.id,
          name: item.name || "Unknown Product",
          price: Number(item.price) || 0,
          image: item.image || "",
          brand: item.brand || "",
          quantity: Math.max(parseInt(item.quantity, 10) || 1, 1)
        };
      });
    } catch (error) {
      cart = [];
      saveCart();
    }
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
    item.quantity = parseInt(newQuantity, 10);
    if (item.quantity <= 0) {
      removeFromCart(productId);
    } else if (Number.isNaN(item.quantity)) {
      item.quantity = 1;
      saveCart();
      updateCartDisplay();
      updateCartCount();
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
      el.style.display = count > 0 ? "inline-flex" : "none";
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
    if (cartSubtotalEl) cartSubtotalEl.textContent = formatCurrency(0);
    if (cartTotalEl) cartTotalEl.textContent = formatCurrency(0);
    return;
  }

  if (emptyCartMessage) emptyCartMessage.style.display = "none";
  if (cartTable) cartTable.style.display = "table";

  var html = "";
  cart.forEach(function(item) {
    html += '<tr data-id="' + item.id + '">';
    html += '<td><button class="cart-remove-btn" type="button" onclick="removeFromCart(' + item.id + ')" aria-label="Remove ' + escapeHtml(item.name) + '"><i class="far fa-times-circle"></i></button></td>';
    html += '<td><img src="' + escapeHtml(item.image) + '" alt="' + escapeHtml(item.name) + '" /></td>';
    html += '<td class="cart-product-name">' + (item.brand ? "<span>" + escapeHtml(item.brand) + "</span><br>" : "") + escapeHtml(item.name) + '</td>';
    html += '<td>' + formatCurrency(item.price) + '</td>';
    html += '<td><input type="number" value="' + item.quantity + '" min="1" onchange="updateQuantity(' + item.id + ', this.value)" onkeyup="updateQuantity(' + item.id + ', this.value)" /></td>';
    html += '<td>' + formatCurrency(item.price * item.quantity) + '</td>';
    html += '</tr>';
  });
  cartTableBody.innerHTML = html;

  const subtotal = getCartTotal();
  if (cartSubtotalEl) cartSubtotalEl.textContent = formatCurrency(subtotal);
  if (cartTotalEl) cartTotalEl.textContent = formatCurrency(subtotal);
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
        const priceText = priceEl.textContent.replace("UGX", "").replace(/,/g, "").split("-")[0].trim();
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
window.formatCurrency = formatCurrency;

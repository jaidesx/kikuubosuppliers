/**
 * Tests for cart.js
 *
 * Strategy: evaluate cart.js inside a fresh jsdom window per test group.
 * All public functions are exposed via window.* at the bottom of cart.js.
 * The internal `cart` array is shared via closure across those window functions.
 */

const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const CART_JS = fs.readFileSync(
  path.resolve(__dirname, "../cart.js"),
  "utf8"
);

const CART_PAGE_HTML = `<!DOCTYPE html><html><head></head><body>
  <span class="cart-count"></span>
  <table id="cart-table" style="display:none">
    <tbody id="cart-items"></tbody>
  </table>
  <span id="cart-subtotal">UGX 0.00</span>
  <span id="cart-total">UGX 0.00</span>
  <p id="empty-cart-msg" style="display:none"></p>
</body></html>`;

function injectScript(win, code) {
  const script = win.document.createElement("script");
  script.textContent = code;
  win.document.head.appendChild(script);
}

function createWindow(html = CART_PAGE_HTML) {
  const dom = new JSDOM(html, { url: "http://localhost", runScripts: "dangerously" });
  const win = dom.window;
  win.localStorage.clear();
  injectScript(win, CART_JS);
  // Manually trigger the DOMContentLoaded initialisation
  win.loadCart();
  win.updateCartDisplay();
  win.updateCartCount();
  return win;
}

// ---------------------------------------------------------------------------
// addToCart
// ---------------------------------------------------------------------------
describe("addToCart", () => {
  let win;
  beforeEach(() => {
    win = createWindow();
  });

  test("adds a new item to an empty cart", () => {
    win.addToCart({ id: 1, name: "Pringles", price: 9500, image: "img.jpg", brand: "Snacks" });
    expect(win.getCartItemCount()).toBe(1);
    expect(win.getCartTotal()).toBe(9500);
  });

  test("increments quantity when the same product is added twice", () => {
    const product = { id: 1, name: "Pringles", price: 9500, image: "img.jpg", brand: "Snacks" };
    win.addToCart(product);
    win.addToCart(product);
    expect(win.getCartItemCount()).toBe(2);
    expect(win.getCartTotal()).toBe(19000);
  });

  test("defaults quantity to 1 when not specified", () => {
    win.addToCart({ id: 2, name: "Sugar", price: 160000, image: "img.jpg", brand: "Kakira" });
    expect(win.getCartItemCount()).toBe(1);
  });

  test("respects an explicit quantity parameter", () => {
    win.addToCart({ id: 3, name: "Oil", price: 11000, image: "img.jpg", brand: "Oils", quantity: 3 });
    expect(win.getCartItemCount()).toBe(3);
    expect(win.getCartTotal()).toBe(33000);
  });

  test("accumulates quantities correctly when the same product is added with a quantity > 1", () => {
    win.addToCart({ id: 1, name: "Item", price: 5000, image: "", brand: "", quantity: 2 });
    win.addToCart({ id: 1, name: "Item", price: 5000, image: "", brand: "", quantity: 3 });
    expect(win.getCartItemCount()).toBe(5);
  });

  test("keeps different products as separate entries", () => {
    win.addToCart({ id: 1, name: "Pringles", price: 9500, image: "", brand: "Snacks" });
    win.addToCart({ id: 2, name: "Sugar", price: 160000, image: "", brand: "Kakira" });
    expect(win.getCartItemCount()).toBe(2);
    expect(win.getCartTotal()).toBe(169500);
  });

  test("defaults brand to empty string when not provided", () => {
    expect(() =>
      win.addToCart({ id: 1, name: "Test", price: 1000, image: "" })
    ).not.toThrow();
    expect(win.getCartItemCount()).toBe(1);
  });

  test("saves the cart to localStorage after adding an item", () => {
    win.addToCart({ id: 1, name: "Pringles", price: 9500, image: "", brand: "Snacks" });
    const saved = JSON.parse(win.localStorage.getItem("kikuuboCart"));
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe("Pringles");
    expect(saved[0].price).toBe(9500);
  });
});

// ---------------------------------------------------------------------------
// removeFromCart
// ---------------------------------------------------------------------------
describe("removeFromCart", () => {
  let win;
  beforeEach(() => {
    win = createWindow();
  });

  test("removes an existing item by id", () => {
    win.addToCart({ id: 1, name: "Pringles", price: 9500, image: "", brand: "Snacks" });
    win.removeFromCart(1);
    expect(win.getCartItemCount()).toBe(0);
    expect(win.getCartTotal()).toBe(0);
  });

  test("does not affect other items when one is removed", () => {
    win.addToCart({ id: 1, name: "Pringles", price: 9500, image: "", brand: "Snacks" });
    win.addToCart({ id: 2, name: "Sugar", price: 160000, image: "", brand: "Kakira" });
    win.removeFromCart(1);
    expect(win.getCartItemCount()).toBe(1);
    expect(win.getCartTotal()).toBe(160000);
  });

  test("does nothing when the id does not exist in the cart", () => {
    win.addToCart({ id: 1, name: "Pringles", price: 9500, image: "", brand: "Snacks" });
    win.removeFromCart(999);
    expect(win.getCartItemCount()).toBe(1);
  });

  test("works on an empty cart without throwing", () => {
    expect(() => win.removeFromCart(1)).not.toThrow();
    expect(win.getCartItemCount()).toBe(0);
  });

  test("updates localStorage after removal", () => {
    win.addToCart({ id: 1, name: "Pringles", price: 9500, image: "", brand: "Snacks" });
    win.removeFromCart(1);
    const saved = JSON.parse(win.localStorage.getItem("kikuuboCart"));
    expect(saved).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// updateQuantity
// ---------------------------------------------------------------------------
describe("updateQuantity", () => {
  let win;
  beforeEach(() => {
    win = createWindow();
    win.addToCart({ id: 1, name: "Pringles", price: 9500, image: "", brand: "Snacks" });
  });

  test("updates an item's quantity to a new value", () => {
    win.updateQuantity(1, 5);
    expect(win.getCartItemCount()).toBe(5);
    expect(win.getCartTotal()).toBe(47500);
  });

  test("removes the item when quantity is set to 0", () => {
    win.updateQuantity(1, 0);
    expect(win.getCartItemCount()).toBe(0);
  });

  test("removes the item when quantity is set to a negative number", () => {
    win.updateQuantity(1, -1);
    expect(win.getCartItemCount()).toBe(0);
  });

  test("does nothing for a non-existent product id", () => {
    win.updateQuantity(999, 5);
    expect(win.getCartItemCount()).toBe(1);
  });

  test("parses string quantity values correctly", () => {
    win.updateQuantity(1, "3");
    expect(win.getCartItemCount()).toBe(3);
  });

  test("updates localStorage after quantity change", () => {
    win.updateQuantity(1, 4);
    const saved = JSON.parse(win.localStorage.getItem("kikuuboCart"));
    expect(saved[0].quantity).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// getCartTotal
// ---------------------------------------------------------------------------
describe("getCartTotal", () => {
  let win;
  beforeEach(() => {
    win = createWindow();
  });

  test("returns 0 for an empty cart", () => {
    expect(win.getCartTotal()).toBe(0);
  });

  test("returns the price of a single item", () => {
    win.addToCart({ id: 1, name: "Item", price: 9500, image: "", brand: "" });
    expect(win.getCartTotal()).toBe(9500);
  });

  test("sums prices across multiple different items", () => {
    win.addToCart({ id: 1, name: "A", price: 10000, image: "", brand: "" });
    win.addToCart({ id: 2, name: "B", price: 20000, image: "", brand: "" });
    expect(win.getCartTotal()).toBe(30000);
  });

  test("accounts for item quantity in the total", () => {
    win.addToCart({ id: 1, name: "Item", price: 5000, image: "", brand: "", quantity: 4 });
    expect(win.getCartTotal()).toBe(20000);
  });

  test("calculates a mixed cart total correctly", () => {
    win.addToCart({ id: 1, name: "A", price: 10000, image: "", brand: "", quantity: 2 });
    win.addToCart({ id: 2, name: "B", price: 3000, image: "", brand: "", quantity: 5 });
    // 10000*2 + 3000*5 = 20000 + 15000 = 35000
    expect(win.getCartTotal()).toBe(35000);
  });
});

// ---------------------------------------------------------------------------
// getCartItemCount
// ---------------------------------------------------------------------------
describe("getCartItemCount", () => {
  let win;
  beforeEach(() => {
    win = createWindow();
  });

  test("returns 0 for an empty cart", () => {
    expect(win.getCartItemCount()).toBe(0);
  });

  test("returns 1 for a single item added with default quantity", () => {
    win.addToCart({ id: 1, name: "Item", price: 5000, image: "", brand: "" });
    expect(win.getCartItemCount()).toBe(1);
  });

  test("sums quantities across all cart entries", () => {
    win.addToCart({ id: 1, name: "A", price: 1000, image: "", brand: "", quantity: 2 });
    win.addToCart({ id: 2, name: "B", price: 2000, image: "", brand: "", quantity: 3 });
    expect(win.getCartItemCount()).toBe(5);
  });

  test("decreases after an item is removed", () => {
    win.addToCart({ id: 1, name: "A", price: 1000, image: "", brand: "" });
    win.addToCart({ id: 2, name: "B", price: 2000, image: "", brand: "" });
    win.removeFromCart(1);
    expect(win.getCartItemCount()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// localStorage persistence (saveCart / loadCart)
// ---------------------------------------------------------------------------
describe("saveCart / loadCart", () => {
  test("loadCart restores a previously saved cart from localStorage", () => {
    const win1 = createWindow();
    win1.addToCart({ id: 1, name: "Pringles", price: 9500, image: "img.jpg", brand: "Snacks" });
    const serialised = win1.localStorage.getItem("kikuuboCart");

    const win2 = createWindow();
    win2.localStorage.setItem("kikuuboCart", serialised);
    win2.loadCart();

    expect(win2.getCartItemCount()).toBe(1);
    expect(win2.getCartTotal()).toBe(9500);
  });

  test("loadCart leaves cart empty when localStorage has no entry", () => {
    const win = createWindow();
    win.localStorage.removeItem("kikuuboCart");
    win.loadCart();
    expect(win.getCartItemCount()).toBe(0);
  });

  test("saveCart serialises the full cart to localStorage", () => {
    const win = createWindow();
    win.addToCart({ id: 1, name: "Pringles", price: 9500, image: "", brand: "Snacks" });
    win.addToCart({ id: 2, name: "Sugar", price: 160000, image: "", brand: "Kakira" });
    win.saveCart();

    const saved = JSON.parse(win.localStorage.getItem("kikuuboCart"));
    expect(saved).toHaveLength(2);
    expect(saved.map((p) => p.name)).toEqual(["Pringles", "Sugar"]);
  });
});

// ---------------------------------------------------------------------------
// clearCart
// ---------------------------------------------------------------------------
describe("clearCart", () => {
  let win;
  beforeEach(() => {
    win = createWindow();
    win.addToCart({ id: 1, name: "A", price: 1000, image: "", brand: "" });
    win.addToCart({ id: 2, name: "B", price: 2000, image: "", brand: "" });
  });

  test("empties the cart completely", () => {
    win.clearCart();
    expect(win.getCartItemCount()).toBe(0);
    expect(win.getCartTotal()).toBe(0);
  });

  test("clears the cart entry in localStorage", () => {
    win.clearCart();
    const saved = JSON.parse(win.localStorage.getItem("kikuuboCart"));
    expect(saved).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// updateCartCount (badge in header)
// ---------------------------------------------------------------------------
describe("updateCartCount", () => {
  test("hides the badge when the cart is empty", () => {
    const win = createWindow();
    win.updateCartCount();
    expect(win.document.querySelector(".cart-count").style.display).toBe("none");
  });

  test("shows the badge when the cart has items", () => {
    const win = createWindow();
    win.addToCart({ id: 1, name: "Item", price: 5000, image: "", brand: "" });
    win.updateCartCount();
    expect(win.document.querySelector(".cart-count").style.display).not.toBe("none");
  });

  test("sets badge text to the total item count", () => {
    const win = createWindow();
    win.addToCart({ id: 1, name: "A", price: 1000, image: "", brand: "", quantity: 3 });
    win.updateCartCount();
    expect(win.document.querySelector(".cart-count").textContent).toBe("3");
  });

  test("updates badge across multiple cart-count elements", () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>
      <span class="cart-count"></span>
      <span class="cart-count"></span>
    </body></html>`, { url: "http://localhost", runScripts: "dangerously" });
    const win = dom.window;
    win.localStorage.clear();
    injectScript(win, CART_JS);
    win.loadCart();
    win.addToCart({ id: 1, name: "Item", price: 5000, image: "", brand: "" });
    win.updateCartCount();

    const badges = win.document.querySelectorAll(".cart-count");
    badges.forEach((b) => expect(b.textContent).toBe("1"));
  });
});

// ---------------------------------------------------------------------------
// updateCartDisplay (cart page table)
// ---------------------------------------------------------------------------
describe("updateCartDisplay", () => {
  test("shows empty-cart message and hides table when cart is empty", () => {
    const win = createWindow();
    win.updateCartDisplay();

    expect(win.document.querySelector("#empty-cart-msg").style.display).toBe("block");
    expect(win.document.querySelector("#cart-table").style.display).toBe("none");
  });

  test("hides empty-cart message and shows table when cart has items", () => {
    const win = createWindow();
    win.addToCart({ id: 1, name: "Item", price: 5000, image: "", brand: "" });
    win.updateCartDisplay();

    expect(win.document.querySelector("#cart-table").style.display).toBe("table");
    expect(win.document.querySelector("#empty-cart-msg").style.display).toBe("none");
  });

  test("renders the correct number of rows in the cart table", () => {
    const win = createWindow();
    win.addToCart({ id: 1, name: "A", price: 1000, image: "", brand: "" });
    win.addToCart({ id: 2, name: "B", price: 2000, image: "", brand: "" });
    win.updateCartDisplay();

    expect(win.document.querySelectorAll("#cart-items tr")).toHaveLength(2);
  });

  test("displays the correct subtotal for the cart", () => {
    const win = createWindow();
    win.addToCart({ id: 1, name: "Item", price: 9500, image: "", brand: "" });
    win.updateCartDisplay();

    expect(win.document.querySelector("#cart-subtotal").textContent).toBe("UGX 9,500");
  });

  test("displays UGX 0.00 for subtotal when cart is empty", () => {
    const win = createWindow();
    win.updateCartDisplay();
    expect(win.document.querySelector("#cart-subtotal").textContent).toBe("UGX 0");
  });

  test("displays the correct total for multiple items with quantities", () => {
    const win = createWindow();
    win.addToCart({ id: 1, name: "A", price: 10000, image: "", brand: "", quantity: 2 });
    win.addToCart({ id: 2, name: "B", price: 5000, image: "", brand: "", quantity: 3 });
    win.updateCartDisplay();
    // 10000*2 + 5000*3 = 20000 + 15000 = 35000
    expect(win.document.querySelector("#cart-total").textContent).toBe("UGX 35,000");
  });

  test("renders product name in the row", () => {
    const win = createWindow();
    win.addToCart({ id: 1, name: "Pringles", price: 9500, image: "", brand: "Snacks" });
    win.updateCartDisplay();
    expect(win.document.querySelector("#cart-items").innerHTML).toContain("Pringles");
  });

  test("renders brand in the row when brand is provided", () => {
    const win = createWindow();
    win.addToCart({ id: 1, name: "Pringles", price: 9500, image: "", brand: "Snacks" });
    win.updateCartDisplay();
    expect(win.document.querySelector("#cart-items").innerHTML).toContain("Snacks");
  });

  test("does not render brand markup when brand is empty", () => {
    const win = createWindow();
    win.addToCart({ id: 1, name: "Generic", price: 5000, image: "", brand: "" });
    win.updateCartDisplay();
    const rowHtml = win.document.querySelector("#cart-items").innerHTML;
    // The brand <span> should not appear
    expect(rowHtml).not.toContain("<span></span>");
  });

  test("returns early without throwing when cart-items element is absent", () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body></body></html>`, { url: "http://localhost", runScripts: "dangerously" });
    const win = dom.window;
    win.localStorage.clear();
    injectScript(win, CART_JS);
    win.loadCart();
    expect(() => win.updateCartDisplay()).not.toThrow();
  });
});

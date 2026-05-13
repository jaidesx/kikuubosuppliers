/**
 * Tests for script.js
 *
 * Strategy: evaluate script.js inside a fresh jsdom window per describe block.
 * The window is seeded with a minimal DOM and a small mock products array
 * before the script is evaluated so all top-level initialisation succeeds.
 *
 * window.location is replaced with a plain object so viewProduct() does not
 * trigger jsdom's navigation guard.
 */

const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const SCRIPT_JS = fs.readFileSync(
  path.resolve(__dirname, "../script.js"),
  "utf8"
);

const MOCK_PRODUCTS = [
  { id: 1, name: "Pringles", brand: "Snacks", price: 9500, category: "Snacks", image: "img1.jpg" },
  { id: 2, name: "Corn Flakes", brand: "Kellogg's", price: 35000, category: "Cereals", image: "img2.jpg" },
  { id: 3, name: "Nescafe", brand: "Coffee", price: 15000, category: "Breakfast", image: "img3.jpg" },
  { id: 4, name: "BBQ Sauce", brand: "Gold Valley", price: 15000, category: "Cooking", image: "img4.jpg" },
  { id: 5, name: "Sunseed Oil", brand: "Oils", price: 11000, category: "Cooking", image: "img5.jpg" },
];

// Minimal HTML providing every element that script.js references at the top level
const SCRIPT_HTML = `<!DOCTYPE html><html><head></head><body>
  <button id="theme-toggle"><i class="fas fa-moon"></i></button>
  <ul id="navbar"></ul>
  <i id="bar"></i>
  <a id="close" href="#"></a>
  <div id="command-palette">
    <input id="palette-input" type="text" />
    <div id="palette-results"></div>
  </div>
</body></html>`;

function injectScript(win, code) {
  const script = win.document.createElement("script");
  script.textContent = code;
  win.document.head.appendChild(script);
}

function createWindow(html = SCRIPT_HTML, { products = MOCK_PRODUCTS, theme = null } = {}) {
  const dom = new JSDOM(html, { url: "http://localhost", runScripts: "dangerously" });
  const win = dom.window;

  win.localStorage.clear();
  if (theme) win.localStorage.setItem("theme", theme);

  // Expose products before the script runs so getProductById / displayTrending work
  win.products = products;

  // Prevent jsdom navigation errors from viewProduct's window.location.href = ...
  delete win.location;
  win.location = { href: "" };

  // Polyfill browser APIs jsdom doesn't implement — must be injected as a
  // script so they are visible inside jsdom's own execution context.
  injectScript(win, `
    if (!window.IntersectionObserver) {
      window.IntersectionObserver = class {
        constructor() {} observe() {} unobserve() {} disconnect() {}
      };
    }
    if (!Element.prototype.scrollIntoView) {
      Element.prototype.scrollIntoView = function() {};
    }
  `);

  injectScript(win, SCRIPT_JS);
  return win;
}

// ---------------------------------------------------------------------------
// Theme toggle
// ---------------------------------------------------------------------------
describe("Theme Toggle", () => {
  test("defaults to light theme when localStorage has no theme entry", () => {
    const win = createWindow();
    expect(win.document.body.getAttribute("data-theme")).toBe("light");
  });

  test("restores dark theme saved in localStorage", () => {
    const win = createWindow(SCRIPT_HTML, { theme: "dark" });
    expect(win.document.body.getAttribute("data-theme")).toBe("dark");
  });

  test("restores light theme saved in localStorage", () => {
    const win = createWindow(SCRIPT_HTML, { theme: "light" });
    expect(win.document.body.getAttribute("data-theme")).toBe("light");
  });

  test("switches from light to dark on a single click", () => {
    const win = createWindow();
    win.document.getElementById("theme-toggle").click();
    expect(win.document.body.getAttribute("data-theme")).toBe("dark");
  });

  test("switches back to light on a second click", () => {
    const win = createWindow();
    const toggle = win.document.getElementById("theme-toggle");
    toggle.click();
    toggle.click();
    expect(win.document.body.getAttribute("data-theme")).toBe("light");
  });

  test("persists new theme to localStorage after toggle", () => {
    const win = createWindow();
    win.document.getElementById("theme-toggle").click();
    expect(win.localStorage.getItem("theme")).toBe("dark");
  });

  test("sets sun icon when dark theme is active", () => {
    const win = createWindow();
    win.document.getElementById("theme-toggle").click(); // → dark
    const icon = win.document.getElementById("theme-toggle").querySelector("i");
    expect(icon.className).toBe("fas fa-sun");
  });

  test("sets moon icon when light theme is active", () => {
    const win = createWindow();
    const icon = win.document.getElementById("theme-toggle").querySelector("i");
    expect(icon.className).toBe("fas fa-moon");
  });

  test("moon icon appears again after toggling back to light", () => {
    const win = createWindow();
    const toggle = win.document.getElementById("theme-toggle");
    toggle.click(); // dark
    toggle.click(); // light
    const icon = toggle.querySelector("i");
    expect(icon.className).toBe("fas fa-moon");
  });
});

// ---------------------------------------------------------------------------
// getProductById
// ---------------------------------------------------------------------------
describe("getProductById", () => {
  let win;
  beforeEach(() => {
    win = createWindow();
  });

  test("returns the product that matches the given id", () => {
    const product = win.getProductById(1);
    expect(product).not.toBeNull();
    expect(product.name).toBe("Pringles");
  });

  test("returns undefined for an id that does not exist", () => {
    // Array.find() returns undefined when no element matches (not null)
    expect(win.getProductById(9999)).toBeUndefined();
  });

  test("handles a string id by parsing it to an integer", () => {
    const product = win.getProductById("2");
    expect(product).not.toBeNull();
    expect(product.name).toBe("Corn Flakes");
  });

  test("returns null when products global is not defined", () => {
    // Evaluate script without injecting products
    const dom = new JSDOM(SCRIPT_HTML, { url: "http://localhost", runScripts: "dangerously" });
    const w = dom.window;
    w.localStorage.clear();
    delete w.location;
    w.location = { href: "" };
    // Polyfills must still be injected to avoid unrelated jsdom noise
    injectScript(w, `
      window.IntersectionObserver = class { constructor() {} observe() {} unobserve() {} disconnect() {} };
      Element.prototype.scrollIntoView = function() {};
    `);
    // deliberately do NOT set w.products
    injectScript(w, SCRIPT_JS);
    expect(w.getProductById(1)).toBeNull();
  });

  test("returns the correct product from the middle of the array", () => {
    const product = win.getProductById(3);
    expect(product.name).toBe("Nescafe");
    expect(product.price).toBe(15000);
  });

  test("returns the last product in the array", () => {
    const product = win.getProductById(5);
    expect(product).not.toBeNull();
    expect(product.name).toBe("Sunseed Oil");
  });
});

// ---------------------------------------------------------------------------
// viewProduct
// ---------------------------------------------------------------------------
describe("viewProduct", () => {
  let win;
  beforeEach(() => {
    win = createWindow();
  });

  test("stores the product id in localStorage under selectedProductId", () => {
    win.viewProduct(42);
    expect(win.localStorage.getItem("selectedProductId")).toBe("42");
  });

  test("redirects to sproduct.html", () => {
    win.viewProduct(1);
    expect(win.location.href).toBe("sproduct.html");
  });

  test("works with any numeric product id", () => {
    win.viewProduct(123);
    expect(win.localStorage.getItem("selectedProductId")).toBe("123");
    expect(win.location.href).toBe("sproduct.html");
  });
});

// ---------------------------------------------------------------------------
// Mobile navigation toggle
// ---------------------------------------------------------------------------
describe("Mobile Nav Toggle", () => {
  test("adds 'active' class to navbar when the menu bar is clicked", () => {
    const win = createWindow();
    win.document.getElementById("bar").click();
    expect(win.document.getElementById("navbar").classList.contains("active")).toBe(true);
  });

  test("removes 'active' class from navbar when close is clicked", () => {
    const win = createWindow();
    win.document.getElementById("bar").click();
    win.document.getElementById("close").click();
    expect(win.document.getElementById("navbar").classList.contains("active")).toBe(false);
  });

  test("navbar starts without active class", () => {
    const win = createWindow();
    expect(win.document.getElementById("navbar").classList.contains("active")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Command palette – togglePalette
// ---------------------------------------------------------------------------
describe("Command Palette – togglePalette", () => {
  let win;
  beforeEach(() => {
    win = createWindow();
  });

  test("adds 'active' class to the palette overlay when opened", () => {
    win.togglePalette(true);
    expect(win.document.getElementById("command-palette").classList.contains("active")).toBe(true);
  });

  test("removes 'active' class when closed", () => {
    win.togglePalette(true);
    win.togglePalette(false);
    expect(win.document.getElementById("command-palette").classList.contains("active")).toBe(false);
  });

  test("clears the input value when the palette is closed", () => {
    const input = win.document.getElementById("palette-input");
    input.value = "pringles";
    win.togglePalette(false);
    expect(input.value).toBe("");
  });

  test("clears results HTML when the palette is closed", () => {
    const results = win.document.getElementById("palette-results");
    results.innerHTML = "<div>leftover</div>";
    win.togglePalette(false);
    expect(results.innerHTML).toBe("");
  });

  test("opening the palette populates results via displayTrending", () => {
    win.togglePalette(true);
    const results = win.document.getElementById("palette-results");
    // displayTrending renders the first 5 products
    expect(results.querySelectorAll(".palette-item").length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Command palette – renderResults
// ---------------------------------------------------------------------------
describe("Command Palette – renderResults", () => {
  let win;
  beforeEach(() => {
    win = createWindow();
  });

  test("renders the correct number of palette items", () => {
    win.renderResults(MOCK_PRODUCTS, "Test Results");
    expect(win.document.querySelectorAll(".palette-item")).toHaveLength(MOCK_PRODUCTS.length);
  });

  test("includes the section title in the output", () => {
    win.renderResults(MOCK_PRODUCTS, "My Section Title");
    expect(win.document.getElementById("palette-results").innerHTML).toContain("My Section Title");
  });

  test("renders product names in the items", () => {
    win.renderResults(MOCK_PRODUCTS, "Test");
    const html = win.document.getElementById("palette-results").innerHTML;
    expect(html).toContain("Pringles");
    expect(html).toContain("Corn Flakes");
  });

  test("includes 'UGX' price label in the output", () => {
    win.renderResults(MOCK_PRODUCTS, "Test");
    expect(win.document.getElementById("palette-results").innerHTML).toContain("UGX");
  });

  test("renders product categories in the items", () => {
    win.renderResults(MOCK_PRODUCTS, "Test");
    const html = win.document.getElementById("palette-results").innerHTML;
    expect(html).toContain("Snacks");
  });

  test("handles an empty results array gracefully", () => {
    win.renderResults([], "Empty Section");
    expect(win.document.querySelectorAll(".palette-item")).toHaveLength(0);
  });

  test("replaces previous results on each call", () => {
    win.renderResults([MOCK_PRODUCTS[0]], "First");
    win.renderResults([MOCK_PRODUCTS[1], MOCK_PRODUCTS[2]], "Second");
    expect(win.document.querySelectorAll(".palette-item")).toHaveLength(2);
    expect(win.document.getElementById("palette-results").innerHTML).not.toContain("Pringles");
  });
});

// ---------------------------------------------------------------------------
// Command palette – keyboard shortcuts
// ---------------------------------------------------------------------------
describe("Command Palette – keyboard shortcuts", () => {
  test("opens the palette on Ctrl+K", () => {
    const win = createWindow();
    win.dispatchEvent(
      new win.KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true })
    );
    expect(win.document.getElementById("command-palette").classList.contains("active")).toBe(true);
  });

  test("closes the palette on a second Ctrl+K", () => {
    const win = createWindow();
    const event = new win.KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true });
    win.dispatchEvent(event); // open
    win.dispatchEvent(event); // close
    expect(win.document.getElementById("command-palette").classList.contains("active")).toBe(false);
  });

  test("closes the palette when Escape is pressed in the input", () => {
    const win = createWindow();
    win.togglePalette(true);
    win.document.getElementById("palette-input").dispatchEvent(
      new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    expect(win.document.getElementById("command-palette").classList.contains("active")).toBe(false);
  });

  test("clicking outside (on the backdrop) closes the palette", () => {
    const win = createWindow();
    win.togglePalette(true);
    // Simulate a click directly on the palette overlay element (not a child)
    const palette = win.document.getElementById("command-palette");
    const event = new win.MouseEvent("click", { bubbles: true });
    Object.defineProperty(event, "target", { value: palette });
    palette.dispatchEvent(event);
    expect(palette.classList.contains("active")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Command palette – keyboard navigation (Arrow keys)
// ---------------------------------------------------------------------------
describe("Command Palette – arrow-key navigation", () => {
  test("ArrowDown selects the first item from an unselected state", () => {
    const win = createWindow();
    win.togglePalette(true); // populates trending items

    win.document.getElementById("palette-input").dispatchEvent(
      new win.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
    );

    const items = win.document.querySelectorAll(".palette-item");
    expect(items[0].classList.contains("selected")).toBe(true);
  });

  test("ArrowDown cycles selection through items", () => {
    const win = createWindow();
    win.togglePalette(true);
    const input = win.document.getElementById("palette-input");

    input.dispatchEvent(new win.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    input.dispatchEvent(new win.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));

    const items = win.document.querySelectorAll(".palette-item");
    expect(items[1].classList.contains("selected")).toBe(true);
  });

  test("Enter on a selected item navigates to sproduct.html", () => {
    const win = createWindow();
    win.togglePalette(true);
    const input = win.document.getElementById("palette-input");

    // Select the first item
    input.dispatchEvent(new win.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    // Press Enter
    input.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(win.location.href).toBe("sproduct.html");
  });
});

// ---------------------------------------------------------------------------
// Command palette – search filtering
// ---------------------------------------------------------------------------
describe("Command Palette – search input", () => {
  test("filtering by product name shows matching items only", () => {
    const win = createWindow();
    win.togglePalette(true);

    const input = win.document.getElementById("palette-input");
    input.value = "pringles";
    input.dispatchEvent(new win.Event("input", { bubbles: true }));

    const items = win.document.querySelectorAll(".palette-item");
    expect(items).toHaveLength(1);
    expect(win.document.getElementById("palette-results").innerHTML).toContain("Pringles");
  });

  test("filtering by brand shows matching items only", () => {
    const win = createWindow();
    win.togglePalette(true);

    const input = win.document.getElementById("palette-input");
    input.value = "coffee";
    input.dispatchEvent(new win.Event("input", { bubbles: true }));

    const items = win.document.querySelectorAll(".palette-item");
    expect(items).toHaveLength(1);
    expect(win.document.getElementById("palette-results").innerHTML).toContain("Nescafe");
  });

  test("clearing the search restores trending display", () => {
    const win = createWindow();
    win.togglePalette(true);

    const input = win.document.getElementById("palette-input");
    // Filter down to one item
    input.value = "pringles";
    input.dispatchEvent(new win.Event("input", { bubbles: true }));
    // Clear
    input.value = "";
    input.dispatchEvent(new win.Event("input", { bubbles: true }));

    const items = win.document.querySelectorAll(".palette-item");
    // All 5 mock products should show as trending
    expect(items.length).toBe(MOCK_PRODUCTS.length);
  });

  test("a search with no matches produces no palette items", () => {
    const win = createWindow();
    win.togglePalette(true);

    const input = win.document.getElementById("palette-input");
    input.value = "xyznonexistentproduct";
    input.dispatchEvent(new win.Event("input", { bubbles: true }));

    expect(win.document.querySelectorAll(".palette-item")).toHaveLength(0);
  });
});

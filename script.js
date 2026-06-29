const bar = document.getElementById("bar");
const close = document.getElementById("close");
const nav = document.getElementById("navbar");

if (bar) {
  bar.addEventListener("click", () => {
    nav.classList.add("active");
  });
}

if (close) {
  close.addEventListener("click", () => {
    nav.classList.remove("active");
  });
}

const themeToggle = document.getElementById("theme-toggle");
const body = document.body;

const currentTheme = localStorage.getItem("theme") || "light";
body.setAttribute("data-theme", currentTheme);

updateThemeIcon();

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const currentTheme = body.getAttribute("data-theme");
    const newTheme = currentTheme === "light" ? "dark" : "light";

    body.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
    updateThemeIcon();
  });
}

function updateThemeIcon() {
  if (!themeToggle) return;
  const icon = themeToggle.querySelector("i");
  if (!icon) return;
  const currentTheme = body.getAttribute("data-theme");

  if (currentTheme === "dark") {
    icon.className = "fas fa-sun";
  } else {
    icon.className = "fas fa-moon";
  }
}



document.addEventListener("DOMContentLoaded", () => {

  const observerOptions = {
    root: null,
    rootMargin: "0px",
    threshold: 0.1,
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");

        const staggerChildren = entry.target.querySelectorAll(".stagger");
        staggerChildren.forEach((child, index) => {
          child.style.animationDelay = `${index * 0.1}s`;
          child.classList.add("animate-fade-up");
        });
      }
    });
  }, observerOptions);

  const animatedElements = document.querySelectorAll(".scroll-animate");
  animatedElements.forEach((el) => observer.observe(el));

  const featureBoxes = document.querySelectorAll("#feature .fe-box");
  featureBoxes.forEach((box, index) => {
    box.style.animationDelay = `${index * 0.1}s`;
    box.classList.add("animate-fade-up");
  });

  const productElements = document.querySelectorAll(".pro");
  productElements.forEach((product, index) => {
    product.style.animationDelay = `${index * 0.05}s`;
    product.classList.add("animate-fade-up");
  });


  const sections = document.querySelectorAll("section");
  sections.forEach((section, index) => {
    section.style.animationDelay = `${index * 0.1}s`;
    section.classList.add("animate-fade-in");
  });


  const hero = document.getElementById("hero");
  if (hero) {
    window.addEventListener("scroll", () => {
      const scrolled = window.pageYOffset;
      const heroHeight = hero.offsetHeight;
      if (scrolled < heroHeight) {
        hero.style.backgroundPositionY = `${scrolled * 0.5}px`;
      }
    });
  }


 document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute("href"));
      if (target) {
        target.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    });
  });


  document.body.classList.add("page-loaded");
});


document.querySelectorAll("button").forEach((button) => {
  button.addEventListener("click", function (e) {
    const ripple = document.createElement("span");
    const rect = this.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;

    ripple.style.cssText = `
      position: absolute;
      width: ${size}px;
      height: ${size}px;
      left: ${x}px;
      top: ${y}px;
      background: rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      transform: scale(0);
      animation: ripple 0.6s ease-out;
      pointer-events: none;
    `;

    this.style.position = "relative";
    this.style.overflow = "hidden";
    this.appendChild(ripple);

    setTimeout(() => ripple.remove(), 600);
  });
});

// Command Palette Functionality
const palette = document.getElementById("command-palette");
const paletteInput = document.getElementById("palette-input");
const paletteResults = document.getElementById("palette-results");

let selectedIndex = -1;
let filteredProducts = [];

function togglePalette(show) {
  if (!palette || !paletteInput || !paletteResults) return;
  if (show) {
    palette.classList.add("active");
    paletteInput.focus();
    displayTrending();
  } else {
    palette.classList.remove("active");
    paletteInput.value = "";
    paletteResults.innerHTML = "";
    selectedIndex = -1;
  }
}

function displayTrending() {
  if (typeof products === "undefined") return;
  const trending = products.slice(0, 5); // Just show first 5 as trending
  renderResults(trending, "Trending Products");
}

function renderResults(items, title) {
  if (!paletteResults) return;
  filteredProducts = items;
  paletteResults.innerHTML = `
    <div class="palette-section-title">${title}</div>
    ${items
      .map(
        (item, index) => `
      <div class="palette-item ${index === selectedIndex ? "selected" : ""}" onclick="viewProduct(${item.id})">
        <img src="${item.image}" alt="${item.name}">
        <div class="palette-item-info">
          <div class="palette-item-name">${item.name}</div>
          <div class="palette-item-category">${item.category}</div>
        </div>
        <div class="palette-item-price">UGX ${item.price.toLocaleString()}</div>
      </div>
    `
      )
      .join("")}
  `;
}

if (paletteInput) {
  paletteInput.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase();
    if (!query) {
      displayTrending();
      return;
    }

    if (typeof products !== "undefined") {
      const matches = products
        .filter(
          (p) =>
            p.name.toLowerCase().includes(query) ||
            p.brand.toLowerCase().includes(query) ||
            p.category.toLowerCase().includes(query)
        )
        .slice(0, 8);
      renderResults(matches, "Search Results");
    }
  });

  paletteInput.addEventListener("keydown", (e) => {
    const items = paletteResults.querySelectorAll(".palette-item");
    if (!items.length && ["ArrowDown", "ArrowUp", "Enter"].includes(e.key)) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % items.length;
      updateSelection(items);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + items.length) % items.length;
      updateSelection(items);
    } else if (e.key === "Enter") {
      if (selectedIndex >= 0 && filteredProducts[selectedIndex]) {
        viewProduct(filteredProducts[selectedIndex].id);
      }
    } else if (e.key === "Escape") {
      togglePalette(false);
    }
  });
}

function updateSelection(items) {
  items.forEach((item, index) => {
    item.classList.toggle("selected", index === selectedIndex);
    if (index === selectedIndex) {
      item.scrollIntoView({ block: "nearest" });
    }
  });
}

window.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "k") {
    if (!palette) return;
    e.preventDefault();
    const isActive = palette.classList.contains("active");
    togglePalette(!isActive);
  }
});

if (palette) {
  palette.addEventListener("click", (e) => {
    if (e.target === palette) {
      togglePalette(false);
    }
  });
}

// Add selection style if not in CSS
if (!document.getElementById("palette-selection-style")) {
  const style = document.createElement("style");
  style.id = "palette-selection-style";
  style.textContent = `
    .palette-item.selected {
      background: rgba(8, 129, 120, 0.15) !important;
      border-left: 4px solid var(--accent-color);
    }
  `;
  document.head.appendChild(style);
}

// Ripple animation keyframes
const rippleStyle = document.createElement("style");
rippleStyle.textContent = `
  @keyframes ripple {
    to {
      transform: scale(4);
      opacity: 0;
    }
  }
`;
document.head.appendChild(rippleStyle);
// Product utility functions
function getProductById(id) {
  if (typeof products === "undefined") return null;
  return products.find((p) => p.id === parseInt(id));
}

function viewProduct(productId) {
  localStorage.setItem("selectedProductId", productId);
  window.location.href = "sproduct.html";
}

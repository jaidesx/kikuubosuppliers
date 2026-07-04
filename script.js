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

const installUi = createInstallUi();
let deferredInstallPrompt = null;
let installFallbackTimer = null;
const installBannerDismissedKey = "kikuuboInstallBannerDismissed";

function isStandaloneApp() {
  return (
    (typeof window.matchMedia === "function" &&
      window.matchMedia("(display-mode: standalone)").matches) ||
    window.navigator.standalone === true
  );
}

function createInstallUi() {
  const navbarButton = createInstallAppButton();
  const mobileButton = createMobileInstallButton();
  const banner = createInstallBanner();

  return {
    navbarButton,
    mobileButton,
    banner,
    buttons: [navbarButton, mobileButton, banner ? banner.querySelector(".pwa-install-button") : null].filter(Boolean),
    bannerText: banner ? banner.querySelector(".pwa-install-copy") : null,
    bannerFallback: banner ? banner.querySelector(".pwa-install-fallback") : null,
    dismissButton: banner ? banner.querySelector(".pwa-install-dismiss") : null,
  };
}

function createInstallAppButton() {
  const navbar = document.getElementById("navbar");
  const closeLink = document.getElementById("close");

  if (!navbar || document.getElementById("install-app-button")) {
    return document.getElementById("install-app-button");
  }

  const item = document.createElement("li");
  item.className = "install-app-item";

  const button = document.createElement("button");
  button.id = "install-app-button";
  button.className = "install-app-button pwa-install-button";
  button.type = "button";
  button.hidden = true;
  button.setAttribute("aria-label", "Install Kikuubo Suppliers app");
  button.innerHTML = '<i class="fas fa-download" aria-hidden="true"></i><span>Install App</span>';

  item.appendChild(button);

  if (closeLink && closeLink.parentElement && closeLink.parentElement.parentElement === navbar) {
    navbar.insertBefore(item, closeLink.parentElement);
  } else {
    navbar.appendChild(item);
  }

  return button;
}

function createMobileInstallButton() {
  const mobileControls = document.getElementById("mobile");
  const mobileMenuButton = document.getElementById("bar");

  if (!mobileControls || document.getElementById("mobile-install-button")) {
    return document.getElementById("mobile-install-button");
  }

  const button = document.createElement("button");
  button.id = "mobile-install-button";
  button.className = "mobile-install-button pwa-install-button";
  button.type = "button";
  button.hidden = true;
  button.setAttribute("aria-label", "Install Kikuubo Suppliers");
  button.setAttribute("title", "Install App");
  button.innerHTML = '<i class="fas fa-download" aria-hidden="true"></i>';

  if (mobileMenuButton) {
    mobileControls.insertBefore(button, mobileMenuButton);
  } else {
    mobileControls.appendChild(button);
  }

  return button;
}

function createInstallBanner() {
  if (document.getElementById("pwa-install-banner")) {
    return document.getElementById("pwa-install-banner");
  }

  const banner = document.createElement("section");
  banner.id = "pwa-install-banner";
  banner.className = "pwa-install-banner";
  banner.hidden = true;
  banner.setAttribute("aria-label", "Install Kikuubo Suppliers app");
  banner.innerHTML = `
    <div class="pwa-install-copy">
      <strong>Install Kikuubo Suppliers</strong>
      <span>Access the shop quickly from your phone.</span>
    </div>
    <p class="pwa-install-fallback" hidden>To install this app, open the Chrome menu, select Add to home screen, then Install.</p>
    <div class="pwa-install-actions">
      <button class="pwa-install-button install-app-button" type="button">
        <i class="fas fa-download" aria-hidden="true"></i><span>Install App</span>
      </button>
      <button class="pwa-install-dismiss" type="button" aria-label="Dismiss install app prompt">
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    </div>
  `;

  const header = document.getElementById("header");
  if (header && header.parentNode) {
    header.parentNode.insertBefore(banner, header.nextSibling);
  } else {
    document.body.insertBefore(banner, document.body.firstChild);
  }

  return banner;
}

function isMobileInstallSurface() {
  return (
    typeof window.matchMedia !== "function" ||
    window.matchMedia("(max-width: 799px)").matches
  );
}

function isInstallBannerDismissed() {
  try {
    return sessionStorage.getItem(installBannerDismissedKey) === "true";
  } catch (error) {
    return false;
  }
}

function setInstallBannerDismissed() {
  try {
    sessionStorage.setItem(installBannerDismissedKey, "true");
  } catch (error) {
    // Ignore storage errors; dismissal is a convenience only.
  }
}

function showInstallUi(options = {}) {
  const fallback = options.fallback === true;
  const forceBanner = options.forceBanner === true;

  if (isStandaloneApp()) {
    hideInstallUi();
    return;
  }

  if (installUi.navbarButton && !fallback) {
    installUi.navbarButton.hidden = false;
  }

  if (installUi.mobileButton && isMobileInstallSurface()) {
    installUi.mobileButton.hidden = false;
    installUi.mobileButton.classList.toggle("pwa-install-unavailable", fallback);
  }

  if (installUi.banner && isMobileInstallSurface() && (forceBanner || !isInstallBannerDismissed())) {
    installUi.banner.hidden = false;
    installUi.banner.classList.toggle("fallback", fallback);

    if (installUi.bannerText) {
      installUi.bannerText.hidden = fallback;
    }

    if (installUi.bannerFallback) {
      installUi.bannerFallback.hidden = !fallback;
    }

    const bannerButton = installUi.banner.querySelector(".pwa-install-button");
    if (bannerButton) {
      bannerButton.hidden = fallback;
    }
  }
}

function hideInstallUi() {
  if (installUi.banner) {
    installUi.banner.hidden = true;
  }

  installUi.buttons.forEach((button) => {
    button.hidden = true;
  });
}

async function installApp() {
  if (!deferredInstallPrompt) {
    showInstallUi({ fallback: true, forceBanner: true });
    return;
  }

  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  hideInstallUi();
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).catch((error) => {
      console.warn("Service worker registration failed:", error);
    });
  });
}

if (isStandaloneApp()) {
  hideInstallUi();
} else if (isMobileInstallSurface()) {
  installFallbackTimer = window.setTimeout(() => {
    if (!deferredInstallPrompt) {
      showInstallUi({ fallback: true });
    }
  }, 3500);
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  if (installFallbackTimer) {
    window.clearTimeout(installFallbackTimer);
    installFallbackTimer = null;
  }
  showInstallUi();
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  hideInstallUi();
});

installUi.buttons.forEach((button) => {
  button.addEventListener("click", installApp);
});

if (installUi.dismissButton) {
  installUi.dismissButton.addEventListener("click", () => {
    setInstallBannerDismissed();
    if (installUi.banner) {
      installUi.banner.hidden = true;
    }
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

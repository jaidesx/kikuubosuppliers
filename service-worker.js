const CACHE_PREFIX = "kikuubo-suppliers";
const STATIC_CACHE = `${CACHE_PREFIX}-static-v1`;
const OFFLINE_URL = "/offline.html";

const PRECACHE_URLS = [
  OFFLINE_URL,
  "/manifest.json",
  "/style.css",
  "/modern-header.css",
  "/script.js",
  "/cart.js",
  "/image/logo.webp",
  "/image/logo.png",
  "/image/icon.png",
  "/image/app-icon-192.png",
  "/image/app-icon-512.png"
];

const SENSITIVE_PATHS = [
  "/api/",
  "/auth/",
  "/login",
  "/logout",
  "/admin",
  "/account",
  "/accounts",
  "/dashboard",
  "/checkout",
  "/session",
  "/token",
  "/jwt"
];

const STATIC_EXTENSIONS = [
  ".css",
  ".js",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".svg",
  ".ico",
  ".woff",
  ".woff2",
  ".json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith(CACHE_PREFIX) && cacheName !== STATIC_CACHE)
          .map((cacheName) => caches.delete(cacheName))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin || isSensitivePath(url.pathname)) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});

function isSensitivePath(pathname) {
  const normalized = pathname.toLowerCase();
  return SENSITIVE_PATHS.some((path) => normalized.startsWith(path));
}

function isStaticAsset(pathname) {
  const normalized = pathname.toLowerCase();
  return STATIC_EXTENSIONS.some((extension) => normalized.endsWith(extension));
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);

  if (cached) {
    return cached;
  }

  const response = await fetch(request);

  if (response && response.ok && response.type === "basic") {
    cache.put(request, response.clone());
  }

  return response;
}

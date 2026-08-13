// Service worker registration for the app shell (frontend/web). Split out from
// app.js because app.js is owned by another agent - this file's only job is
// registration, safe to load on all six pages regardless of what else runs there.

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/frontend/web/sw.js").catch(() => {});
}

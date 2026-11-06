// Service worker mínimo: existe para o navegador oferecer "Instalar o app".
// Não guarda cache: toda requisição vai para a rede, então a tela nunca mostra
// agendamento antigo.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", event => {
  event.respondWith(fetch(event.request));
});

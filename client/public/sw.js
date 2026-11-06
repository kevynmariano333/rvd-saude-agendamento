// Service worker: instala o app, recebe o aviso da portaria e atualiza o número
// do ícone. Não guarda cache: toda requisição vai para a rede, então a tela
// nunca mostra agendamento antigo.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", event => {
  event.respondWith(fetch(event.request));
});

self.addEventListener("push", event => {
  let dados = {};
  try {
    dados = event.data ? event.data.json() : {};
  } catch {
    dados = {};
  }
  const titulo = dados.titulo || "RVDlog+";
  const corpo = dados.corpo || "Nova solicitação da portaria.";
  const numeroDoIcone = typeof dados.contagem === "number" && self.navigator && self.navigator.setAppBadge ? self.navigator.setAppBadge(dados.contagem) : null;
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(titulo, {
        body: corpo,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: "solicitacao-portaria",
        renotify: true,
        data: { url: dados.url || "/" },
      }),
      numeroDoIcone,
    ]),
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(janelas => {
      const aberta = janelas.find(janela => "focus" in janela);
      if (aberta) {
        aberta.navigate(url).catch(() => undefined);
        return aberta.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});

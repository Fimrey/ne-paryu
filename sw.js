// Кладём приложение в кэш при установке — дальше интернет не нужен совсем
const CACHE = 'neparyu-v3';
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Сначала кэш, сеть — только как запасной вариант.
// Чужие домены (вход через Google, Диск) не трогаем вообще.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request).then(hit =>
      hit || fetch(e.request).catch(() =>
        e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()
      )
    )
  );
});

/* ============================================================
   ФОНОВАЯ ПРОВЕРКА РУБЕЖЕЙ
   Система сама решает, когда дать нам поработать (не чаще раза в 6 часов).
   ============================================================ */
const DAY = 86400, HOUR = 3600;

const MILESTONES = [
  {t:2*HOUR,  at:'2 часа',    h:'Пульс и давление свои'},
  {t:12*HOUR, at:'12 часов',  h:'Никотина в крови почти нет'},
  {t:24*HOUR, at:'1 сутки',   h:'Первые сутки взяты'},
  {t:3*DAY,   at:'3 суток',   h:'Пик тяги пройден'},
  {t:5*DAY,   at:'5 суток',   h:'Горло и рот пришли в норму'},
  {t:7*DAY,   at:'1 неделя',  h:'Сон выравнивается'},
  {t:14*DAY,  at:'2 недели',  h:'Тяга стала редкой'},
  {t:21*DAY,  at:'3 недели',  h:'Вкус и запах острее'},
  {t:30*DAY,  at:'1 месяц',   h:'Дыхание чище'},
  {t:90*DAY,  at:'3 месяца',  h:'Рецепторы вернулись к норме'},
  {t:180*DAY, at:'6 месяцев', h:'Настроение без подпитки'},
  {t:365*DAY, at:'1 год',     h:'Год без пара'}
];

function idb(mode, fn){
  return new Promise((res, rej) => {
    const r = indexedDB.open('neparyu', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onerror = () => rej(r.error);
    r.onsuccess = () => {
      const db = r.result;
      const store = db.transaction('kv', mode).objectStore('kv');
      const rq = fn(store);
      rq.onsuccess = () => { res(rq.result); db.close(); };
      rq.onerror = () => { rej(rq.error); db.close(); };
    };
  });
}

async function checkMilestones(){
  let state;
  try{ state = await idb('readonly', s => s.get('state')); }catch(e){ return; }
  if (!state || !state.quit || !state.notify) return;

  const sec = (Date.now() - state.quit) / 1000;
  const seen = state.notified || [];
  const fresh = [];
  MILESTONES.forEach((m, i) => { if (sec >= m.t && seen.indexOf(i) === -1) fresh.push(i); });
  if (!fresh.length) return;

  state.notified = seen.concat(fresh);
  try{ await idb('readwrite', s => s.put(state, 'state')); }catch(e){}

  for (const i of fresh){
    const m = MILESTONES[i];
    await self.registration.showNotification('Рубеж пройден: ' + m.at, {
      body: m.h,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      tag: 'neparyu-ms-' + i,
      vibrate: [80, 40, 80]
    });
  }
}

self.addEventListener('periodicsync', e => {
  if (e.tag === 'neparyu-milestones') e.waitUntil(checkMilestones());
});

self.addEventListener('sync', e => {
  if (e.tag === 'neparyu-milestones') e.waitUntil(checkMilestones());
});

// тап по уведомлению открывает приложение, а не новую вкладку
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(list => {
      for (const c of list){ if ('focus' in c) return c.focus(); }
      return self.clients.openWindow('./index.html');
    })
  );
});

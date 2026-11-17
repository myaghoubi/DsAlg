/* لایه‌ی فعال‌سازی برنامه: نگهداری شناسه‌ی دستگاه، کدهای فعال‌سازی، کدهای زمانی و تصمیم‌گیری دسترسی.
   همه‌ی کدهای ذخیره‌شده در هر بار اجرا دوباره «امضا + دستگاه + انقضا» بررسی می‌شوند؛
   پس دست‌کاری حافظه‌ی مرورگر (localStorage / IndexedDB) هیچ دسترسی‌ای نمی‌سازد. */
(function () {
'use strict';
const L = window.LicCore, COURSES = window.COURSES, KEY = 'ds_lic1';
const subs = [];
let S = { secrets: {}, codes: [], grants: [], hw: 0 };     /* وضعیت ذخیره‌شده */
let rbSeq = 0, mv = [];
let acts = [];            /* فعال‌سازی‌های معتبر: {raw, role, courses, exp, teacher:{key,cert,certSig}} */
let grs = [];             /* کدهای زمانی معتبر: {raw, course, topic, startMs, endMs} */
const ids = {}, tags = {};
let devPub = null, hwSaved = 0, skewed = false;
const SKEW = 2 * 60000;   /* تحمل اختلاف ساعت دستگاه‌ها پیش از شروع */

/* ---------- زمان قابل اعتماد: هرگز به عقب نمی‌رود (جلوگیری از عقب‌بردن ساعت دستگاه) ---------- */
function now() {
  const t = Date.now();
  if (t > S.hw) { S.hw = t; if (t - hwSaved > 30000) { hwSaved = t; save(); } }
  else if (S.hw - t > 3 * 60000) skewed = true;
  return Math.max(t, S.hw);
}

/* ---------- ذخیره‌سازی (localStorage + آینه در IndexedDB) ---------- */
function idb() {
  return new Promise((res) => {
    try {
      const r = indexedDB.open('ds_lic', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result); r.onerror = () => res(null); r.onblocked = () => res(null);
    } catch (e) { res(null); }
  });
}
const idbGet = (db) => new Promise((res) => { if (!db) return res(null); try { const q = db.transaction('kv').objectStore('kv').get('s'); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); } catch (e) { res(null); } });
let DB = null;
/* ادغام وضعیت ذخیره‌شده (که ممکن است تب/صفحه‌ی دیگری نوشته باشد) با وضعیت حافظه: هیچ کد یا دسترسی‌ای گم نمی‌شود */
function mergeIn(o) {
  if (!o) return false;
  let ch = false;
  Object.keys(o.secrets || {}).forEach((k) => { if (!S.secrets[k]) { S.secrets[k] = o.secrets[k]; ch = true; } });
  (o.codes || []).forEach((c) => { if (!S.codes.includes(c)) { S.codes.push(c); ch = true; } });
  (o.grants || []).forEach((g) => {
    if (!g || !g.raw) return;
    const x = S.grants.find((y) => y && y.raw === g.raw);
    if (!x) { S.grants.push(g); ch = true; return; }
    if (g.at < x.at) { x.at = g.at; ch = true; }
    const gr = g.rev || 0, xr = x.rev || 0;          /* rev: شماره‌ی نسخه‌ی وضعیت «منتقل‌شده»؛ نسخه‌ی بالاتر برنده است */
    if (gr > xr) { x.rev = gr; if (g.moved) x.moved = g.moved; else delete x.moved; ch = true; }
    else if (gr === xr && g.moved && !x.moved) { x.moved = g.moved; ch = true; }
  });
  if ((o.hw || 0) > S.hw) { S.hw = o.hw; ch = true; }
  return ch;
}
function readLS() { try { return parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
function save() {
  mergeIn(readLS());
  const j = JSON.stringify(S);
  try { localStorage.setItem(KEY, j); } catch (e) { /* ignore */ }
  try { if (DB) DB.transaction('kv', 'readwrite').objectStore('kv').put(j, 's'); } catch (e) { /* ignore */ }
}
const parse = (j) => { try { const o = JSON.parse(j); return o && typeof o === 'object' ? o : null; } catch (e) { return null; } };
const uniq = (a) => Array.from(new Set(a));

/* ---------- ساخت وضعیت از کدهای ذخیره‌شده ---------- */
async function rebuild() {
  const my = ++rbSeq;
  const t = now();
  const ctx = { devPub, tags, now: t };
  const na = [], ng = [], nm = [];
  for (const raw of S.codes.slice()) {
    const r = await L.readActivation(raw, ctx);
    if (!r.ok) continue;
    const a = { raw, role: r.role, courses: r.courses, exp: r.exp, teacher: null };
    if (r.teacher) { try { a.teacher = { key: await L.teacherKey(r.teacher), cert: r.teacher.cert, certSig: r.teacher.certSig }; r.teacher.d.fill(0); } catch (e) { continue; } }
    na.push(a);
  }
  for (const g of S.grants.slice()) {
    if (!g || typeof g !== 'object' || !g.raw) continue;
    const r = await L.readTimeToken(g.raw, { devPub, now: t });
    if (!r.ok) continue;
    /* لحظه‌ی ورود کد باید در مهلتِ خودِ کد باشد (دست‌کاری ذخیره‌سازی نمی‌تواند آن را جلو ببرد) */
    const at = Math.min(Math.max(+g.at || 0, r.startMs - SKEW), r.codeEndMs);
    const end = at + r.accessMs;
    if (t >= end) continue;
    if (g.moved) nm.push({ raw: g.raw, course: r.course, topic: r.topic, at, endMs: end, link: g.moved.link, ts: g.moved.ts });
    else ng.push({ raw: g.raw, course: r.course, topic: r.topic, startMs: at, at, endMs: end });
  }
  if (my !== rbSeq) return;          /* بازسازیِ تازه‌تری شروع شده است؛ نتیجه‌ی کهنه را کنار بگذار */
  acts = na; grs = ng; mv = nm;
}
function fire() { subs.forEach((f) => { try { f(); } catch (e) { /* ignore */ } }); }

/* ---------- پرسش دسترسی ---------- */
function info(idx) {
  const t = now();
  let best = null;
  acts.forEach((a) => {
    if (!a.courses.includes(idx) || (a.exp && t >= a.exp)) return;
    if (!best || a.role > best.role || (a.role === best.role && (!a.exp || a.exp > best.exp) && best.exp)) best = a;
  });
  return best ? { active: true, role: best.role, exp: best.exp } : { active: false, role: null, exp: 0 };
}
const isTeacher = (idx) => { const i = info(idx); return i.active && i.role === 1; };
function topicOf(topicId) {
  for (const c of COURSES) { const ti = c.topics.indexOf(topicId); if (ti >= 0) return { course: c, ti }; }
  return null;
}
function grantEnd(idx, topicId) {
  const tp = topicOf(topicId), t = now();
  if (!tp || tp.course.idx !== idx) return 0;
  let e = 0; grs.forEach((g) => { if (g.course === idx && g.topic === tp.ti && t < g.endMs && g.endMs > e) e = g.endMs; });
  return e;
}
const can = (idx, topicId) => info(idx).active || grantEnd(idx, topicId) > 0;

/* ---------- فرمان‌ها ---------- */
async function activate(text) {
  await ready;
  const raw = String(text || '').trim().replace(/\s+/g, '');
  if (!raw) return { ok: false, msg: 'کد فعال‌سازی را وارد کنید.' };
  const r = await L.readActivation(raw, { devPub, tags, now: now() });
  if (!r.ok) return r;
  if (r.teacher) r.teacher.d.fill(0);
  if (!S.codes.includes(raw)) S.codes.push(raw);
  save(); await rebuild(); fire();
  return { ok: true, role: r.role, courses: r.courses, exp: r.exp };
}
async function redeem(text) {
  await ready;
  const t = now();
  const r = await L.readTimeToken(String(text || '').trim(), { devPub, now: t });
  if (!r.ok) return r;
  const hm = (ms) => new Date(ms).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const info = ' (کد ساعت ' + hm(r.startMs) + ' صادر شده و تا ' + hm(r.codeEndMs) + ' معتبر بود؛ ساعت این دستگاه ' + hm(t) + ' است.)';
  if (t >= r.codeEndMs) return { ok: false, msg: 'مهلت خودِ کد (حداکثر ۵ دقیقه) تمام شده است؛ از استاد کد تازه بخواهید و سریع وارد کنید. اگر تازه صادر شده، ساعت این دستگاه جلوتر از ساعت استاد است و باید اصلاح شود.' + info };
  if (t < r.startMs - SKEW) return { ok: false, msg: 'ساعت این دستگاه بیش از ۲ دقیقه عقب‌تر از ساعت صدور کد است؛ ساعت دستگاه را (روی «خودکار») اصلاح کنید.' + info };
  const raw = 'DST1-' + String(text).trim().replace(/^.*?(DST1-|tc=)/, '').replace(/^DST1-/, '');
  let g = S.grants.find((x) => x && x.raw === raw);
  if (g && g.moved) return { ok: false, msg: 'اعتبار این مبحث به دستگاه دیگری منتقل شده است و روی این دستگاه دوباره باز نمی‌شود.' };
  if (!g) { g = { raw, at: t }; S.grants.push(g); }      /* ورود دوباره‌ی همان کد، مهلت را تمدید نمی‌کند */
  S.grants = S.grants.slice(-40);
  save(); await rebuild(); fire();
  const c = COURSES[r.course];
  return { ok: true, course: r.course, topicId: c && c.topics[r.topic], endMs: Math.min(Math.max(g.at, r.startMs - SKEW), r.codeEndMs) + r.accessMs };
}
/* ---------- انتقال اعتبار یک مبحث به دستگاه دیگر ---------- */
const TR_WINDOW = 15 * 60000;       /* مهلت اسکن پیوند انتقال */
async function makeTransfer(topicId, again) {
  await ready;
  const tp = topicOf(topicId); if (!tp) throw new Error('مبحث نامعتبر');
  await rebuild();
  const t = now();
  const pool = (again ? mv : grs).filter((g) => g.course === tp.course.idx && g.topic === tp.ti && t < g.endMs);
  const cand = pool.sort((a, b) => b.endMs - a.endMs)[0];
  if (!cand) throw new Error('برای این مبحث اعتبار موقتِ قابل انتقال وجود ندارد.');
  const tail = cand.raw.replace(/^DST1-/, '');
  const link = location.origin + location.pathname + '#tr=' + tail + '.' + Math.floor(cand.at / 1000).toString(36) + '.' + Math.floor(t / 1000).toString(36);
  S.grants.forEach((g) => { if (g && g.raw) { const r = grs.concat(mv).find((x) => x.raw === g.raw); if (r && r.course === cand.course && r.topic === cand.topic) { g.moved = { link, ts: t }; g.rev = (g.rev || 0); } } });
  save(); await rebuild(); fire();
  return { link, endMs: cand.endMs, ts: t };
}
async function acceptTransfer(text) {
  await ready;
  const t = now();
  const m = String(text || '').trim().replace(/^.*?tr=/, '').split('.');
  if (m.length !== 3 || !m[0] || !/^[0-9a-z]+$/.test(m[1]) || !/^[0-9a-z]+$/.test(m[2])) return { ok: false, msg: 'پیوند انتقال نادرست یا ناقص است.' };
  const raw = 'DST1-' + m[0];
  const r = await L.readTimeToken(raw, { devPub, now: t });
  if (!r.ok) return r;
  const atMs = parseInt(m[1], 36) * 1000, issued = parseInt(m[2], 36) * 1000;
  if (t > issued + TR_WINDOW) return { ok: false, msg: 'مهلت اسکن این QR انتقال (۱۵ دقیقه) تمام شده است؛ در دستگاه مبدأ دوباره «نمایش QR انتقال» را بزنید.' };
  if (t < issued - SKEW) return { ok: false, msg: 'ساعت این دستگاه عقب‌تر از ساعت دستگاه مبدأ است؛ ساعت را (روی «خودکار») اصلاح کنید.' };
  const at = Math.min(Math.max(atMs, r.startMs - SKEW), r.codeEndMs);
  const end = at + r.accessMs;
  if (t >= end) return { ok: false, msg: 'اعتبار این مبحث تمام شده است.' };
  let g = S.grants.find((x) => x && x.raw === raw);
  if (!g) { g = { raw, at }; S.grants.push(g); }
  else { g.at = Math.min(g.at, at); if (g.moved) { delete g.moved; g.rev = (g.rev || 0) + 1; } }
  S.grants = S.grants.slice(-40);
  save(); await rebuild(); fire();
  const c = COURSES[r.course];
  return { ok: true, course: r.course, topicId: c && c.topics[r.topic], endMs: end };
}
async function makeTimeCode(idx, topicId, codeMin, accessMin) {
  await ready;
  const tp = topicOf(topicId), t = now();
  if (!tp || tp.course.idx !== idx) throw new Error('مبحث نامعتبر');
  const a = acts.find((x) => x.teacher && x.courses.includes(idx) && (!x.exp || t < x.exp));
  if (!a) throw new Error('این دستگاه برای این درس به‌عنوان استاد فعال نشده است.');
  const startMin = Math.floor(t / 60000);
  const token = await L.makeTimeToken({ course: idx, topic: tp.ti, startMin, codeMin, accessMin, key: a.teacher.key, cert: a.teacher.cert, certSig: a.teacher.certSig });
  const url = location.origin + location.pathname + '#tc=' + token.slice(5);
  return { token, url, startMs: startMin * 60000, codeEndMs: startMin * 60000 + codeMin * 60000, accessMin };
}

/* ---------- راه‌اندازی ---------- */
const ready = (async () => {
  if (!window.crypto || !crypto.subtle) throw new Error('nocrypto');
  devPub = await L.importPub(L.unb64u(window.LICENSE_PUB));
  const ls = parse((function () { try { return localStorage.getItem(KEY); } catch (e) { return null; } })());
  DB = await idb();
  const db = parse(await idbGet(DB));
  [ls, db].forEach((o) => mergeIn(o));
  for (const c of COURSES) {
    if (!S.secrets[c.idx]) S.secrets[c.idx] = L.b64u(crypto.getRandomValues(new Uint8Array(16)));
    const r = await L.deviceId(L.unb64u(S.secrets[c.idx]), c);
    ids[c.idx] = r.id; tags[c.idx] = r.tag;
  }
  hwSaved = Date.now(); now(); save();
  await rebuild();
})();
ready.catch(() => { /* مرورگر بدون WebCrypto: همه‌چیز قفل می‌ماند */ });

/* تغییر ذخیره‌سازی از تب/پنجره‌ی دیگر: ادغام و بازسازی */
window.addEventListener('storage', (e) => {
  if (e.key !== KEY || !devPub) return;
  const o = sig2(); if (mergeIn(parse(e.newValue))) { save(); rebuild().then(() => { if (o !== sig2()) fire(); }); }
});
const sig2 = () => sig();
/* بازبینی دوره‌ای (پایان مهلت کدها) */
const sig = () => acts.map((x) => x.raw).join('|') + '#' + grs.map((x) => x.raw).join('|') + '#' + mv.map((x) => x.raw).join('|');
setInterval(() => { if (!devPub) return; const o = sig(); rebuild().then(() => { if (o !== sig()) fire(); }); }, 20000);

window.License = {
  ready, now, info, isTeacher, can, grantEnd, topicOf, activate, redeem, makeTimeCode, makeTransfer, acceptTransfer,
  moved: () => mv.filter((g) => now() < g.endMs).slice(),
  id: (idx) => ids[idx] || '…', get skewed() { return skewed; },
  grants: () => grs.filter((g) => now() < g.endMs).slice(),
  onChange: (f) => subs.push(f)
};
})();

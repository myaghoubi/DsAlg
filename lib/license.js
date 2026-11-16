/* لایه‌ی فعال‌سازی برنامه: نگهداری شناسه‌ی دستگاه، کدهای فعال‌سازی، کدهای زمانی و تصمیم‌گیری دسترسی.
   همه‌ی کدهای ذخیره‌شده در هر بار اجرا دوباره «امضا + دستگاه + انقضا» بررسی می‌شوند؛
   پس دست‌کاری حافظه‌ی مرورگر (localStorage / IndexedDB) هیچ دسترسی‌ای نمی‌سازد. */
(function () {
'use strict';
const L = window.LicCore, COURSES = window.COURSES, KEY = 'ds_lic1';
const subs = [];
let S = { secrets: {}, codes: [], grants: [], hw: 0 };     /* وضعیت ذخیره‌شده */
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
function save() {
  const j = JSON.stringify(S);
  try { localStorage.setItem(KEY, j); } catch (e) { /* ignore */ }
  try { if (DB) DB.transaction('kv', 'readwrite').objectStore('kv').put(j, 's'); } catch (e) { /* ignore */ }
}
const parse = (j) => { try { const o = JSON.parse(j); return o && typeof o === 'object' ? o : null; } catch (e) { return null; } };
const uniq = (a) => Array.from(new Set(a));

/* ---------- ساخت وضعیت از کدهای ذخیره‌شده ---------- */
async function rebuild() {
  const t = now();
  const ctx = { devPub, tags, now: t };
  const na = [], ng = [];
  for (const raw of S.codes) {
    const r = await L.readActivation(raw, ctx);
    if (!r.ok) continue;
    const a = { raw, role: r.role, courses: r.courses, exp: r.exp, teacher: null };
    if (r.teacher) { try { a.teacher = { key: await L.teacherKey(r.teacher), cert: r.teacher.cert, certSig: r.teacher.certSig }; r.teacher.d.fill(0); } catch (e) { continue; } }
    na.push(a);
  }
  for (const g of S.grants) {
    if (!g || typeof g !== 'object' || !g.raw) continue;
    const r = await L.readTimeToken(g.raw, { devPub, now: t });
    if (!r.ok) continue;
    /* لحظه‌ی ورود کد باید در مهلتِ خودِ کد باشد (دست‌کاری ذخیره‌سازی نمی‌تواند آن را جلو ببرد) */
    const at = Math.min(Math.max(+g.at || 0, r.startMs - SKEW), r.codeEndMs);
    const end = at + r.accessMs;
    if (t < end) ng.push({ raw: g.raw, course: r.course, topic: r.topic, startMs: at, endMs: end });
  }
  acts = na; grs = ng;
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
  if (t >= r.codeEndMs) return { ok: false, msg: 'مهلت خودِ این کد تمام شده است (کد زمانی فقط چند دقیقه معتبر است)؛ از استاد کد تازه بخواهید.' };
  if (t < r.startMs - SKEW) return { ok: false, msg: 'ساعت دستگاه شما با ساعت صدور کد اختلاف دارد؛ ساعت دستگاه را اصلاح کنید.' };
  const raw = 'DST1-' + String(text).trim().replace(/^.*?(DST1-|tc=)/, '').replace(/^DST1-/, '');
  let g = S.grants.find((x) => x && x.raw === raw);
  if (!g) { g = { raw, at: t }; S.grants.push(g); }      /* ورود دوباره‌ی همان کد، مهلت را تمدید نمی‌کند */
  S.grants = S.grants.slice(-40);
  save(); await rebuild(); fire();
  const c = COURSES[r.course];
  return { ok: true, course: r.course, topicId: c && c.topics[r.topic], endMs: Math.min(Math.max(g.at, r.startMs - SKEW), r.codeEndMs) + r.accessMs };
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
  [ls, db].forEach((o) => { if (!o) return;
    Object.keys(o.secrets || {}).forEach((k) => { if (!S.secrets[k]) S.secrets[k] = o.secrets[k]; });
    S.codes = uniq(S.codes.concat(o.codes || [])); (o.grants || []).forEach((g) => { if (g && g.raw) { const x = S.grants.find((y) => y.raw === g.raw); if (!x) S.grants.push(g); else if (g.at < x.at) x.at = g.at; } });
    S.hw = Math.max(S.hw, o.hw || 0);
  });
  for (const c of COURSES) {
    if (!S.secrets[c.idx]) S.secrets[c.idx] = L.b64u(crypto.getRandomValues(new Uint8Array(16)));
    const r = await L.deviceId(L.unb64u(S.secrets[c.idx]), c);
    ids[c.idx] = r.id; tags[c.idx] = r.tag;
  }
  hwSaved = Date.now(); now(); save();
  await rebuild();
})();
ready.catch(() => { /* مرورگر بدون WebCrypto: همه‌چیز قفل می‌ماند */ });

/* بازبینی دوره‌ای (پایان مهلت کدها) */
const sig = () => acts.map((x) => x.raw).join('|') + '#' + grs.map((x) => x.raw).join('|');
setInterval(() => { if (!devPub) return; const o = sig(); rebuild().then(() => { if (o !== sig()) fire(); }); }, 20000);

window.License = {
  ready, now, info, isTeacher, can, grantEnd, topicOf, activate, redeem, makeTimeCode,
  id: (idx) => ids[idx] || '…', get skewed() { return skewed; },
  grants: () => grs.filter((g) => now() < g.endMs).slice(),
  onChange: (f) => subs.push(f)
};
})();

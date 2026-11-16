/* هسته‌ی رمزنگاری سامانه‌ی فعال‌سازی (هم در برنامه و هم در ابزار توسعه‌دهنده استفاده می‌شود).
   - امضای ECDSA روی منحنی P-256 (کلید خصوصی فقط نزد توسعه‌دهنده؛ در برنامه فقط کلید عمومی است)
   - کد فعال‌سازی  = [محتوا + امضای توسعه‌دهنده] (+ برای استاد: گواهی و کلید امضای کد زمانی که رمز شده)
   - کد زمانی      = [محتوا + امضای استاد + گواهی استاد که توسعه‌دهنده امضا کرده]
   هیچ رازی روی دستگاه دانشجو نیست؛ پس با خواندن کد برنامه نمی‌توان کد ساخت. */
(function (root) {
  'use strict';
  const subtle = (root.crypto || {}).subtle;
  const enc = new TextEncoder(), dec = new TextDecoder();
  const EPOCH = Date.UTC(2020, 0, 1);
  const A32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';           /* الفبای شناسه (بدون حروف شبیه‌هم) */
  const MAGIC_ACT = 0xA1, MAGIC_CERT = 0xC1, MAGIC_TOK = 0xE1;

  /* ---------- ابزارهای بایت ---------- */
  const b64u = (u8) => { let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = (s) => {
    s = String(s).replace(/[\s‌‏‎]/g, '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const b = atob(s), u = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    return u;
  };
  const cat = (...a) => { let n = 0; a.forEach((x) => n += x.length); const o = new Uint8Array(n); let p = 0; a.forEach((x) => { o.set(x, p); p += x.length; }); return o; };
  const eq = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0; };
  const sha = async (u8) => new Uint8Array(await subtle.digest('SHA-256', u8));
  const dayOf = (ms) => Math.floor((ms - EPOCH) / 864e5);
  const msOfDay = (d) => EPOCH + d * 864e5;

  /* ---------- شناسه‌ی دستگاه برای هر درس ---------- */
  /* secret: ۱۶ بایت تصادفی ثابت روی دستگاه. خروجی: {id:'DSA-XXXX-XXXX-XXXX', tag:Uint8Array(8)} */
  async function deviceId(secret, course) {
    const h = await sha(cat(enc.encode('ds-id|' + course.id + '|'), secret));
    let bits = 0n; for (let i = 0; i < 8; i++) bits = (bits << 8n) | BigInt(h[i]);
    bits >>= 4n;                                            /* ۶۰ بیت */
    let s = ''; for (let i = 11; i >= 0; i--) s += A32[Number((bits >> BigInt(i * 5)) & 31n)];
    return fromIdChars(course, s);
  }
  function fromIdChars(course, s) {
    let bits = 0n; for (const ch of s) bits = (bits << 5n) | BigInt(A32.indexOf(ch));
    const tag = new Uint8Array(8); for (let i = 7; i >= 0; i--) { tag[i] = Number(bits & 255n); bits >>= 8n; }
    return { id: course.short + '-' + s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8, 12), tag };
  }
  /* تجزیه‌ی متن شناسه (توسعه‌دهنده) → {course, id, tag} یا null */
  function parseId(text, courses) {
    const t = String(text).toUpperCase().replace(/[^A-Z0-9-]/g, '');
    const m = /^([A-Z]{3})-?([A-Z2-9]{4})-?([A-Z2-9]{4})-?([A-Z2-9]{4})$/.exec(t);
    if (!m) return null;
    const c = courses.find((x) => x.short === m[1]);
    if (!c) return null;
    const r = fromIdChars(c, m[2] + m[3] + m[4]);
    return { course: c, id: r.id, tag: r.tag };
  }
  const findIds = (text, courses) => (String(text).toUpperCase().match(/[A-Z]{3}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}/g) || []).map((x) => parseId(x, courses)).filter(Boolean);

  /* ---------- کلیدها ---------- */
  const ALG = { name: 'ECDSA', namedCurve: 'P-256' }, SIG = { name: 'ECDSA', hash: 'SHA-256' };
  const importPub = (raw) => subtle.importKey('raw', raw, ALG, false, ['verify']);
  const importPriv = (jwk, extractable) => subtle.importKey('jwk', Object.assign({}, jwk, { ext: !!extractable, key_ops: ['sign'] }), ALG, !!extractable, ['sign']);
  const sign = async (priv, data) => new Uint8Array(await subtle.sign(SIG, priv, data));
  const verify = async (pub, data, sig) => { try { return await subtle.verify(SIG, pub, sig, data); } catch (e) { return false; } };
  async function genPair() {
    const kp = await subtle.generateKey(ALG, true, ['sign', 'verify']);
    const jwk = await subtle.exportKey('jwk', kp.privateKey);
    const pub = new Uint8Array(await subtle.exportKey('raw', kp.publicKey));
    return { jwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d }, pub };
  }
  async function tagsKey(tags) {                           /* کلید رمز کلید استاد: از شناسه‌های همین دستگاه */
    const k = await sha(cat(enc.encode('tk|'), ...tags));
    return subtle.importKey('raw', k, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }

  /* ---------- کد فعال‌سازی ---------- */
  /* opts: {role:0|1, entries:[{course, tag}], expiryDay (0=بدون انقضا), devPriv:CryptoKey, now} → رشته‌ی کد */
  async function makeActivation(opts) {
    const n = opts.entries.length;
    const head = new Uint8Array(7);
    head[0] = MAGIC_ACT; head[1] = opts.role; head[6] = n;
    const issued = dayOf(opts.now || Date.now()), exp = opts.expiryDay || 0;
    head[2] = issued >> 8; head[3] = issued & 255; head[4] = exp >> 8; head[5] = exp & 255;
    const ent = opts.entries.map((e) => cat(new Uint8Array([e.course.idx]), e.tag));
    let payload = cat(head, ...ent), parts = [], mask = 0;
    opts.entries.forEach((e) => mask |= 1 << e.course.idx);
    let tpub = null, tenc = null, cert = null, certSig = null;
    if (opts.role === 1) {
      const kp = await genPair();
      tpub = kp.pub;
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await tagsKey(opts.entries.map((e) => e.tag));
      const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, unb64u(kp.jwk.d)));
      tenc = cat(iv, ct);                                   /* ۱۲ + ۴۸ */
      cert = cat(new Uint8Array([MAGIC_CERT, mask, exp >> 8, exp & 255]), tpub);   /* ۶۹ بایت */
      certSig = await sign(opts.devPriv, cert);
      payload = cat(payload, tpub);
    }
    const sig = await sign(opts.devPriv, payload);
    return 'DSL1-' + b64u(role1(opts.role, payload, sig, tenc, certSig));
  }
  const role1 = (role, payload, sig, tenc, certSig) => role === 1 ? cat(payload, sig, tenc, certSig) : cat(payload, sig);

  /* بررسی کد فعال‌سازی روی این دستگاه.
     ctx: {devPub: CryptoKey, tags: {courseIdx: Uint8Array}, now: ms}
     خروجی: {ok, msg, role, courses:[idx], exp (ms|0), teacher?:{cert, certSig, pub, d(Uint8Array)}} */
  async function readActivation(text, ctx) {
    const bad = (msg) => ({ ok: false, msg });
    let u;
    try { u = unb64u(String(text).trim().replace(/^DSL1-/, '')); } catch (e) { return bad('قالب کد نادرست است.'); }
    if (u.length < 7 + 9 + 64 || u[0] !== MAGIC_ACT) return bad('قالب کد نادرست است.');
    const role = u[1], n = u[6];
    if (role > 1 || n < 1 || n > 8) return bad('قالب کد نادرست است.');
    const plen = 7 + n * 9 + (role === 1 ? 65 : 0);
    if (u.length !== plen + 64 + (role === 1 ? 60 + 64 : 0)) return bad('کد ناقص یا بیش‌ازحد طولانی است؛ دوباره کپی کنید.');
    const payload = u.slice(0, plen), sig = u.slice(plen, plen + 64);
    if (!(await verify(ctx.devPub, payload, sig))) return bad('امضای کد معتبر نیست.');
    const exp = (u[4] << 8) | u[5];
    const courses = [], tags = [];
    for (let i = 0; i < n; i++) {
      const o = 7 + i * 9, ci = u[o], tag = u.slice(o + 1, o + 9);
      const mine = ctx.tags[ci];
      if (!mine || !eq(mine, tag)) return bad('این کد برای این دستگاه (یا این درس) صادر نشده است.');
      courses.push(ci); tags.push(tag);
    }
    const expMs = exp ? msOfDay(exp) + 864e5 : 0;           /* تا پایان روز انقضا */
    if (expMs && ctx.now >= expMs) return bad('مهلت این کد فعال‌سازی تمام شده است.');
    const r = { ok: true, role, courses, exp: expMs };
    if (role === 1) {
      const tpub = u.slice(7 + n * 9, plen);
      const tenc = u.slice(plen + 64, plen + 64 + 60), certSig = u.slice(plen + 124);
      let mask = 0; courses.forEach((c) => mask |= 1 << c);
      const cert = cat(new Uint8Array([MAGIC_CERT, mask, exp >> 8, exp & 255]), tpub);
      if (!(await verify(ctx.devPub, cert, certSig))) return bad('گواهی استاد معتبر نیست.');
      try {
        const key = await tagsKey(tags);
        const d = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: tenc.slice(0, 12) }, key, tenc.slice(12)));
        r.teacher = { cert, certSig, pub: tpub, d };
      } catch (e) { return bad('رمزگشایی کلید استاد ممکن نشد.'); }
    }
    return r;
  }
  /* کلید امضای استاد (غیرقابل استخراج) از d و کلید عمومی */
  function teacherKey(t) {
    return importPriv({ kty: 'EC', crv: 'P-256', x: b64u(t.pub.slice(1, 33)), y: b64u(t.pub.slice(33, 65)), d: b64u(t.d) }, false);
  }

  /* ---------- کد زمانی ---------- */
  /* دو مهلت مستقل:
       codeMin   : مهلتِ «خودِ کد» برای واردکردن (۱ تا ۵ دقیقه از لحظه‌ی صدور)
       accessMin : مدتی که مبحث پس از وارد شدن کد برای دانشجو باز می‌ماند (تا یک سال)
     startMin: دقیقه از 1970 */
  const MAX_CODE_MIN = 5, MAX_ACCESS_MIN = 366 * 1440;
  async function makeTimeToken(t) {   /* t: {course, topic, startMin, codeMin, accessMin, key, cert, certSig} */
    if (t.codeMin < 1 || t.codeMin > MAX_CODE_MIN) throw new Error('codeMin');
    if (t.accessMin < 1 || t.accessMin > MAX_ACCESS_MIN) throw new Error('accessMin');
    const p = new Uint8Array(14), nonce = crypto.getRandomValues(new Uint8Array(2));
    p[0] = MAGIC_TOK; p[1] = t.course; p[2] = t.topic;
    p[3] = (t.startMin >>> 24) & 255; p[4] = (t.startMin >>> 16) & 255; p[5] = (t.startMin >>> 8) & 255; p[6] = t.startMin & 255;
    p[7] = t.codeMin;
    p[8] = (t.accessMin >>> 24) & 255; p[9] = (t.accessMin >>> 16) & 255; p[10] = (t.accessMin >>> 8) & 255; p[11] = t.accessMin & 255;
    p[12] = nonce[0]; p[13] = nonce[1];
    const s = await sign(t.key, p);
    return 'DST1-' + b64u(cat(p, s, t.cert, t.certSig));
  }
  /* ctx: {devPub, now} → {ok,msg,course,topic,startMs,codeEndMs,accessMs} */
  async function readTimeToken(text, ctx) {
    const bad = (msg) => ({ ok: false, msg });
    let u;
    try { u = unb64u(String(text).trim().replace(/^.*?(DST1-|tc=)/, '').replace(/^DST1-/, '')); } catch (e) { return bad('قالب کد زمانی نادرست، ناقص یا مربوط به نسخه‌ی دیگر برنامه است؛ برنامه را بروزرسانی کنید (دکمه‌ی ⟳ بالای صفحه) و پیوند را کامل کپی کنید.'); }
    if (u.length !== 14 + 64 + 69 + 64 || u[0] !== MAGIC_TOK || u[78] !== MAGIC_CERT) return bad('قالب کد زمانی نادرست، ناقص یا مربوط به نسخه‌ی دیگر برنامه است؛ برنامه را بروزرسانی کنید (دکمه‌ی ⟳ بالای صفحه) و پیوند را کامل کپی کنید.');
    const p = u.slice(0, 14), s = u.slice(14, 78), cert = u.slice(78, 147), certSig = u.slice(147);
    if (!(await verify(ctx.devPub, cert, certSig))) return bad('گواهی استاد در این کد معتبر نیست.');
    const tpub = await importPub(cert.slice(4));
    if (!(await verify(tpub, p, s))) return bad('امضای کد زمانی معتبر نیست.');
    const cexp = (cert[2] << 8) | cert[3];
    if (cexp && ctx.now >= msOfDay(cexp) + 864e5) return bad('مجوز استادِ صادرکننده‌ی این کد منقضی شده است.');
    if (!(cert[1] & (1 << p[1]))) return bad('استاد برای این درس مجوز ندارد.');
    const startMin = ((p[3] << 24) >>> 0) + (p[4] << 16) + (p[5] << 8) + p[6];
    const codeMin = p[7], accessMin = ((p[8] << 24) >>> 0) + (p[9] << 16) + (p[10] << 8) + p[11];
    if (codeMin < 1 || codeMin > MAX_CODE_MIN || accessMin < 1 || accessMin > MAX_ACCESS_MIN) return bad('مقادیر مهلت در این کد نامعتبر است.');
    const startMs = startMin * 6e4;
    return { ok: true, course: p[1], topic: p[2], startMs, codeEndMs: startMs + codeMin * 6e4, accessMs: accessMin * 6e4 };
  }

  root.LicCore = { b64u, unb64u, cat, sha, dayOf, msOfDay, deviceId, parseId, findIds, importPub, importPriv, genPair, makeActivation, readActivation, teacherKey, makeTimeToken, readTimeToken, EPOCH, MAX_CODE_MIN, MAX_ACCESS_MIN };
})(typeof window !== 'undefined' ? window : globalThis);

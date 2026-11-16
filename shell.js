/* پوسته‌ی برنامه: منوی اصلی، بارگذاری شبیه‌سازها (هر کدام یک فایل جدا)، toast، نصب PWA
   هر شبیه‌ساز فایلی در پوشه‌ی sims/ است که با Shell.register({...}) خودش را معرفی می‌کند:
     { id, title, subtitle, css, html, mount(view) → { destroy() } }
   برای افزودن شبیه‌ساز جدید: یک فایل در sims/ بسازید و آیتمی به MENU اضافه کنید. */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);

  /* ---------- ساختار منوی اصلی ---------- */
  const MENU = [
    {
      ci: 0, title: 'درس ساختمان داده‌ها و الگوریتم‌ها', icon: '📚', open: true,
      items: [
        { id: 'stack-queue', title: 'شبیه‌ساز صف و پشته', file: 'sims/stack-queue.js' },
        { id: 'graph-traversal', title: 'شبیه‌ساز پیمایش عمقی و سطحی گراف (DFS / BFS)', file: 'sims/graph-traversal.js', deps: ['lib/stepper.js'] },
        { id: 'avl', title: 'شبیه‌ساز درج و حذف در درخت AVL', file: 'sims/avl.js', deps: ['lib/stepper.js'] }
      ]
    },
    {
      ci: 1, title: 'نظریه‌ی زبان‌ها و ماشین‌ها', icon: '⚙️', open: true,
      items: [
        { id: 'pda', title: 'شبیه‌ساز ماشین پشته‌ای (PDA)', file: 'sims/pda.js', deps: ['lib/automata.js'] },
        { id: 'turing', title: 'شبیه‌ساز ماشین تورینگ', file: 'sims/turing.js', deps: ['lib/automata.js'] }
      ]
    },
    {
      title: 'فعال‌سازی', icon: '🔑', open: true,
      items: [
        { id: 'activation', title: 'فعال‌سازی دروس و کد زمانی', file: 'sims/activation.js', deps: ['lib/qr.js'] }
      ]
    },
    {
      title: 'درباره‌ی برنامه', icon: 'ℹ️', open: true,
      items: [
        { id: 'changelog', title: 'سابقه‌ی بروزرسانی‌ها', file: 'sims/changelog.js' }
      ]
    }
  ];
  const DEFAULT_ID = 'stack-queue';
  MENU.forEach((c) => c.items.forEach((it) => { if (c.ci !== undefined) it.ci = c.ci; }));   /* شماره‌ی درسِ هر مبحث (برای قفل) */
  const Lic = window.License;
  const licOK = (it) => it.ci === undefined || Lic.can(it.ci, it.id);

  const sims = {};            /* id → تعریفی که فایل شبیه‌ساز ثبت کرده */
  let current = null;         /* { id, def, inst, style } */
  let seq = 0;                /* برای نادیده گرفتن بارگذاری‌های قدیمی هنگام کلیک پشت‌سرهم */
  const view = $('#view');

  window.Shell = { register(def) { sims[def.id] = def; } };

  /* ---------- پیام کوتاه ---------- */
  let toastTimer = null;
  window.appToast = function (msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  };

  /* ---------- منو ---------- */
  const drawer = $('#drawer'), scrim = $('#scrim'), menuBtn = $('#menuBtn');

  function renderMenu() {
    const ul = $('#menu');
    ul.innerHTML = '';
    MENU.forEach((course, ci) => {
      const li = document.createElement('li');
      li.className = 'm-course' + (course.open ? ' open' : '');
      const head = document.createElement('button');
      head.className = 'm-head'; head.type = 'button';
      head.setAttribute('aria-expanded', course.open ? 'true' : 'false');
      let tag = '';
      if (course.ci !== undefined) { const i = Lic.info(course.ci); tag = i.active ? '<em class="lk ok">' + (i.role === 1 ? 'استاد' : 'فعال') + '</em>' : '<em class="lk">🔒</em>'; }
      head.innerHTML = '<span>' + course.icon + ' ' + course.title + '</span>' + tag + '<span class="chev" aria-hidden="true">▾</span>';
      const sub = document.createElement('ul');
      sub.className = 'm-sub'; sub.id = 'msub' + ci;
      head.setAttribute('aria-controls', sub.id);
      head.addEventListener('click', () => {
        const o = li.classList.toggle('open'); course.open = o;
        head.setAttribute('aria-expanded', o ? 'true' : 'false');
      });
      course.items.forEach((it) => {
        const l = document.createElement('li');
        const b = document.createElement('button');
        const lk = !licOK(it), gr = it.ci !== undefined && !Lic.info(it.ci).active && !lk;
        b.type = 'button'; b.className = 'm-item' + (it.soon ? ' soon' : '') + (lk ? ' locked' : ''); b.dataset.id = it.id;
        b.innerHTML = '<span>' + it.title + '</span>' + (it.soon ? '<em>به‌زودی</em>' : lk ? '<em class="lk">🔒</em>' : gr ? '<em class="lk ok">🕒 موقت</em>' : '');
        b.addEventListener('click', () => choose(it));
        l.appendChild(b); sub.appendChild(l);
      });
      li.appendChild(head); li.appendChild(sub); ul.appendChild(li);
    });
    markActive();
  }

  function markActive() {
    document.querySelectorAll('.m-item').forEach((b) => {
      const on = !!current && b.dataset.id === current.id;
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
  }

  function openMenu() {
    drawer.classList.add('open'); scrim.hidden = false;
    drawer.setAttribute('aria-hidden', 'false'); menuBtn.setAttribute('aria-expanded', 'true');
    const first = drawer.querySelector('.m-item.on') || drawer.querySelector('.m-item:not(.soon)') || drawer.querySelector('.m-head');
    if (first) setTimeout(() => first.focus(), 60);
  }
  function closeMenu(refocus) {
    if (!drawer.classList.contains('open')) return;
    drawer.classList.remove('open'); scrim.hidden = true;
    drawer.setAttribute('aria-hidden', 'true'); menuBtn.setAttribute('aria-expanded', 'false');
    if (refocus) menuBtn.focus();
  }
  menuBtn.addEventListener('click', () => (drawer.classList.contains('open') ? closeMenu(true) : openMenu()));
  $('#menuClose').addEventListener('click', () => closeMenu(true));
  scrim.addEventListener('click', () => closeMenu(true));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(true); });

  function choose(item) {
    if (item.soon) { window.appToast('«' + item.title + '» در نسخه‌های بعدی اضافه می‌شود.'); return; }
    closeMenu(false);
    if (location.hash === '#' + item.id) { if (!current || current.id !== item.id) open(item.id); }
    else location.hash = item.id;               /* hashchange شبیه‌ساز را باز می‌کند و دکمه‌ی «بازگشت» هم کار می‌کند */
  }

  /* ---------- بارگذاری شبیه‌ساز ---------- */
  const find = (id) => { for (const c of MENU) for (const it of c.items) if (it.id === id) return it; return null; };

  const loaded = {};
  function loadScript(src) {
    if (loaded[src]) return loaded[src];
    return loaded[src] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = () => { delete loaded[src]; reject(new Error('load failed: ' + src)); };
      document.head.appendChild(s);
    });
  }

  function teardown() {
    if (!current) return;
    try { if (current.inst && current.inst.destroy) current.inst.destroy(); } catch (e) { /* ignore */ }
    if (current.style) current.style.remove();
    view.innerHTML = '';
    current = null;
  }

  async function open(id) {
    const item = find(id);
    if (!item || item.soon) return;
    if (current && current.id === id) return;
    const my = ++seq;
    try { await Lic.ready; } catch (e) { /* مرورگر بدون WebCrypto: قفل می‌ماند */ }
    if (my !== seq) return;
    if (!licOK(item)) {                           /* درس فعال نشده: به صفحه‌ی فعال‌سازی همان درس برو */
      window.appFocus = { ci: item.ci, id };
      window.appToast('برای باز کردن «' + item.title + '» ابتدا درس را فعال کنید.');
      if (id !== 'activation') { history.replaceState(null, '', '#activation'); return open('activation'); }
      return;
    }
    teardown();
    view.innerHTML = '<div class="loading">در حال بارگذاری…</div>';
    try {
      if (!sims[id]) { await loadScript('lib/follow.js'); for (const d of (item.deps || [])) await loadScript(d); await loadScript(item.file); }
      if (!sims[id]) throw new Error('not registered');
    } catch (e) {
      if (my === seq) view.innerHTML = '<div class="loading err">بارگذاری این شبیه‌ساز ممکن نشد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.</div>';
      return;
    }
    if (my !== seq) return;                      /* کاربر در این فاصله شبیه‌ساز دیگری انتخاب کرد */
    const def = sims[id];
    const style = document.createElement('style');
    style.dataset.sim = id; style.textContent = def.css || '';
    document.head.appendChild(style);
    view.innerHTML = def.html || '';
    $('#simTitle').textContent = def.title;
    $('#simSub').textContent = def.subtitle || '';
    document.title = def.title;
    if (!licOK(item)) return;                    /* بازبینی دوباره پس از بارگذاری ناهمگام */
    current = { id, def, style, inst: null };
    current.inst = def.mount(view);
    updTc();
    if (location.hash !== '#' + id) history.replaceState(null, '', '#' + id);
    markActive();
  }

  /* ---------- دکمه‌ی «کد زمانی» (فقط برای استادِ همان درس) ---------- */
  const tcBtn = $('#tcBtn');
  function updTc() {
    const it = current && find(current.id);
    tcBtn.hidden = !(it && it.ci !== undefined && Lic.isTeacher(it.ci));
  }
  tcBtn.addEventListener('click', async () => {
    const it = current && find(current.id); if (!it) return;
    try { await loadScript('lib/qr.js'); await loadScript('lib/timecode.js'); window.TimeCodeUI.open(it.ci, it.id, it.title); }
    catch (e) { window.appToast('بارگذاری پنجره‌ی کد زمانی ممکن نشد.'); }
  });

  /* کد زمانیِ آمده از پیوند (#tc=...) */
  async function handleTc(h) {
    let r;
    try { r = await Lic.redeem(h.slice(3)); }
    catch (e) { r = { ok: false, msg: 'این مرورگر از رمزنگاری امن پشتیبانی نمی‌کند (آدرس باید https باشد؛ پیوند را در Chrome یا Safari باز کنید، نه داخل برنامه‌ی پیام‌رسان).' }; }
    if (r.ok && r.topicId) { window.appToast('مبحث برای شما باز شد (تا ' + (r.endMs - Lic.now() > 20 * 36e5 ? new Date(r.endMs).toLocaleDateString('fa-IR') : 'ساعت ' + new Date(r.endMs).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })) + ').'); history.replaceState(null, '', '#' + r.topicId); return open(r.topicId); }
    window.appTcMsg = r.msg || 'کد زمانی معتبر نیست.';          /* در صفحه‌ی فعال‌سازی، ماندگار نمایش داده می‌شود */
    window.appToast('ورود با پیوند کد زمانی ناموفق بود.');
    history.replaceState(null, '', '#activation'); current && current.id === 'activation' ? (teardown(), open('activation')) : open('activation');
  }
  function route() {
    const h = location.hash.replace(/^#/, '');
    if (h.startsWith('tc=')) return handleTc(h);
    return open(h);
  }
  window.addEventListener('hashchange', route);

  /* با تغییر وضعیت فعال‌سازی (و هر ۲۰ ثانیه): منو را بساز، و اگر مهلت مبحث جاری تمام شد، بیرون ببر */
  Lic.onChange(() => {
    renderMenu(); updTc();
    const it = current && find(current.id);
    if (it && !licOK(it)) { window.appFocus = { ci: it.ci, id: it.id }; window.appToast('مهلت دسترسی به این مبحث تمام شد.'); teardown(); history.replaceState(null, '', '#activation'); open('activation'); }
  });

  /* ---------- اسکرول‌بار خودکار‌پنهان (برای همه‌ی ناحیه‌ها) ---------- */
  document.addEventListener('scroll', (e) => {
    const el = e.target === document ? document.documentElement : e.target;
    if (!el || !el.classList) return;
    el.classList.add('sb-on');
    clearTimeout(el._sbT);
    el._sbT = setTimeout(() => el.classList.remove('sb-on'), 900);
  }, true);

  /* ---------- نصب PWA ---------- */
  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferred = e; $('#installBtn').hidden = false;
  });
  $('#installBtn').addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt(); await deferred.userChoice; deferred = null; $('#installBtn').hidden = true;
  });

  /* ---------- شروع ---------- */
  (async () => {
    try { await Lic.ready; } catch (e) { /* ignore */ }
    renderMenu();
    const start = location.hash.replace(/^#/, '');
    if (start.startsWith('tc=')) return handleTc(start);
    open(find(start) && !find(start).soon ? start : DEFAULT_ID);
  })();
})();

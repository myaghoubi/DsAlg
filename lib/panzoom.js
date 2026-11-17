/* زوم و جابه‌جایی ناحیه‌ی دید در نمودارهای SVG (گراف، درخت AVL، نمودار حالت ماشین‌ها).
   - دو انگشت روی صفحه‌ی لمسی: فاصله‌ی دو انگشت = زوم، حرکت وسط دو انگشت = جابه‌جایی افقی/عمودی
   - ماوس/تاچ‌پد: Ctrl + چرخ (یا ضربه‌ی دو انگشتی تاچ‌پد) = زوم؛ دکمه‌های + ، − ، ⟲ کنار نمودار
   روش کار: viewBox را که شبیه‌ساز خودش تنظیم می‌کند «پایه» می‌گیرد و زوم/جابه‌جایی را روی آن اعمال می‌کند؛
   پس نیازی به تغییر در کد شبیه‌سازها نیست و کشیدن گره‌ها با یک انگشت مثل قبل کار می‌کند. */
(function () {
'use strict';
const ZMIN = 0.4, ZMAX = 8;

function attach(svg) {
  if (!svg || svg._pz) return svg && svg._pz;
  let base = null, z = 1, ox = 0, oy = 0, last = '', bar = null;
  const parse = (s) => { const a = String(s || '').trim().split(/[\s,]+/).map(Number); return a.length === 4 && a.every(isFinite) && a[2] > 0 && a[3] > 0 ? a : null; };

  function apply() {
    if (!base) return;
    /* مرکز دید از ناحیه‌ی پایه بیرون نرود */
    ox = Math.max(-base[2] / 2, Math.min(base[2] / 2, ox));
    oy = Math.max(-base[3] / 2, Math.min(base[3] / 2, oy));
    const w = base[2] / z, h = base[3] / z;
    const cx = base[0] + base[2] / 2 + ox, cy = base[1] + base[3] / 2 + oy;
    last = [cx - w / 2, cy - h / 2, w, h].map((v) => +v.toFixed(3)).join(' ');
    svg.setAttribute('viewBox', last);
    syncUi();
  }
  function readBase() {
    const cur = svg.getAttribute('viewBox');
    if (cur === last) return;
    const b = parse(cur);
    if (!b) return;
    base = b; apply();
  }
  const mo = new MutationObserver(readBase);
  mo.observe(svg, { attributes: true, attributeFilter: ['viewBox'] });
  base = parse(svg.getAttribute('viewBox'));
  if (base) apply();

  const toUser = (cx, cy) => {
    const m = svg.getScreenCTM(); if (!m) return null;
    const p = new DOMPoint(cx, cy).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  /* زوم با ثابت ماندن نقطه‌ی زیر (cx, cy) صفحه */
  function zoomAt(nz, cx, cy) {
    if (!base) return;
    nz = Math.max(ZMIN, Math.min(ZMAX, nz));
    const p = toUser(cx, cy);
    z = nz; apply();
    const q = toUser(cx, cy);
    if (p && q) { ox += p.x - q.x; oy += p.y - q.y; apply(); }
  }
  function panPx(dx, dy) {
    const m = svg.getScreenCTM(); if (!m || !base) return;
    ox -= dx / m.a; oy -= dy / m.d; apply();
  }
  function reset() { z = 1; ox = 0; oy = 0; apply(); }
  function center() { const r = svg.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }

  /* ----- لمس دو انگشتی ----- */
  const ptr = new Map();         /* pointerId -> {x, y} (فقط لمسی) */
  let synth = false, gest = false, gd = 0, gx = 0, gy = 0;
  const mid = () => { const a = [...ptr.values()]; return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2, d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1 }; };
  const eat = (e) => { e.stopImmediatePropagation(); e.preventDefault(); };

  svg.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptr.size === 2) {
      /* کشیدن گره/پس‌زمینه‌ای که انگشت اول شروع کرده لغو می‌شود */
      const first = [...ptr.keys()][0];
      synth = true;
      try { svg.dispatchEvent(new PointerEvent('pointercancel', { pointerId: first, pointerType: 'touch', bubbles: true })); } catch (err) { /* ignore */ }
      synth = false;
      gest = true; const m = mid(); gd = m.d; gx = m.x; gy = m.y;
      eat(e);
    } else if (gest) eat(e);
  }, true);
  svg.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch' || !ptr.has(e.pointerId)) return;
    ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gest) return;
    eat(e);
    if (ptr.size < 2) return;
    const m = mid();
    panPx(m.x - gx, m.y - gy);
    zoomAt(z * (m.d / gd), m.x, m.y);
    gd = m.d; gx = m.x; gy = m.y;
  }, true);
  const up = (e) => {
    if (synth || e.pointerType !== 'touch') return;
    const had = ptr.delete(e.pointerId);
    if (gest && had) {
      eat(e);
      if (ptr.size === 2) { const m = mid(); gd = m.d; gx = m.x; gy = m.y; }
      else if (ptr.size === 0) gest = false;
      else { gx = [...ptr.values()][0].x; gy = [...ptr.values()][0].y; }
    }
  };
  svg.addEventListener('pointerup', up, true);
  svg.addEventListener('pointercancel', up, true);

  /* ----- چرخ ماوس / پینچ تاچ‌پد ----- */
  svg.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    zoomAt(z * Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.01)), e.clientX, e.clientY);
  }, { passive: false });
  svg.addEventListener('dblclick', (e) => { if (z !== 1 || ox || oy) { e.preventDefault(); reset(); } });

  /* ----- دکمه‌ها ----- */
  svg.style.touchAction = 'none';
  const host = svg.parentElement;
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  bar = document.createElement('div');
  bar.className = 'pzbar';
  bar.innerHTML = '<button type="button" data-a="in" aria-label="بزرگ‌نمایی">+</button><button type="button" data-a="out" aria-label="کوچک‌نمایی">−</button><button type="button" data-a="rst" aria-label="اندازه‌ی اصلی">⟲</button>';
  host.appendChild(bar);
  bar.addEventListener('click', (e) => {
    const a = e.target.dataset && e.target.dataset.a; if (!a) return;
    const [cx, cy] = center();
    if (a === 'in') zoomAt(z * 1.3, cx, cy); else if (a === 'out') zoomAt(z / 1.3, cx, cy); else reset();
  });
  function syncUi() { if (bar) bar.classList.toggle('on', z !== 1 || ox !== 0 || oy !== 0); }

  svg._pz = { reset, zoomAt, panPx, get zoom() { return z; } };
  return svg._pz;
}

window.PanZoom = { attach };
})();

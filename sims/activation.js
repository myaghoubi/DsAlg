/* صفحه‌ی فعال‌سازی دروس: شناسه‌ی دستگاه برای هر درس، وارد کردن کد فعال‌سازی، و ورود کد زمانی استاد */
(function () {
'use strict';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fa = (n) => Number(n).toLocaleString('fa-IR');
const dt = (ms) => new Date(ms).toLocaleDateString('fa-IR');
const tm = (ms) => new Date(ms).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });

const CSS = `
.act{padding:12px;display:flex;flex-direction:column;gap:12px;max-width:760px;margin:0 auto;width:100%;overflow:auto}
.act .card{background:var(--card);border:1px solid var(--bd);border-radius:14px;padding:12px 14px;display:flex;flex-direction:column;gap:8px}
.act .card.focus{border-color:var(--acc);box-shadow:0 0 0 2px rgba(37,99,235,.25)}
.act h2{margin:0;font-size:15px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.act .st{font-size:12px;font-weight:600;border-radius:999px;padding:1px 10px;border:1px solid var(--bd);color:var(--mut)}
.act .st.ok{color:var(--ok);border-color:var(--ok)}
.act .idrow{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px}
.act .idv{font-family:var(--mono);direction:ltr;unicode-bidi:isolate;font-size:17px;font-weight:700;letter-spacing:1px;background:rgba(37,99,235,.08);border-radius:8px;padding:2px 10px;user-select:all}
.act textarea,.act input{width:100%;box-sizing:border-box;border:1px solid var(--bd);border-radius:9px;background:var(--bg);color:var(--tx);padding:6px 8px;font:12px var(--mono);direction:ltr}
.act .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.act .msg{font-size:13px;min-height:1.2em}.act .msg.err{color:var(--err)}.act .msg.ok{color:var(--ok)}
.act .nt{font-size:12.5px;color:var(--mut);line-height:1.9;margin:0}
.act .warn{color:var(--warn)}
`;

function mount(view) {
  const L = window.License, C = window.COURSES;
  let alive = true; const vals = {}; const msgs = {};
  const focus = window.appFocus || null; window.appFocus = null;
  if (window.appTcMsg) { msgs.tc = { t: 'err', m: '✗ ' + window.appTcMsg }; window.appTcMsg = null; }
  const root = view.querySelector('.act');

  function status(c) {
    const i = L.info(c.idx);
    if (!i.active) return '<span class="st">غیرفعال 🔒</span>';
    return '<span class="st ok">فعال — ' + (i.role === 1 ? 'استاد' : 'دانشجو') + (i.exp ? ' (تا ' + dt(i.exp - 1) + ')' : ' (بدون محدودیت زمانی)') + '</span>';
  }
  function render() {
    if (!alive) return;
    root.querySelectorAll('textarea,input').forEach((e) => { vals[e.id] = e.value; });
    const gr = L.grants();
    let h = '';
    if (L.skewed) h += '<div class="card"><p class="nt warn">⚠ ساعت دستگاه عقب‌تر از آخرین زمان ثبت‌شده است. برای جلوگیری از سوءاستفاده، برنامه از آخرین زمانِ دیده‌شده استفاده می‌کند. ساعت دستگاه را اصلاح کنید.</p></div>';
    if (!window.crypto || !crypto.subtle) h += '<div class="card"><p class="nt warn">⚠ این مرورگر/آدرس از رمزنگاری امن پشتیبانی نمی‌کند؛ برنامه را از طریق آدرس https و با مرورگر به‌روز باز کنید.</p></div>';
    C.forEach((c) => {
      const f = focus && focus.ci === c.idx;
      h += '<section class="card' + (f ? ' focus' : '') + '" id="c' + c.idx + '"><h2><span>' + c.icon + ' ' + esc(c.title) + '</span>' + status(c) + '</h2>' +
        '<div class="idrow"><span>شناسه‌ی این دستگاه برای این درس:</span><span class="idv">' + esc(L.id(c.idx)) + '</span><button class="btn cp" data-c="' + c.idx + '">کپی</button></div>' +
        '<p class="nt">این شناسه را برای توسعه‌دهنده بفرستید و «کد فعال‌سازی» را در کادر زیر وارد کنید. (یک کد می‌تواند چند درس را هم‌زمان فعال کند.)</p>' +
        '<textarea id="code' + c.idx + '" rows="3" placeholder="کد فعال‌سازی (DSL1-…)">' + esc(vals['code' + c.idx] || '') + '</textarea>' +
        '<div class="row"><button class="btn pri ac" data-c="' + c.idx + '">فعال‌سازی</button><span class="msg ' + (msgs[c.idx] ? msgs[c.idx].t : '') + '" id="m' + c.idx + '">' + esc(msgs[c.idx] ? msgs[c.idx].m : (f ? 'برای دسترسی به این درس، کد فعال‌سازی را وارد کنید.' : '')) + '</span></div></section>';
    });
    h += '<section class="card"><h2><span>🕒 کد زمانیِ استاد</span></h2>' +
      '<p class="nt">اگر استاد در کلاس یک کد زمانی نمایش داد (QR یا متن)، آن را اینجا وارد کنید (کد فقط چند دقیقه معتبر است) تا فقط همان مبحث، برای مدتی که استاد تعیین کرده، برایتان باز شود. (اسکن QR با دوربین گوشی هم مستقیم همین کار را می‌کند.)</p>' +
      '<textarea id="tcIn" rows="3" placeholder="کد زمانی (DST1-…) یا پیوند">' + esc(vals.tcIn || '') + '</textarea>' +
      '<div class="row"><button class="btn sec" id="tcGo">باز کردن مبحث</button><span class="msg ' + (msgs.tc ? msgs.tc.t : '') + '" id="mtc">' + esc(msgs.tc ? msgs.tc.m : '') + '</span></div>';
    if (gr.length) h += '<p class="nt">دسترسی‌های موقت فعال:</p>' + gr.map((g) => { const c = C[g.course]; return '<p class="nt">• ' + esc(c ? c.title : '') + ' — «' + esc(c ? c.topics[g.topic] : '') + '» تا ' + (g.endMs - L.now() > 20 * 36e5 ? dt(g.endMs) : 'ساعت ' + tm(g.endMs)) + '</p>'; }).join('');
    h += '</section>';
    root.innerHTML = h;
    if (focus) { const el = root.querySelector('#c' + focus.ci); if (el && !root._f) { root._f = 1; el.scrollIntoView({ block: 'center' }); } }
  }
  const nameOf = (r) => r.courses.map((i) => C[i].title).join(' و ');
  root.addEventListener('click', async (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.classList.contains('cp')) {
      const id = L.id(+t.dataset.c);
      try { await navigator.clipboard.writeText(id); window.appToast('شناسه کپی شد.'); } catch (x) { window.appToast(id); }
    } else if (t.classList.contains('ac')) {
      const ci = +t.dataset.c, ta = root.querySelector('#code' + ci);
      const r = await L.activate(ta.value);
      if (r.ok) { vals['code' + ci] = ''; msgs[ci] = { t: 'ok', m: '✓ فعال شد: ' + nameOf(r) + ' — ' + (r.role === 1 ? 'استاد' : 'دانشجو') }; }
      else { vals['code' + ci] = ta.value; msgs[ci] = { t: 'err', m: '✗ ' + r.msg }; }
      render();
    } else if (t.id === 'tcGo') {
      const r = await L.redeem(root.querySelector('#tcIn').value);
      if (r.ok) { msgs.tc = { t: 'ok', m: '✓ مبحث باز شد.' }; vals.tcIn = ''; render(); location.hash = r.topicId; }
      else { vals.tcIn = root.querySelector('#tcIn').value; msgs.tc = { t: 'err', m: '✗ ' + r.msg }; render(); }
    }
  });
  render();
  L.onChange(() => { if (alive) render(); });
  return { destroy() { alive = false; } };
}

window.Shell.register({
  id: 'activation', title: 'فعال‌سازی دروس', subtitle: 'شناسه‌ی دستگاه · کد فعال‌سازی · کد زمانی',
  css: CSS, html: '<div class="act"></div>', mount
});
})();

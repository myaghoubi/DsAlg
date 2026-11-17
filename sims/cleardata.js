/* پاک‌کردن همه‌ی داده‌ها و اعتبارهای ذخیره‌شده‌ی برنامه روی همین دستگاه، پس از تأیید کاربر */
(function () {
'use strict';
const CSS = `
.clr{padding:12px;display:flex;flex-direction:column;gap:12px;max-width:720px;margin:0 auto;width:100%;overflow:auto}
.clr .card{background:var(--card);border:1px solid var(--bd);border-radius:14px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;font-size:13.5px;line-height:1.9}
.clr h2{margin:0;font-size:15px}
.clr ul{margin:0;padding:0 18px}
.clr .warn{color:var(--warn);font-weight:600}
.clr .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.clr .danger{background:#dc2626;border-color:#dc2626;color:#fff;font-weight:700}
.clr .danger:disabled{opacity:.45}
.clr label{display:flex;gap:8px;align-items:flex-start;cursor:pointer}
.clr .done{color:var(--ok);font-weight:700}`;

function mount(view) {
  const root = view.querySelector('.clr'), L = window.License;
  let step = 0;
  function render() {
    const nAct = (() => { try { return [0, 1].filter((i) => L.info(i).active).length; } catch (e) { return 0; } })();
    const nGr = (() => { try { return L.grants().length; } catch (e) { return 0; } })();
    const nMv = (() => { try { return L.moved().length; } catch (e) { return 0; } })();
    let h = '<div class="card"><h2>🗑 پاک‌کردن داده‌ها و اعتبارها</h2>' +
      '<div>با این کار همه‌ی اطلاعاتی که برنامه روی <b>همین دستگاه</b> نگه می‌دارد پاک می‌شود:</div><ul>' +
      '<li>کدهای فعال‌سازی دروس' + (nAct ? ' (اکنون ' + nAct.toLocaleString('fa-IR') + ' درس فعال)' : '') + ' و اعتبار استاد/دانشجو</li>' +
      '<li>مبحث‌هایی که با کد زمانی باز شده‌اند' + (nGr ? ' (اکنون ' + nGr.toLocaleString('fa-IR') + ' مورد)' : '') + (nMv ? ' و ' + nMv.toLocaleString('fa-IR') + ' مبحث منتقل‌شده' : '') + '</li>' +
      '<li>شناسه‌ی دستگاه هر درس (پس از پاک‌کردن، شناسه‌ی <b>تازه‌ای</b> ساخته می‌شود)</li>' +
      '<li>تنظیمات (اندازه‌ی فونت، پهنای پنل‌ها) و ماشین‌های ذخیره‌شده‌ی PDA و تورینگ</li></ul>' +
      '<div>فایل‌های برنامه برای اجرای آفلاین سر جایشان می‌مانند.</div>' +
      '<div class="warn">⚠ این کار برگشت‌پذیر نیست. برای فعال‌شدن دوباره، شناسه‌ی تازه را برای توسعه‌دهنده بفرستید و کد جدید بگیرید؛ مبحث‌های بازشده با کد زمانی را نیز فقط استاد می‌تواند دوباره باز کند (کد زمانی پس از چند دقیقه منقضی می‌شود). اعتباری که به دستگاه دیگر منتقل شده، روی آن دستگاه می‌ماند.</div>';
    if (step === 0) h += '<div class="row"><button class="btn danger" id="go">پاک‌کردن همه‌ی داده‌ها…</button></div>';
    else if (step === 1) h += '<label><input type="checkbox" id="ok"> متوجه‌ام که همه‌ی اعتبارها و داده‌های این دستگاه برای همیشه پاک می‌شود.</label>' +
      '<div class="row"><button class="btn danger" id="yes" disabled>بله، همه‌چیز پاک شود</button><button class="btn" id="no">انصراف</button></div>';
    else if (step === 2) h += '<div>در حال پاک‌کردن…</div>';
    else h += '<div class="done">✔ همه‌ی داده‌ها پاک شد. برنامه دوباره بارگذاری می‌شود…</div>';
    root.innerHTML = h + '</div>';
  }
  root.addEventListener('click', async (e) => {
    const id = e.target.id;
    if (id === 'go') { step = 1; render(); }
    else if (id === 'no') { step = 0; render(); }
    else if (id === 'yes') {
      if (!root.querySelector('#ok')) return;
      if (!root.querySelector('#ok').checked) return;
      if (!window.confirm('آخرین تأیید: همه‌ی داده‌ها و اعتبارهای این دستگاه پاک شود؟')) return;
      step = 2; render();
      try { await L.wipe(); } catch (x) { /* ignore */ }
      step = 3; render();
      setTimeout(() => { location.replace(location.pathname); }, 900);
    }
  });
  root.addEventListener('change', (e) => { if (e.target.id === 'ok') root.querySelector('#yes').disabled = !e.target.checked; });
  render();
  return { destroy() {} };
}

window.Shell.register({
  id: 'cleardata', title: 'پاک‌کردن داده‌ها و اعتبارها', subtitle: 'حذف اعتبارها و اطلاعات ذخیره‌شده‌ی این دستگاه',
  css: CSS, html: '<div class="clr"></div>', mount
});
})();

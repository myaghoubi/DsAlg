/* پنجره‌ی «انتقال اعتبار مبحث به دستگاه دیگر»: QR انتقال می‌سازد و اعتبار همین دستگاه را غیرفعال می‌کند. */
(function () {
'use strict';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fa = (n) => Number(n).toLocaleString('fa-IR');
let dlg = null, timer = null;
function close() { if (timer) clearInterval(timer); timer = null; if (dlg) dlg.remove(); dlg = null; }
const when = (ms) => ms - window.License.now() > 20 * 36e5 ? new Date(ms).toLocaleDateString('fa-IR') : 'ساعت ' + new Date(ms).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });

/* again=true: نمایش دوباره‌ی QR برای مبحثی که پیش‌تر منتقل شده (بدون هشدار) */
function open(topicId, title, again) {
  close();
  const L = window.License;
  dlg = document.createElement('div');
  dlg.className = 'lic-back'; dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true');
  dlg.innerHTML = '<div class="lic-box"><div class="lic-h"><b>📲 انتقال اعتبار به دستگاه دیگر</b><button class="btn icon" id="trX" aria-label="بستن">✕</button></div>' +
    '<p class="lic-sub">' + esc(title) + '</p><div id="trBody"></div></div>';
  document.body.appendChild(dlg);
  const $ = (s) => dlg.querySelector(s);
  $('#trX').onclick = close;
  dlg.addEventListener('pointerdown', (e) => { dlg._bd = e.target === dlg; });
  dlg.addEventListener('click', (e) => { if (e.target === dlg && dlg._bd) close(); });
  const flash = (m) => window.appToast && window.appToast(m);
  const body = $('#trBody');

  function askView() {
    const g = L.grantEnd(window.License.topicOf(topicId).course.idx, topicId);
    body.innerHTML = '<p class="lic-hint">اعتبار این مبحث' + (g ? ' (تا ' + esc(when(g)) + ')' : '') + ' به یک دستگاه دیگر منتقل می‌شود؛ مدت اعتبار تغییر نمی‌کند.</p>' +
      '<p class="lic-hint warn">⚠ با ساخت QR انتقال، مبحث روی <b>همین دستگاه فوراً غیرفعال</b> می‌شود. دستگاه مقصد باید ظرف ۱۵ دقیقه QR را اسکن کند (یا پیوند را باز کند). تا آن زمان QR را نگه دارید.</p>' +
      '<div class="lic-row"><button class="btn pri" id="trGo">ساخت QR و غیرفعال‌کردن این دستگاه</button><button class="btn" id="trNo">انصراف</button></div>';
    $('#trNo').onclick = close;
    $('#trGo').onclick = async () => {
      $('#trGo').disabled = true;
      try { const r = await L.makeTransfer(topicId, false); showView(r); }
      catch (e) { flash(e.message || 'ساخت QR انتقال ممکن نشد.'); close(); }
    };
  }
  function showView(r) {
    const q = window.qrcode(0, 'L'); q.addData(r.link, 'Byte'); q.make();
    body.innerHTML = '<div class="lic-qr" id="trQr"></div><div class="lic-cd" id="trCd"></div>' +
      '<p class="lic-hint">این QR را با دوربین/برنامه‌ی دستگاه دیگر اسکن کنید (یا پیوند را برایش بفرستید). مبحث روی این دستگاه غیرفعال شد. اگر مهلت ۱۵ دقیقه تمام شد، از «فعال‌سازی دروس» دوباره QR بسازید.</p>' +
      '<textarea class="lic-ta" id="trTxt" readonly rows="3" dir="ltr"></textarea>' +
      '<div class="lic-row"><button class="btn" id="trCl">کپی پیوند</button><button class="btn" id="trSh" hidden>اشتراک‌گذاری</button><button class="btn" id="trOk">بستن</button></div>';
    $('#trQr').innerHTML = q.createSvgTag({ scalable: true, margin: 3 });
    $('#trTxt').value = r.link;
    $('#trOk').onclick = close;
    $('#trCl').onclick = async () => { try { await navigator.clipboard.writeText(r.link); } catch (e) { $('#trTxt').select(); document.execCommand('copy'); } flash('پیوند کپی شد.'); };
    if (navigator.share) { $('#trSh').hidden = false; $('#trSh').onclick = () => navigator.share({ title: 'انتقال اعتبار: ' + title, url: r.link }).catch(() => {}); }
    const tick = () => {
      const left = r.ts + 15 * 60000 - L.now();
      $('#trCd').textContent = left > 0 ? 'مهلت اسکن: ' + fa(Math.floor(left / 60000)) + ':' + String(Math.floor(left / 1000) % 60).padStart(2, '0').replace(/\d/g, (d) => fa(d)) + ' دقیقه' : 'مهلت اسکن تمام شد.';
      $('#trCd').classList.toggle('bad', left <= 0);
    };
    tick(); timer = setInterval(tick, 1000);
  }
  if (again) {
    L.makeTransfer(topicId, true).then(showView).catch((e) => { flash(e.message || 'ساخت QR انتقال ممکن نشد.'); close(); });
  } else askView();
}
window.TransferUI = { open };
})();

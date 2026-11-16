/* پنجره‌ی «کد زمانی» برای استاد: کدی امضاشده که فقط برای همین مبحث و مدت محدود اعتبار دارد.
   کد حاوی گواهی توسعه‌دهنده + امضای کلید استاد است؛ دانشجو نمی‌تواند آن را بسازد یا تغییر دهد. */
(function () {
'use strict';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let dlg = null, timer = null;

function close() { if (timer) clearInterval(timer); timer = null; if (dlg) dlg.remove(); dlg = null; }
const fa = (n) => Number(n).toLocaleString('fa-IR');
const fmtT = (ms) => new Date(ms).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });

async function open(ci, topicId, title) {
  close();
  dlg = document.createElement('div');
  dlg.className = 'lic-back'; dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true');
  dlg.innerHTML = '<div class="lic-box">' +
    '<div class="lic-h"><b>🕒 کد زمانی مبحث</b><button class="btn icon" id="tcX" aria-label="بستن">✕</button></div>' +
    '<p class="lic-sub">' + esc(title) + '</p>' +
    '<div class="lic-row"><label for="tcCm">مهلتِ خودِ کد:</label><select id="tcCm">' +
    [1, 2, 3, 4, 5].map((m) => '<option value="' + m + '"' + (m === 5 ? ' selected' : '') + '>' + fa(m) + ' دقیقه</option>').join('') + '</select></div>' +
    '<div class="lic-row"><label for="tcAc">مدت دسترسی به مبحث پس از ورود کد:</label><select id="tcAc">' +
    [[90, '۹۰ دقیقه'], [180, '۳ ساعت'], [1440, '۱ روز'], [10080, '۷ روز'], [43200, '۳۰ روز'], [172800, '۱۲۰ روز'], [525600, '۱ سال']].map((o) => '<option value="' + o[0] + '"' + (o[0] === 1440 ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></div>' +
    '<div class="lic-row"><button class="btn pri" id="tcGen">تولید کد جدید</button><label><input type="checkbox" id="tcAuto" checked> تازه‌سازی خودکار با پایان مهلت کد</label></div>' +
    '<div class="lic-qr" id="tcQr"></div><div class="lic-cd" id="tcCd"></div>' +
    '<p class="lic-hint">کد فقط تا چند دقیقه برای ورود معتبر است؛ دانشجو با اسکن QR یا چسباندنِ کد در «فعال‌سازی دروس ← کد زمانی»، همین مبحث را برای مدتِ «دسترسی» باز می‌کند (از لحظه‌ی ورودِ کد).</p>' +
    '<textarea id="tcTxt" class="lic-ta" readonly rows="3" dir="ltr"></textarea>' +
    '<div class="lic-row"><button class="btn" id="tcCp">کپی کد</button><button class="btn" id="tcCl">کپی پیوند</button><button class="btn" id="tcSh" hidden>اشتراک‌گذاری</button></div></div>';
  document.body.appendChild(dlg);
  const $ = (s) => dlg.querySelector(s);
  $('#tcX').onclick = close;
  dlg.addEventListener('pointerdown', (e) => { dlg._bd = e.target === dlg; });
  dlg.addEventListener('click', (e) => { if (e.target === dlg && dlg._bd) close(); });
  let cur = null;
  const flash = (m) => window.appToast && window.appToast(m);
  async function gen() {
    busy = true; $('#tcGen').disabled = true;
    try {
      cur = await window.License.makeTimeCode(ci, topicId, +$('#tcCm').value, +$('#tcAc').value);
      const q = window.qrcode(0, 'L'); q.addData(cur.url, 'Byte'); q.make();
      $('#tcQr').innerHTML = q.createSvgTag({ scalable: true, margin: 3 });
      $('#tcTxt').value = cur.token;
      tick();
    } catch (e) { flash(e.message || 'تولید کد ممکن نشد.'); }
    $('#tcGen').disabled = false; busy = false;
  }
  function tick() {
    if (!cur) return;
    const left = cur.codeEndMs - window.License.now();
    $('#tcCd').textContent = left > 0 ? 'این کد تا ساعت ' + fmtT(cur.codeEndMs) + ' قابل استفاده است (' + fa(Math.ceil(left / 1000)) + ' ثانیه‌ی دیگر)' : 'مهلت این کد تمام شد؛ کد جدید بسازید.';
    $('#tcCd').classList.toggle('bad', left <= 0);
    if (left <= 0 && $('#tcAuto').checked && !busy) gen();
  }
  let busy = false;
  const copy = async (txt, m) => { try { await navigator.clipboard.writeText(txt); flash(m); } catch (e) { const t = $('#tcTxt'); t.value = txt; t.select(); document.execCommand('copy'); flash(m); } };
  $('#tcGen').onclick = gen;
  $('#tcCp').onclick = () => cur && copy(cur.token, 'کد کپی شد.');
  $('#tcCl').onclick = () => cur && copy(cur.url, 'پیوند کپی شد.');
  if (navigator.share) { $('#tcSh').hidden = false; $('#tcSh').onclick = () => cur && navigator.share({ title: 'کد زمانی: ' + title, url: cur.url }).catch(() => {}); }
  timer = setInterval(tick, 1000);
  gen();
}
window.TimeCodeUI = { open, close };
})();

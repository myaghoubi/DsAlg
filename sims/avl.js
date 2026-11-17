/* شبیه‌ساز درج و حذف در درخت AVL — درخت با گره‌های پیوندی (فرزند چپ و راست)
   اجرای گام‌به‌گام شبه‌کد پایتون با Trace و Watch؛ به lib/stepper.js وابسته است. */
(function () {
'use strict';

const MAX_NODES = 31;
const esc = Stepper.esc;

/* ===================== شبه‌کد پایتون (هر خط یک برچسب برای ارجاع از موتور دارد) ===================== */
const COMMON = [
  ['in_cls', 'class Node:'], ['in_def', '    def __init__(self, key):'], ['in_key', '        self.key = key'], ['in_l', '        self.left = None'],
  ['in_r', '        self.right = None'], ['in_h', '        self.height = 1'], [0, ''],
  ['h_def', 'def height(n):'], ['h_ret', '    return n.height if n else 0'], [0, ''],
  ['u_def', 'def update(n):'], ['u_set', '    n.height = 1 + max(height(n.left), height(n.right))'], [0, ''],
  ['b_def', 'def balance(n):'], ['b_ret', '    return height(n.left) - height(n.right)'], [0, ''],
  ['rr_def', 'def rotate_right(y):'], ['rr_x', '    x = y.left'], ['rr_yl', '    y.left = x.right'], ['rr_xr', '    x.right = y'],
  ['rr_uy', '    update(y)'], ['rr_ux', '    update(x)'], ['rr_ret', '    return x'], [0, ''],
  ['rl_def', 'def rotate_left(x):'], ['rl_y', '    y = x.right'], ['rl_xr', '    x.right = y.left'], ['rl_yl', '    y.left = x'],
  ['rl_ux', '    update(x)'], ['rl_uy', '    update(y)'], ['rl_ret', '    return y'], [0, ''],
  ['rb_def', 'def rebalance(n):'], ['rb_upd', '    update(n)'], ['rb_bal', '    b = balance(n)'], ['rb_c1', '    if b > 1:'],
  ['rb_c2', '        if balance(n.left) < 0:'], ['rb_lr', '            n.left = rotate_left(n.left)'], ['rb_r', '        return rotate_right(n)'],
  ['rb_c3', '    if b < -1:'], ['rb_c4', '        if balance(n.right) > 0:'], ['rb_rl', '            n.right = rotate_right(n.right)'],
  ['rb_l', '        return rotate_left(n)'], ['rb_ret', '    return n'], [0, '']
];
const INSERT = [
  ['i_def', 'def insert(n, key):'], ['i_c0', '    if n is None:'], ['i_new', '        return Node(key)'],
  ['i_lt', '    if key < n.key:'], ['i_l', '        n.left = insert(n.left, key)'],
  ['i_gt', '    elif key > n.key:'], ['i_r', '        n.right = insert(n.right, key)'],
  ['i_eq', '    else:'], ['i_dup', '        return n          # کلید تکراری'], ['i_rb', '    return rebalance(n)']
];
const DELETE = [
  ['mn_def', 'def min_node(n):'], ['mn_w', '    while n.left:'], ['mn_n', '        n = n.left'], ['mn_ret', '    return n'], [0, ''],
  ['d_def', 'def delete(n, key):'], ['d_c0', '    if n is None:'], ['d_none', '        return None'],
  ['d_lt', '    if key < n.key:'], ['d_l', '        n.left = delete(n.left, key)'],
  ['d_gt', '    elif key > n.key:'], ['d_r', '        n.right = delete(n.right, key)'],
  ['d_eq', '    else:'], ['d_ln', '        if n.left is None:'], ['d_rr', '            return n.right'],
  ['d_rn', '        if n.right is None:'], ['d_rl', '            return n.left'],
  ['d_s', '        s = min_node(n.right)'], ['d_cp', '        n.key = s.key'], ['d_rd', '        n.right = delete(n.right, s.key)'],
  ['d_rb', '    return rebalance(n)']
];
function build(parts) {
  const lines = [], L = {};
  parts.forEach(([tag, text]) => { if (tag) L[tag] = lines.length; lines.push(text); });
  return { lines, L };
}
const CODE = { insert: build(COMMON.concat(INSERT)), delete: build(COMMON.concat(DELETE)) };

/* ===================== موتور: اجرای واقعیِ همین کد با مفسر MiniPy ===================== */
/* حالت پایدار درخت = عکس‌فوری حافظه: { objs:{id:{cls,a:{key,left,right,height}}}, glob:{root}, nextId } */
const EMPTY = () => ({ objs: {}, glob: { root: { k: 'none' } }, nextId: 1 });
const ATOMIC = ['height', 'update', 'balance', 'min_node', 'Node'];
const ptr = (r) => (r && r.k === 'obj' ? r.id : null);
const numOf = (r) => (r && r.k === 'num' ? r.v : undefined);
const rootOf = (st) => ptr(st.glob.root);

function hydrate(st) {
  const objs = {};
  Object.keys(st.objs).forEach((id) => { objs[id] = { id: +id, cls: st.objs[id].cls, a: Object.create(null) }; });
  Object.keys(st.objs).forEach((id) => {
    const a = st.objs[id].a;
    Object.keys(a).forEach((k) => { const r = a[k]; objs[id].a[k] = r.k === 'none' ? null : r.k === 'obj' ? objs[r.id] : r.v; });
  });
  const rid = rootOf(st);
  return rid === null ? null : objs[rid];
}

/* بررسی اعتبار AVL بودن حالت (برای گزارش پایان اجرا و آزمون‌ها) */
function analyze(st) {
  const res = { count: 0, height: 0, inorder: [], problems: [] };
  const seen = new Set(), path = new Set();
  const nm = (id) => 'Node(' + (numOf(st.objs[id].a.key) === undefined ? '?' : numOf(st.objs[id].a.key)) + ')';
  function go(id) {
    if (id === null || id === undefined || !st.objs[id]) return 0;
    if (path.has(id)) { res.problems.push('حلقه در پیوندها (' + nm(id) + ')'); return 0; }
    if (seen.has(id)) { res.problems.push(nm(id) + ' در دو جای درخت آمده'); return 0; }
    seen.add(id); path.add(id);
    const a = st.objs[id].a;
    const hl = go(ptr(a.left));
    res.count++; res.inorder.push(numOf(a.key));
    const hr = go(ptr(a.right));
    path.delete(id);
    const h = 1 + Math.max(hl, hr);
    if (numOf(a.height) !== h) res.problems.push('ارتفاع ذخیره‌شده‌ی ' + nm(id) + ' = ' + (numOf(a.height) === undefined ? '?' : numOf(a.height)) + ' ولی ارتفاع واقعی ' + h + ' است');
    if (Math.abs(hl - hr) > 1) res.problems.push(nm(id) + ' نامتوازن است (bf = ' + (hl - hr) + ')');
    return h;
  }
  res.height = go(rootOf(st));
  for (let i = 1; i < res.inorder.length; i++) if (!(res.inorder[i - 1] < res.inorder[i])) { res.problems.push('ترتیب درخت جست‌وجو (BST) رعایت نشده'); break; }
  res.ok = !res.problems.length;
  return res;
}

/* اجرای یک عملیات: o = { deep, off:(lineIdx)=>bool, silent } ← { steps, state, err } */
function run(op, state, key, o) {
  o = o || {};
  const prog = MiniPy.parse(CODE[op].lines, o.off || (() => false));
  const steps = [];
  const vm = MiniPy.createVM(prog, {
    deep: o.deep !== false, atomic: ATOMIC, nextId: state.nextId, record: !o.silent, maxSteps: o.silent ? Infinity : 5000,
    onStep: (line, note, ex, snap) => steps.push({ line, note, snap: snap(ex) })
  });
  const root0 = hydrate(state);
  vm.globals.root = root0;
  let err = null;
  try {
    const rv = vm.run(op, [root0, key]);
    if (rv !== null && typeof rv !== 'object') throw new MiniPy.PyErr('TypeError', 'تابع ' + op + ' باید گره یا None برگرداند، نه ' + vm.repr(rv) + '؛ root را نمی‌توان به آن تغییر داد');
    vm.globals.root = rv;
    const tmp = vm.snapshot({ noFrames: true }); tmp.nextId = vm.nextId();
    const an = analyze(tmp);
    vm.emitFinal('پایان: root = ' + vm.repr(rv) + '. ' + (an.ok ? 'درخت حاصل یک AVL معتبر است ✓' : '⚠ درخت حاصل AVL معتبر نیست: ' + an.problems.slice(0, 2).join('؛ ') + '.'), { fin: true });
  } catch (e) {
    if (e instanceof MiniPy.PyErr) err = e.pyName + ': ' + e.pyMsg;
    else if (e instanceof MiniPy.Limit) err = 'LimitError: تعداد گام‌های اجرا از حد مجاز گذشت (حلقه یا بازگشت بی‌پایان؟)';
    else throw e;
    vm.emitError(vm.errorLine() >= 0 ? vm.errorLine() : CODE[op].L[op === 'insert' ? 'i_def' : 'd_def'], '❌ ' + err + ' — اجرا در همین خط متوقف شد؛ root تغییر نکرد (ولی تغییرهایی که تا اینجا روی گره‌ها داده شده می‌ماند).', { err, fin: true });
  }
  const ns = vm.snapshot({ noFrames: true }); ns.nextId = vm.nextId();
  return { steps, state: ns, err };
}

/* ===================== استایل ===================== */
const CSS = `
.avst{display:flex;flex-direction:column;gap:6px;height:100%}
.avsvg{flex:0 0 min(78vw,400px);min-height:0}
.avsvg svg{width:100%;height:100%;display:block}
@media (orientation:landscape) and (min-width:640px){.avsvg{flex:1 1 0;min-height:150px}}
.avl-edge{stroke:var(--edge);stroke-width:2.2}
.avl-edge.new{stroke:var(--acc);stroke-width:4}
.avl-edge.ghost{stroke:var(--err);stroke-width:2.4;stroke-dasharray:5 4;opacity:.75}
.avl-edge.cross{stroke-dasharray:7 4;opacity:.8}
.avdet{fill:none;stroke:var(--mut);stroke-dasharray:6 4;opacity:.55;stroke-width:1.5}
.avcap{font-size:11px;fill:var(--mut);text-anchor:middle}
.avn circle.c{fill:var(--node);stroke:var(--edge);stroke-width:2.4}
.avn text.k{font-family:var(--mono);font-size:15px;font-weight:700;fill:var(--tx);text-anchor:middle;pointer-events:none}
.avn text.h{font-family:var(--mono);font-size:10.5px;fill:var(--mut);text-anchor:middle}
.avn text.v{font-family:var(--mono);font-size:11px;font-weight:700;fill:var(--acc2);text-anchor:middle}
.avn.ref circle.c{stroke:var(--acc2);stroke-width:3.5}
.avn.cur circle.c{fill:var(--acc);stroke:var(--acc)}
.avn.cur text.k{fill:#fff}
.avn.nw circle.c{fill:#bbf7d0;stroke:var(--ok);stroke-width:3.5}
.avn text.bf{font-family:var(--mono);font-size:12px;font-weight:700;text-anchor:start}
.avn text.bf.ok{fill:var(--ok)}.avn text.bf.bad{fill:var(--err)}
.avstate{display:flex;flex-direction:column;gap:3px;padding:2px 4px}
.avrow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.avlab{flex:0 0 120px;font-size:12px;color:var(--mut)}
.avchips{display:flex;flex-wrap:wrap;gap:4px;direction:ltr;min-height:24px;align-items:center}
.avchip{font-family:var(--mono);font-size:12px;font-weight:700;padding:0 8px;border:1.5px solid var(--edge);border-radius:8px;background:var(--node)}
.avchip.last{border-color:var(--acc);background:var(--live)}
.avlegend{display:flex;flex-wrap:wrap;gap:4px 14px;align-items:center}
.avlegend i{display:inline-block;width:12px;height:12px;border-radius:50%;border:2px solid var(--edge);vertical-align:-2px;margin-left:4px;background:var(--node)}
.avlegend i.c{background:var(--acc);border-color:var(--acc)}
.avlegend i.r{border-color:var(--acc2)}
.avlegend i.n{background:#bbf7d0;border-color:var(--ok)}
.avlegend u{display:inline-block;width:22px;height:0;border-top:3px solid var(--acc);vertical-align:3px;margin-left:4px;text-decoration:none}
.avlegend u.g{border-top:3px dashed var(--err)}
.avlegend u.d{border-top:2px dashed var(--mut)}
.avend{font-weight:700;color:var(--ok);font-size:13px}
.avoff{font-size:12px;color:var(--warn);font-weight:700}
`;

const STAGE = `
<div class="avst">
  <div class="avsvg"><svg id="avsvg" preserveAspectRatio="xMidYMid meet" role="img" aria-label="درخت AVL"></svg></div>
  <div class="avstate" id="avstate"></div>
  <div class="legend avlegend">
    <span><i class="c"></i>n / self — گره‌ی جاری</span><span><i class="r"></i>سایر متغیرها (x، y، s، …)</span>
    <span><i class="n"></i>گره‌ی تازه‌ساخته</span>
    <span><u></u>یال تازه (همین گام)</span><span><u class="g"></u>یالی که همین گام برداشته شد</span><span><u class="d"></u>یا کادر خط‌چین: جدا از root</span>
    <span>عدد زیر هر گره = n.height ذخیره‌شده؛ bf = توازن</span>
  </div>
</div>`;

const HTML = `
  <section class="tools">
    <div class="card mini">
      <div class="row"><span class="lbl">عملیات</span>
        <div class="seg" id="segOp"><button data-v="insert" class="on">درج (insert)</button><button data-v="delete">حذف (delete)</button></div>
      </div>
      <div class="row"><span class="lbl">کلید</span>
        <input type="text" id="keyIn" inputmode="numeric" autocomplete="off" style="width:80px" aria-label="کلید">
        <button class="btn pri" id="btnRun">▶ اجرای عملیات</button>
        <span class="lbl" id="avInfo"></span>
      </div>
      <div class="row"><label class="lbl" style="cursor:pointer"><input type="checkbox" id="deepChk" checked> ورود به همه‌ی توابع (height، update، balance، …)</label></div>
    </div>
    <div class="card mini">
      <div class="row"><span class="lbl">نمونه</span>
        <select id="preset" aria-label="سناریوی نمونه"></select>
      </div>
      <div class="row"><span class="lbl">ساخت سریع</span>
        <input type="text" id="bulk" style="width:150px" placeholder="30,20,40,10" autocomplete="off" aria-label="کلیدها">
        <button class="btn" id="btnBuild">بساز</button>
        <button class="btn" id="btnRand">تصادفی</button>
        <button class="btn" id="btnEmpty">خالی</button>
      </div>
      <div class="row"><span class="lbl">آزمایش با کد</span>
        <select id="exper" aria-label="آزمایش غیرفعال‌کردن خط‌های کد"></select>
        <button class="btn" id="btnAllOn">فعال‌سازی همه‌ی خط‌ها</button>
        <span class="avoff" id="offInfo"></span>
      </div>
    </div>
  </section>
` + Stepper.layout(STAGE, { codeNote: 'درخت دقیقاً نتیجه‌ی اجرای همین کد است. برای غیرفعال‌کردن (کامنت‌کردن) یک خط یا یک بلوک، روی ☑ کنار شماره‌ی خط بزنید؛ اجرا از نو با کد تازه انجام می‌شود و اثرش (یا خطای پایتون) در درخت دیده می‌شود.' });

/* ===================== رابط کاربری ===================== */
const PRESETS = [
  { name: 'درخت خالی', keys: [], op: 'insert', key: 50 },
  { name: 'چرخش LL (به راست): درج ۵', keys: [30, 20, 40, 10], op: 'insert', key: 5 },
  { name: 'چرخش RR (به چپ): درج ۵۰', keys: [20, 10, 30, 40], op: 'insert', key: 50 },
  { name: 'چرخش دوگانه LR: درج ۱۵', keys: [40, 20, 50, 10], op: 'insert', key: 15 },
  { name: 'چرخش دوگانه RL: درج ۵۵', keys: [20, 10, 50, 60], op: 'insert', key: 55 },
  { name: 'حذف همراه با چرخش: حذف ۴۰', keys: [30, 20, 40, 10], op: 'delete', key: 40 },
  { name: 'حذف گره دوفرزندی: حذف ۵۰', keys: [50, 30, 70, 20, 40, 60, 80], op: 'delete', key: 50 },
  { name: 'درخت ۱۰ کلیدی', keys: [50, 25, 75, 12, 37, 62, 87, 6, 18, 31], op: 'insert', key: 22 }
];
/* آزمایش‌ها: چند خط از کد غیرفعال می‌شود تا اثر آن در درخت دیده شود */
const EXPERS = [
  { name: '— کد کامل (بدون آزمایش) —', tags: [] },
  { name: 'بدون update پس از چرخش (ارتفاع‌ها کهنه می‌مانند)', tags: ['rr_uy', 'rr_ux', 'rl_ux', 'rl_uy'], keys: [30, 20, 40, 10], op: 'insert', key: 5 },
  { name: 'بدون «x.right = y» در rotate_right (y از درخت جدا می‌شود)', tags: ['rr_xr'], keys: [30, 20, 40, 10], op: 'insert', key: 5 },
  { name: 'بدون «y.left = x.right» (یک زیردرخت گم می‌شود)', tags: ['rr_yl'], keys: [40, 20, 50, 10, 30], op: 'insert', key: 5 },
  { name: 'بدون چرخش نهایی (return rotate_right / rotate_left)', tags: ['rb_r', 'rb_l'], keys: [30, 20, 40, 10], op: 'insert', key: 5 },
  { name: 'بدون «n.left = insert(...)» (کلید جدید وصل نمی‌شود)', tags: ['i_l'], keys: [30, 20, 40], op: 'insert', key: 10 },
  { name: 'بدون «return rebalance(n)» در insert (تابع None برمی‌گرداند)', tags: ['i_rb'], keys: [30, 20, 40], op: 'insert', key: 10 },
  { name: 'بدون «self.height = 1» در سازنده (خطای AttributeError)', tags: ['in_h'], keys: [30, 20], op: 'insert', key: 10 },
  { name: 'حذف: بدون «n.key = s.key» (کلید جانشین کپی نمی‌شود)', tags: ['d_cp'], keys: [50, 30, 70, 20, 40, 60, 80], op: 'delete', key: 50 },
  { name: 'حذف: بدون «n.right = delete(n.right, s.key)» (جانشین دوبار می‌ماند)', tags: ['d_rd'], keys: [50, 30, 70, 20, 40, 60, 80], op: 'delete', key: 50 }
];

function mount(view) {
  const $ = (s) => view.querySelector(s);
  const toast = (m) => window.appToast && window.appToast(m);
  /* state: حافظه‌ی پایدار درخت؛ pre: حالت پیش از آخرین عملیات؛ last: آخرین عملیات (برای اجرای دوباره پس از تغییر کد) */
  const S = { op: 'insert', state: EMPTY(), pre: null, last: null, off: new Set(), ctl: null };

  /* ----- تجزیه‌ی عکس‌فوری به گراف ----- */
  function nodesOf(snap) {
    const out = {};
    Object.keys(snap.objs).forEach((id) => {
      const o = snap.objs[id];
      if (o.cls !== 'Node') return;
      out[id] = { id: +id, key: numOf(o.a.key), h: numOf(o.a.height), l: ptr(o.a.left), r: ptr(o.a.right) };
    });
    return out;
  }
  const reprRep = (rep, snap) => {
    if (!rep) return '?';
    if (rep.k === 'none') return 'None';
    if (rep.k === 'num') return String(rep.v);
    if (rep.k === 'bool') return rep.v ? 'True' : 'False';
    const o = snap.objs[rep.id];
    return o ? o.cls + '(' + (numOf(o.a.key) === undefined ? '?' : numOf(o.a.key)) + ')' : 'Node';
  };

  /* چیدمان جنگل: درخت اصلی (از root) + زیردرخت‌های جدا از root که فقط متغیرهای محلی به آن‌ها اشاره می‌کنند */
  function layout(snap, nodes) {
    const placed = {}, trees = [];
    let idx = 0;
    const kids = (id) => [nodes[id].l, nodes[id].r].filter((x) => x !== null && nodes[x]);
    function place(id, d, tr) {
      placed[id] = { d, idx: -1, tree: tr };
      const n = nodes[id];
      if (n.l !== null && nodes[n.l] && !placed[n.l]) place(n.l, d + 1, tr);
      placed[id].idx = idx++;
      if (n.r !== null && nodes[n.r] && !placed[n.r]) place(n.r, d + 1, tr);
    }
    const reach = (id) => { const s = new Set(); (function g(i) { if (s.has(i)) return; s.add(i); kids(i).forEach(g); })(id); return s; };
    const rid = ptr(snap.glob.root);
    trees.push({ main: true, ids: [] });
    if (rid !== null && nodes[rid]) place(rid, 0, 0);
    /* نامزدهای جدا از root: گره‌هایی که متغیر محلی یا مقدار بازگشتی به آن‌ها اشاره می‌کند */
    const cand = [];
    const addC = (rep) => { const i = ptr(rep); if (i !== null && nodes[i] && !cand.includes(i)) cand.push(i); };
    for (let f = snap.frames.length - 1; f >= 0; f--) Object.keys(snap.frames[f].vars).forEach((k) => addC(snap.frames[f].vars[k]));
    addC(snap.ret);
    const un = cand.filter((c) => !placed[c]);
    const rs = {}; un.forEach((c) => { rs[c] = reach(c); });
    const prim = un.filter((c) => !un.some((o) => o !== c && rs[o].has(c) && !rs[c].has(o)));
    [...prim, ...un].forEach((c) => {
      if (placed[c]) return;
      if (idx > 0) idx += 0.7;
      trees.push({ main: false });
      place(c, 0, trees.length - 1);
    });
    Object.keys(placed).forEach((id) => { const t = trees[placed[id].tree]; (t.ids = t.ids || []).push(+id); });
    return { placed, trees, width: idx };
  }

  function edgeSet(nodes) {
    const s = new Set();
    Object.keys(nodes).forEach((id) => { const n = nodes[id]; if (n.l !== null && nodes[n.l]) s.add(id + '>' + n.l + 'L'); if (n.r !== null && nodes[n.r]) s.add(id + '>' + n.r + 'R'); });
    return s;
  }

  function drawTree(snap, prev) {
    const svg = $('#avsvg');
    const nodes = nodesOf(snap), pn = prev ? nodesOf(prev) : {};
    const ids = Object.keys(nodes);
    const rid = ptr(snap.glob.root);
    if (!ids.length) {
      svg.setAttribute('viewBox', '0 0 560 230');
      svg.innerHTML = '<text x="280" y="115" text-anchor="middle" style="fill:var(--mut);font-size:15px">درخت خالی است (root = None)</text>';
      return;
    }
    const lay = layout(snap, nodes), P = lay.placed;
    const maxD = Math.max(...Object.keys(P).map((i) => P[i].d));
    const slots = Math.max(lay.width, 1);
    const W = Math.max(560, (slots + 1) * 46), Hh = Math.max(230, (maxD + 1) * 76 + 66);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + Hh);
    const dx = W / (slots + 1);
    const pos = {};
    Object.keys(P).forEach((i) => { pos[i] = { x: (P[i].idx + 1) * dx, y: 38 + P[i].d * 76 }; });
    const roles = {};
    const addRole = (rep, name) => { const i = ptr(rep); if (i !== null) (roles[i] = roles[i] || []).push(name); };
    const top = snap.frames.length ? snap.frames[snap.frames.length - 1] : null;
    if (top) Object.keys(top.vars).forEach((k) => addRole(top.vars[k], k));
    addRole(snap.glob.root, 'root');
    addRole(snap.ret, 'return');
    const nowE = edgeSet(nodes), preE = edgeSet(pn);
    let s = '';
    /* کادر زیردرخت‌های جدا از root */
    lay.trees.forEach((t) => {
      if (t.main || !t.ids || !t.ids.length) return;
      const xs = t.ids.map((i) => pos[i].x), ys = t.ids.map((i) => pos[i].y);
      const x0 = Math.min(...xs) - 30, x1 = Math.max(...xs) + 30, y1 = Math.max(...ys) + 62;
      s += '<rect class="avdet" x="' + x0 + '" y="4" width="' + (x1 - x0) + '" height="' + (y1 - 4) + '" rx="12"/><text class="avcap" x="' + (x0 + x1) / 2 + '" y="' + (y1 - 3) + '">جدا از root (متغیر محلی)</text>';
    });
    if (rid === null) s += '<text x="10" y="16" style="fill:var(--err);font-size:12px;font-weight:700">root = None</text>';
    /* یال‌های حذف‌شده در همین گام */
    preE.forEach((e) => {
      if (nowE.has(e)) return;
      const m = /^(\d+)>(\d+)/.exec(e);
      if (pos[m[1]] && pos[m[2]] && nodes[m[1]] && nodes[m[2]]) s += '<line class="avl-edge ghost" x1="' + pos[m[1]].x + '" y1="' + pos[m[1]].y + '" x2="' + pos[m[2]].x + '" y2="' + pos[m[2]].y + '"/>';
    });
    /* یال‌های فعلی */
    ids.forEach((id) => {
      const n = nodes[id];
      [['l', 'L'], ['r', 'R']].forEach(([f, sd]) => {
        const c = n[f];
        if (c === null || !nodes[c] || !pos[id] || !pos[c]) return;
        const tree = P[c].tree === P[id].tree && P[c].d === P[id].d + 1 && P[c].idx !== undefined;
        const cls = 'avl-edge' + (preE.has(id + '>' + c + sd) ? '' : ' new') + (tree ? '' : ' cross');
        s += '<line class="' + cls + '" x1="' + pos[id].x + '" y1="' + pos[id].y + '" x2="' + pos[c].x + '" y2="' + pos[c].y + '"/>';
      });
    });
    ids.forEach((id) => {
      const n = nodes[id], p = pos[id], r = roles[id] || [];
      const isCur = r.includes('n') || r.includes('self');
      const cls = 'avn' + (isCur ? ' cur' : (r.length ? ' ref' : '')) + (pn[id] ? '' : ' nw');
      let bf = '';
      if (top && top.vars.b && top.vars.b.k === 'num' && top.vars.n && ptr(top.vars.n) === +id) bf = '<text class="bf ' + (Math.abs(top.vars.b.v) > 1 ? 'bad' : 'ok') + '" x="22" y="-8">bf=' + (top.vars.b.v > 0 ? '+' : '') + top.vars.b.v + '</text>';
      s += '<g class="' + cls + '" transform="translate(' + p.x + ',' + p.y + ')"><circle class="c" r="19"/><text class="k" y="5">' + (n.key === undefined ? '?' : esc(n.key)) + '</text><text class="h" y="34">h=' + (n.h === undefined ? '؟' : n.h) + '</text>' +
        (r.length ? '<text class="v" y="-25">' + esc(r.join(',')) + '</text>' : '') + bf + '</g>';
    });
    svg.innerHTML = s;
  }

  function drawState(snap) {
    const calls = snap.frames.map((f) => f.label);
    const st = { objs: snap.objs, glob: snap.glob };
    const an = analyze(st);
    $('#avstate').innerHTML =
      '<div class="avrow"><span class="avlab">پشته‌ی فراخوانی: bottom → top</span><span class="avchips">' +
      (calls.length ? calls.map((c, i) => '<span class="avchip' + (i === calls.length - 1 ? ' last' : '') + '">' + esc(c) + '</span>').join('') : '<span style="font-size:12px;color:var(--mut)">' + (snap.fin ? 'خالی — اجرا تمام شد' : '∅ خالی') + '</span>') + '</span></div>' +
      '<div class="avrow"><span class="avlab">پیمایش میان‌ترتیب</span><span class="avchips">' + (an.inorder.map((k) => '<span class="avchip">' + esc(k === undefined ? '?' : k) + '</span>').join('') || '<span style="font-size:12px;color:var(--mut)">—</span>') + '</span></div>' +
      '<div class="avrow"><span class="avlab">گره‌ها / ارتفاع (از root)</span><b style="font-family:var(--mono);direction:ltr;unicode-bidi:isolate">' + an.count + ' / ' + an.height + '</b></div>';
  }

  /* ----- غیرفعال‌سازی خط‌ها ----- */
  const lineOf = (op, tag) => CODE[op].L[tag];
  const indent = (t) => t.match(/^ */)[0].length;
  function blockEnd(lines, i) {       /* خط‌های بدنه‌ی بلوکی که از i شروع می‌شود */
    const ind = indent(lines[i]); const out = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (!lines[j].trim()) { continue; }
      if (indent(lines[j]) <= ind) break;
      out.push(j);
    }
    return out;
  }
  function offSets(op) {
    const lines = CODE[op].lines, own = new Set(), eff = new Set();
    S.off.forEach((tag) => {
      const i = lineOf(op, tag);
      if (i === undefined) return;
      own.add(i); eff.add(i);
      blockEnd(lines, i).forEach((j) => eff.add(j));
    });
    return { own, eff };
  }
  const offFn = (op) => { const o = offSets(op).own; return (i) => o.has(i); };
  function syncOffInfo() {
    $('#offInfo').textContent = S.off.size ? '⚠ ' + S.off.size + ' خط غیرفعال' : '';
  }
  function toggleLine(i) {
    const op = S.op, lines = CODE[op].lines;
    if (!lines[i].trim()) return;
    const tag = Object.keys(CODE[op].L).find((t) => CODE[op].L[t] === i);
    if (!tag) return;
    if (S.off.has(tag)) S.off.delete(tag); else S.off.add(tag);
    syncOffInfo(); rerun();
  }
  /* پس از تغییر کد، آخرین عملیات از همان حالت قبلی دوباره اجرا می‌شود */
  function rerun() {
    if (S.last && S.pre) execOp(S.last.op, S.last.key, S.pre);
    else ctl.refresh();
  }

  /* ----- Stepper ----- */
  const repr = (rep, snap) => reprRep(rep, snap);
  const ctl = Stepper.create(view, {
    getCode: () => {
      const lines = CODE[S.op].lines, sets = offSets(S.op);
      const tg = new Set(); lines.forEach((l, i) => { if (l.trim()) tg.add(i); });
      const pre = S.pre || S.state;
      return {
        tabs: [{ id: 'insert', label: 'insert(n, key)' }, { id: 'delete', label: 'delete(n, key)' }],
        tab: S.op, lines, off: sets.eff, offOwn: sets.own, toggle: tg,
        decl: '# درخت پیش از اجرا (پیش‌ترتیب): ' + (preorderOf(pre).join(' ') || 'تهی') + '\nroot = ' + S.op + '(root, ' + ($('#keyIn').value.trim() || 'key') + ')'
      };
    },
    onToggle: toggleLine,
    idle: () => ({ line: -1, note: '', snap: snapOf(S.pre || S.state), idle: true }),
    watch: (step) => {
      const sn = step.snap;
      if (!sn) return [];
      const out = [];
      const fr = sn.frames.length ? sn.frames[sn.frames.length - 1] : null;
      if (fr) Object.keys(fr.vars).forEach((k) => out.push([k, repr(fr.vars[k], sn)]));
      out.push(['root', repr(sn.glob.root, sn)]);
      if (sn.frames.length > 1) out.push(['depth', String(sn.frames.length)]);
      return out;
    },
    render: (step, prev) => { drawTree(step.snap, prev && prev.snap); drawState(step.snap); },
    onTab: (id) => { S.op = id; syncOp(); },
    traceOpen: false,
    hint: 'عملیات و کلید را انتخاب و «اجرای عملیات» را بزنید؛ سپس با «بعدی» یا «پخش» مراحل را دنبال کنید.'
  });
  const snapOf = (st) => ({ objs: st.objs, glob: st.glob, frames: [], ret: null, fin: false, err: null });
  function preorderOf(st) {
    const out = [], seen = new Set();
    (function g(id) { if (id === null || seen.has(id) || !st.objs[id]) return; seen.add(id); const a = st.objs[id].a; out.push(numOf(a.key) === undefined ? '?' : numOf(a.key)); g(ptr(a.left)); g(ptr(a.right)); })(rootOf(st));
    return out;
  }

  function syncOp() {
    view.querySelectorAll('#segOp button').forEach((b) => b.classList.toggle('on', b.dataset.v === S.op));
    ctl.refresh();
  }
  function info() { const an = analyze(S.state); $('#avInfo').textContent = an.count + ' گره · ارتفاع ' + an.height; }
  function resetSteps() { S.pre = null; S.last = null; ctl.setSteps([], S.op, CODE[S.op].lines); }

  function setTree(keys) {
    S.state = EMPTY();
    for (const k of keys) S.state = run('insert', S.state, k, { silent: true, deep: false }).state;   /* ساخت با کد کامل (بدون خط‌های غیرفعال) */
    info(); resetSteps();
  }
  const parseKeys = (str) => str.split(/[\s,،;]+/).filter(Boolean).map(Number);
  const okKey = (k) => Number.isInteger(k) && k >= -999 && k <= 999;

  function execOp(op, k, pre) {
    const r = run(op, pre, k, { deep: $('#deepChk').checked, off: offFn(op) });
    S.pre = pre; S.state = r.state; S.last = { op, key: k };
    info();
    ctl.setSteps(r.steps, op, CODE[op].lines);
    if (r.err) toast('خطای پایتون: ' + r.err);
  }
  function doOp() {
    const k = Number($('#keyIn').value.trim());
    if ($('#keyIn').value.trim() === '' || !okKey(k)) { toast('یک عدد صحیح (بین ‎−۹۹۹ تا ۹۹۹) به‌عنوان کلید وارد کنید.'); return; }
    const an = analyze(S.state);
    if (S.op === 'insert' && an.count >= MAX_NODES && !an.inorder.includes(k)) { toast('حداکثر ' + MAX_NODES + ' گره پشتیبانی می‌شود.'); return; }
    execOp(S.op, k, S.state);
  }

  /* ----- رویدادها ----- */
  $('#segOp').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; S.op = b.dataset.v; syncOp(); });
  $('#btnRun').addEventListener('click', doOp);
  $('#keyIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') doOp(); });
  $('#keyIn').addEventListener('input', () => ctl.refresh());
  $('#deepChk').addEventListener('change', () => { if (S.last && S.pre) rerun(); });
  $('#btnEmpty').addEventListener('click', () => { setTree([]); $('#preset').value = '0'; });
  $('#btnBuild').addEventListener('click', () => {
    const ks = parseKeys($('#bulk').value);
    if (!ks.length || !ks.every(okKey)) { toast('کلیدها را با ویرگول جدا کنید؛ مثلاً 30,20,40,10'); return; }
    if (new Set(ks).size > MAX_NODES) { toast('حداکثر ' + MAX_NODES + ' کلید پشتیبانی می‌شود.'); return; }
    setTree(ks);
  });
  $('#btnRand').addEventListener('click', () => {
    const set = new Set(); while (set.size < 7) set.add(1 + Math.floor(Math.random() * 99));
    const ks = [...set]; $('#bulk').value = ks.join(','); setTree(ks);
  });
  $('#preset').innerHTML = PRESETS.map((p, i) => '<option value="' + i + '">' + esc(p.name) + '</option>').join('');
  $('#preset').addEventListener('change', (e) => {
    const p = PRESETS[+e.target.value];
    S.op = p.op; $('#keyIn').value = String(p.key); $('#bulk').value = p.keys.join(',');
    setTree(p.keys); syncOp();
  });
  $('#exper').innerHTML = EXPERS.map((p, i) => '<option value="' + i + '">' + esc(p.name) + '</option>').join('');
  $('#exper').addEventListener('change', (e) => {
    const x = EXPERS[+e.target.value];
    S.off = new Set(x.tags); syncOffInfo();
    if (!x.tags.length) { rerun(); return; }
    S.op = x.op; $('#keyIn').value = String(x.key); $('#bulk').value = x.keys.join(',');
    setTree(x.keys); syncOp(); doOp();
  });
  $('#btnAllOn').addEventListener('click', () => { S.off = new Set(); $('#exper').value = '0'; syncOffInfo(); rerun(); });

  /* ----- شروع ----- */
  $('#preset').value = '1';
  { const p = PRESETS[1]; S.op = p.op; $('#keyIn').value = String(p.key); $('#bulk').value = p.keys.join(','); setTree(p.keys); syncOp(); }
  return { destroy() { ctl.destroy(); } };
}

window.Shell.register({
  id: 'avl',
  title: 'شبیه‌ساز درج و حذف در درخت AVL',
  subtitle: 'اجرای واقعیِ شبه‌کد پایتون روی گره‌های پیوندی — با امکان غیرفعال‌کردن خط‌های کد',
  css: CSS,
  html: HTML,
  mount: mount,
  engine: { run, analyze, CODE, EMPTY }
});
})();

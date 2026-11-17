/* مفسر کوچک زیرمجموعه‌ای از پایتون برای شبیه‌سازهای آموزشی.
   کدِ نمایش‌داده‌شده «واقعاً» اجرا می‌شود؛ هر دستور اجراشده یک گام (با عکس‌فوری از حافظه) می‌سازد.
   پشتیبانی: class با __init__، def، if/elif/else، while، return، pass، انتساب به متغیر یا صفت (a.b = ...)،
   فراخوانی توابع، عبارت‌های شرطی (x if c else y)، and/or/not، مقایسه‌ها (< > <= >= == != is is not)، + - *،
   max/min. مقدارها: None، عدد، True/False، و شیء (نمونه‌ی کلاس).
   خطاهای پایتونی (AttributeError، NameError، TypeError، RecursionError) با پیام درست گزارش می‌شوند.

   MiniPy.parse(lines, isOff)  ← isOff(lineIndex) خطِ غیرفعال (کامنت‌شده) را مشخص می‌کند؛ دستورِ غیرفعال (و بدنه‌اش) اجرا نمی‌شود
   MiniPy.createVM(prog, opts) → { run(fname,args), globals, frames, snapshot(), nextId(), emitFinal(note), errorLine() } */
(function (root) {
'use strict';

class PyErr extends Error { constructor(name, msg) { super(name + ': ' + msg); this.pyName = name; this.pyMsg = msg; } }
class Limit extends Error { constructor(msg) { super(msg || 'limit'); } }

const typeName = (v) => (v === null ? 'NoneType' : typeof v === 'number' ? 'int' : typeof v === 'boolean' ? 'bool' : (v && v.cls) || 'object');
const truthy = (v) => (v === null ? false : typeof v === 'number' ? v !== 0 : typeof v === 'boolean' ? v : true);

/* ---------- تحلیل واژگانی و نحوی ---------- */
const TOK = /\s*(?:(\d+)|([A-Za-z_]\w*)|(==|!=|<=|>=|\+=|-=|[<>+\-*().,=:]))/y;
const KW = new Set(['None', 'True', 'False', 'is', 'not', 'and', 'or', 'if', 'else']);
function tokenize(s) {
  const out = []; s = s.trim(); let i = 0;
  while (i < s.length) {
    TOK.lastIndex = i;
    const m = TOK.exec(s);
    if (!m) throw new Error('syntax: ' + s);
    if (m[1] !== undefined) out.push({ t: 'num', v: +m[1] });
    else if (m[2] !== undefined) out.push({ t: KW.has(m[2]) ? 'kw' : 'name', v: m[2] });
    else out.push({ t: 'op', v: m[3] });
    i = TOK.lastIndex;
  }
  return out;
}

function parseExpr(toks) {
  let p = 0;
  const peek = () => toks[p], isOp = (v) => toks[p] && toks[p].t === 'op' && toks[p].v === v, isKw = (v) => toks[p] && toks[p].t === 'kw' && toks[p].v === v;
  const need = (v) => { if (!(isOp(v) || isKw(v))) throw new Error('syntax: expected ' + v); p++; };
  function expr() {
    const a = orE();
    if (isKw('if')) { p++; const c = orE(); need('else'); const b = expr(); return { t: 'ifx', c, a, b }; }
    return a;
  }
  function orE() { let l = andE(); while (isKw('or')) { p++; l = { t: 'or', l, r: andE() }; } return l; }
  function andE() { let l = notE(); while (isKw('and')) { p++; l = { t: 'and', l, r: notE() }; } return l; }
  function notE() { if (isKw('not')) { p++; return { t: 'not', e: notE() }; } return cmp(); }
  function cmp() {
    let l = arith();
    for (;;) {
      const k = peek();
      if (!k) return l;
      if (k.t === 'op' && ['<', '>', '<=', '>=', '==', '!='].includes(k.v)) { p++; l = { t: 'cmp', op: k.v, l, r: arith() }; }
      else if (k.t === 'kw' && k.v === 'is') { p++; let op = 'is'; if (isKw('not')) { p++; op = 'is not'; } l = { t: 'cmp', op, l, r: arith() }; }
      else return l;
    }
  }
  function arith() { let l = term(); while (isOp('+') || isOp('-')) { const op = toks[p++].v; l = { t: 'bin', op, l, r: term() }; } return l; }
  function term() { let l = unary(); while (isOp('*')) { p++; l = { t: 'bin', op: '*', l, r: unary() }; } return l; }
  function unary() { if (isOp('-')) { p++; return { t: 'neg', e: unary() }; } return post(); }
  function post() {
    let e = atom();
    for (;;) {
      if (isOp('.')) { p++; const n = toks[p++]; if (!n || n.t !== 'name') throw new Error('syntax: attr'); e = { t: 'attr', o: e, name: n.v }; }
      else if (isOp('(')) {
        p++; const args = [];
        if (!isOp(')')) { for (;;) { args.push(expr()); if (isOp(',')) { p++; continue; } break; } }
        need(')'); e = { t: 'call', f: e, args };
      } else return e;
    }
  }
  function atom() {
    const k = toks[p++];
    if (!k) throw new Error('syntax: eof');
    if (k.t === 'num') return { t: 'num', v: k.v };
    if (k.t === 'name') return { t: 'name', v: k.v };
    if (k.t === 'kw' && k.v === 'None') return { t: 'none' };
    if (k.t === 'kw' && (k.v === 'True' || k.v === 'False')) return { t: 'bool', v: k.v === 'True' };
    if (k.t === 'op' && k.v === '(') { const e = expr(); need(')'); return e; }
    throw new Error('syntax: ' + k.v);
  }
  const e = expr();
  if (p !== toks.length) throw new Error('syntax: trailing');
  return e;
}

/* متن عبارت (برای توضیح گام‌ها) */
function fmt(e) {
  const w = (x) => (x.t === 'bin' || x.t === 'cmp' || x.t === 'ifx' || x.t === 'and' || x.t === 'or' ? '(' + fmt(x) + ')' : fmt(x));
  switch (e.t) {
    case 'num': return String(e.v);
    case 'none': return 'None';
    case 'bool': return e.v ? 'True' : 'False';
    case 'name': return e.v;
    case 'attr': return fmt(e.o) + '.' + e.name;
    case 'call': return fmt(e.f) + '(' + e.args.map(fmt).join(', ') + ')';
    case 'neg': return '-' + w(e.e);
    case 'not': return 'not ' + w(e.e);
    case 'and': case 'or': return w(e.l) + ' ' + e.t + ' ' + w(e.r);
    case 'bin': case 'cmp': return fmt(e.l) + ' ' + e.op + ' ' + (e.r.t === 'bin' || e.r.t === 'cmp' ? '(' + fmt(e.r) + ')' : fmt(e.r));
    case 'ifx': return fmt(e.a) + ' if ' + fmt(e.c) + ' else ' + fmt(e.b);
    default: return '?';
  }
}

/* ساخت درخت دستورها از خطوط (فاصله‌گذاری = ساختار بلوک‌ها) */
function parse(lines, isOff) {
  const off = isOff || (() => false);
  const items = [];
  lines.forEach((raw, i) => {
    const t = raw.replace(/#.*$/, '');
    if (!t.trim()) return;
    items.push({ i, ind: t.match(/^ */)[0].length, text: t.trim() });
  });
  let p = 0;
  const synErr = (line, msg, name) => { const e = new PyErr(name || 'SyntaxError', msg); e.line = line; throw e; };
  function block(ind) {
    const out = [];
    while (p < items.length && items[p].ind === ind) out.push(stmt(ind));
    if (p < items.length && items[p].ind > ind) synErr(items[p].i, 'unexpected indent (تورفتگی اضافه)', 'IndentationError');
    return out;
  }
  function body(ind, line) {
    if (p < items.length && items[p].ind > ind) return block(items[p].ind);
    return synErr(line, 'expected an indented block (پس از « : » باید بدنه‌ی تورفته بیاید؛ اگر خالی است pass بنویسید)', 'IndentationError');
  }
  function stmt(ind) {
    const it = items[p];
    try { return stmt0(ind, it); }
    catch (e) {
      if (e instanceof PyErr) { if (e.line === undefined) e.line = it.i; throw e; }
      return synErr(it.i, 'نحو نامعتبر یا پشتیبانی‌نشده در این خط: «' + it.text + '»');
    }
  }
  function stmt0(ind, it) {
    p++;
    const tx = it.text, line = it.i, o = off(line);
    let m;
    if ((m = /^class\s+(\w+)\s*(?:\(.*\))?\s*:$/.exec(tx))) return { t: 'class', name: m[1], line, off: o, body: body(ind, line) };
    if ((m = /^def\s+(\w+)\s*\((.*)\)\s*:$/.exec(tx))) return { t: 'def', name: m[1], params: m[2].split(',').map((s) => s.trim()).filter(Boolean), line, off: o, body: body(ind, line) };
    if ((m = /^if\s+(.*):$/.exec(tx))) {
      const branches = [{ kind: 'if', cond: parseExpr(tokenize(m[1])), line, off: o, body: body(ind, line) }];
      while (p < items.length && items[p].ind === ind) {
        const n = items[p];
        let mm;
        if ((mm = /^elif\s+(.*):$/.exec(n.text))) { p++; branches.push({ kind: 'elif', cond: parseExpr(tokenize(mm[1])), line: n.i, off: off(n.i), body: body(ind, n.i) }); }
        else if (/^else\s*:$/.test(n.text)) { p++; branches.push({ kind: 'else', line: n.i, off: off(n.i), body: body(ind, n.i) }); break; }
        else break;
      }
      return { t: 'if', branches, line };
    }
    if ((m = /^while\s+(.*):$/.exec(tx))) return { t: 'while', cond: parseExpr(tokenize(m[1])), line, off: o, body: body(ind, line) };
    if (/^pass$/.test(tx)) return { t: 'pass', line, off: o };
    if ((m = /^return(?:\s+(.*))?$/.exec(tx))) return { t: 'return', e: m[1] ? parseExpr(tokenize(m[1])) : null, line, off: o };
    const toks = tokenize(tx);
    let depth = 0, eq = -1;
    toks.forEach((k, j) => { if (k.t === 'op') { if (k.v === '(') depth++; else if (k.v === ')') depth--; else if ((k.v === '=' || k.v === '+=' || k.v === '-=') && depth === 0 && eq < 0) eq = j; } });
    if (eq > 0) {
      const target = parseExpr(toks.slice(0, eq));
      if (target.t !== 'name' && target.t !== 'attr') throw new Error('syntax: target');
      const rhs = parseExpr(toks.slice(eq + 1));
      const opv = toks[eq].v;
      return { t: 'assign', target, e: opv === '=' ? rhs : { t: 'bin', op: opv[0], l: target, r: rhs }, line, off: o };
    }
    return { t: 'expr', e: parseExpr(toks), line, off: o };
  }
  if (items.length && items[0].ind !== 0) synErr(items[0].i, 'unexpected indent (تورفتگی اضافه)', 'IndentationError');
  const top = block(0);
  if (p < items.length) synErr(items[p].i, 'unindent does not match any outer indentation level', 'IndentationError');
  return { body: top };
}

/* ---------- ماشین اجرا ---------- */
function createVM(prog, opts) {
  const o = Object.assign({ deep: true, atomic: [], maxSteps: 4000, maxExec: 200000, maxDepth: 120, nextId: 1, record: true, onStep: null }, opts || {});
  const funcs = Object.create(null), classes = Object.create(null);
  prog.body.forEach((s) => {
    if (s.off) return;
    if (s.t === 'def') funcs[s.name] = s;
    else if (s.t === 'class') {
      const c = { name: s.name, methods: Object.create(null) };
      s.body.forEach((m) => { if (m.t === 'def' && !m.off) c.methods[m.name] = m; });
      classes[s.name] = c;
    }
  });
  const frames = [], globals = { root: null };
  let silent = 0, steps = 0, execs = 0, curLine = -1, callSteps = 0, nid = o.nextId;

  const repr = (v) => {
    if (v === null) return 'None';
    if (typeof v === 'boolean') return v ? 'True' : 'False';
    if (typeof v === 'number') return String(v);
    if (v === undefined) return '?';
    return v.cls + '(' + ('key' in v.a ? v.a.key : '?') + ')';
  };
  const rep = (v) => (v === null ? { k: 'none' } : typeof v === 'number' ? { k: 'num', v } : typeof v === 'boolean' ? { k: 'bool', v } : { k: 'obj', id: v.id });

  function snapshot(ex) {
    ex = ex || {};
    const objs = {}, seen = new Set();
    const visit = (v) => {
      if (!v || typeof v !== 'object' || seen.has(v)) return;
      seen.add(v);
      const a = {};
      Object.keys(v.a).forEach((k) => { a[k] = rep(v.a[k]); });
      objs[v.id] = { cls: v.cls, a };
      Object.keys(v.a).forEach((k) => visit(v.a[k]));
    };
    visit(globals.root);
    const fr = ex.noFrames ? [] : frames.map((f) => {
      const vars = {};
      Object.keys(f.vars).forEach((k) => { visit(f.vars[k]); vars[k] = rep(f.vars[k]); });
      return { label: f.label, fn: f.fn, vars };
    });
    if (ex.ret !== undefined) visit(ex.ret);
    return { objs, glob: { root: rep(globals.root) }, frames: fr, ret: ex.ret === undefined ? null : rep(ex.ret), fin: !!ex.fin, err: ex.err || null };
  }

  function emit(line, note, ex) {
    if (!o.record || silent > 0) return;
    if (++steps > o.maxSteps) throw new Limit('steps');
    if (o.onStep) o.onStep(line, note, ex || {}, snapshot);
  }

  /* ----- دسترسی به صفت‌ها ----- */
  function getattr(ob, name) {
    if (ob && typeof ob === 'object') {
      if (name in ob.a) return ob.a[name];
      throw new PyErr('AttributeError', "'" + ob.cls + "' object has no attribute '" + name + "'");
    }
    throw new PyErr('AttributeError', "'" + typeName(ob) + "' object has no attribute '" + name + "'");
  }
  function setattr(ob, name, v) {
    if (ob && typeof ob === 'object') { ob.a[name] = v; return; }
    throw new PyErr('AttributeError', "'" + typeName(ob) + "' object has no attribute '" + name + "'");
  }
  const num2 = (op, l, r) => {
    if (typeof l !== 'number' || typeof r !== 'number') throw new PyErr('TypeError', "unsupported operand type(s) for " + op + ": '" + typeName(l) + "' and '" + typeName(r) + "'");
  };

  /* ----- محاسبه‌ی عبارت‌ها ----- */
  function ev(e, line) {
    switch (e.t) {
      case 'num': return e.v;
      case 'none': return null;
      case 'bool': return e.v;
      case 'name': {
        const f = frames[frames.length - 1];
        if (f && e.v in f.vars) return f.vars[e.v];
        throw new PyErr('NameError', "name '" + e.v + "' is not defined");
      }
      case 'attr': return getattr(ev(e.o, line), e.name);
      case 'neg': { const v = ev(e.e, line); if (typeof v !== 'number') throw new PyErr('TypeError', "bad operand type for unary -: '" + typeName(v) + "'"); return -v; }
      case 'not': return !truthy(ev(e.e, line));
      case 'and': { const l = ev(e.l, line); return truthy(l) ? ev(e.r, line) : l; }
      case 'or': { const l = ev(e.l, line); return truthy(l) ? l : ev(e.r, line); }
      case 'ifx': return truthy(ev(e.c, line)) ? ev(e.a, line) : ev(e.b, line);
      case 'bin': {
        const l = ev(e.l, line), r = ev(e.r, line);
        num2(e.op, l, r);
        return e.op === '+' ? l + r : e.op === '-' ? l - r : l * r;
      }
      case 'cmp': {
        const l = ev(e.l, line), r = ev(e.r, line);
        e._l = l; e._r = r;
        switch (e.op) {
          case 'is': case '==': return l === r;
          case 'is not': case '!=': return l !== r;
          default:
            if (typeof l !== 'number' || typeof r !== 'number') throw new PyErr('TypeError', "'" + e.op + "' not supported between instances of '" + typeName(l) + "' and '" + typeName(r) + "'");
            return e.op === '<' ? l < r : e.op === '>' ? l > r : e.op === '<=' ? l <= r : l >= r;
        }
      }
      case 'call': return evCall(e, line);
      default: throw new Error('bad expr');
    }
  }
  function evCall(e, line) {
    if (e.f.t !== 'name') throw new PyErr('TypeError', "'" + typeName(null) + "' object is not callable");
    const name = e.f.v;
    const args = e.args.map((a) => ev(a, line));
    if (name === 'max' || name === 'min') {
      if (!args.length) throw new PyErr('TypeError', name + ' expected at least 1 argument, got 0');
      for (let i = 1; i < args.length; i++) if (typeof args[i] !== 'number' || typeof args[0] !== 'number') throw new PyErr('TypeError', "'" + (name === 'max' ? '>' : '<') + "' not supported between instances of '" + typeName(args[i]) + "' and '" + typeName(args[0]) + "'");
      return name === 'max' ? Math.max(...args) : Math.min(...args);
    }
    if (classes[name]) return instantiate(classes[name], args, line);
    if (funcs[name]) return callFn(funcs[name], args, line, name + '(' + args.map(repr).join(', ') + ')', name);
    throw new PyErr('NameError', "name '" + name + "' is not defined");
  }
  function instantiate(c, args, line) {
    const init = c.methods.__init__;
    const callLabel = c.name + '(' + args.map(repr).join(', ') + ')';
    if (!init) {
      if (args.length) throw new PyErr('TypeError', c.name + '() takes no arguments');
      return { id: nid++, cls: c.name, a: Object.create(null) };
    }
    const obj = { id: nid++, cls: c.name, a: Object.create(null) };
    const label = c.name + '.__init__(self' + (args.length ? ', ' + args.map(repr).join(', ') : '') + ')';
    callFn(init, [obj].concat(args), line, label, c.name, callLabel);
    return obj;
  }
  const isAtomic = (n) => !o.deep && o.atomic.includes(n);

  function callFn(def, args, line, label, atomName, callLabel) {
    if (frames.length >= o.maxDepth) throw new PyErr('RecursionError', 'maximum recursion depth exceeded');
    if (args.length !== def.params.length) throw new PyErr('TypeError', def.name + '() takes ' + def.params.length + ' positional argument' + (def.params.length === 1 ? '' : 's') + ' but ' + args.length + ' were given');
    const at = isAtomic(atomName);
    if (at) silent++;
    try {
      if (line >= 0 && silent === 0 && o.record) { emit(line, 'فراخوانی ' + (callLabel || label) + ' — اجرا به داخل تابع می‌رود.'); callSteps++; }
      const vars = Object.create(null);
      def.params.forEach((p, i) => { vars[p] = args[i]; });
      frames.push({ label, vars, fn: def.name });
      emit(def.line, 'ورود به ' + label + ' — پارامترها با آرگومان‌ها مقدار گرفتند.');
      const r = execBlock(def.body);
      const rv = r ? r.v : null;
      frames.pop();
      return rv;
    } finally { if (at) silent--; }
  }

  /* ----- دستورها ----- */
  const SIDE = { left: 'چپ', right: 'راست' };
  function noteAssign(s, v, ob) {
    const tgt = fmt(s.target);
    let t = tgt + ' = ' + repr(v) + '.';
    if (s.target.t === 'attr') {
      const nm = s.target.name;
      if (nm in SIDE) t += ' فرزند ' + SIDE[nm] + ' ' + repr(ob) + (v === null ? ' اکنون None است ← یال آن حذف شد.' : ' اکنون ' + repr(v) + ' است ← یال جدید.');
      else if (nm === 'height') t += ' ارتفاع ذخیره‌شده‌ی ' + repr(ob) + ' اکنون ' + repr(v) + ' است.';
      else if (nm === 'key') t += ' کلید گره‌ی ' + repr(ob) + ' (پیش از این ' + (ob._old === undefined ? '?' : ob._old) + ') شد ' + repr(v) + '.';
    }
    return t;
  }
  function noteCond(kind, cond, v) {
    const val = truthy(v);
    let t = kind + ' ' + fmt(cond) + ' ؟ ';
    if (cond.t === 'cmp') t += repr(cond._l) + ' ' + cond.op + ' ' + repr(cond._r);
    else t += repr(v);
    t += ' → ' + (val ? 'درست' : 'نادرست');
    return { val, t };
  }
  function execBlock(list) {
    for (const s of list) { const r = execStmt(s); if (r) return r; }
    return null;
  }
  function tick() { if (++execs > o.maxExec) throw new Limit('exec'); }
  function execStmt(s) {
    switch (s.t) {
      case 'if': {
        for (const b of s.branches) {
          if (b.off) continue;
          tick(); curLine = b.line;
          if (b.kind === 'else') {
            emit(b.line, 'else: شرط‌های قبلی همه نادرست بودند ← بلوک else اجرا می‌شود.');
            return execBlock(b.body);
          }
          const v = ev(b.cond, b.line);
          const c = noteCond(b.kind, b.cond, v);
          emit(b.line, c.t + (c.val ? ' ← وارد بلوک می‌شویم.' : ' ← بلوک رد می‌شود.'));
          if (c.val) return execBlock(b.body);
        }
        return null;
      }
      case 'while': {
        if (s.off) return null;
        for (;;) {
          tick(); curLine = s.line;
          const v = ev(s.cond, s.line);
          const c = noteCond('while', s.cond, v);
          emit(s.line, c.t + (c.val ? ' ← یک دور دیگر.' : ' ← حلقه تمام شد.'));
          if (!c.val) return null;
          const r = execBlock(s.body);
          if (r) return r;
        }
      }
      case 'pass': if (s.off) return null; tick(); curLine = s.line; emit(s.line, 'pass'); return null;
      case 'def': case 'class': return null;
      default: break;
    }
    if (s.off) return null;
    tick(); curLine = s.line;
    if (s.t === 'assign') {
      const v = ev(s.e, s.line);
      let ob = null;
      if (s.target.t === 'name') {
        const f = frames[frames.length - 1];
        f.vars[s.target.v] = v;
        emit(s.line, s.target.v + ' = ' + repr(v) + '.');
      } else {
        ob = ev(s.target.o, s.line);
        const old = ob && typeof ob === 'object' && s.target.name in ob.a ? ob.a[s.target.name] : undefined;
        if (ob && typeof ob === 'object') ob._old = old;
        setattr(ob, s.target.name, v);
        emit(s.line, noteAssign(s, v, ob));
        if (ob && typeof ob === 'object') delete ob._old;
      }
      return null;
    }
    if (s.t === 'return') {
      const v = s.e ? ev(s.e, s.line) : null;
      const f = frames[frames.length - 1];
      emit(s.line, 'return ' + repr(v) + ' — بازگشت از ' + (f ? f.label : 'تابع') + ' به فراخوان.', { ret: v });
      return { v };
    }
    if (s.t === 'expr') {
      const before = callSteps;
      const v = ev(s.e, s.line);
      if (callSteps === before) emit(s.line, fmt(s.e) + ' اجرا شد' + (v === null ? '.' : ' ← ' + repr(v) + '.'));
      return null;
    }
    return null;
  }

  function run(fname, args) {
    const def = funcs[fname];
    if (!def) throw new PyErr('NameError', "name '" + fname + "' is not defined");
    frames.length = 0;
    return callFn(def, args, -1, fname + '(' + args.map(repr).join(', ') + ')', fname);
  }

  return {
    run, globals, frames, snapshot, repr,
    nextId: () => nid, errorLine: () => curLine,
    emitFinal: (note, ex) => { const s = silent; silent = 0; steps = Math.min(steps, o.maxSteps - 1); try { emit(-1, note, ex); } finally { silent = s; } },
    emitError: (line, note, ex) => { silent = 0; steps = Math.min(steps, o.maxSteps - 1); emit(line, note, ex); }
  };
}

root.MiniPy = { parse, createVM, PyErr, Limit, fmt };
})(typeof window !== 'undefined' ? window : globalThis);

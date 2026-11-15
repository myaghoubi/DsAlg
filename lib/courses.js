/* فهرست درس‌ها و مبحث‌ها برای سامانه‌ی فعال‌سازی.
   مهم: ترتیب درس‌ها (idx) و ترتیب مبحث‌ها (topics) را هرگز عوض نکنید و موارد جدید را فقط به «انتها» اضافه کنید؛
   چون کدهای فعال‌سازی و کدهای زمانی ایمن‌شده، شماره‌ی درس/مبحث را ذخیره می‌کنند. */
(function (root) {
  'use strict';
  root.COURSES = [
    { idx: 0, id: 'ds', short: 'DSA', icon: '📚', title: 'درس ساختمان داده‌ها و الگوریتم‌ها', topics: ['stack-queue', 'graph-traversal', 'avl'] },
    { idx: 1, id: 'tl', short: 'TLM', icon: '⚙️', title: 'نظریه‌ی زبان‌ها و ماشین‌ها', topics: ['pda', 'turing'] }
  ];
})(typeof window !== 'undefined' ? window : globalThis);

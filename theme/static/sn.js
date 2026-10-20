/* 辰记 StarNote · GitHub 博客模板 — 辰记评论预览（模板自有脚本，不来自 SSR）。
   只读展示辰记原文最新 3 条评论（公开 GET 接口，不带凭据），参与讨论要去辰记原文 #comments 登录后进行。
   只在 site.json comments="chenji" 且文章有辰记原文链接时加载；配置在 <script id="sn-cfg">（构建时生成）。 */
(function () {
  'use strict';
  var doc = document;
  var cfgEl = doc.getElementById('sn-cfg');
  if (!cfgEl) return;
  var cfg = {};
  try { cfg = JSON.parse(cfgEl.textContent || '{}'); } catch (e) { return; }
  var T = cfg.i18n || {};
  function t(key, n) { return (T[key] || key).replace('{n}', n == null ? '' : n); }
  function get(url) {
    return fetch(url, { credentials: 'omit' }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || j.code !== 0) throw new Error((j && j.message) || 'error');
      return j.data;
    });
  }

  /* ---------- 辰记 comments preview ---------- */
  (function comments() {
    var box = doc.querySelector('[data-sn-comments]');
    if (!box || !cfg.comments) return;
    var list = box.querySelector('[data-sn-comments-list]');
    var status = box.querySelector('[data-sn-comments-status]');
    function el(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function avatar(a) {
      var size = 32;
      if (a && a.avatar_url) {
        var img = el('img', 'avatar'); img.src = /^https?:/.test(a.avatar_url) ? a.avatar_url : cfg.origin + a.avatar_url;
        img.alt = ''; img.width = size; img.height = size; img.loading = 'lazy'; img.style.setProperty('--sz', size + 'px'); return img;
      }
      var s = el('span', 'avatar avatar-text', ((a && a.name) || '?').trim().charAt(0) || '?');
      s.style.setProperty('--sz', size + 'px'); s.setAttribute('aria-hidden', 'true'); return s;
    }
    function date(iso) {
      var d = new Date(iso); if (isNaN(d)) return '';
      return cfg.lang === 'en' ? d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
    }
    get(cfg.comments).then(function (d) {
      if (d.policy === 'off') { box.hidden = true; return; }
      var items = (d.items || []).slice(0, 3);
      if (status) status.textContent = d.total ? t('comments_count', d.total) : t('comments_none');
      list.textContent = '';
      items.forEach(function (c) {
        var node = el('article', 'comment');
        node.appendChild(avatar(c.author));
        var main = el('div');
        var head = el('div', 'comment-head');
        head.appendChild(el('b', null, (c.author && c.author.name) || '—'));
        var time = el('time', null, date(c.created_at)); time.dateTime = c.created_at || ''; head.appendChild(time);
        main.appendChild(head);
        main.appendChild(el('p', 'comment-body' + (c.deleted ? ' is-deleted' : ''), c.deleted ? t('comment_deleted') : (c.text || '')));
        node.appendChild(main);
        list.appendChild(node);
      });
      if (d.total > items.length && items.length) {
        var more = el('a', 'comment-more', t('comments_all', d.total)); more.href = cfg.comments_url; more.target = '_blank'; more.rel = 'noopener';
        list.appendChild(more);
      }
    }).catch(function () { if (status) status.textContent = ''; });
  })();
})();

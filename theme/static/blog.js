/* 辰记 StarNote 博客脚本 — 复制自 starnote-api app/web/static/blog.js（SPEC-r8，sha1 87f86b8ebd76，2026-10-19），请勿在此改动。 */
/* 辰记 StarNote · public blog — progressive enhancement.
   Everything on the page works without this file; it adds: theme toggle, cookie consent, search scope,
   the category menu's gliding pill / overflow / hover preview, reading progress + TOC tracking, the view
   counter and the comments list (loaded from the JSON API — works for SSR and the static export alike). */
(function () {
  'use strict';
  var doc = document;
  var root = doc.documentElement;
  var body = doc.body;
  if (!body || !body.classList.contains('blog')) return;

  var API = (body.getAttribute('data-api') || '').replace(/\/$/, '');
  var API_ORIGIN = API.replace(/\/api\/v1$/, '');
  var HANDLE = body.getAttribute('data-handle') || '';
  var LANG = body.getAttribute('data-lang') || 'zh-CN';
  var I18N = {};
  try { I18N = JSON.parse((doc.getElementById('sn-i18n') || {}).textContent || '{}'); } catch (e) { I18N = {}; }
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function t(key, n) { return (I18N[key] || key).replace('{n}', n == null ? '' : n); }
  function $(sel, el) { return (el || doc).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || doc).querySelectorAll(sel)); }
  function el(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function store(key, val) { try { if (val === undefined) return localStorage.getItem(key); localStorage.setItem(key, val); } catch (e) { return null; } }
  function absUrl(u) { return !u ? u : /^https?:\/\//.test(u) ? u : API_ORIGIN + u; }
  function api(path, opts) {
    if (!API) return Promise.reject(new Error('no api'));
    return fetch(API + path, Object.assign({ credentials: 'omit', headers: { Accept: 'application/json' } }, opts || {}))
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j || j.code !== 0) throw Object.assign(new Error(j && j.message || 'error'), { code: j && j.code }); return j.data; });
  }
  function fmtNum(n) { n = Number(n) || 0; if (n >= 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'; return n.toLocaleString('en-US'); }
  function fmtShort(iso) {
    var d = new Date(iso); if (isNaN(d)) return '';
    var m = d.getMonth() + 1, day = d.getDate();
    if (LANG === 'en') return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1] + ' ' + day;
    if (LANG === 'ja') return m + '月' + day + '日';
    return m + ' 月 ' + day + ' 日';
  }
  function fmtLong(iso) {
    var d = new Date(iso); if (isNaN(d)) return '';
    var y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
    if (LANG === 'en') return fmtShort(iso) + ', ' + y;
    if (LANG === 'ja') return y + '年' + m + '月' + day + '日';
    return y + ' 年 ' + m + ' 月 ' + day + ' 日';
  }

  /* ---------- theme ---------- */
  (function theme() {
    var btn = $('[data-theme-toggle]');
    var mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
    function effective() {
      var t = root.getAttribute('data-theme');
      if (t === 'dark' || t === 'light') return t;
      return mq && mq.matches ? 'dark' : 'light';
    }
    function apply(next, persist) {
      root.setAttribute('data-theme', next);
      root.classList.toggle('is-dark', next === 'dark');
      if (persist) store('sn-theme', next);
    }
    root.classList.toggle('is-dark', effective() === 'dark');
    if (btn) btn.addEventListener('click', function () { apply(effective() === 'dark' ? 'light' : 'dark', true); });
    if (mq && mq.addEventListener) mq.addEventListener('change', function () { if (!store('sn-theme')) root.classList.toggle('is-dark', effective() === 'dark'); });
  })();

  /* ---------- cookie consent ---------- */
  // Code blocks of the post body (HTML rendered by the editor SDK): the copy button is hidden in the HTML so a page
  // without script never shows a dead control; same behaviour as @starnote/shared publish/enhance.ts.
  (function codeCopy() {
    function copy(text) {
      if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
      return new Promise(function (resolve, reject) {
        var area = el('textarea'); area.value = text; area.setAttribute('readonly', ''); area.style.position = 'fixed'; area.style.opacity = '0';
        doc.body.appendChild(area); area.select();
        var ok = false; try { ok = doc.execCommand('copy'); } catch (e) { ok = false; }
        area.remove(); if (ok) resolve(); else reject(new Error('copy'));
      });
    }
    $$('.post-body button[data-sn-copy]').forEach(function (btn) {
      var label = btn.getAttribute('aria-label') || '';
      var done = btn.getAttribute('data-copied-label') || label;
      var timer = null;
      btn.hidden = false;
      btn.addEventListener('click', function () {
        var block = btn.closest('.richtext-code-block');
        var code = block && block.querySelector('pre code');
        if (!code) return;
        copy(code.textContent || '').then(function () {
          btn.setAttribute('data-copied', ''); btn.setAttribute('aria-label', done); btn.title = done;
          clearTimeout(timer);
          timer = setTimeout(function () { btn.removeAttribute('data-copied'); btn.setAttribute('aria-label', label); btn.title = label; }, 1500);
        }, function () {});
      });
    });
  })();

  /* AdSense (SPEC-r8): only on pages the server rendered with body[data-ads] (ADSENSE_CLIENT + the author's switch).
     banner mode: the script loads after 「全部接受」 here; cmp mode: it is already in <head> and a Google-certified CMP
     asks for consent itself, so our bar stays closed and 「Cookie 设置」 reopens the CMP. */
  var ADS = body.getAttribute('data-ads') || '';
  var ADS_CMP = body.getAttribute('data-ads-consent') === 'cmp';
  var adsLoaded = false;
  function loadAds() {
    if (!ADS || adsLoaded) return;
    adsLoaded = true;
    function fill() { $$('ins.adsbygoogle').forEach(function () { try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { /* ad blocker */ } }); }
    if (ADS_CMP) { fill(); return; }
    var s = doc.createElement('script');
    s.async = true; s.src = ADS; s.crossOrigin = 'anonymous';
    doc.head.appendChild(s);
    fill();
  }

  (function cookies() {
    var bar = $('[data-cookie-bar]');
    var KEY = 'sn.cookie-consent';
    if (ADS && ADS_CMP) {
      loadAds();
      $$('[data-cookie-settings]').forEach(function (b) {
        b.addEventListener('click', function () {
          var fc = window.googlefc = window.googlefc || {}; fc.callbackQueue = fc.callbackQueue || [];
          fc.callbackQueue.push(function () { if (fc.showRevocationMessage) fc.showRevocationMessage(); });
        });
      });
      return;
    }
    if (!bar) return;
    function open() { bar.hidden = false; }
    function pick(choice) {
      store(KEY, JSON.stringify(choice)); bar.hidden = true;
      body.setAttribute('data-cookie-consent', choice); root.setAttribute('data-consent', choice);
      if (choice === 'all') loadAds();
    }
    var saved = store(KEY);
    if (saved) { saved = saved.replace(/"/g, ''); body.setAttribute('data-cookie-consent', saved); if (saved === 'all') loadAds(); } else open();
    $$('[data-cookie-choice]', bar).forEach(function (b) { b.addEventListener('click', function () { pick(b.getAttribute('data-cookie-choice')); }); });
    $$('[data-cookie-settings]').forEach(function (b) { b.addEventListener('click', open); });
  })();

  /* ---------- search scope (the bar's form and the phone menu's) ---------- */
  $$('.blog-search').forEach(function search(form) {
    var input = $('input[type=search]', form);
    var handle = $('[data-search-handle]', form);
    $$('[data-scope]', form).forEach(function (b) {
      b.addEventListener('click', function () {
        var mine = b.getAttribute('data-scope') === 'mine';
        $$('[data-scope]', form).forEach(function (x) { var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', on ? 'true' : 'false'); });
        if (handle) handle.disabled = !mine;
        if (input) input.placeholder = input.getAttribute(mine ? 'data-ph-mine' : 'data-ph-all') || '';
      });
    });
    form.addEventListener('submit', function (e) { if (input && !input.value.trim()) e.preventDefault(); });
  });

  /* ---------- phone menu sheet: a <details> that works without JS; here it also closes on Escape, an outside
     tap and when the window widens past the breakpoint ---------- */
  function dismissable(details, onClose) {
    if (!details) return;
    var summary = $('summary', details);
    doc.addEventListener('pointerdown', function (e) { if (details.open && !details.contains(e.target)) { details.open = false; if (onClose) onClose(); } });
    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && details.open) { details.open = false; if (summary) summary.focus(); } });
  }
  (function navMenu() {
    var menu = $('[data-nav-menu]');
    if (!menu) return;
    dismissable(menu);
    var wide = window.matchMedia ? matchMedia('(min-width: 961px)') : null;
    if (wide && wide.addEventListener) wide.addEventListener('change', function () { if (wide.matches) menu.open = false; });
    menu.addEventListener('toggle', function () { body.classList.toggle('is-menu-open', menu.open); });
  })();

  /* ---------- nav drawer (article / about / contact pages fold the menu into the bar) ---------- */
  (function drawer() {
    var toggle = $('[data-menu-toggle]');
    var drawer = $('#cm-drawer');
    if (!toggle || !drawer) return;
    toggle.addEventListener('click', function () {
      var open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      drawer.classList.toggle('is-open', open);
      drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
      if (open) cmLayout();
    });
  })();

  /* ---------- category menu: pill, overflow, preview ---------- */
  var cmLayout = function () {};
  (function categoryMenu() {
    var nav = $('[data-cm]');
    if (!nav) return;
    var row = $('.cm-row', nav);
    var pill = $('.cm-pill', nav);
    var preview = $('[data-cm-preview]', nav);
    var postUrl = nav.getAttribute('data-post-url') || '';
    var items = $$('.cm-item', row);
    var active = items.filter(function (a) { return a.getAttribute('aria-current') === 'page'; })[0] || null;
    var MORE_W = 88;

    // "更多" overflow: measure natural widths once, fold what does not fit into a panel.
    var more = el('div', 'cm-more');
    var moreBtn = el('button', 'cm-item cm-more-btn');
    moreBtn.type = 'button'; moreBtn.setAttribute('data-key', 'more'); moreBtn.setAttribute('aria-expanded', 'false');
    moreBtn.appendChild(el('span', 'cm-label', t('menu_more') === 'menu_more' ? '更多' : t('menu_more')));
    var moreSup = el('sup'); moreBtn.appendChild(moreSup);
    var panel = el('div', 'cm-panel'); panel.setAttribute('role', 'menu');
    more.appendChild(moreBtn); more.appendChild(panel);
    row.insertBefore(more, preview);
    var widths = items.map(function (a) { return a.offsetWidth; });
    function layout() {
      var w = row.clientWidth - 48;
      if (!w || widths.length !== items.length || widths.some(function (x) { return !x; })) { widths = items.map(function (a) { a.classList.remove('is-folded'); return a.offsetWidth; }); }
      var used = 0, n = 0;
      for (; n < widths.length; n++) {
        var needMore = n < widths.length - 1 ? MORE_W : 0;
        if (used + widths[n] + needMore > w) break;
        used += widths[n];
      }
      if (n === widths.length - 1 && used + widths[n] <= w) n = widths.length;
      n = Math.max(1, n);
      panel.textContent = '';
      var folded = 0, activeFolded = false;
      items.forEach(function (a, i) {
        var fold = i >= n;
        a.classList.toggle('is-folded', fold);
        if (fold) {
          folded++;
          var link = el('a', 'cm-panel-item'); link.href = a.href; link.setAttribute('role', 'menuitem');
          if (a === active) { link.setAttribute('aria-current', 'page'); activeFolded = true; }
          link.appendChild(el('span', null, $('.cm-label', a).textContent));
          var c = a.getAttribute('data-count'); if (c) link.appendChild(el('em', null, c));
          panel.appendChild(link);
        }
      });
      more.classList.toggle('is-on', folded > 0);
      moreSup.textContent = folded ? String(folded) : '';
      if (activeFolded) moreBtn.setAttribute('aria-current', 'page'); else moreBtn.removeAttribute('aria-current');
      rest();
    }
    cmLayout = layout;
    moreBtn.addEventListener('click', function () { var open = moreBtn.getAttribute('aria-expanded') !== 'true'; moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false'); panel.classList.toggle('is-open', open); });
    more.addEventListener('mouseenter', function () { moreBtn.setAttribute('aria-expanded', 'true'); panel.classList.add('is-open'); hidePreview(); movePill(moreBtn); });
    more.addEventListener('mouseleave', function () { moreBtn.setAttribute('aria-expanded', 'false'); panel.classList.remove('is-open'); });

    // the pill glides under the pointer and rests on the current page
    function movePill(target) {
      if (!pill) return;
      if (!target || target.classList.contains('is-folded')) { pill.classList.remove('is-on'); return; }
      var r = target.getBoundingClientRect(), rr = row.getBoundingClientRect();
      pill.style.transform = 'translateX(' + (r.left - rr.left) + 'px)';
      pill.style.width = r.width + 'px';
      pill.classList.add('is-on');
    }
    function rest() { movePill(active && active.classList.contains('is-folded') ? moreBtn : active); }

    // hover preview: the latest posts of a category, fetched once
    var cache = {}, timer = null, current = null;
    function hidePreview() { if (preview) { preview.classList.remove('is-open'); preview.setAttribute('aria-hidden', 'true'); } current = null; }
    function renderPreview(a, posts) {
      if (!preview || current !== a) return;
      preview.textContent = '';
      var head = el('div', 'cm-preview-head');
      head.appendChild(el('b', null, $('.cm-label', a).textContent));
      var all = el('a', null, t('menu_all_posts', a.getAttribute('data-count') || '')); all.href = a.href; head.appendChild(all);
      preview.appendChild(head);
      if (posts === null) { var sk = el('div', 'cm-preview-skel'); sk.appendChild(el('i')); sk.appendChild(el('i')); sk.appendChild(el('i')); preview.appendChild(sk); }
      else if (!posts.length) preview.appendChild(el('div', 'cm-preview-empty', t('menu_empty')));
      else {
        var ul = el('ul');
        posts.forEach(function (p) {
          var li = el('li'), link = el('a');
          link.href = postUrl.replace('__KEY__', encodeURIComponent(p.short_id || p.slug));
          link.appendChild(el('span', null, p.title)); link.appendChild(el('small', null, fmtShort(p.published_at)));
          li.appendChild(link); ul.appendChild(li);
        });
        preview.appendChild(ul);
      }
    }
    function showPreview(a) {
      var slug = a.getAttribute('data-slug');
      if (!slug || !preview || !API) return hidePreview();
      current = a;
      var r = a.getBoundingClientRect(), rr = row.getBoundingClientRect();
      preview.style.transform = 'translateX(' + (r.left - rr.left - 24) + 'px)';
      preview.classList.add('is-open'); preview.setAttribute('aria-hidden', 'false');
      if (cache[slug]) return renderPreview(a, cache[slug]);
      renderPreview(a, null);
      api('/blogs/' + encodeURIComponent(HANDLE) + '/posts?category=' + encodeURIComponent(slug) + '&page=1&page_size=3')
        .then(function (d) { cache[slug] = d.items || []; renderPreview(a, cache[slug]); })
        .catch(function () { cache[slug] = []; renderPreview(a, []); });
    }
    items.forEach(function (a) {
      a.addEventListener('mouseenter', function () { movePill(a); clearTimeout(timer); timer = setTimeout(function () { showPreview(a); }, 140); });
      a.addEventListener('focus', function () { movePill(a); });
    });
    nav.addEventListener('mouseleave', function () { clearTimeout(timer); timer = setTimeout(hidePreview, 120); rest(); });
    if (preview) { preview.addEventListener('mouseenter', function () { clearTimeout(timer); }); preview.addEventListener('mouseleave', function () { timer = setTimeout(hidePreview, 120); }); }

    // phones: the row scrolls sideways (CSS); bring the current chip into view without scrolling the page
    function centreActive() {
      if (!active || row.scrollWidth <= row.clientWidth + 1) return;
      row.scrollLeft = Math.max(0, active.offsetLeft - (row.clientWidth - active.offsetWidth) / 2);
    }
    layout();
    centreActive();
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { widths = []; layout(); });
    var raf = null;
    window.addEventListener('resize', function () { cancelAnimationFrame(raf); raf = requestAnimationFrame(function () { widths = []; layout(); }); });
  })();

  /* ---------- toast ---------- */
  var toastTimer = null;
  function toast(msg) {
    var n = $('.sn-toast');
    if (!n) { n = el('div', 'sn-toast'); n.setAttribute('role', 'status'); n.setAttribute('aria-live', 'polite'); body.appendChild(n); }
    n.textContent = msg;
    requestAnimationFrame(function () { n.classList.add('is-on'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { n.classList.remove('is-on'); }, 1800);
  }

  /* ---------- article: progress, toc, views, comments ---------- */
  var postKey = body.getAttribute('data-post-key');
  if (!postKey) return;
  // a password post (SPEC-r3 §B) was opened with ?pwd=; the view counter and comments need the same code
  var PWD = (function () { var m = /[?&]pwd=([^&#]*)/.exec(location.search); return m ? decodeURIComponent(m[1]) : ''; })();
  var pwdQ = PWD ? 'pwd=' + encodeURIComponent(PWD) : '';

  (function progress() {
    var bar = $('[data-progress]');
    if (!bar) return;
    function on() {
      var h = root.scrollHeight - window.innerHeight;
      bar.style.width = (h > 0 ? Math.min(100, Math.max(0, (window.scrollY / h) * 100)) : 0) + '%';
    }
    on(); window.addEventListener('scroll', on, { passive: true }); window.addEventListener('resize', on);
  })();

  (function toc() {
    var nav = $('[data-toc]');
    var head = $('[data-post-head]');
    if (!nav) return;
    var links = $$('a', nav);
    var ids = links.map(function (a) { return decodeURIComponent(a.getAttribute('href').slice(1)); });
    var positions = [];
    function measure() {
      positions = ids.map(function (id) { var h = doc.getElementById(id); return h ? { id: id, top: h.getBoundingClientRect().top + window.scrollY } : null; }).filter(Boolean);
    }
    function on() {
      if (head) { var shown = head.getBoundingClientRect().bottom < 96; nav.classList.toggle('is-shown', shown); nav.setAttribute('aria-hidden', shown ? 'false' : 'true'); }
      var y = window.scrollY + 120, cur = positions.length ? positions[0].id : null;
      for (var i = 0; i < positions.length; i++) if (positions[i].top <= y) cur = positions[i].id;
      links.forEach(function (a, i) { a.classList.toggle('on', ids[i] === cur); });
    }
    links.forEach(function (a, i) {
      a.addEventListener('click', function (e) {
        var h = doc.getElementById(ids[i]); if (!h) return;
        e.preventDefault();
        window.scrollTo({ top: h.getBoundingClientRect().top + window.scrollY - 88, behavior: reduced ? 'auto' : 'smooth' });
        history.replaceState(null, '', '#' + ids[i]);
      });
    });
    measure(); on();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', function () { measure(); on(); });
    $$('.post-body img').forEach(function (img) { img.addEventListener('load', measure); });
  })();

  /* phones / tablets: the 「目录」 bar — sticks under the nav (CSS, .js only), names the current section,
     closes after a pick and lands the heading below itself */
  (function tocBar() {
    var bar = $('[data-tocbar]');
    if (!bar) return;
    var cur = $('[data-tocbar-cur]', bar);
    var links = $$('a', bar);
    var ids = links.map(function (a) { return decodeURIComponent(a.getAttribute('href').slice(1)); });
    dismissable(bar);
    function on() {
      if (!bar.offsetParent) return; // hidden on desktop
      var y = window.scrollY + (parseFloat(getComputedStyle(bar).top) || 0) + bar.offsetHeight + 24, idx = 0;
      ids.forEach(function (id, i) { var h = doc.getElementById(id); if (h && h.getBoundingClientRect().top + window.scrollY <= y) idx = i; });
      links.forEach(function (a, i) { a.classList.toggle('on', i === idx); if (i === idx) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current'); });
      if (cur) cur.textContent = links[idx] ? links[idx].textContent : '';
    }
    links.forEach(function (a, i) {
      a.addEventListener('click', function (e) {
        var h = doc.getElementById(ids[i]); if (!h) return;
        e.preventDefault();
        bar.open = false;
        var offset = (parseFloat(getComputedStyle(bar).top) || 0) + $('summary', bar).offsetHeight + 16;
        window.scrollTo({ top: h.getBoundingClientRect().top + window.scrollY - offset, behavior: reduced ? 'auto' : 'smooth' });
        history.replaceState(null, '', '#' + ids[i]);
      });
    });
    on();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
  })();

  /* post actions: the rail fades in past the header (≥1280px); the bottom bar (<1280px) slides away on scroll-down
     and back on scroll-up / near the end. The share <details> gains copy, Web Share and outside-tap closing. */
  (function postActions() {
    var pa = $('[data-pa]');
    if (!pa) return;
    var head = $('[data-post-head]');
    var share = $('[data-share]', pa);
    var wide = window.matchMedia ? matchMedia('(min-width: 1280px)') : { matches: true };
    var lastY = window.scrollY, ticking = false;
    function on() {
      ticking = false;
      var y = window.scrollY;
      if (wide.matches) {
        pa.classList.remove('is-away');
        var shown = !head || head.getBoundingClientRect().bottom < 96;
        pa.classList.toggle('is-shown', shown || (share && share.open));
      } else {
        pa.classList.add('is-shown');
        var nearEnd = y + window.innerHeight >= root.scrollHeight - 80;
        if (share && share.open) pa.classList.remove('is-away');
        else if (y > lastY + 6 && y > 160 && !nearEnd) pa.classList.add('is-away');
        else if (y < lastY - 6 || nearEnd || y < 160) pa.classList.remove('is-away');
      }
      lastY = y;
    }
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(on); } }, { passive: true });
    window.addEventListener('resize', on);
    on();
    if (!share) return;
    dismissable(share);
    share.addEventListener('toggle', function () { if (share.open) { pa.classList.remove('is-away'); pa.classList.add('is-shown'); } });
    var close = $('[data-share-close]', share);
    if (close) { close.hidden = false; close.addEventListener('click', function () { share.open = false; $('summary', share).focus(); }); }
    // the popover and the share strip under the article share these handlers
    $$('[data-share-open]').forEach(function (b) {
      b.hidden = false;
      b.addEventListener('click', function () { share.open = true; pa.classList.remove('is-away'); pa.classList.add('is-shown'); var s = $('summary', share); if (s) s.focus(); });
    });
    var copy = $('[data-share-copy]', share);
    $$('[data-share-copy]').forEach(function (btn) {
      btn.hidden = false;
      btn.addEventListener('click', function () {
        var url = btn.getAttribute('data-share-copy');
        function fallback() {
          var ta = el('textarea'); ta.value = url; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
          body.appendChild(ta); ta.select();
          var done = false; try { done = doc.execCommand('copy'); } catch (e) { done = false; }
          body.removeChild(ta);
          toast(done ? t('share_copied') : t('share_copy_failed'));
        }
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(function () { toast(t('share_copied')); }, fallback);
        else fallback();
      });
    });
    var coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    if (navigator.share && coarse) {
      $$('[data-share-native]').forEach(function (native) {
        native.hidden = false;
        native.addEventListener('click', function () {
          var og = function (p) { var m = $('meta[property="og:' + p + '"]'); return m ? m.getAttribute('content') : ''; };
          var url = native.getAttribute('data-share-native') || (copy ? copy.getAttribute('data-share-copy') : location.href);
          navigator.share({ title: og('title') || doc.title, text: og('description'), url: url }).catch(function () {});
        });
      });
    }
  })();

  /* 微信 JS-SDK share card — only inside WeChat and only when the server has a verified 公众号 configured
     (body[data-wechat-jssdk]); otherwise WeChat shows its generic card and nothing is loaded. */
  (function wechatShare() {
    if (!API || body.getAttribute('data-wechat-jssdk') !== '1' || !/MicroMessenger/i.test(navigator.userAgent)) return;
    var page = location.href.split('#')[0];
    api('/wechat/jssdk-signature?url=' + encodeURIComponent(page)).then(function (cfg) {
      if (!cfg || !cfg.enabled) return;
      var s = doc.createElement('script');
      s.src = 'https://res.wx.qq.com/open/js/jweixin-1.6.0.js';
      s.onload = function () {
        var wx = window.wx; if (!wx) return;
        var og = function (p) { var m = $('meta[property="og:' + p + '"]'); return m ? m.getAttribute('content') : ''; };
        var data = { title: og('title') || doc.title, desc: og('description'), link: og('url') || page, imgUrl: og('image') };
        wx.config({ debug: false, appId: cfg.app_id, timestamp: cfg.timestamp, nonceStr: cfg.nonce_str, signature: cfg.signature, jsApiList: ['updateAppMessageShareData', 'updateTimelineShareData'] });
        wx.ready(function () { wx.updateAppMessageShareData(data); wx.updateTimelineShareData({ title: data.title, link: data.link, imgUrl: data.imgUrl }); });
      };
      doc.head.appendChild(s);
    }).catch(function () {});
  })();

  (function views() {
    if (!API) return;
    var reads = $('[data-reads]');
    api('/blogs/' + encodeURIComponent(HANDLE) + '/posts/' + encodeURIComponent(postKey) + '/view' + (pwdQ ? '?' + pwdQ : ''), { method: 'POST' })
      .then(function (d) { if (reads && d && d.reads != null) reads.textContent = t('reads', fmtNum(d.reads)); })
      .catch(function () {});
  })();

  (function comments() {
    var box = $('[data-comments]');
    if (!box) return;
    var list = $('[data-comments-list]', box);
    var status = $('[data-comments-status]', box);
    var card = $('.comment-login-card', box);
    var railCount = $('[data-pa-comments]');
    var policy = body.getAttribute('data-comments-policy') || 'login';
    if (policy === 'off') { if (status) status.textContent = t('comments_off'); if (card) card.hidden = true; return; }
    if (!API || !list) return;

    function avatar(a, size) {
      if (a && a.avatar_url) { var img = el('img', 'avatar'); img.src = absUrl(a.avatar_url); img.alt = ''; img.width = size; img.height = size; img.style.setProperty('--sz', size + 'px'); img.loading = 'lazy'; return img; }
      var s = el('span', 'avatar avatar-text', ((a && a.name) || '?').trim().charAt(0) || '?'); s.style.setProperty('--sz', size + 'px'); s.setAttribute('aria-hidden', 'true'); return s;
    }
    function render(c, size) {
      var node = el('article', 'comment'); node.id = 'comment-' + c.id;
      node.appendChild(avatar(c.author, size));
      var main = el('div');
      var head = el('div', 'comment-head');
      head.appendChild(el('b', null, (c.author && c.author.name) || '—'));
      if (c.reply_to && c.reply_to.name) head.appendChild(el('span', null, '→ ' + c.reply_to.name));
      var time = el('time', null, fmtLong(c.created_at)); time.dateTime = c.created_at || ''; head.appendChild(time);
      main.appendChild(head);
      main.appendChild(el('p', 'comment-body' + (c.deleted ? ' is-deleted' : ''), c.deleted ? t('comment_deleted') : (c.text || '')));
      var replies = c.replies || [];
      var total = c.replies_count || 0;
      if (replies.length || total) {
        var wrap = el('div', 'comment-replies');
        replies.forEach(function (r) { wrap.appendChild(render(r, 24)); });
        if (total > replies.length) {
          var btn = el('button', 'comment-more', t('comments_more') + ' (' + (total - replies.length) + ')'); btn.type = 'button';
          btn.addEventListener('click', function () {
            btn.disabled = true;
            api('/comments/' + encodeURIComponent(c.id) + '/replies?page=1&page_size=50').then(function (d) {
              wrap.textContent = '';
              (d.items || []).forEach(function (r) { wrap.appendChild(render(r, 24)); });
            }).catch(function () { btn.disabled = false; });
          });
          wrap.appendChild(btn);
        }
        main.appendChild(wrap);
      }
      node.appendChild(main);
      return node;
    }
    if (status) status.textContent = t('comments_loading');
    api('/blogs/' + encodeURIComponent(HANDLE) + '/posts/' + encodeURIComponent(postKey) + '/comments?page=1&page_size=20' + (pwdQ ? '&' + pwdQ : ''))
      .then(function (d) {
        if (d.policy === 'off') { if (status) status.textContent = t('comments_off'); if (card) card.hidden = true; return; }
        var items = d.items || [];
        if (status) status.textContent = d.total ? t('comments_count', d.total) : t('comments_none');
        if (railCount) { railCount.textContent = fmtNum(d.total); railCount.hidden = !d.total; }
        list.textContent = '';
        if (!items.length) { list.appendChild(el('div', 'comment-empty', t('comments_none'))); return; }
        items.forEach(function (c) { list.appendChild(render(c, 32)); });
      })
      .catch(function (err) {
        if (status) status.textContent = err && err.code === 40101 ? t('comments_login') : (box.getAttribute('data-count') > 0 ? t('comments_count', box.getAttribute('data-count')) : t('comments_none'));
      });
  })();
})();

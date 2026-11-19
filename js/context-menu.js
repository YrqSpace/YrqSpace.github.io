/*! 自定义右键菜单 —— 全站接管原生右键，输入区提供完整编辑操作
 *  菜单内容按点击位置动态生成：输入框 / 链接 / 图片 / 选中文字 / 空白处
 *  键盘 Ctrl+C、Ctrl+X、Ctrl+V 不拦截原生行为，只补一个「已复制」提示，两者互不影响
 */
(function () {
  'use strict';

  var NL = String.fromCharCode(10);
  var menu = null;
  var openedAt = 0;
  var ctx = {};          // 当前这次右键的上下文
  var toastEl = null;
  var toastTimer = 0;

  /* ================= 基础工具 ================= */

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function selText() {
    var s = window.getSelection();
    return s ? String(s).toString().trim() : '';
  }

  function isEditable(el) {
    if (!el || !el.tagName) return false;
    if (el.isContentEditable) return true;
    return /^(input|textarea)$/i.test(el.tagName) && !/^(button|submit|reset|checkbox|radio|file|image)$/i.test(el.type || '');
  }

  /* ================= 提示条 ================= */

  function toast(msg) {
    if (!toastEl || !document.body.contains(toastEl)) {
      toastEl = document.createElement('div');
      toastEl.className = 'ctx-toast';
      toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      if (toastEl) toastEl.classList.remove('is-show');
    }, 1600);
  }

  /* ================= 菜单容器 ================= */

  function ensureMenu() {
    if (menu && document.body.contains(menu)) return menu;
    menu = document.createElement('ul');
    menu.className = 'ctx-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('tabindex', '-1');
    menu.hidden = true;
    document.body.appendChild(menu);
    return menu;
  }

  function close() {
    if (menu) menu.hidden = true;
    if (menu) menu.innerHTML = '';
  }

  /* ================= 剪贴板 ================= */

  function copy(text, tip) {
    if (!text) { toast('没有可复制的内容'); return; }
    function done() { toast(tip || ('已复制 ' + text.length + ' 个字符')); }
    function fallback(t) {
      var ta = document.createElement('textarea');
      ta.value = t;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('复制被浏览器拒绝'); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallback(text); });
    } else {
      fallback(text);
    }
  }

  /* ================= 输入区（剪切/复制/粘贴/撤销） ================= */

  // 右键时先记住光标与选区，否则点菜单会把焦点抢走
  function saveEditSel(el) {
    if (!el) return;
    if (typeof el.selectionStart === 'number') {
      ctx.ss = el.selectionStart;
      ctx.se = el.selectionEnd;
      ctx.hasSel = el.selectionEnd > el.selectionStart;
    } else {
      var s = window.getSelection();
      ctx.range = (s && s.rangeCount) ? s.getRangeAt(0).cloneRange() : null;
      ctx.hasSel = !!(s && String(s).toString().trim());
    }
  }

  function restoreEditSel() {
    var el = ctx.el;
    if (!el) return false;
    try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) {} }
    if (typeof el.setSelectionRange === 'function' && ctx.ss != null) {
      try { el.setSelectionRange(ctx.ss, ctx.se); } catch (e) {}
    } else if (ctx.range) {
      var s = window.getSelection();
      if (s) { s.removeAllRanges(); s.addRange(ctx.range); }
    }
    return true;
  }

  function edCopy() {
    if (!restoreEditSel()) return;
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    if (ok) toast('已复制');
    else copy(selText());
  }

  function edCut() {
    if (!restoreEditSel()) return;
    var ok = false;
    try { ok = document.execCommand('cut'); } catch (e) {}
    if (ok) toast('已剪切');
    else toast('剪切被浏览器拒绝，请用 Ctrl+X');
  }

  function edPaste() {
    if (!restoreEditSel()) return;
    // execCommand('paste') 在现代浏览器基本被禁用，能成就用，不成改读剪贴板
    var ok = false;
    try { ok = document.execCommand('paste'); } catch (e) {}
    if (ok) { toast('已粘贴'); return; }

    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText().then(function (text) {
        if (!text) { toast('剪贴板是空的'); return; }
        restoreEditSel();
        var inserted = false;
        try { inserted = document.execCommand('insertText', false, text); } catch (e) {}
        if (!inserted) {
          var el = ctx.el;
          if (el && typeof el.value === 'string' && typeof el.selectionStart === 'number') {
            var s = el.selectionStart, e = el.selectionEnd;
            el.value = el.value.slice(0, s) + text + el.value.slice(e);
            el.setSelectionRange(s + text.length, s + text.length);
            inserted = true;
          }
        }
        toast(inserted ? '已粘贴' : '请用 Ctrl+V 粘贴');
      }).catch(function () {
        toast('浏览器不给读剪贴板，请按 Ctrl+V');
      });
    } else {
      toast('当前环境不支持菜单粘贴，请按 Ctrl+V');
    }
  }

  function edCmd(cmd, tip) {
    if (!restoreEditSel()) return;
    var ok = false;
    try { ok = document.execCommand(cmd); } catch (e) {}
    toast(ok ? tip : '浏览器拒绝了这个操作');
  }

  function edSelectAll() {
    if (!restoreEditSel()) return;
    try { document.execCommand('selectAll'); } catch (e) {}
  }

  /* ================= 其他动作 ================= */

  // 清掉地址里可能混进来的引号和转义斜杠，保证跳转是干净路径
  function cleanUrl(u) {
    return String(u == null ? '' : u)
      .trim()
      .replace(/^["'\s]+|["'\s]+$/g, '')
      .replace(/\\\//g, '/');
  }

  function randomPost() {
    var list = (window.__POSTS__ || []).map(cleanUrl).filter(Boolean);
    if (!list.length) { toast('还没有文章列表'); return; }
    var cur = location.pathname;
    var pool = list.filter(function (u) { return u !== cur; });
    if (!pool.length) pool = list;
    location.href = pool[Math.floor(Math.random() * pool.length)];
  }

  function toggleScheme() {
    var btn = document.querySelector('#dark-mode-toggle');
    if (btn) { btn.click(); return; }
    var html = document.documentElement;
    var now = html.getAttribute('data-scheme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-scheme', now);
    try { localStorage.setItem('StackColorScheme', now); } catch (e) {}
  }

  function openUrl(u) {
    if (!u) return;
    if (/^mailto:|^tel:/i.test(u)) location.href = u;
    else window.open(u, '_blank', 'noopener');
  }

  function saveImage(src) {
    if (!src) return;
    var a = document.createElement('a');
    a.href = src;
    a.download = (src.split('/').pop() || 'image').split('?')[0];
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast('开始下载，跨站图片可能被拦');
  }

  function selectPageText() {
    var s = window.getSelection();
    if (!s) return;
    var root = document.querySelector('.article-content') || document.body;
    s.removeAllRanges();
    var r = document.createRange();
    r.selectNodeContents(root);
    s.addRange(r);
    toast('已选中页面正文');
  }

  /* ================= 生成菜单 ================= */

  function addItem(act, label, hint, disabled) {
    var cls = 'data-act="' + act + '"';
    if (disabled) cls += ' class="ctx-disabled"';
    return '<li ' + cls + '>' + esc(label) + '</li>';
  }

  function build(e) {
    var m = ensureMenu();
    var t = e.target;
    var editable = isEditable(t);
    var link = t && t.closest ? t.closest('a[href]') : null;
    var img = t && t.closest ? t.closest('img') : null;
    var picked = selText();

    ctx = { el: editable ? t : null, link: link, img: img };
    if (editable) saveEditSel(t);

    var h = '';
    var hasSel = editable ? !!ctx.hasSel : !!picked;

    if (editable) {
      h += addItem('undo', '撤销', 'Ctrl+Z');
      h += addItem('redo', '重做', 'Ctrl+Y');
      h += '<li class="sep"></li>';
      h += addItem('cut', '剪切', 'Ctrl+X', !hasSel);
      h += addItem('copy', '复制', 'Ctrl+C', !hasSel);
      h += addItem('paste', '粘贴', 'Ctrl+V');
      h += '<li class="sep"></li>';
      h += addItem('selectall', '全选', 'Ctrl+A');
      h += '<li class="sep"></li>';
    } else if (picked) {
      h += addItem('copy-sel', '复制选中');
      h += addItem('search-sel', '搜索这段文字');
      h += addItem('selectall-page', '改为全选正文');
      h += '<li class="sep"></li>';
    }

    if (link) {
      var href = link.getAttribute('href') || '';
      h += addItem('open-link', '在新标签页打开');
      h += addItem('copy-link-addr', '复制链接地址');
      h += addItem('copy-link-text', '复制链接文字');
      h += '<li class="sep"></li>';
    }

    if (img) {
      h += addItem('open-img', '在新标签页查看图片');
      h += addItem('copy-img-addr', '复制图片地址');
      h += addItem('save-img', '图片另存为');
      h += '<li class="sep"></li>';
    }

    if (!editable && !picked) {
      h += addItem('selectall-page', '全选正文');
      h += '<li class="sep"></li>';
    }

    h += addItem('copy-link', '复制本页链接');
    h += addItem('copy-title', '复制本页标题');
    h += '<li class="sep"></li>';
    h += addItem('random', '随机看一篇');
    h += addItem('top', '回到顶部');
    h += addItem('scheme', '切换深浅色');
    h += addItem('reload', '刷新页面', 'F5');

    m.innerHTML = h;
    m.dataset.url = location.href;
    m.dataset.title = document.title;
    m.dataset.picked = picked;
    if (link) {
      var raw = link.getAttribute('href') || '';
      m.dataset.href = link.href || raw;
      m.dataset.linkText = (link.textContent || '').trim();
    }
    if (img) {
      m.dataset.img = img.currentSrc || img.src || '';
    }
    return m;
  }

  /* ================= 定位 ================= */

  function place(m, x, y) {
    m.hidden = false;
    m.style.left = '0px';
    m.style.top = '0px';
    var r = m.getBoundingClientRect();
    var pad = 8;
    var left = x, top = y;
    if (left + r.width + pad > window.innerWidth) left = window.innerWidth - r.width - pad;
    if (top + r.height + pad > window.innerHeight) top = window.innerHeight - r.height - pad;
    if (left < pad) left = pad;
    if (top < pad) top = pad;
    m.style.left = left + 'px';
    m.style.top = top + 'px';
  }

  /* ================= 右键入口 ================= */

  document.addEventListener('contextmenu', function (e) {
    // 触屏交给系统长按
    if (window.matchMedia && window.matchMedia('(hover: none)').matches) return;

    var t = e.target;
    if (!t || !t.closest) return;

    e.preventDefault();
    var m = build(e);
    place(m, e.clientX, e.clientY);
    openedAt = Date.now();
    try { m.focus({ preventScroll: true }); } catch (err) {}
  });

  /* ================= 菜单点击 ================= */

  document.addEventListener('click', function (e) {
    var li = (e.target && e.target.closest) ? e.target.closest('.ctx-menu li[data-act]') : null;
    if (!li) { close(); return; }
    e.preventDefault();

    if (li.classList.contains('ctx-disabled')) return;

    var act = li.getAttribute('data-act');
    var m = ensureMenu();
    var url = m.dataset.url || location.href;
    var title = m.dataset.title || document.title;
    var picked = m.dataset.picked || '';

    if (act === 'undo')      edCmd('undo', '已撤销');
    if (act === 'redo')      edCmd('redo', '已重做');
    if (act === 'cut')       edCut();
    if (act === 'copy')      edCopy();
    if (act === 'paste')     edPaste();
    if (act === 'selectall') edSelectAll();
    if (act === 'selectall-page') selectPageText();

    if (act === 'copy-sel')  copy(picked);
    if (act === 'search-sel') location.href = '/search/?keyword=' + encodeURIComponent(picked);

    if (act === 'open-link')      openUrl(m.dataset.href);
    if (act === 'copy-link-addr') copy(m.dataset.href);
    if (act === 'copy-link-text') copy(m.dataset.linkText || '');
    if (act === 'open-img')       openUrl(m.dataset.img);
    if (act === 'copy-img-addr')  copy(m.dataset.img);
    if (act === 'save-img')       saveImage(m.dataset.img);

    if (act === 'copy-link')  copy(url);
    if (act === 'copy-title') copy(title);
    if (act === 'random')     randomPost();
    if (act === 'top')        window.scrollTo({ top: 0, behavior: 'smooth' });
    if (act === 'scheme')     toggleScheme();
    if (act === 'reload')     location.reload();

    close();
  });

  /* ================= 键盘 ================= */

  // 复制/剪切/粘贴事件：原生行为完全不动，只给个反馈，避免和菜单操作割裂
  document.addEventListener('copy', function (e) {
    var t = e.target;
    if (isEditable(t)) return;              // 输入区内部由浏览器提示，不打扰
    if (!selText()) return;
    toast('已复制');
  });
  document.addEventListener('cut', function () {
    toast('已剪切');
  });
  document.addEventListener('paste', function (e) {
    var t = e.target;
    if (!isEditable(t)) return;             // 页面非输入区粘贴无意义，不提示
    toast('已粘贴');
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { close(); return; }
    if (!menu || menu.hidden) return;

    var items = Array.prototype.slice.call(menu.querySelectorAll('li[data-act]:not(.ctx-disabled)'));
    if (!items.length) return;
    var idx = items.indexOf(menu.querySelector('li.is-active'));

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      idx = (idx + 1) % items.length;
      items.forEach(function (n) { n.classList.remove('is-active'); });
      items[idx].classList.add('is-active');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      idx = idx <= 0 ? items.length - 1 : idx - 1;
      items.forEach(function (n) { n.classList.remove('is-active'); });
      items[idx].classList.add('is-active');
    } else if (e.key === 'Enter' && idx > -1) {
      e.preventDefault();
      items[idx].click();
    }
  });

  /* ================= 关闭时机 ================= */

  window.addEventListener('scroll', function () {
    if (Date.now() - openedAt > 150) close();
  }, { passive: true });
  window.addEventListener('resize', close);
  window.addEventListener('blur', close);
  document.addEventListener('pjax:send', close);
  document.addEventListener('pjax:complete', function () { menu = null; });
})();

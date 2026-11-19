/* holiday-eggs.js - 中国传统节日彩蛋（按日期自动触发；?fx=节日key 预览单个；?fx=1 循环预览全部） */
/* 节假日彩蛋 - 被动库：定义 holidayRun(opts)，不自动执行 */

/* ---------- 农历换算 ---------- */
var lunarInfo = [
  0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2,
  0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977,
  0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970,
  0x06566,0x0d4a0,0x0ea50,0x06e95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950,
  0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557,
  0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0,
  0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0,
  0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6,
  0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570,
  0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x055c0,0x0ab60,0x096d5,0x092e0,
  0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,
  0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,
  0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530,
  0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45,
  0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0,
  0x14b63,0x09370,0x049f8,0x04970,0x064b0,0x168a6,0x0ea50,0x06b20,0x1a6c4,0x0aae0,
  0x0a2e0,0x0d2e3,0x0c960,0x0d557,0x0d4a0,0x0da50,0x05d55,0x056a0,0x0a6d0,0x055d4,
  0x052d0,0x0a9b8,0x0a950,0x0b4a0,0x0b6a6,0x0ad50,0x055a0,0x0aba4,0x0a5b0,0x052b0,
  0x0b273,0x06930,0x07337,0x06aa0,0x0ad50,0x14b55,0x04b60,0x0a570,0x054e4,0x0d160,
  0x0e968,0x0d520,0x0daa0,0x16aa6,0x056d0,0x04ae0,0x0a9d4,0x0a2d0,0x0d150,0x0f252,
  0x0d520
];

function lYearDays(y) {
  var i, sum = 348;
  for (i = 0x8000; i > 0x8; i >>= 1) { sum += (lunarInfo[y - 1900] & i) ? 1 : 0; }
  return sum + leapDays(y);
}
function leapMonth(y) { return lunarInfo[y - 1900] & 0xf; }
function leapDays(y) { if (leapMonth(y)) { return ((lunarInfo[y - 1900] & 0x10000) ? 30 : 29); } return 0; }
function monthDays(y, m) { return ((lunarInfo[y - 1900] & (0x10000 >> m)) ? 30 : 29); }

function s2l(y, mo, d) {
  var date = Date.UTC(y, mo - 1, d);
  var base = Date.UTC(1900, 0, 31);
  var offset = Math.floor((date - base) / 86400000);
  var i, temp = 0, lYear = 1900;
  for (i = 1900; i < 2101 && offset > 0; i++) { temp = lYearDays(i); offset -= temp; }
  if (offset < 0) { offset += temp; i--; }
  lYear = i;
  var leap = leapMonth(i), isLeap = false;
  for (i = 1; i < 13 && offset > 0; i++) {
    if (leap > 0 && i === (leap + 1) && !isLeap) { --i; isLeap = true; temp = leapDays(lYear); }
    else { temp = monthDays(lYear, i); }
    if (isLeap && i === (leap + 1)) { isLeap = false; }
    offset -= temp;
  }
  if (offset === 0 && leap > 0 && i === leap + 1) {
    if (isLeap) { isLeap = false; } else { isLeap = true; --i; }
  }
  if (offset < 0) { offset += temp; --i; }
  return { year: lYear, month: i, day: offset + 1, isLeap: isLeap };
}

/* ---------- 节日定义 ---------- */
var SOLAR = [
  { key: 'yuandan',  name: '元旦',   m: 1,  d: [1],             effect: 'fireworks', chars: [] },
  { key: 'qingren',  name: '情人节', m: 2,  d: [14],            effect: 'rise', chars: ['♥'] },
  { key: 'qingming', name: '清明节', m: 4,  d: [4, 5],          effect: 'fall', chars: ['🌧️', '🌱', '🌿'], count: 24 },
  { key: 'guoqing',  name: '国庆节', m: 10, d: [1,2,3,4,5,6,7], effect: 'fall', chars: ['🇨🇳', '🎈', '⭐', '🎆'], count: 34 },
  { key: 'wansheng', name: '万圣节', m: 10, d: [31],            effect: 'fall', chars: ['🎃', '🦇', '👻'], count: 18 },
  { key: 'shengdan', name: '圣诞节', m: 12, d: [24, 25],        effect: 'fall', chars: ['❄', '❅', '❆'], count: 40 }
];
var LUNAR = [
  { key: 'chunjie',    name: '春节',   m: 1,  d: 1,  effect: 'both', chars: ['🏮', '🧨', '🧧', '🎊'], count: 30 },
  { key: 'chuxi',      name: '除夕',   special: 'chuxi', effect: 'both', chars: ['🏮', '🧨', '🧧'], count: 30 },
  { key: 'yuanxiao',   name: '元宵节', m: 1,  d: 15, effect: 'rise', chars: ['🏮', '🥣', '✨'], count: 24 },
  { key: 'longtaitou', name: '龙抬头', m: 2,  d: 2,  effect: 'fall', chars: ['🐉', '✂️', '🌾'], count: 18 },
  { key: 'shangsi',    name: '上巳节', m: 3,  d: 3,  effect: 'fall', chars: ['🌸', '🍃', '💧'], count: 24 },
  { key: 'duanwu',     name: '端午节', m: 5,  d: 5,  effect: 'fall', chars: ['🐉', '🫔', '🌿', '🚣'], count: 24 },
  { key: 'qixi',       name: '七夕节', m: 7,  d: 7,  effect: 'rise', chars: ['💝', '🐦', '⭐'], count: 22 },
  { key: 'zhongyuan',  name: '中元节', m: 7,  d: 15, effect: 'rise', chars: ['🏮', '🕯️', '💧'], count: 16 },
  { key: 'zhongqiu',   name: '中秋节', m: 8,  d: 15, effect: 'fall', chars: ['🌕', '🐇', '🥮', '✨'], count: 24 },
  { key: 'chongyang',  name: '重阳节', m: 9,  d: 9,  effect: 'fall', chars: ['🌼', '🍂', '🍶'], count: 22 },
  { key: 'hanyi',      name: '寒衣节', m: 10, d: 1,  effect: 'rise', chars: ['🕯️', '🍂'], count: 14 },
  { key: 'xiayuan',    name: '下元节', m: 10, d: 15, effect: 'rise', chars: ['🏮', '✨'], count: 14 },
  { key: 'laba',       name: '腊八节', m: 12, d: 8,  effect: 'fall', chars: ['🥣', '🌾', '✨'], count: 22 },
  { key: 'xiaonian',   name: '小年',   m: 12, d: 23, effect: 'fall', chars: ['🍬', '🧹', '🏮'], count: 18 }
];
var ALL_FESTIVALS = LUNAR.concat(SOLAR);

function matchFestivals(now) {
  var y = now.getFullYear(), mo = now.getMonth() + 1, d = now.getDate();
  var today = s2l(y, mo, d);
  var t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  var tom = s2l(t.getFullYear(), t.getMonth() + 1, t.getDate());
  var hits = [], i, f;
  for (i = 0; i < SOLAR.length; i++) {
    f = SOLAR[i];
    if (f.m === mo && f.d.indexOf(d) >= 0) { hits.push(f); }
  }
  for (i = 0; i < LUNAR.length; i++) {
    f = LUNAR[i];
    if (f.special === 'chuxi') {
      if (today.month === 12 && tom.month === 1 && tom.day === 1) { hits.push(f); }
    } else if (!today.isLeap && today.month === f.m && today.day === f.d) {
      hits.push(f);
    }
  }
  return hits;
}
function findFestival(key) {
  for (var i = 0; i < ALL_FESTIVALS.length; i++) {
    if (ALL_FESTIVALS[i].key === key) { return ALL_FESTIVALS[i]; }
  }
  return null;
}

/* ---------- 特效 ---------- */
var HE_LAYER_ID = 'holiday-egg-layer';
var heFw = { raf: 0, timer: 0 };
var heDemo = { timer: 0 };

function heEnsureStyle() {
  if (document.getElementById('holiday-egg-style')) { return; }
  var s = document.createElement('style');
  s.id = 'holiday-egg-style';
  s.textContent =
    '#' + HE_LAYER_ID + '{position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;overflow:hidden;}' +
    '#' + HE_LAYER_ID + ' .he-fall{position:absolute;top:-8%;white-space:nowrap;will-change:transform;animation:he-fall linear infinite;}' +
    '@keyframes he-fall{0%{transform:translateY(-10vh) rotate(0deg);opacity:1;}100%{transform:translateY(112vh) rotate(360deg);opacity:.65;}}' +
    '#' + HE_LAYER_ID + ' .he-rise{position:absolute;bottom:-8%;white-space:nowrap;will-change:transform;animation:he-rise linear infinite;}' +
    '@keyframes he-rise{0%{transform:translateY(10vh) scale(.7);opacity:0;}12%{opacity:1;}88%{opacity:1;}100%{transform:translateY(-112vh) scale(1.1);opacity:0;}}' +
    '#' + HE_LAYER_ID + ' .he-fireworks{position:absolute;top:0;left:0;width:100%;height:100%;}';
  document.head.appendChild(s);
}
function heLayer() {
  var el = document.getElementById(HE_LAYER_ID);
  if (!el) { el = document.createElement('div'); el.id = HE_LAYER_ID; document.body.appendChild(el); }
  return el;
}
function heStopFw() {
  if (heFw.raf) { cancelAnimationFrame(heFw.raf); heFw.raf = 0; }
  if (heFw.timer) { clearInterval(heFw.timer); heFw.timer = 0; }
}
function heReset() {
  heStopFw();
  if (heDemo.timer) { clearInterval(heDemo.timer); heDemo.timer = 0; }
  var el = document.getElementById(HE_LAYER_ID);
  if (el) { el.innerHTML = ''; }
}
function heSpawnFall(layer, chars, count) {
  count = count || 20;
  if (!chars || !chars.length) { chars = ['✨']; }
  for (var i = 0; i < count; i++) {
    var s = document.createElement('span');
    s.className = 'he-fall';
    s.textContent = chars[i % chars.length];
    s.style.left = (Math.random() * 100).toFixed(2) + '%';
    s.style.fontSize = (12 + Math.random() * 16).toFixed(1) + 'px';
    s.style.opacity = (0.65 + Math.random() * 0.35).toFixed(2);
    s.style.animationDuration = (7 + Math.random() * 8).toFixed(1) + 's';
    s.style.animationDelay = (-Math.random() * 12).toFixed(1) + 's';
    layer.appendChild(s);
  }
}
function heSpawnRise(layer, chars, count) {
  count = count || 20;
  for (var i = 0; i < count; i++) {
    var s = document.createElement('span');
    s.className = 'he-rise';
    s.textContent = chars[i % chars.length];
    s.style.left = (Math.random() * 100).toFixed(2) + '%';
    s.style.fontSize = (12 + Math.random() * 16).toFixed(1) + 'px';
    s.style.animationDuration = (7 + Math.random() * 8).toFixed(1) + 's';
    s.style.animationDelay = (-Math.random() * 12).toFixed(1) + 's';
    layer.appendChild(s);
  }
}
function heStartFw(layer) {
  var canvas = document.createElement('canvas');
  canvas.className = 'he-fireworks';
  layer.appendChild(canvas);
  var ctx = canvas.getContext('2d');
  var W, H;
  function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
  resize();
  window.addEventListener('resize', resize);
  var parts = [];
  var colors = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff9ff3', '#ffb86b'];
  function launch() {
    var x = W * (0.15 + Math.random() * 0.7);
    var y = H * (0.12 + Math.random() * 0.4);
    var c = colors[Math.floor(Math.random() * colors.length)];
    var n = 60 + Math.floor(Math.random() * 50);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 5;
      parts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, decay: 0.008 + Math.random() * 0.012, c: c, r: 1.5 + Math.random() * 2 });
    }
  }
  function tick() {
    ctx.clearRect(0, 0, W, H);
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.vx *= 0.985; p.vy *= 0.985; p.life -= p.decay;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(p.life, 0);
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    heFw.raf = requestAnimationFrame(tick);
  }
  tick();
  launch();
  heFw.timer = setInterval(launch, 1400 + Math.random() * 900);
}
function heApply(layer, f) {
  if (f.effect === 'fall') { heSpawnFall(layer, f.chars, f.count); }
  else if (f.effect === 'rise') { heSpawnRise(layer, f.chars, f.count); }
  else if (f.effect === 'both') { heSpawnFall(layer, f.chars, f.count); heStartFw(layer); }
  else if (f.effect === 'fireworks') { heStartFw(layer); }
}

/* ---------- 入口 ---------- */
function holidayRun(opts) {
  opts = opts || {};
  if (typeof document === 'undefined' || !document.body) {
    return { ok: false, summary: 'no document/body', applied: [] };
  }
  var fx;
  if (opts.force !== undefined && opts.force !== null && String(opts.force) !== '') {
    fx = String(opts.force);
  } else {
    var params = new URLSearchParams(location.search || '');
    fx = params.get('fx');
  }
  heEnsureStyle();

  if (fx === null) {
    var hits = matchFestivals(new Date());
    if (!hits.length) { return { ok: true, summary: '今天没有节日彩蛋', applied: [] }; }
    var l1 = heLayer();
    for (var i = 0; i < hits.length; i++) { heApply(l1, hits[i]); }
    var names = hits.map(function (f) { return f.name; });
    try { console.log('🎉 今日彩蛋：' + names.join('、')); } catch (e) {}
    return { ok: true, summary: '节日彩蛋已触发：' + names.join('、'), applied: names };
  }
  if (fx === '' || fx === '1' || fx === 'all') {
    heReset();
    var idx = 0;
    function step() {
      heReset();
      heEnsureStyle();
      heApply(heLayer(), ALL_FESTIVALS[idx]);
      idx = (idx + 1) % ALL_FESTIVALS.length;
    }
    step();
    heDemo.timer = setInterval(step, 4000);
    return { ok: true, summary: '预览模式：循环展示全部 ' + ALL_FESTIVALS.length + ' 个节日彩蛋', applied: ALL_FESTIVALS.map(function (f) { return f.name; }) };
  }
  var f = findFestival(fx);
  if (!f) {
    return { ok: false, summary: '未知节日 key: ' + fx, applied: [], valid_keys: ALL_FESTIVALS.map(function (x) { return x.key; }) };
  }
  heReset();
  heEnsureStyle();
  heApply(heLayer(), f);
  try { console.log('🎉 预览彩蛋：' + f.name); } catch (e) {}
  return { ok: true, summary: '已预览：' + f.name, applied: [f.name] };
}

(function(){try{holidayRun({});}catch(e){}}());

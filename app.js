/* 스터디 플래너 — 정적 웹앱 (GitHub Pages용)
 * 데이터: localStorage(텍스트·체크) + IndexedDB(필기)
 */
(() => {
'use strict';

// ============================================================ utils
const $ = (s, r = document) => r.querySelector(s);
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ym = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d || 1); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMonths = (s, n) => { const d = parseYmd(s + '-01'); d.setMonth(d.getMonth() + n); return ym(d); };
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const fmtMin = m => { const h = Math.floor(m / 60), r = m % 60; return h ? (r ? `${h}시간 ${r}분` : `${h}시간`) : `${r}분`; };

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 1800);
}

// ============================================================ data
const KEY = 'study-planner-v1';
const DEFAULT_SUBJECTS = [
  { name: '국어', color: '#f4b2b2' }, { name: '영어', color: '#a9cbe9' },
  { name: '수학', color: '#b5dfb1' }, { name: '탐구', color: '#f6d78a' },
  { name: '한국사', color: '#cfbde9' },
];
function defaults() {
  return {
    v: 1,
    settings: { subjects: DEFAULT_SUBJECTS.map(s => ({ ...s })), ddayLabel: '시험', ddayDate: '' },
    days: {}, months: {}, subjectPages: [], lecturePages: [], examPages: [],
  };
}
let data;
try { data = Object.assign(defaults(), JSON.parse(localStorage.getItem(KEY) || 'null') || {}); }
catch { data = defaults(); }

let saveTimer, dirty = false;
function flush() {
  clearTimeout(saveTimer);
  if (!dirty) return;
  try { localStorage.setItem(KEY, JSON.stringify(data)); dirty = false; }
  catch (e) { toast('저장 공간이 부족해요. 설정에서 백업 후 정리해 주세요.'); }
  pushAndroid();
}
function save() { dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(flush, 250); }
// 저장하지 않은 변경이 있을 때만 닫기 전에 저장 (다른 창의 기록을 덮어쓰지 않도록)
window.addEventListener('pagehide', flush);

const subjects = () => data.settings.subjects;
const subjColor = i => (subjects()[i] || {}).color || '#ddd';

// 저장 대상 객체를 처음 수정할 때만 data에 붙인다 (빈 날짜가 쌓이지 않도록)
function attach(parent, key, obj) { return () => { parent[key] = obj; save(); }; }

// 공통 입력 컴포넌트
const SVGNS = 'http://www.w3.org/2000/svg';
function icon(name) {
  const svg = document.createElementNS(SVGNS, 'svg');
  const use = document.createElementNS(SVGNS, 'use');
  use.setAttribute('href', '#i-' + name); svg.append(use);
  return svg;
}
// 붓으로 칠한 듯한 배너 배경
function banner(kind, ...kids) {
  const fills = { pink: '#fbdcd7', green: '#e3ecdc', cream: '#f8f0d2' };
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('class', 'bg'); svg.setAttribute('viewBox', '0 0 400 64'); svg.setAttribute('preserveAspectRatio', 'none');
  const p = document.createElementNS(SVGNS, 'path');
  p.setAttribute('d', 'M14 10 C70 4 160 8 250 6 C310 5 360 3 388 9 C396 12 394 22 384 26 C392 32 396 46 386 54 C330 60 240 57 160 59 C100 60 50 61 18 56 C6 54 4 44 10 36 C3 30 4 16 14 10 Z');
  p.setAttribute('fill', fills[kind] || fills.pink); p.setAttribute('stroke', '#4d4845'); p.setAttribute('stroke-width', '1.5');
  p.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.append(p);
  return h('div', { class: 'banner' }, svg, h('span', { class: 'dot-ic ' + (kind === 'pink' ? '' : kind) }), ...kids);
}
function field(obj, key, commit, props = {}) {
  return h('input', {
    class: 'field', type: 'text', value: obj[key] || '', autocomplete: 'off', ...props,
    oninput: e => { obj[key] = e.target.value; commit(); },
  });
}
function area(obj, key, commit, rows, props = {}) {
  return h('textarea', {
    class: 'field lined', rows, value: obj[key] || '', ...props,
    style: { height: rows * 34 + 'px' },
    oninput: e => { obj[key] = e.target.value; commit(); },
  });
}
function checkbox(obj, key, commit, rowEl) {
  const b = h('button', { class: 'check' + (obj[key] ? ' on' : ''), type: 'button', 'aria-label': '완료' }, icon('check'));
  b.addEventListener('click', () => {
    obj[key] = !obj[key]; b.classList.toggle('on', !!obj[key]);
    rowEl && rowEl.classList.toggle('done', !!obj[key]); commit();
  });
  return b;
}
function stars(obj, key, commit) {
  const wrap = h('span', { class: 'stars' });
  const paint = () => [...wrap.children].forEach((b, i) => b.classList.toggle('on', i < (obj[key] || 0)));
  for (let i = 1; i <= 5; i++) wrap.append(h('button', {
    type: 'button', 'aria-label': `${i}점`, onclick: () => { obj[key] = obj[key] === i ? 0 : i; paint(); commit(); },
  }, icon('review')));
  paint();
  return wrap;
}
const fill = (arr, n, make) => { while (arr.length < n) arr.push(make()); return arr; };

// 날짜별 공부시간 (10분 칸 기준)
function dayMinutes(key) {
  const d = data.days[key]; if (!d || !d.slots) return 0;
  return d.slots.filter(v => v != null).length * 10;
}
function daySubjectMinutes(key, acc = {}) {
  const d = data.days[key]; if (!d || !d.slots) return acc;
  d.slots.forEach(v => { if (v != null) acc[v] = (acc[v] || 0) + 10; });
  return acc;
}
function ddayNum(dateStr) {
  const t = data.settings.ddayDate; if (!t) return null;
  return Math.round((parseYmd(t) - parseYmd(dateStr)) / 86400000);
}

// 스티커 이미지: 직접 고른 그림을 300px 이하로 줄여 저장
function pickSticker(done) {
  readImage(url => { data.settings.sticker = url; save(); done(); });
}
function readImage(cb) {
  const inp = h('input', { type: 'file', accept: 'image/*' });
  inp.addEventListener('change', () => {
    const f = inp.files[0]; if (!f) return;
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 300 / Math.max(img.width, img.height));
      const c = h('canvas', { width: Math.round(img.width * k), height: Math.round(img.height * k) });
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src); cb(c.toDataURL('image/png'));
    };
    img.onerror = () => toast('이미지를 열지 못했어요');
    img.src = URL.createObjectURL(f);
  });
  inp.click();
}

// ============================================================ pages
const START_HOUR = 5; // 타임라인: 05시 ~ 다음날 04시
const TASK_ROWS = 18;

function pageDaily(dateStr) {
  const date = parseYmd(dateStr);
  const day = data.days[dateStr] || {};
  fill(day.tasks = day.tasks || [], TASK_ROWS, () => ({ s: '', t: '', d: false }));
  day.slots = day.slots || Array(144).fill(null);
  const commit = attach(data.days, dateStr, day);

  const hEl = h('span', { class: 'n' }), mEl = h('span', { class: 'n' });
  const brushes = h('div', { class: 'brushes' });
  let brush = Number(sessionStorage.getItem('brush') || 0);
  const refresh = () => {
    const m = day.slots.filter(v => v != null).length * 10;
    hEl.textContent = Math.floor(m / 60); mEl.textContent = pad(m % 60);
    const per = {}; day.slots.forEach(v => { if (v != null) per[v] = (per[v] || 0) + 10; });
    brushes.replaceChildren(h('span', { class: 'lbl' }, '칠할 과목'), ...subjects().map((s, i) =>
      h('button', { type: 'button', class: i === brush ? 'active' : '', onclick: () => { brush = i; sessionStorage.setItem('brush', i); refresh(); } },
        h('span', { class: 'dot', style: { background: s.color } }), s.name, per[i] ? h('span', { class: 'sum' }, fmtMin(per[i])) : null)));
  };

  // 타임라인
  const tl = h('div', { class: 'timeline' });
  const cells = [];
  for (let r = 0; r < 24; r++) {
    tl.append(h('div', { class: 'h' }, pad((START_HOUR + r) % 24)));
    for (let c = 0; c < 6; c++) {
      const idx = r * 6 + c;
      const cell = h('div', { class: 'c', 'data-i': idx });
      cells[idx] = cell; tl.append(cell);
    }
  }
  const paintCell = i => { const v = day.slots[i]; cells[i].style.background = v == null ? '' : subjColor(v); };
  cells.forEach((_, i) => paintCell(i));
  let painting = null;
  const hit = e => { const el = document.elementFromPoint(e.clientX, e.clientY); return el && el.dataset && el.dataset.i != null && tl.contains(el) ? Number(el.dataset.i) : null; };
  const apply = i => { if (i == null) return; const v = painting === 'erase' ? null : brush; if (day.slots[i] !== v) { day.slots[i] = v; paintCell(i); } };
  tl.addEventListener('pointerdown', e => {
    const i = hit(e); if (i == null) return;
    painting = day.slots[i] === brush ? 'erase' : 'paint'; apply(i); e.preventDefault();
  });
  tl.addEventListener('pointermove', e => { if (painting) apply(hit(e)); });
  const stop = () => { if (painting) { painting = null; refresh(); commit(); } };
  window.addEventListener('pointerup', stop); window.addEventListener('pointercancel', stop);
  cleanup.push(() => { window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop); });

  // 할 일 + 하루 마무리
  const ribbon = h('button', { type: 'button', class: 'ribbon' + (day.great ? ' on' : ''), title: '오늘 칭찬 도장' }, '참잘했어');
  ribbon.addEventListener('click', () => { day.great = !day.great; ribbon.classList.toggle('on', day.great); commit(); });
  const tasks = h('div', { class: 'tasks' },
    day.tasks.map(t => {
      const row = h('div', { class: 'row' + (t.d ? ' done' : '') });
      row.append(h('div', { class: 'subj' }, field(t, 's', commit)),
        h('div', { class: 'txt' }, field(t, 't', commit)), h('div', { class: 'ck' }, checkbox(t, 'd', commit, row)));
      return row;
    }),
    h('div', { class: 'row foot' }, area(day, 'memo', commit, 4, { placeholder: '오늘 하루를 돌아보며 한마디' }), ribbon));

  // 스티커
  // 그날의 스티커 (없으면 설정의 기본 스티커)
  const sKey = 'sticker:' + dateStr;
  const sBtn = h('button', { type: 'button', class: 'sticker' });
  const sDel = h('button', { type: 'button', class: 'sticker-del', title: '오늘 스티커 지우기', hidden: true }, '×');
  const sticker = h('div', { class: 'sticker-wrap' }, sBtn, sDel);
  const showSticker = own => {
    const src = own || data.settings.sticker;
    sBtn.className = 'sticker' + (src ? ' has' : '') + (own ? '' : ' default');
    sBtn.title = own ? '오늘 스티커 바꾸기' : '오늘의 스티커 넣기';
    sBtn.replaceChildren(src ? h('img', { src, alt: '' }) : icon('image'));
    sDel.hidden = !own;
  };
  sBtn.addEventListener('click', () => readImage(url => { Ink.set(sKey, url); showSticker(url); toast('오늘의 스티커를 붙였어요'); }));
  sDel.addEventListener('click', () => { Ink.set(sKey, null); showSticker(null); });
  showSticker(null);
  Ink.get(sKey).then(v => { if (v && location.hash.includes(dateStr)) showSticker(v); });

  // D-day 달력
  const dn = ddayNum(dateStr);
  const dcal = h('div', { class: 'dcal' }, h('i'), h('i'),
    dn == null
      ? h('a', { class: 'in', href: '#/settings', style: { textDecoration: 'none', color: 'var(--muted)', fontSize: '14px', padding: '18px 14px' } }, '설정에서 D-day 날짜 넣기')
      : h('div', { class: 'in' }, h('span', { class: 'lbl' }, dn >= 0 ? 'D -' : 'D +'), h('span', { class: 'big' + (Math.abs(dn) > 999 ? ' small' : '') }, dn === 0 ? 'DAY' : Math.abs(dn))),
    dn == null ? null : h('div', { class: 'lbl2' }, data.settings.ddayLabel || ''));

  refresh();
  return {
    key: 'daily:' + dateStr,
    title: `${date.getMonth() + 1}월 ${date.getDate()}일`,
    el: h('div', null,
      h('div', { class: 'ph' },
        banner('pink', h('h1', null, `${date.getFullYear()} / ${pad(date.getMonth() + 1)} / ${pad(date.getDate())}`, h('small', null, DOW[date.getDay()] + '요일'))),
        h('div', { class: 'navbtns' },
          h('button', { onclick: () => go(`#/daily/${ymd(addDays(date, -1))}`), 'aria-label': '이전 날' }, '‹'),
          h('input', { type: 'date', value: dateStr, onchange: e => e.target.value && go('#/daily/' + e.target.value) }),
          h('button', { onclick: () => go(`#/daily/${ymd(addDays(date, 1))}`), 'aria-label': '다음 날' }, '›'),
          h('button', { onclick: () => go(`#/daily/${ymd(new Date())}`) }, '오늘'),
          h('button', { class: 'btn pink', onclick: () => openImport(dateStr) }, '붙여넣기'))),
      h('div', { class: 'd-head' },
        h('div', { class: 'd-left' },
          h('div', { class: 'd-quote' }, sticker,
            h('div', { class: 'quote-lines' },
              field(day, 'q1', commit, { placeholder: '오늘 나에게 해주고 싶은 말' }),
              field(day, 'q2', commit, { placeholder: '' }),
              field(day, 'qs', commit, { placeholder: '출처', class: 'field src' })))),
        h('div', null, dcal,
          h('div', { class: 'dstat', title: '오늘 공부시간 (타임라인 합계)' },
            h('div', { class: 'r' }, hEl, icon('heart'), h('span', { class: 'u' }, '시간')),
            h('div', { class: 'r' }, mEl, icon('inf'), h('span', { class: 'u' }, '분'))))),
      h('div', { class: 'd-body' }, tasks, h('div', { class: 'tl-wrap' }, tl)),
      brushes),
  };
}

// ============================================================ 계획 붙여넣기
// 형식 예)
//   날짜: 2026-10-17
//   한마디: 더딘 것을 염려하지 말고 멈출 것을 염려하라
//   출처: 공자
//   아침 | 영어 단어 30개
//        | 듣기 2회
//   국어 | 문학 기출 3회분
//   - 구분 없는 할 일
//   메모: 저녁엔 오답 정리
function parsePlan(text) {
  const out = { date: null, q: [], qs: null, memo: [], tasks: [] };
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim(); if (!line) continue;
    let m;
    if ((m = line.match(/^#?\s*(?:플래너|날짜|date)\s*[:：]?\s*(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/i))) { out.date = `${m[1]}-${pad(m[2])}-${pad(m[3])}`; continue; }
    if ((m = line.match(/^(?:오늘의\s*)?한마디\s*[:：]\s*(.*)$/))) { out.q.push(m[1]); continue; }
    if ((m = line.match(/^출처\s*[:：]\s*(.*)$/))) { out.qs = m[1]; continue; }
    if ((m = line.match(/^(?:메모|피드백|회고)\s*[:：]\s*(.*)$/))) { out.memo.push(m[1]); continue; }
    if (/^[=#]{2,}/.test(line)) continue;
    let done = false, body = line;
    body = body.replace(/^\[\s*([xXvV✓✔]?)\s*\]\s*/, (_, c) => { done = !!c; return ''; });
    if (body.includes('|')) {
      const i = body.indexOf('|');
      out.tasks.push({ s: body.slice(0, i).trim(), t: body.slice(i + 1).trim().replace(/^\[\s*([xXvV✓✔]?)\s*\]\s*/, (_, c) => { done = done || !!c; return ''; }), d: done });
    } else {
      out.tasks.push({ s: '', t: body.replace(/^([-*·•]|\d+[.)])\s+/, ''), d: done });
    }
  }
  return out;
}
function applyPlan(dateKey, plan, mode) {
  const day = data.days[dateKey] || {};
  fill(day.tasks = day.tasks || [], TASK_ROWS, () => ({ s: '', t: '', d: false }));
  day.slots = day.slots || Array(144).fill(null);
  if (mode === 'replace') {
    day.tasks = plan.tasks.map(t => ({ ...t }));
    fill(day.tasks, TASK_ROWS, () => ({ s: '', t: '', d: false }));
    if (plan.q.length) { day.q1 = plan.q[0] || ''; day.q2 = plan.q[1] || ''; }
    if (plan.qs != null) day.qs = plan.qs;
    if (plan.memo.length) day.memo = plan.memo.join('\n');
  } else {
    let i = 0;
    for (const t of plan.tasks) {
      while (i < day.tasks.length && (day.tasks[i].s || day.tasks[i].t)) i++;
      if (i < day.tasks.length) day.tasks[i] = { ...t }; else day.tasks.push({ ...t });
      i++;
    }
    if (plan.q.length) { if (!day.q1) day.q1 = plan.q[0]; else if (!day.q2) day.q2 = plan.q[0]; if (plan.q[1] && !day.q2) day.q2 = plan.q[1]; }
    if (plan.qs != null && !day.qs) day.qs = plan.qs;
    if (plan.memo.length) day.memo = (day.memo ? day.memo + '\n' : '') + plan.memo.join('\n');
  }
  data.days[dateKey] = day; save();
}
function openImport(dateStr, initial) {
  const ta = h('textarea', { class: 'imp-text', placeholder: '여기에 계획을 붙여 넣으세요', value: initial || '' });
  const info = h('div', { class: 'imp-info' });
  const close = () => bg.remove();
  const update = () => {
    const p = parsePlan(ta.value);
    const bits = [];
    if (p.date) bits.push(`${p.date}`);
    bits.push(`할 일 ${p.tasks.length}개`);
    if (p.q.length) bits.push(`한마디 ${p.q.length}줄`);
    if (p.memo.length) bits.push('메모 있음');
    info.textContent = ta.value.trim() ? bits.join(' · ') : '';
    return p;
  };
  ta.addEventListener('input', update);
  const run = mode => {
    const p = update();
    if (!p.tasks.length && !p.q.length && !p.memo.length) { toast('넣을 내용이 없어요'); return; }
    let target = dateStr;
    if (p.date && p.date !== dateStr) {
      if (confirm(`이 계획은 ${p.date} 날짜예요.\n그 날짜에 넣을까요? (취소하면 지금 보고 있는 ${dateStr}에 넣어요)`)) target = p.date;
    }
    if (mode === 'replace' && !confirm('이 날의 할 일·한마디·메모를 붙여 넣은 내용으로 바꿀까요? 타임라인과 필기는 그대로예요.')) return;
    applyPlan(target, p, mode); close();
    toast(`할 일 ${p.tasks.length}개를 넣었어요`);
    go('#/daily/' + target);
  };
  const paste = h('button', { class: 'btn', onclick: async () => {
    try { ta.value = await navigator.clipboard.readText(); update(); }
    catch { toast('클립보드를 읽지 못했어요. 칸을 길게 눌러 붙여넣기 해 주세요'); ta.focus(); }
  } }, '클립보드에서 가져오기');
  const box = h('div', { class: 'modal' },
    h('div', { class: 'modal-head' }, h('span', { class: 'tag pink' }, '계획 붙여넣기'), h('span', { class: 'muted', style: { fontSize: '13px' } }, dateStr)),
    ta, info,
    h('details', { class: 'imp-help' }, h('summary', null, '형식 보기'),
      h('pre', null, '날짜: 2026-10-17\n한마디: 더딘 것을 염려하지 말고 멈출 것을 염려하라\n출처: 공자\n아침 | 영어 단어 30개\n     | 듣기 2회\n국어 | 문학 기출 3회분\n- 구분 없이 쓰는 할 일\n[x] 이미 끝낸 일은 이렇게\n메모: 저녁엔 오답 정리'),
      h('p', null, '“|” 왼쪽은 구분(시간대·과목), 오른쪽은 할 일이에요. 날짜 줄은 없어도 돼요.')),
    h('div', { class: 'modal-btns' }, paste, h('span', { style: { flex: 1 } }),
      h('button', { class: 'btn', onclick: close }, '취소'),
      h('button', { class: 'btn', onclick: () => run('replace') }, '바꾸기'),
      h('button', { class: 'btn primary', onclick: () => run('append') }, '빈 칸에 넣기')));
  const bg = h('div', { class: 'modal-bg', onclick: e => { if (e.target === bg) close(); } }, box);
  document.body.append(bg); update(); ta.focus();
}

function pageMonthly(mStr) {
  const first = parseYmd(mStr + '-01');
  const m = data.months[mStr] || {};
  m.notes = m.notes || {};
  const commit = attach(data.months, mStr, m);
  const start = addDays(first, -first.getDay());
  const today = ymd(new Date());
  const cal = h('div', { class: 'cal' }, ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((d, i) => h('div', { class: 'dow' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '') }, d)));
  let total = 0;
  const weeks = Math.ceil((first.getDay() + new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()) / 7);
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i), key = ymd(d), inMonth = d.getMonth() === first.getMonth();
    const mins = dayMinutes(key); if (inMonth) total += mins;
    const cls = ['cell', inMonth ? '' : 'out', key === today ? 'today' : '', d.getDay() === 0 ? 'sun' : d.getDay() === 6 ? 'sat' : ''].join(' ');
    cal.append(h('div', { class: cls },
      h('button', { class: 'dnum', title: '하루 기록 열기', onclick: () => go('#/daily/' + key) }, d.getDate()),
      inMonth ? h('textarea', { value: m.notes[d.getDate()] || '', oninput: e => { m.notes[d.getDate()] = e.target.value; commit(); } }) : h('div', { style: { flex: 1 } }),
      h('div', { class: 't' }, mins ? `${Math.floor(mins / 60)}H ${pad(mins % 60)}M` : '')));
  }
  return {
    key: 'monthly:' + mStr,
    title: `${first.getMonth() + 1}월`,
    el: h('div', null,
      h('div', { class: 'ph' },
        banner('green', h('h1', null, pad(first.getMonth() + 1), h('small', null, `${first.getFullYear()} · ${first.getMonth() + 1}월 계획`))),
        h('div', { class: 'navbtns' },
          h('button', { onclick: () => go('#/monthly/' + addMonths(mStr, -1)), 'aria-label': '이전 달' }, '‹'),
          h('input', { type: 'month', value: mStr, onchange: e => e.target.value && go('#/monthly/' + e.target.value) }),
          h('button', { onclick: () => go('#/monthly/' + addMonths(mStr, 1)), 'aria-label': '다음 달' }, '›'))),
      h('div', { class: 'box month-goal' }, h('span', { class: 'tag green' }, '이달의 목표'), field(m, 'goal', commit)),
      cal,
      h('div', { class: 'month-foot' },
        h('span', { class: 'pill' }, '이번 달 총 공부시간', h('b', null, fmtMin(total))),
        h('a', { class: 'stamp-link', href: '#/review/' + mStr }, h('span', { class: 'circ' }, icon('review')), '이달의 평가 바로가기'))),
  };
}

function pageReview(mStr) {
  const first = parseYmd(mStr + '-01');
  const m = data.months[mStr] || {};
  const r = m.review = m.review || {};
  fill(r.evals = r.evals || [], 12, () => ({ s: '', t: '', r: 0 }));
  r.life = r.life || {};
  const commit = attach(data.months, mStr, m);

  const per = {}; let total = 0;
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  for (let d = 1; d <= last; d++) { const k = `${mStr}-${pad(d)}`; daySubjectMinutes(k, per); total += dayMinutes(k); }
  const max = Math.max(1, ...Object.values(per));
  const bars = subjects().map((s, i) => h('div', { class: 'b' },
    h('span', null, s.name), h('div', { class: 'track' }, h('div', { class: 'fill', style: { width: ((per[i] || 0) / max * 100) + '%', background: s.color } })),
    h('span', { class: 'v' }, per[i] ? `${Math.round(per[i] / 6) / 10}h` : '-')));

  const LIFE = [['contents', '콘텐츠'], ['music', '음악'], ['best', '좋았던 것'], ['book', '책'], ['food', '음식'], ['place', '장소']];
  return {
    key: 'review:' + mStr,
    title: `${first.getMonth() + 1}월 평가`,
    el: h('div', null,
      h('div', { class: 'ph' },
        banner('cream', h('h1', { class: 'kr' }, `${first.getMonth() + 1}월의 평가`, h('small', null, first.getFullYear()))),
        h('div', { class: 'navbtns' },
          h('button', { onclick: () => go('#/review/' + addMonths(mStr, -1)), 'aria-label': '이전 달' }, '‹'),
          h('a', { class: 'btn', href: '#/monthly/' + mStr }, '월간 계획으로'),
          h('button', { onclick: () => go('#/review/' + addMonths(mStr, 1)), 'aria-label': '다음 달' }, '›'))),
      h('div', { class: 'review-top' },
        h('div', { class: 'box' },
          h('div', { class: 'box-title' }, h('span', { class: 'tag pink' }, '칭찬해')), area(r, 'praise', commit, 3),
          h('div', { class: 'box-title' }, h('span', { class: 'tag green' }, '아쉬워')), area(r, 'regret', commit, 3)),
        h('div', { class: 'box total-box' },
          h('div', { class: 'lbl' }, '총 공부시간'),
          h('div', { class: 'big' }, String(Math.floor(total / 60)), h('small', null, '시간'), pad(total % 60), h('small', null, '분')),
          h('div', { class: 'subj-bars' }, bars))),
      h('div', { class: 'box' },
        h('table', { class: 'eval' },
          h('thead', null, h('tr', null, h('th', null, '과목'), h('th', null, '내용'), h('th', null, '평가'))),
          h('tbody', null, r.evals.map(row => h('tr', null,
            h('td', null, field(row, 's', commit, { style: { textAlign: 'center' } })),
            h('td', null, field(row, 't', commit)),
            h('td', null, stars(row, 'r', commit))))))),
      h('div', { class: 'box life' }, LIFE.map(([k, label]) => h('div', null, h('label', null, label), field(r.life, k, commit)))),
    ),
  };
}

function pager(kind, idx, count) {
  return h('div', { class: 'pager' },
    h('button', { class: 'btn', disabled: idx <= 0, onclick: () => go(`#/${kind}/${idx}`), 'aria-label': '이전 페이지' }, '‹'),
    h('span', null, `${idx + 1} / ${count}`),
    h('button', { class: 'btn', onclick: () => go(`#/${kind}/${idx + 2}`) }, idx + 1 >= count ? '+ 새 페이지' : '›'));
}

function pageSubjects(n) {
  const idx = Math.max(0, n - 1);
  const pages = data.subjectPages;
  const pg = pages[idx] || {};
  const commit = () => { pages[idx] = pg; for (let i = 0; i < idx; i++) pages[i] = pages[i] || null; save(); };
  fill(pg.cards = pg.cards || [], 4, () => ({ name: '', goal: '', memo: '', items: [] }));
  const cards = pg.cards.map((c, ci) => {
    fill(c.items, 9, () => ({ t: '', d: false }));
    if (!c.name && idx === 0 && !pages[idx]) c.name = (subjects()[ci] || {}).name || '';
    return h('div', { class: 'box scard' },
      h('div', { class: 'shead' }, field(c, 'name', commit, { placeholder: '과목' })),
      h('div', { class: 'goal' }, h('span', null, '목표'), field(c, 'goal', commit)),
      c.items.map(it => { const row = h('div', { class: 'item' + (it.d ? ' done' : '') }); row.append(field(it, 't', commit), checkbox(it, 'd', commit, row)); return row; }),
      h('div', { class: 'smemo' }, area(c, 'memo', commit, 2, { placeholder: '메모' })));
  });
  return {
    key: 'subjects:' + idx,
    title: '과목별 계획',
    el: h('div', null,
      h('div', { class: 'ph' }, banner('pink', h('h1', { class: 'kr' }, '과목별 계획')), pager('subjects', idx, Math.max(pages.length, idx + 1))),
      h('div', { class: 'sgrid' }, cards)),
  };
}

function pageLectures(n) {
  const idx = Math.max(0, n - 1);
  const pages = data.lecturePages;
  const pg = pages[idx] || {};
  const commit = () => { pages[idx] = pg; for (let i = 0; i < idx; i++) pages[i] = pages[i] || null; save(); };
  fill(pg.lecs = pg.lecs || [], 4, () => ({ subj: '', teacher: '', title: '', period: '', memo: '', done: [] }));
  const blocks = pg.lecs.map(L => {
    const prog = h('div', { class: 'prog' });
    const upd = () => { const c = L.done.filter(Boolean).length; prog.textContent = c ? `${c}강 완료` : ''; };
    const grid = h('div', { class: 'grid' });
    for (let i = 0; i < 60; i++) {
      const b = h('button', { type: 'button', class: L.done[i] ? 'on' : '' }, i + 1);
      b.addEventListener('click', () => { L.done[i] = !L.done[i]; b.classList.toggle('on', L.done[i]); upd(); commit(); });
      grid.append(b);
    }
    grid.append(prog); upd();
    const R = (label, k) => h('div', { class: 'r' }, h('span', null, label), field(L, k, commit));
    return h('div', { class: 'box lec' },
      h('div', { class: 'meta' }, R('과목', 'subj'), R('선생님', 'teacher'), R('강좌', 'title'), R('기간', 'period'), R('메모', 'memo')),
      grid);
  });
  return {
    key: 'lectures:' + idx,
    title: '온라인 강의',
    el: h('div', null,
      h('div', { class: 'ph' }, banner('green', h('h1', { class: 'kr' }, '온라인 강의')), pager('lectures', idx, Math.max(pages.length, idx + 1))),
      blocks),
  };
}

function pageExams(n) {
  const idx = Math.max(0, n - 1);
  const pages = data.examPages;
  const pg = pages[idx] || {};
  const commit = () => { pages[idx] = pg; for (let i = 0; i < idx; i++) pages[i] = pages[i] || null; save(); drawChart(); };
  fill(pg.rows = pg.rows || [], 12, () => ({ date: '', name: '', s: {} }));
  const subs = subjects();

  const chartBox = h('div', { class: 'box chart' });
  function drawChart() {
    const rows = pg.rows.filter(r => Object.values(r.s || {}).some(v => v && v.score !== '' && !isNaN(parseFloat(v.score))));
    if (rows.length < 2) { chartBox.replaceChildren(h('p', { class: 'help' }, '점수를 두 번 이상 입력하면 과목별 점수 추이 그래프가 나타나요.')); return; }
    const W = 900, H = 220, L = 34, B = 24, T = 10;
    let max = 0; rows.forEach(r => subs.forEach((_, i) => { const v = parseFloat((r.s[i] || {}).score); if (!isNaN(v)) max = Math.max(max, v); }));
    max = max <= 100 ? 100 : Math.ceil(max / 10) * 10;
    const x = j => L + 10 + j * (W - L - 30) / (rows.length - 1);
    const y = v => T + (H - T - B) * (1 - v / max);
    const s = (tag, attrs, text) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; };
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}` });
    [0, .5, 1].forEach(f => { const yy = y(max * f); svg.append(s('line', { x1: L, x2: W - 10, y1: yy, y2: yy, stroke: '#ece8e3' }), s('text', { x: L - 6, y: yy + 4, 'text-anchor': 'end', 'font-size': 11, fill: '#97908a' }, Math.round(max * f))); });
    rows.forEach((r, j) => svg.append(s('text', { x: x(j), y: H - 6, 'text-anchor': 'middle', 'font-size': 11, fill: '#97908a' }, r.date || r.name || j + 1)));
    subs.forEach((sub, i) => {
      const pts = rows.map((r, j) => [j, parseFloat((r.s[i] || {}).score)]).filter(p => !isNaN(p[1]));
      if (!pts.length) return;
      const col = sub.color, st = 'filter:saturate(1.5) brightness(.85)';
      svg.append(s('polyline', { points: pts.map(([j, v]) => `${x(j)},${y(v)}`).join(' '), fill: 'none', stroke: col, 'stroke-width': 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', style: st }));
      pts.forEach(([j, v]) => svg.append(s('circle', { cx: x(j), cy: y(v), r: 4, fill: '#fff', stroke: col, 'stroke-width': 2.2, style: st })));
    });
    chartBox.replaceChildren(
      h('div', { class: 'brushes', style: { margin: '0 0 6px', justifyContent: 'flex-start' } }, subs.map(sb => h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '5px' } }, h('span', { class: 'dot', style: { background: sb.color } }), sb.name))),
      svg);
  }

  const table = h('table', { class: 'exam' },
    h('colgroup', null, h('col', { style: { width: '74px' } }), h('col', { style: { width: '116px' } }), subs.flatMap(() => [h('col'), h('col', { style: { width: '42px' } })])),
    h('thead', null,
      h('tr', null, h('th', { rowspan: 2 }, '날짜'), h('th', { rowspan: 2 }, '시험'), subs.map(sb => h('th', { colspan: 2, class: 'sep' }, sb.name))),
      h('tr', null, subs.flatMap(() => [h('th', { class: 'sep' }, '점수'), h('th', null, '등급')]))),
    h('tbody', null, pg.rows.map(r => h('tr', null,
      h('td', null, field(r, 'date', commit, { placeholder: '' })),
      h('td', null, field(r, 'name', commit)),
      subs.flatMap((_, i) => {
        const o = r.s[i] = r.s[i] || {};
        return [h('td', { class: 'sep' }, field(o, 'score', commit, { inputmode: 'decimal' })), h('td', { class: 'grade' }, field(o, 'grade', commit, { inputmode: 'numeric' }))];
      })))));
  drawChart();

  return {
    key: 'exams:' + idx,
    title: '시험 결과',
    el: h('div', null,
      h('div', { class: 'ph' }, banner('cream', h('h1', { class: 'kr' }, '시험 결과 정리')), pager('exams', idx, Math.max(pages.length, idx + 1))),
      h('div', { class: 'box' }, table),
      chartBox,
      h('div', { class: 'fb' },
        h('div', { class: 'box' }, h('div', { class: 'box-title' }, h('span', { class: 'tag pink' }, '칭찬해')), area(pg, 'good', commit, 4)),
        h('div', { class: 'box' }, h('div', { class: 'box-title' }, h('span', { class: 'tag green' }, '아쉬워')), area(pg, 'bad', commit, 4)))),
  };
}

function pageSettings() {
  const st = data.settings;
  const list = h('div');
  const drawList = () => list.replaceChildren(...st.subjects.map((s, i) => h('div', { class: 'set-row' },
    h('input', { type: 'color', value: s.color, oninput: e => { s.color = e.target.value; save(); } }),
    h('input', { type: 'text', value: s.name, oninput: e => { s.name = e.target.value; save(); } }),
    h('button', { class: 'btn', disabled: i === 0, onclick: () => { [st.subjects[i - 1], st.subjects[i]] = [st.subjects[i], st.subjects[i - 1]]; save(); drawList(); } }, '↑'),
    h('button', { class: 'btn', onclick: () => {
      if (!confirm(`'${s.name}' 과목을 삭제할까요?\n하루 기록 타임라인에서 이 과목으로 칠한 칸 색이 다른 과목으로 바뀔 수 있어요.`)) return;
      st.subjects.splice(i, 1); save(); drawList();
    } }, '삭제'))),
    st.subjects.length < 8 ? h('button', { class: 'btn', onclick: () => { st.subjects.push({ name: '새 과목', color: '#cccccc' }); save(); drawList(); } }, '+ 과목 추가') : null);
  drawList();

  const fileIn = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: e => importBackup(e.target.files[0]) });
  return {
    key: null, title: '설정',
    el: h('div', null,
      h('div', { class: 'ph' }, banner('green', h('h1', { class: 'kr' }, '설정'))),
      h('div', { class: 'box set-sec' }, h('h3', null, h('span', { class: 'tag pink' }, 'D-day')),
        h('div', { class: 'set-row' },
          h('input', { type: 'text', value: st.ddayLabel, placeholder: '예: 수능', oninput: e => { st.ddayLabel = e.target.value; save(); } }),
          h('input', { type: 'date', value: st.ddayDate, onchange: e => { st.ddayDate = e.target.value; save(); } }))),
      h('div', { class: 'box set-sec' }, h('h3', null, h('span', { class: 'tag green' }, '과목')),
        h('p', { class: 'help', style: { marginBottom: '10px' } }, '하루 기록 타임라인 색, 이달의 평가 그래프, 시험 결과 표의 열이 이 목록을 따라가요. 순서를 바꾸면 이미 칠한 칸의 과목도 함께 바뀌니 처음에 정해 두는 걸 권해요.'),
        list),
      h('div', { class: 'box set-sec' }, h('h3', null, h('span', { class: 'tag cream' }, '기본 스티커')),
        h('p', { class: 'help', style: { marginBottom: '10px' } }, '하루 기록의 스티커 칸을 누르면 그날만의 사진이나 그림을 붙일 수 있어요. 여기서 고른 기본 스티커는 그날 스티커를 붙이지 않은 날에 연하게 보여요.'),
        h('div', { class: 'set-row' },
          st.sticker ? h('img', { src: st.sticker, alt: '', style: { width: '80px', height: '70px', objectFit: 'contain', border: '1px solid var(--line-soft)', borderRadius: '10px', background: '#fff' } }) : null,
          h('button', { class: 'btn', onclick: () => pickSticker(route) }, st.sticker ? '바꾸기' : '이미지 고르기'),
          st.sticker ? h('button', { class: 'btn', onclick: () => { delete st.sticker; save(); route(); } }, '지우기') : null)),
      h('div', { class: 'box set-sec' }, h('h3', null, h('span', { class: 'tag' }, '백업')),
        h('p', { class: 'help', style: { marginBottom: '10px' } }, '모든 기록은 지금 쓰는 기기의 브라우저에만 저장돼요. 기기를 바꾸거나 브라우저 데이터를 지우기 전에 꼭 백업 파일을 내려받아 두세요. 다른 기기에서는 백업 파일을 불러오면 그대로 이어서 쓸 수 있어요.'),
        h('div', { class: 'set-row' },
          h('button', { class: 'btn primary', onclick: exportBackup }, '백업 파일 내려받기'),
          h('button', { class: 'btn', onclick: () => fileIn.click() }, '백업 불러오기'), fileIn,
          h('button', { class: 'btn', style: { marginLeft: 'auto', color: '#c25555' }, onclick: resetAll }, '전체 초기화'))),
      h('div', { class: 'box set-sec' }, h('h3', null, h('span', { class: 'tag' }, '사용 팁')),
        h('p', { class: 'help' },
          '· 하루 기록 타임라인: 아래에서 과목을 고르고 칸을 누르거나 쓸어서 칠해요. 같은 과목 칸을 다시 누르면 지워져요.', h('br'),
          '· 필기: 오른쪽 연필 탭을 누르면 페이지 위에 펜으로 쓸 수 있어요. 손 모양 버튼을 켜면 펜슬로만 써지고 손가락으로는 스크롤돼요.', h('br'),
          '· 아래 ‘참잘했어’ 리본을 누르면 그날 칭찬 도장이 찍혀요.', h('br'),
          '· 아이패드 사파리에서 공유 → 홈 화면에 추가를 하면 앱처럼 전체 화면으로 열려요.'))),
  };
}

// ============================================================ backup
async function exportBackup() {
  const ink = await Ink.all();
  const blob = new Blob([JSON.stringify({ app: 'study-planner', v: 1, exportedAt: new Date().toISOString(), data, ink })], { type: 'application/json' });
  if (window.AndroidBridge) { AndroidBridge.saveFile(`planner-backup-${ymd(new Date())}.json`, 'application/json', await blobToBase64(blob)); return; }
  const a = h('a', { href: URL.createObjectURL(blob), download: `planner-backup-${ymd(new Date())}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('백업 파일을 내려받았어요');
}
async function importBackup(file) {
  if (!file) return;
  try {
    const json = JSON.parse(await file.text());
    if (json.app !== 'study-planner' || !json.data) throw new Error('형식');
    if (!confirm('지금 기기의 기록을 백업 파일 내용으로 바꿀까요?')) return;
    data = Object.assign(defaults(), json.data);
    localStorage.setItem(KEY, JSON.stringify(data));
    await Ink.replaceAll(json.ink || {});
    toast('불러오기 완료'); route();
  } catch (e) { alert('백업 파일을 읽지 못했어요. 이 플래너에서 내려받은 .json 파일인지 확인해 주세요.'); }
}
async function resetAll() {
  if (!confirm('모든 기록과 필기를 지울까요? 되돌릴 수 없어요.')) return;
  if (!confirm('정말 지울까요? 백업을 먼저 내려받는 걸 권해요.')) return;
  data = defaults(); localStorage.setItem(KEY, JSON.stringify(data));
  await Ink.replaceAll({}); toast('초기화했어요'); route();
}

// ============================================================ ink (필기)
const Ink = (() => {
  let dbp;
  const db = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('study-planner-ink', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('pages');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction('pages', mode); const out = fn(t.objectStore('pages')); t.oncomplete = () => res(out && out.result); t.onerror = () => rej(t.error); }); };
  return {
    get: k => tx('readonly', s => s.get(k)).catch(() => null),
    set: (k, v) => tx('readwrite', s => (v && v.length ? s.put(v, k) : s.delete(k))).catch(() => toast('필기 저장 실패')),
    async all() {
      const d = await db(); return new Promise(res => {
        const out = {}; const c = d.transaction('pages').objectStore('pages').openCursor();
        c.onsuccess = () => { const cur = c.result; if (cur) { out[cur.key] = cur.value; cur.continue(); } else res(out); };
        c.onerror = () => res(out);
      });
    },
    async replaceAll(obj) { await tx('readwrite', s => { s.clear(); for (const k in obj) s.put(obj[k], k); }); },
  };
})();

let strokeN = 0; // 획 생성 순서 (지우개 실행취소 정렬용)
const pen = {
  on: false, tool: 'pen', color: '#45413e', width: 2.5, penOnly: localStorage.getItem('penOnly') === '1',
  key: null, strokes: [], undo: [], cur: null, cache: null, saveT: null,
};
const COLORS = ['#45413e', '#e07272', '#5b86b5', '#6a9c5a', '#f0a24a', '#ffd84d'];
const canvas = $('#ink'), ctx = canvas.getContext('2d');
const pageEl = $('#page');

function setupPenUI() {
  const sw = $('#swatches');
  COLORS.forEach(c => sw.append(h('button', { 'aria-label': c, style: { background: c }, class: c === pen.color ? 'active' : '', onclick: e => {
    pen.color = c; [...sw.children].forEach(b => b.classList.toggle('active', b === e.currentTarget));
    if (pen.tool === 'eraser') selectTool('pen');
  } })));
  const selectTool = t => { pen.tool = t; document.querySelectorAll('.rail-tools .tool').forEach(b => b.classList.toggle('active', b.dataset.tool === t)); };
  document.querySelectorAll('.rail-tools .tool').forEach(b => b.addEventListener('click', () => selectTool(b.dataset.tool)));
  document.querySelectorAll('#penWidth button').forEach(b => b.addEventListener('click', () => {
    pen.width = Number(b.dataset.w); document.querySelectorAll('#penWidth button').forEach(x => x.classList.toggle('active', x === b));
  }));
  $('#penToggle').addEventListener('click', () => {
    pen.on = !pen.on; document.body.classList.toggle('pen-on', pen.on);
    $('#penToggle').classList.toggle('on', pen.on); $('#penSub').hidden = !pen.on;
    if (pen.on && document.activeElement) document.activeElement.blur();
    fit();
  });
  const po = $('#penOnlyBtn');
  po.classList.toggle('tool', false); po.classList.toggle('on', pen.penOnly);
  po.addEventListener('click', () => {
    pen.penOnly = !pen.penOnly; po.classList.toggle('on', pen.penOnly);
    try { localStorage.setItem('penOnly', pen.penOnly ? '1' : '0'); } catch {}
    toast(pen.penOnly ? '펜슬로만 써져요. 손가락은 스크롤' : '손가락으로도 써져요');
  });
  $('#penUndo').addEventListener('click', () => {
    const u = pen.undo.pop(); if (!u) return;
    if (u.add) pen.strokes.splice(pen.strokes.lastIndexOf(u.add), 1);
    if (u.removed) { pen.strokes.push(...u.removed); pen.strokes.sort((a, b) => a._n - b._n); }
    redrawInk(true); queueInkSave();
  });
  $('#penClear').addEventListener('click', () => {
    if (!pen.strokes.length || !confirm('이 페이지의 필기를 모두 지울까요?')) return;
    pen.undo.push({ removed: pen.strokes.slice() }); pen.strokes = []; redrawInk(true); queueInkSave();
  });

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('touchstart', e => { if (pen.on) e.preventDefault(); }, { passive: false });
}

let scrollDrag = null;
function toPage(e) { const r = pageEl.getBoundingClientRect(); const s = r.width / pageEl.offsetWidth; return [(e.clientX - r.left) / s, (e.clientY - r.top) / s]; }
function onDown(e) {
  if (!pen.on || !pen.key) return;
  if (pen.penOnly && e.pointerType === 'touch') { scrollDrag = { id: e.pointerId, y: e.clientY }; return; }
  if (e.button > 0) return;
  canvas.setPointerCapture(e.pointerId);
  const [x, y] = toPage(e);
  if (pen.tool === 'eraser') { pen.cur = { erase: true, removed: [] }; eraseAt(x, y); return; }
  pen.cur = { _n: strokeN++, t: pen.tool, c: pen.color, w: pen.tool === 'hl' ? pen.width * 6 : pen.width, p: [Math.round(x * 10) / 10, Math.round(y * 10) / 10] };
  drawLive();
}
function onMove(e) {
  if (scrollDrag && e.pointerId === scrollDrag.id) { window.scrollBy(0, scrollDrag.y - e.clientY); scrollDrag.y = e.clientY; return; }
  if (!pen.cur) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of evs.length ? evs : [e]) {
    const [x, y] = toPage(ev);
    if (pen.cur.erase) eraseAt(x, y);
    else { const p = pen.cur.p, lx = p[p.length - 2], ly = p[p.length - 1]; if (Math.hypot(x - lx, y - ly) > 0.8) p.push(Math.round(x * 10) / 10, Math.round(y * 10) / 10); }
  }
  if (!pen.cur.erase) drawLive();
}
function onUp(e) {
  if (scrollDrag && e.pointerId === scrollDrag.id) { scrollDrag = null; return; }
  if (!pen.cur) return;
  if (pen.cur.erase) { if (pen.cur.removed.length) pen.undo.push({ removed: pen.cur.removed }); }
  else { if (pen.cur.p.length === 2) pen.cur.p.push(pen.cur.p[0] + .1, pen.cur.p[1]); pen.strokes.push(pen.cur); pen.undo.push({ add: pen.cur }); }
  pen.cur = null; redrawInk(true); queueInkSave();
}
function eraseAt(x, y) {
  const R = 10; let hit = false;
  for (let i = pen.strokes.length - 1; i >= 0; i--) {
    const st = pen.strokes[i], p = st.p, rr = R + st.w / 2;
    for (let j = 0; j < p.length; j += 2) if (Math.abs(p[j] - x) < rr && Math.abs(p[j + 1] - y) < rr) {
      pen.cur.removed.push(st); pen.strokes.splice(i, 1); hit = true; break;
    }
  }
  if (hit) redrawInk(true);
}
function strokePath(c, s) {
  const p = s.p; c.beginPath(); c.moveTo(p[0], p[1]);
  if (p.length === 4) c.lineTo(p[2], p[3]);
  for (let i = 2; i < p.length - 2; i += 2) { const mx = (p[i] + p[i + 2]) / 2, my = (p[i + 1] + p[i + 3]) / 2; c.quadraticCurveTo(p[i], p[i + 1], mx, my); }
  if (p.length > 4) c.lineTo(p[p.length - 2], p[p.length - 1]);
  c.lineWidth = s.w; c.strokeStyle = s.c; c.lineCap = s.t === 'hl' ? 'butt' : 'round'; c.lineJoin = 'round';
  c.globalAlpha = s.t === 'hl' ? 0.35 : 1; c.stroke(); c.globalAlpha = 1;
}
function sizeCanvas() {
  const r = pageEl.getBoundingClientRect(); const s = r.width / pageEl.offsetWidth || 1;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const W = Math.round(pageEl.offsetWidth * s * dpr), H = Math.round(pageEl.offsetHeight * s * dpr);
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; pen.cache = null; }
  return s * dpr;
}
function redrawInk(rebuild) {
  const k = sizeCanvas();
  if (!canvas.width || !canvas.height) return k;
  if (rebuild || !pen.cache) {
    pen.cache = pen.cache && pen.cache.width === canvas.width && pen.cache.height === canvas.height ? pen.cache : document.createElement('canvas');
    pen.cache.width = canvas.width; pen.cache.height = canvas.height;
    const c = pen.cache.getContext('2d'); c.setTransform(k, 0, 0, k, 0, 0); c.clearRect(0, 0, pen.cache.width, pen.cache.height);
    pen.strokes.forEach(s => strokePath(c, s));
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(pen.cache, 0, 0);
  return k;
}
let liveRaf = 0;
function drawLive() {
  if (liveRaf) return;
  liveRaf = requestAnimationFrame(() => { liveRaf = 0; const k = redrawInk(false); if (pen.cur && pen.cur.p) { ctx.setTransform(k, 0, 0, k, 0, 0); strokePath(ctx, pen.cur); } });
}
function queueInkSave() {
  const key = pen.key, strokes = pen.strokes.map(({ _n, ...s }) => s);
  clearTimeout(pen.saveT); pen.saveT = setTimeout(() => Ink.set(key, strokes), 400);
}
async function loadInk(key) {
  if (pen.saveT && pen.key) { clearTimeout(pen.saveT); await Ink.set(pen.key, pen.strokes.map(({ _n, ...s }) => s)); pen.saveT = null; }
  pen.key = key; pen.strokes = []; pen.undo = []; pen.cur = null; redrawInk(true);
  if (!key) return;
  const s = await Ink.get(key);
  if (pen.key !== key) return;
  pen.strokes = (s || []).map(x => ({ ...x, _n: strokeN++ })); redrawInk(true);
}

// ============================================================ 위젯 (오늘 한눈에 보기)
// 주소: widget.html 또는 index.html#/widget
let widgetTimer = null, widgetDay = null;
function reloadData() {
  try { data = Object.assign(defaults(), JSON.parse(localStorage.getItem(KEY) || 'null') || {}); } catch {}
}
// 이미지 저장(html2canvas)에서도 보이도록 <use> 대신 경로를 직접 넣은 체크 아이콘
function checkSvg() {
  const svg = document.createElementNS(SVGNS, 'svg'); svg.setAttribute('viewBox', '0 0 24 24');
  const p = document.createElementNS(SVGNS, 'path'); p.setAttribute('d', 'M4.5 12.8c1.7 1.4 3 3 4.1 5.2C11 12.3 14.6 7.6 19.8 4');
  p.setAttribute('fill', 'none'); p.setAttribute('stroke', '#ec8c8c'); p.setAttribute('stroke-width', '2.2'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
  svg.append(p); return svg;
}
function renderWidget() {
  const root = $('#widgetRoot');
  const dateStr = ymd(new Date()); widgetDay = dateStr;
  const date = parseYmd(dateStr);
  const day = data.days[dateStr] || {};
  const tasks = (day.tasks || []).map((t, i) => ({ t, i })).filter(x => x.t.s || x.t.t);
  const commit = attach(data.days, dateStr, day);
  const mins = dayMinutes(dateStr);
  const dn = ddayNum(dateStr);
  const doneN = tasks.filter(x => x.t.d).length;

  // 할 일 목록
  let lastS = '';
  const list = h('div', { class: 'w-tasks' }, tasks.length ? tasks.map(({ t }) => {
    const row = h('div', { class: 'w-row' + (t.d ? ' done' : '') });
    const label = t.s && t.s !== lastS ? t.s : ''; if (t.s) lastS = t.s;
    const ck = h('button', { type: 'button', class: 'check' + (t.d ? ' on' : ''), 'aria-label': '완료' }, checkSvg());
    ck.addEventListener('click', () => {
      t.d = !t.d; ck.classList.toggle('on', t.d); row.classList.toggle('done', t.d); commit();
      prog.textContent = `${tasks.filter(x => x.t.d).length} / ${tasks.length}`;
    });
    row.append(h('span', { class: 'w-s' }, label), h('span', { class: 'w-t' }, t.t), ck);
    return row;
  }) : h('div', { class: 'w-empty' }, '오늘 할 일이 아직 없어요', h('br'), h('a', { href: 'index.html#/daily/' + dateStr, target: '_blank' }, '플래너에서 계획 넣기')));
  const prog = h('span', { class: 'w-prog' }, tasks.length ? `${doneN} / ${tasks.length}` : '');

  // 타임라인 띠 (05시~다음날 04시)
  const strip = h('div', { class: 'w-strip' });
  const slots = day.slots || [];
  for (let r = 0; r < 24; r++) {
    const col = h('div', { class: 'w-hour' }, h('i', null, r % 3 === 0 ? pad((START_HOUR + r) % 24) : ''));
    for (let c = 0; c < 6; c++) { const v = slots[r * 6 + c]; col.append(h('b', { style: v != null ? { background: subjColor(v) } : null })); }
    strip.append(col);
  }

  const sticker = h('div', { class: 'w-sticker' });
  const showSticker = src => { sticker.replaceChildren(src ? h('img', { src, alt: '' }) : ''); sticker.style.display = src ? '' : 'none'; };
  showSticker(data.settings.sticker);
  Ink.get('sticker:' + dateStr).then(v => { if (v) showSticker(v); });
  const quote = [day.q1, day.q2].filter(Boolean).join(' ');

  const card = h('div', { class: 'w-card', id: 'widgetCard' },
    h('div', { class: 'w-head' },
      banner('pink', h('h1', null, `${pad(date.getMonth() + 1)} / ${pad(date.getDate())}`, h('small', null, DOW[date.getDay()]))),
      h('div', { class: 'w-dday' }, dn == null ? '' : [h('span', null, data.settings.ddayLabel || 'D-day'), h('b', null, dn === 0 ? 'D-DAY' : dn > 0 ? `D-${dn}` : `D+${-dn}`)])),
    (quote || data.settings.sticker) ? h('div', { class: 'w-quote' }, sticker, h('p', null, quote || '')) : sticker,
    h('div', { class: 'w-stats' },
      h('div', null, h('span', null, '오늘 공부'), h('b', null, `${Math.floor(mins / 60)}`, h('small', null, '시간 '), pad(mins % 60), h('small', null, '분'))),
      h('div', null, h('span', null, '완료'), h('b', null, prog))),
    list,
    h('div', { class: 'w-strip-wrap' },
      h('div', { class: 'w-strip-head' }, h('span', null, '오늘의 공부 시간표'), day.great ? h('span', { class: 'w-stamp' }, '참 잘했어') : null),
      strip));

  root.replaceChildren(card,
    h('div', { class: 'w-foot' },
      h('a', { class: 'btn', href: 'index.html#/daily/' + dateStr, target: '_blank' }, '플래너 열기'),
      h('button', { class: 'btn', onclick: () => { reloadData(); renderWidget(); } }, '새로고침'),
      h('button', { class: 'btn pink', onclick: saveWidgetImage }, '이미지로 저장')));
  document.title = `오늘 ${date.getMonth() + 1}/${date.getDate()} · 플래너`;
}
async function saveWidgetImage() {
  const card = $('#widgetCard');
  try {
    if (!window.html2canvas) await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'vendor/html2canvas.min.js';
      s.onload = res; s.onerror = rej; document.head.append(s);
    });
    const c = await window.html2canvas(card, { scale: 2, backgroundColor: '#fffefc', useCORS: true });
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const name = `planner-${ymd(new Date())}.png`;
    if (window.AndroidBridge) { AndroidBridge.saveFile(name, 'image/png', await blobToBase64(blob)); return; }
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: '오늘 플래너' }); return; }
    const a = h('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove();
    toast('이미지를 저장했어요');
  } catch (e) { if (e && e.name !== 'AbortError') toast('이미지를 만들지 못했어요'); }
}
function startWidgetMode() {
  document.body.classList.add('widget-mode');
  renderWidget();
  if (widgetTimer) return;
  // 다른 창(플래너)에서 고치면 바로 반영, 날짜가 바뀌면 새 날로
  window.addEventListener('storage', e => { if (e.key === KEY && document.body.classList.contains('widget-mode')) { reloadData(); renderWidget(); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && document.body.classList.contains('widget-mode')) { reloadData(); renderWidget(); } });
  widgetTimer = setInterval(() => { if (document.body.classList.contains('widget-mode') && ymd(new Date()) !== widgetDay) { reloadData(); renderWidget(); } }, 60000);
}

// ============================================================ 안드로이드 앱 연결
// 안드로이드 앱(WebView) 안에서 열렸을 때만 window.AndroidBridge 가 있어요.
function blobToBase64(blob) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(blob); });
}
function pushAndroid() {
  if (!window.AndroidBridge) return;
  try {
    const days = {};
    for (let k = -1; k <= 7; k++) {
      const key = ymd(addDays(new Date(), k));
      const d = data.days[key];
      const tasks = d && d.tasks ? d.tasks.map((t, i) => ({ i, s: t.s || '', t: t.t || '', d: !!t.d })).filter(t => t.s || t.t) : [];
      days[key] = { tasks, minutes: dayMinutes(key), q: d ? [d.q1, d.q2].filter(Boolean).join(' ') : '', great: !!(d && d.great) };
    }
    AndroidBridge.update(JSON.stringify({ ddayLabel: data.settings.ddayLabel || '', ddayDate: data.settings.ddayDate || '', days }));
  } catch (e) {}
}
function applyAndroidPending() {
  if (!window.AndroidBridge) return false;
  let list = [];
  try { list = JSON.parse(AndroidBridge.takePending() || '[]'); } catch {}
  let changed = false;
  for (const p of list) {
    const d = data.days[p.date];
    if (d && d.tasks && d.tasks[p.i]) { d.tasks[p.i].d = !!p.d; changed = true; }
  }
  if (changed) save();
  return changed;
}
window.__androidFlush = () => flush();
window.__androidResume = () => {
  flush(); reloadData();
  applyAndroidPending();
  const y = window.scrollY; route(); window.scrollTo(0, y);
  pushAndroid();
};

// ============================================================ layout / router
const stage = $('#stage'), wrap = $('#pageWrap'), content = $('#pageContent'), rail = $('#rail');
let cleanup = [];
function fit() {
  const railW = getComputedStyle(rail).position === 'fixed' ? 0 : rail.offsetWidth + 12;
  const avail = stage.clientWidth - (window.innerWidth <= 760 ? 24 : 32) - railW;
  const s = Math.min(1.2, avail / 1000);
  pageEl.style.transform = `scale(${s})`;
  wrap.style.width = 1000 * s + 'px';
  wrap.style.height = pageEl.offsetHeight * s + 'px';
  redrawInk(true);
}
new ResizeObserver(fit).observe(pageEl);
window.addEventListener('resize', fit);

function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
function route() {
  cleanup.forEach(f => f()); cleanup = [];
  const [, tab = 'daily', arg] = location.hash.split('/');
  const today = new Date();
  if (tab === 'widget') { if (pen.on) $('#penToggle').click(); startWidgetMode(); return; }
  document.body.classList.remove('widget-mode');
  let page;
  switch (tab) {
    case 'monthly': page = pageMonthly(/^\d{4}-\d{2}$/.test(arg) ? arg : ym(today)); break;
    case 'review': page = pageReview(/^\d{4}-\d{2}$/.test(arg) ? arg : ym(today)); break;
    case 'subjects': page = pageSubjects(Number(arg) || 1); break;
    case 'lectures': page = pageLectures(Number(arg) || 1); break;
    case 'exams': page = pageExams(Number(arg) || 1); break;
    case 'settings': page = pageSettings(); break;
    default: page = pageDaily(/^\d{4}-\d{2}-\d{2}$/.test(arg) ? arg : ymd(today));
  }
  document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('active', a.dataset.tab === (tab || 'daily') || (!['monthly', 'review', 'subjects', 'lectures', 'exams', 'settings'].includes(tab) && a.dataset.tab === 'daily')));
  content.replaceChildren(page.el);
  document.title = `${page.title} · 스터디 플래너`;
  $('#penToggle').style.display = page.key ? '' : 'none';
  $('#railHome').href = '#/daily/' + ymd(today);
  if (!page.key && pen.on) $('#penToggle').click();
  fit(); loadInk(page.key);
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

// 위젯이나 다른 탭에서 기록을 바꾸면 이 창에도 반영
let pendingSync = false;
function syncFromStorage() {
  if (document.body.classList.contains('widget-mode')) return;
  const a = document.activeElement;
  if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && a.closest('#stage')) { pendingSync = true; return; }
  pendingSync = false;
  const y = window.scrollY; reloadData(); route(); window.scrollTo(0, y);
}
window.addEventListener('storage', e => { if (e.key === KEY && !dirty) syncFromStorage(); });
document.addEventListener('focusout', () => setTimeout(() => { if (pendingSync && !dirty) syncFromStorage(); }, 0));


setupPenUI();
applyAndroidPending();
if (!location.hash) location.replace(document.body.dataset.mode === 'widget' ? '#/widget' : '#/daily/' + ymd(new Date()));
route();
pushAndroid();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
})();

// 화면 구성과 상태 관리
(function () {
  const { kst, dayKey, hourKey, addDays, dowOf, DOW, store, wcText, deg, esc, r0, dist } = U;
  const { SOURCES } = Sources;
  const $ = s => document.querySelector(s);
  const DEFAULT_PLACE = { name: '서울 중구', sub: '명동', lat: 37.5636, lon: 126.9834 };
  const TTL = 30 * 60e3;

  const st = {
    screen: 'home',
    src: store.get('src', 'kma'),
    hourDay: 0,
    cmpView: 'today',
    gpsOn: store.get('gpsOn', true),
    gpsPlace: store.get('gpsPlace', null),
    saved: store.get('saved', []),
    savedSel: store.get('savedSel', -1),
    data: {},
    cache: store.get('cache', {}),
    editMode: false,
    query: '', results: null, searching: false,
    temps: {},
    locating: false,
    overlay: null,
    loadingAll: false
  };
  if (!SOURCES.some(s => s.k === st.src)) st.src = 'kma';

  // ---------- 위치 ----------
  function place() {
    if (st.gpsOn) return st.gpsPlace ? Object.assign({ gps: true }, st.gpsPlace) : null;
    if (st.savedSel >= 0 && st.saved[st.savedSel]) return st.saved[st.savedSel];
    return st.saved[0] || DEFAULT_PLACE;
  }
  const locKey = p => p.lat.toFixed(3) + ',' + p.lon.toFixed(3);

  const SHORT = { '서울특별시': '서울', '부산광역시': '부산', '대구광역시': '대구', '인천광역시': '인천', '광주광역시': '광주', '대전광역시': '대전', '울산광역시': '울산', '세종특별자치시': '세종', '경기도': '경기', '강원도': '강원', '강원특별자치도': '강원', '충청북도': '충북', '충청남도': '충남', '전라북도': '전북', '전북특별자치도': '전북', '전라남도': '전남', '경상북도': '경북', '경상남도': '경남', '제주특별자치도': '제주', '제주도': '제주' };
  function addrName(a) {
    let line = (a.line || '').replace(/^대한민국\s*/, '').replace(/^South Korea\s*/i, '');
    const toks = line.split(/\s+/).filter(Boolean);
    let name = '', sub = '';
    if (toks.length && SHORT[toks[0]] !== undefined || /[도시]$/.test(toks[0] || '')) {
      const parts = [SHORT[toks[0]] || toks[0]];
      let i = 1;
      while (i < toks.length && /(시|군|구)$/.test(toks[i]) && parts.length < 3) { parts.push(toks[i]); i++; }
      name = parts.join(' ');
      for (; i < toks.length; i++) if (/(동|읍|면|가|리)$/.test(toks[i]) && !/\d/.test(toks[i].slice(-2, -1))) { sub = toks[i]; break; }
      if (!sub) for (let j = 1; j < toks.length; j++) if (/(동|읍|면|가|리)\d*$/.test(toks[j]) || /\d+가$/.test(toks[j])) { sub = toks[j]; break; }
    }
    if (!name) {
      const admin = SHORT[a.admin] || a.admin;
      name = [admin, a.locality !== a.admin ? a.locality : '', a.subLocality].filter(Boolean).join(' ');
      sub = a.thoroughfare || '';
    }
    if (!name) name = a.feature || '알 수 없는 곳';
    return { name: name.trim(), sub: sub.replace(/\d+가$/, m => m) };
  }

  async function locate(interactive) {
    if (!window.NativeApi) { setGpsPlace(Object.assign({}, DEFAULT_PLACE)); return true; }
    st.locating = true; render();
    const r = await U.nativeCall('getLocation');
    st.locating = false;
    if (!r.ok) {
      const e = (r.data && r.data.error) || '';
      if (e === 'denied') {
        if (interactive || !st.gpsPlace) showLocDenied(r.data.permanent);
      } else if (e === 'off') toast('기기의 위치 서비스를 켜 주세요');
      else toast('현재 위치를 찾지 못했어요');
      if (!st.gpsPlace) { st.gpsOn = false; store.set('gpsOn', false); }
      render(); return false;
    }
    const { lat, lon } = r.data;
    const prev = st.gpsPlace;
    let nm = prev && dist(prev.lat, prev.lon, lat, lon) < 1 ? { name: prev.name, sub: prev.sub } : { name: '현재 위치', sub: '' };
    setGpsPlace({ name: nm.name, sub: nm.sub, lat, lon });
    U.nativeCall('reverseGeocode', lat, lon).then(g => {
      if (g.ok && g.data) {
        const a = addrName(g.data);
        if (st.gpsPlace && st.gpsPlace.lat === lat) { st.gpsPlace.name = a.name; st.gpsPlace.sub = a.sub; store.set('gpsPlace', st.gpsPlace); render(); }
      }
    });
    return true;
  }
  function setGpsPlace(p) { st.gpsPlace = p; store.set('gpsPlace', p); }

  // ---------- 데이터 ----------
  function slot(p, src) {
    const k = locKey(p);
    const L = st.data[k] = st.data[k] || {};
    if (!L[src]) {
      const c = st.cache[k] && st.cache[k][src];
      L[src] = c ? { status: 'ok', d: c.d, at: c.at, stale: true } : { status: 'idle' };
    }
    return L[src];
  }
  function saveCache(p, src, d, at) {
    const k = locKey(p);
    st.cache[k] = st.cache[k] || { _t: 0 };
    st.cache[k][src] = { d, at };
    st.cache[k]._t = Date.now();
    const keys = Object.keys(st.cache).sort((a, b) => st.cache[b]._t - st.cache[a]._t);
    keys.slice(4).forEach(x => delete st.cache[x]);
    store.set('cache', st.cache);
  }
  async function loadSrc(p, src, force) {
    const s = slot(p, src);
    if (s.status === 'loading') return;
    if (!force && s.status === 'ok' && Date.now() - s.at < TTL) return;
    const keep = s.status === 'ok' ? { d: s.d, at: s.at } : null;
    Object.assign(s, { status: keep ? 'ok' : 'loading', refreshing: true, err: null });
    if (!keep) s.status = 'loading';
    render();
    try {
      const d = await Sources.fetchSource(src, p);
      Object.assign(s, { status: 'ok', d, at: Date.now(), stale: false, refreshing: false, err: null });
      saveCache(p, src, d, s.at);
    } catch (e) {
      s.refreshing = false;
      if (keep) { s.status = 'ok'; s.softErr = e.message; }
      else Object.assign(s, { status: 'err', err: e.message || '불러오지 못했어요' });
    }
    render();
  }
  async function loadAll(force) {
    const p = place(); if (!p) return;
    st.loadingAll = true; render();
    await Promise.all(SOURCES.map(s => loadSrc(p, s.k, force)));
    st.loadingAll = false; render();
  }
  async function refresh(force) {
    if (st.gpsOn) { const ok = await locate(false); if (!ok && !st.gpsPlace) { render(); } }
    await loadAll(force);
  }

  // ---------- 화면 공통 ----------
  const nowK = () => hourKey(kst());
  const today = () => dayKey(kst());
  const dayLabel = (d, i) => i === 0 ? '오늘' : i === 1 ? '내일' : DOW[dowOf(d)] + '요일';
  const isNight = k => { const h = +k.slice(8, 10); return h < 6 || h >= 19; };
  const popText = (pop, pr) => pop != null ? (pop > 0 ? pop + '%' : '') : (pr != null && pr >= 0.1 ? (Math.round(pr * 10) / 10) + '㎜' : '');
  const srcOf = k => SOURCES.find(s => s.k === k);
  function curDay(d) { return d && d.days && d.days.find(x => x.d === today()); }

  function header() {
    const p = place();
    if (st.screen === 'region') {
      return `<div class="loc"><span class="title" style="color:#fff">지역 설정</span></div>` +
        (st.saved.length ? `<button class="round" style="width:auto;padding:0 6px;font-weight:700;font-size:15px" data-act="edit">${st.editMode ? '완료' : '편집'}</button>` : '');
    }
    const icon = p && p.gps ? Icons.ui.nav : Icons.ui.pin;
    const name = p ? p.name : (st.locating ? '위치 찾는 중…' : '위치 없음');
    const sub = p ? [p.sub, p.gps ? '현재 위치' : ''].filter(Boolean).join(' · ') : '';
    const spinning = st.loadingAll || st.locating;
    return `<button class="loc" data-act="go" data-s="region">${icon}<b>${esc(name)}</b>${Icons.ui.chev}<small>${esc(sub)}</small></button>
      <button class="round ${spinning ? 'spin' : ''}" data-act="refresh" aria-label="새로고침">${Icons.ui.refresh}</button>`;
  }
  function tabs() {
    if (st.screen === 'region') return '';
    if (st.screen === 'cmp') {
      return [['today', '오늘'], ['tomorrow', '내일'], ['week', '주간']].map(([k, n]) => `<button class="tab ${st.cmpView === k ? 'on' : ''}" data-act="cmpv" data-v="${k}">${n} 비교</button>`).join('');
    }
    return SOURCES.map(s => `<button class="tab ${s.k === st.src ? 'on' : ''}" data-act="src" data-k="${s.k}"><i style="background:var(--${s.k})"></i>${s.n}</button>`).join('');
  }
  function nav() {
    return [['home', '오늘', 'home'], ['week', '주간', 'week'], ['cmp', '비교', 'cmp'], ['region', '지역', 'pin']]
      .map(([k, n, ic]) => `<button class="${st.screen === k ? 'on' : ''}" data-act="go" data-s="${k}">${Icons.ui[ic].replace(/width="2\d"/, 'width="26"').replace(/height="2\d"/, 'height="26"')}${n}</button>`).join('');
  }

  function errBox(s, src) {
    return `<div class="card errbox"><b>${esc(srcOf(src).n)} 예보를 불러오지 못했어요</b><span>${esc(s.err || '')}<br>잠시 후 다시 시도하거나 다른 출처 탭을 눌러 보세요.</span><button class="btn" data-act="retry" data-k="${src}">다시 시도</button></div>`;
  }
  function skeleton(rows) {
    return `<div class="card">${Array.from({ length: rows }, () => `<div class="sk" style="height:18px;margin:10px 0"></div>`).join('')}</div>`;
  }
  function credit(src, d, at) {
    const t = at ? kst(at) : null;
    return `<div class="foot">${Icons.ui.info.replace('20', '16').replace('20', '16')}<span>출처: ${esc(srcOf(src).credit)}${d && d.issued ? ' · ' + esc(d.issued) : ''}${t ? ` · ${U.pad(t.h)}:${U.pad(t.mi)} 조회` : ''}</span></div>`;
  }

  // ---------- 오늘 ----------
  function homeView() {
    const p = place();
    if (!p) return noPlace();
    const s = slot(p, st.src);
    if (s.status === 'err') return heroEmpty() + errBox(s, st.src);
    if (s.status !== 'ok') return heroEmpty(true) + skeleton(3) + skeleton(3);
    const d = s.d, c = d.cur, t = curDay(d) || d.days[0] || {};
    const night = isNight(nowK());
    const pop = t.popRest ?? t.pop;
    let h = `<section class="hero"><div><div class="big num">${r0(c.tp) ?? '–'}<sup>°</sup></div><div class="cond">${wcText(c.wc)}</div><div class="hl num">최고 ${deg(t.mx)} · 최저 ${deg(t.mn)}</div></div>${Icons.weather(c.wc, 150, night)}</section>`;
    h += `<div class="card meta num">
      <div><span>${Icons.ui.thermo}체감</span><b>${deg(c.fl)}</b></div>
      <div><span>${Icons.ui.drop}습도</span><b>${c.rh != null ? Math.round(c.rh) + '%' : '–'}</b></div>
      <div><span>${Icons.ui.wind}바람</span><b>${c.ws != null ? (+c.ws).toFixed(1) + 'm/s' : '–'}</b></div>
      ${pop != null ? `<div><span>${Icons.ui.umb}강수확률</span><b class="rain">${pop}%</b></div>` : `<div><span>${Icons.ui.umb}강수량</span><b class="rain">${t.pr != null ? t.pr + '㎜' : '–'}</b></div>`}
    </div>`;
    // 시간별
    const dk = addDays(today(), st.hourDay);
    const nk = nowK();
    const hs = d.hours.filter(x => x.k.startsWith(dk) && (st.hourDay > 0 || x.k >= nk));
    h += `<div class="card"><div class="ch"><h3>${Icons.ui.clock}시간별 예보</h3><div class="seg"><button class="${st.hourDay === 0 ? 'on' : ''}" data-act="hday" data-v="0">오늘</button><button class="${st.hourDay === 1 ? 'on' : ''}" data-act="hday" data-v="1">내일</button></div></div>
      <div class="hours num">${hs.length ? hs.map(x => `<div class="h ${x.k === nk ? 'now' : ''}"><span>${x.k === nk ? '지금' : +x.k.slice(8, 10) + '시'}</span>${Icons.weather(x.wc, 38, isNight(x.k))}<span class="t">${deg(x.tp)}</span><span class="p">${popText(x.pop, x.pr)}</span></div>`).join('')
        : `<div class="empty" style="width:100%">이 출처는 ${st.hourDay ? '내일' : '오늘 남은'} 시간별 예보가 없어요</div>`}</div></div>`;
    // 이번 주
    const ds = d.days.slice(0, 7);
    h += `<div class="card"><div class="ch"><h3>${Icons.ui.cal}이번 주</h3><button class="aux" data-act="go" data-s="week">전체보기 ${Icons.ui.right}</button></div>
      <div class="wk num">${ds.map((x, i) => `<div class="h"><span>${i === 0 ? '오늘' : DOW[dowOf(x.d)]}</span>${Icons.weather(x.wc, 34)}<span class="t">${deg(x.mx)}</span><span class="lo">${deg(x.mn)}</span></div>`).join('')}</div></div>`;
    h += credit(st.src, d, s.at);
    return h;
  }
  function heroEmpty(loading) {
    return `<section class="hero"><div><div class="big num" style="opacity:.6">${loading ? '··' : '–'}<sup>°</sup></div><div class="cond">${loading ? '불러오는 중' : ''}</div></div></section>`;
  }
  function noPlace() {
    return `<div class="card errbox" style="margin-top:40px"><b>${st.locating ? '현재 위치를 찾고 있어요' : '위치를 정해 주세요'}</b><span>${st.locating ? '잠시만 기다려 주세요.' : '현재 위치를 쓰거나 지역을 검색해 추가할 수 있어요.'}</span>${st.locating ? '' : `<button class="btn" data-act="go" data-s="region">지역 설정</button>`}</div>`;
  }

  // ---------- 주간 ----------
  function weekTip(ds) {
    const wetDays = ds.map((d, i) => ({ d, i })).filter(({ d }) => (d.pop != null ? d.pop >= 60 : (d.pr || 0) >= 1) || (d.wc != null && d.wc >= 51 && (d.pop == null || d.pop >= 40)));
    const parts = [];
    if (wetDays.length) {
      const names = wetDays.slice(0, 3).map(({ d, i }) => i === 0 ? '오늘' : i === 1 ? '내일' : DOW[dowOf(d.d)] + '요일');
      parts.push(`${names.join('·')} ${wetDays.some(x => U.isWet(x.d.wc) && x.d.wc >= 71 && x.d.wc <= 77) ? '눈' : '비'} 소식이 있어요.`);
    } else parts.push('이번 주는 비 소식이 없어요.');
    const cold = ds.reduce((a, b) => (b.mn < a.mn ? b : a), ds[0]);
    if (cold) parts.push(`${ds.indexOf(cold) === 0 ? '오늘' : ds.indexOf(cold) === 1 ? '내일' : DOW[dowOf(cold.d)] + '요일'} 아침 ${Math.round(cold.mn)}°까지 내려가요.`);
    if (ds.some(d => d.mx - d.mn >= 10)) parts.push('일교차가 큰 날은 겉옷을 챙기세요.');
    return parts.join(' ');
  }
  function weekView() {
    const p = place(); if (!p) return noPlace();
    const s = slot(p, st.src);
    if (s.status === 'err') return errBox(s, st.src);
    if (s.status !== 'ok') return skeleton(7);
    const ds = s.d.days.slice(0, 7);
    if (!ds.length) return `<div class="card empty">주간 예보가 없어요</div>`;
    const lo = Math.min(...ds.map(d => d.mn)), hi = Math.max(...ds.map(d => d.mx)), sp = Math.max(1, hi - lo);
    const t0 = kst(); const end = U.addDays(today(), ds.length - 1);
    let h = `<div class="card days"><div class="ch"><h3>주간 날씨</h3><span class="aux num">${t0.m}.${U.pad(t0.d)} ~ ${+end.slice(4, 6)}.${end.slice(6)}</span></div>`;
    h += ds.map((d, i) => `<div class="r ${i === 0 ? 'today' : ''}"><div class="dn">${dayLabel(d.d, i)}<small class="num">${+d.d.slice(4, 6)}.${+d.d.slice(6)}</small></div>${Icons.weather(d.wc, 42)}
      <div class="pp num">${popText(d.pop, d.pr) ? Icons.ui.dropS + popText(d.pop, d.pr) : ''}</div>
      <div class="rng num"><span class="lo">${deg(d.mn)}</span><div class="track"><i style="left:${(d.mn - lo) / sp * 100}%;right:${100 - (d.mx - lo) / sp * 100}%"></i></div><span>${deg(d.mx)}</span></div></div>`).join('');
    h += `</div><div class="tip">${Icons.ui.info}<span>${esc(weekTip(ds))}</span></div>`;
    h += credit(st.src, s.d, s.at);
    return h;
  }

  // ---------- 비교 ----------
  function chart(series, xs, opts) {
    const W = 330, H = opts.h || 170, L = 26, R = 8, T = 10, B = 22;
    const vals = series.flatMap(s => s.pts.map(p => p[1])).filter(v => v != null);
    if (!vals.length) return '<div class="empty">비교할 자료가 없어요</div>';
    let lo = Math.floor(Math.min(...vals)) - 1, hi = Math.ceil(Math.max(...vals)) + 1;
    const step = hi - lo > 16 ? 10 : 5;
    const x = i => L + i * (W - L - R) / (opts.n - 1), y = v => T + (hi - v) / (hi - lo) * (H - T - B);
    let g = '';
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(16,35,63,.08)"/><text x="${L - 5}" y="${y(v) + 4}" font-size="10" text-anchor="end" fill="#5D6E86">${v}°</text>`;
    xs.forEach((lab, i) => { if (lab) g += `<text x="${x(i)}" y="${H - 6}" font-size="10.5" text-anchor="middle" fill="#5D6E86">${lab}</text>`; });
    for (const s of series) {
      const segs = []; let cur = [];
      s.pts.forEach(([i, v]) => { if (v == null) { if (cur.length) segs.push(cur); cur = []; } else cur.push(x(i).toFixed(1) + ',' + y(v).toFixed(1)); });
      if (cur.length) segs.push(cur);
      segs.forEach(sg => g += `<polyline fill="none" stroke="${s.color}" stroke-width="${s.w || 2.2}" stroke-linejoin="round" stroke-linecap="round" ${s.dash ? 'stroke-dasharray="4 4"' : ''} points="${sg.join(' ')}"/>`);
    }
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`;
  }
  function legend() { return `<div class="legend">${SOURCES.map(s => `<span><i style="background:var(--${s.k})"></i>${s.n}</span>`).join('')}</div>`; }

  function cmpView() {
    const p = place(); if (!p) return noPlace();
    const ent = SOURCES.map(s => ({ s, x: slot(p, s.k) }));
    const ok = ent.filter(e => e.x.status === 'ok');
    if (!ok.length) return ent.some(e => e.x.status === 'loading' || e.x.status === 'idle') ? skeleton(5) + skeleton(5) : `<div class="card errbox"><b>예보를 불러오지 못했어요</b><button class="btn" data-act="refresh">다시 시도</button></div>`;
    if (st.cmpView === 'week') return cmpWeek(ent);
    const di = st.cmpView === 'today' ? 0 : 1;
    const dk = addDays(today(), di);
    const rows = ent.map(({ s, x }) => {
      if (x.status !== 'ok') return { s, err: x.status === 'err' ? '불러오지 못함' : '불러오는 중' };
      const d = x.d.days.find(z => z.d === dk);
      return { s, d, cur: x.d.cur };
    });
    const good = rows.filter(r => r.d);
    const avg = f => { const v = good.map(f).filter(z => z != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    const t = kst(); const dd = new Date(Date.UTC(+dk.slice(0, 4), +dk.slice(4, 6) - 1, +dk.slice(6)));
    let h = `<div class="card"><div class="ch"><h3>${di ? '내일' : '오늘'} (${DOW[dowOf(dk)]}) 예보 비교</h3><span class="aux num">${dd.getUTCMonth() + 1}.${U.pad(dd.getUTCDate())}</span></div>
      <table class="num"><tr><th>출처</th><th></th>${di ? '' : '<th>현재</th>'}<th>최고</th><th>최저</th><th>강수</th></tr>`;
    h += rows.map(r => r.d ? `<tr><td class="src"><span><i style="background:var(--${r.s.k})"></i>${r.s.n}</span></td><td class="ic">${Icons.weather(r.d.wc, 28)}</td>${di ? '' : `<td>${deg(r.cur.tp)}</td>`}<td>${deg(r.d.mx)}</td><td class="lo">${deg(r.d.mn)}</td><td class="rain">${r.d.pop != null ? r.d.pop + '%' : (r.d.pr != null ? r.d.pr + '㎜' : '–')}</td></tr>`
      : `<tr class="err"><td class="src"><span><i style="background:var(--${r.s.k})"></i>${r.s.n}</span></td><td colspan="${di ? 4 : 5}" style="text-align:right">${r.err || '자료 없음'}</td></tr>`).join('');
    if (good.length > 1) {
      const ap = avg(r => r.d.pop);
      h += `<tr class="avg"><td class="src"><span><i style="background:var(--avg)"></i>평균</span></td><td></td>${di ? '' : `<td>${deg(avg(r => r.cur.tp))}</td>`}<td>${deg(avg(r => r.d.mx))}</td><td>${deg(avg(r => r.d.mn))}</td><td class="rain">${ap != null ? Math.round(ap) + '%' : '–'}</td></tr>`;
    }
    h += '</table>';
    if (!di && good.some(r => r.s.k === 'metno')) h += `<div class="sum" style="font-size:12px">노르웨이 MET은 지금 이후 예보만 있어 오늘 최고·최저가 낮게 보일 수 있어요.</div>`;
    if (good.length > 1) {
      const mxs = good.map(r => r.d.mx), mns = good.map(r => r.d.mn);
      const wet = good.filter(r => (r.d.pop != null ? r.d.pop >= 50 : (r.d.pr || 0) >= 1));
      h += `<div class="sum">최고기온 차이 <b>${(Math.max(...mxs) - Math.min(...mxs)).toFixed(1)}°</b> · 최저기온 차이 <b>${(Math.max(...mns) - Math.min(...mns)).toFixed(1)}°</b><br>${good.length}곳 중 <b>${wet.length}곳</b>이 비 소식${wet.length ? '(강수확률 50% 이상 또는 1㎜ 이상)' : ' 없음'}</div>`;
    }
    h += '</div>';
    // 시간별 기온 비교
    const startH = di === 0 ? t.h : 0;
    const n = 24 - startH;
    if (n >= 3) {
      const series = ok.map(({ s, x }) => ({ color: `var(--${s.k})`, pts: Array.from({ length: n }, (_, i) => { const k = dk + U.pad(startH + i); const hh = x.d.hours.find(z => z.k === k); return [i, hh ? hh.tp : null]; }) }));
      const xs = Array.from({ length: n }, (_, i) => ((startH + i) % 3 === 0 ? (startH + i) + '시' : ''));
      h += `<div class="card"><div class="ch"><h3>시간별 기온 비교</h3><span class="aux">${di ? '내일 0~23시' : '지금부터 자정까지'}</span></div>${chart(series, xs, { n })}${legend()}</div>`;
      const rs = ok.map(({ s, x }) => {
        const hs = x.d.hours.filter(z => z.k.startsWith(dk) && +z.k.slice(8) >= startH);
        const wet = hs.filter(z => (z.pop != null ? z.pop >= 50 : (z.pr || 0) >= 0.5));
        return `<tr><td class="src"><span><i style="background:var(--${s.k})"></i>${s.n}</span></td><td style="text-align:left;font-weight:600">${wet.length ? `${+wet[0].k.slice(8)}시~${+wet[wet.length - 1].k.slice(8)}시 비 가능` : '비 소식 없음'}</td></tr>`;
      }).join('');
      h += `<div class="card"><div class="ch"><h3>강수 예상 시간</h3><span class="aux">50% 이상 / 0.5㎜ 이상</span></div><table>${rs}</table></div>`;
    }
    h += `<div class="foot light">각 출처의 예보를 그대로 나란히 보여줍니다</div>`;
    return h;
  }
  function cmpWeek(ent) {
    const ok = ent.filter(e => e.x.status === 'ok');
    const dks = Array.from({ length: 7 }, (_, i) => addDays(today(), i));
    const ser = [];
    ok.forEach(({ s, x }) => {
      const f = (fld) => dks.map((dk, i) => { const d = x.d.days.find(z => z.d === dk); return [i, d ? d[fld] : null]; });
      ser.push({ color: `var(--${s.k})`, pts: f('mx') }, { color: `var(--${s.k})`, pts: f('mn'), dash: true, w: 1.8 });
    });
    let h = `<div class="card"><div class="ch"><h3>주간 기온 비교</h3><span class="aux">실선 최고 · 점선 최저</span></div>${chart(ser, dks.map((d, i) => i ? DOW[dowOf(d)] : '오늘'), { n: 7, h: 190 })}${legend()}</div>`;
    h += `<div class="card"><div class="ch"><h3>날짜별 최고 / 최저</h3></div><div class="scroll-x"><table class="grid7 num"><tr><th></th>${dks.map((d, i) => `<th>${i ? DOW[dowOf(d)] : '오늘'}</th>`).join('')}</tr>`;
    h += ent.map(({ s, x }) => `<tr><td class="src"><span><i style="background:var(--${s.k})"></i>${s.n.replace(/ .*/, '')}</span></td>${dks.map(dk => { const d = x.status === 'ok' && x.d.days.find(z => z.d === dk); return `<td>${d ? `${Icons.weather(d.wc, 22)}<span class="mx">${deg(d.mx)}</span><span class="mn">${deg(d.mn)}</span>` : '–'}</td>`; }).join('')}</tr>`).join('');
    h += `</table></div></div>`;
    // 비 예보 일치도
    const wetCount = dks.map(dk => ok.filter(({ x }) => { const d = x.d.days.find(z => z.d === dk); return d && (d.pop != null ? d.pop >= 50 : (d.pr || 0) >= 1); }).length);
    h += `<div class="card"><div class="ch"><h3>비 예보 일치도</h3><span class="aux">${ok.length}곳 중 비 예상 출처 수</span></div><div class="wk num">${dks.map((d, i) => `<div class="h"><span>${i ? DOW[dowOf(d)] : '오늘'}</span><span class="t" style="color:${wetCount[i] ? 'var(--rain)' : 'var(--faint)'}">${wetCount[i]}</span><span class="lo">/${ok.length}</span></div>`).join('')}</div></div>`;
    h += `<div class="foot light">각 출처의 예보를 그대로 나란히 보여줍니다</div>`;
    return h;
  }

  // ---------- 지역 ----------
  function regionView() {
    let h = `<label class="search">${Icons.ui.search}<input id="q" type="search" placeholder="동·읍·면 또는 도시 이름 검색" value="${esc(st.query)}" autocomplete="off" enterkeyhint="search">${st.query ? `<button class="clear" data-act="clearq" aria-label="지우기">${Icons.ui.x}</button>` : ''}</label>`;
    if (st.searching) h += `<div class="res"><div class="sk" style="height:20px;flex:1"></div></div>`;
    else if (st.results) {
      h += st.results.length ? st.results.map((r, i) => {
        const g = Sources.toGrid(r.lat, r.lon);
        const has = st.saved.some(s => dist(s.lat, s.lon, r.lat, r.lon) < 0.5);
        return `<div class="res"><span class="pin">${Icons.ui.pin}</span><div class="n">${esc(r.name)}${r.sub ? ' ' + esc(r.sub) : ''}<small class="num">동네예보 격자 ${g.nx}, ${g.ny}</small></div><button class="btn-soft" data-act="add" data-i="${i}" ${has ? 'disabled' : ''}>${has ? '저장됨' : '추가'}</button></div>`;
      }).join('') : `<div class="res"><div class="n" style="font-weight:600;color:var(--sub)">'${esc(st.query)}' 검색 결과가 없어요. 동 이름이나 시·군·구로 검색해 보세요.</div></div>`;
    }
    const gp = st.gpsPlace;
    h += `<div class="gps"><div class="l">${Icons.ui.target}<div style="min-width:0"><b>현재 위치 날씨 보기</b><small>${st.locating ? '위치 찾는 중…' : st.gpsOn && gp ? '위치 권한 사용 · 지금 ' + esc(gp.name + (gp.sub ? ' ' + gp.sub : '')) : '켜면 위치 권한으로 지금 있는 곳 날씨를 보여줘요'}</small></div></div>
      <button class="sw ${st.gpsOn ? 'on' : ''}" data-act="gps" role="switch" aria-checked="${st.gpsOn}" aria-label="현재 위치 사용"><i></i></button></div>`;
    h += `<div class="sec"><h3>저장한 지역</h3><span style="color:var(--sub)">${st.saved.length ? '눌러서 선택' : ''}</span></div>`;
    if (!st.saved.length) h += `<div class="card empty">아직 저장한 지역이 없어요.<br>위에서 검색해 추가하면 여기에서 바로 바꿀 수 있어요.</div>`;
    else {
      h += `<div class="card" style="padding:2px 16px">` + st.saved.map((s, i) => {
        const tq = st.temps[locKey(s)];
        const sel = !st.gpsOn && (st.savedSel === i || (st.savedSel < 0 && i === 0));
        return `<div class="li ${sel ? 'sel' : ''}" data-act="pick" data-i="${i}">${st.editMode ? `<button class="del" data-act="del" data-i="${i}" aria-label="삭제">${Icons.ui.minus}</button>` : ''}
          <div class="n">${esc(s.name)}${sel ? '<span class="pill">보는 중</span>' : ''}<small>${esc(s.sub || '')}${tq ? (s.sub ? ' · ' : '') + wcText(tq.wc) : ''}</small></div>
          <div class="t num">${tq ? Icons.weather(tq.wc, 34) + deg(tq.tp) : ''}</div></div>`;
      }).join('') + `</div>`;
    }
    h += `<div class="info">${Icons.ui.info}<span>비교에 쓰는 출처 <b style="color:var(--ink)">5곳</b> · ${SOURCES.map(s => s.n).join(' · ')}<br><button class="link" data-act="about">출처·개인정보 안내 보기</button></span></div>`;
    return h;
  }

  async function doSearch(q) {
    st.searching = true; render();
    let items = [];
    try {
      if (window.NativeApi) {
        const r = await U.nativeCall('geocode', q);
        if (r.ok && r.data) items = r.data.items.filter(a => !a.country || a.country === 'KR').map(a => Object.assign(addrName(a), { lat: a.lat, lon: a.lon }));
      }
      if (!items.length) items = (await Sources.geocodeFallback(q)).map(r => ({ name: r.name, sub: '', lat: r.lat, lon: r.lon }));
    } catch (e) { }
    // 중복 제거
    const out = [];
    items.forEach(it => { if (!out.some(o => dist(o.lat, o.lon, it.lat, it.lon) < 0.3)) out.push(it); });
    if (st.query !== q) return;
    st.searching = false; st.results = out.slice(0, 8); render();
  }
  async function loadTemps() {
    const need = st.saved.filter(s => !st.temps[locKey(s)]);
    if (!need.length) return;
    try {
      const r = await Sources.quickTemps(need);
      need.forEach((s, i) => { if (r[i]) st.temps[locKey(s)] = r[i]; });
      if (st.screen === 'region') render();
    } catch (e) { }
  }

  // ---------- 오버레이 ----------
  function showDialog(title, msg, buttons) {
    st.overlay = { kind: 'dialog', title, msg, buttons }; renderOverlay();
  }
  function closeOverlay() { st.overlay = null; renderOverlay(); }
  function showLocDenied(permanent) {
    showDialog('위치 권한이 필요해요', permanent ? '현재 위치 날씨를 보려면 설정에서 위치 권한을 허용해 주세요. 허용하지 않아도 지역을 검색해서 볼 수 있어요.' : '위치 권한을 허용하지 않아 기본 지역 날씨를 보여드려요.',
      permanent ? [['나중에', 'close', 'ghost'], ['설정 열기', 'settings', '']] : [['확인', 'close', '']]);
  }
  function aboutSheet() {
    const v = window.NativeApi ? window.NativeApi.appVersion() : '1.0.0';
    st.overlay = { kind: 'sheet', html: `<h4>출처·개인정보 안내</h4>
      <div class="row"><b>기상청</b><span>기상청 단기예보·초단기실황·중기예보 조회서비스(공공데이터포털). 공공누리 제1유형에 따라 출처를 표시합니다.</span><br><button class="link" data-act="url" data-u="https://www.data.go.kr">data.go.kr</button></div>
      <div class="row"><b>노르웨이 기상청 MET Norway</b><span>Weather data from MET Norway, CC BY 4.0.</span><br><button class="link" data-act="url" data-u="https://api.met.no">api.met.no</button></div>
      <div class="row"><b>ECMWF · NOAA GFS · JMA</b><span>Weather data by Open-Meteo.com, CC BY 4.0. 각 기관의 수치예보 모델 자료입니다.</span><br><button class="link" data-act="url" data-u="https://open-meteo.com">open-meteo.com</button></div>
      <div class="row"><b>위치정보</b><span>현재 위치는 날씨 조회에만 쓰며 기기 밖의 별도 서버에 저장하지 않습니다. 날씨를 받기 위해 좌표가 위 기상 서버로 전송되고, 주소 변환에는 기기의 지오코더를 씁니다.</span></div>
      <div class="row"><b>문의</b><span style="user-select:text;-webkit-user-select:text">happyfamily1984.3@gmail.com</span></div>
      <div class="row"><span>버전 ${esc(v)} · 예보는 기관마다 다를 수 있으니 중요한 일정은 기상청 특보를 확인하세요.</span></div>
      <button class="btn" style="width:100%;margin-top:8px" data-act="close">닫기</button>` };
    renderOverlay();
  }
  function renderOverlay() {
    const o = $('#overlay');
    if (!st.overlay) { o.hidden = true; o.innerHTML = ''; return; }
    o.hidden = false;
    if (st.overlay.kind === 'dialog') {
      o.className = 'center';
      o.innerHTML = `<div class="dialog" role="dialog"><h4>${esc(st.overlay.title)}</h4><p>${esc(st.overlay.msg)}</p><div class="act">${st.overlay.buttons.map(([t, a, c]) => `<button class="${c === 'ghost' ? 'btn ghost' : 'btn'}" data-act="${a}">${t}</button>`).join('')}</div></div>`;
    } else {
      o.className = '';
      o.innerHTML = `<div class="sheet" role="dialog">${st.overlay.html}</div>`;
    }
  }
  let toastT;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2200);
  }

  // ---------- 렌더 ----------
  let lastScreen = null;
  function render() {
    document.body.className = 's-' + st.screen;
    $('#hdr').innerHTML = header();
    const tb = $('#tabs'); const th = tabs();
    tb.hidden = !th;
    const tabScroll = tb.scrollLeft;
    tb.innerHTML = th; tb.scrollLeft = tabScroll;
    const m = $('#main');
    const focused = document.activeElement && document.activeElement.id === 'q';
    const scroll = m.scrollTop;
    const hoursEl = m.querySelector('.hours'); const hs = hoursEl ? hoursEl.scrollLeft : 0;
    if (st.screen === 'home') m.innerHTML = homeView();
    else if (st.screen === 'week') m.innerHTML = weekView();
    else if (st.screen === 'cmp') m.innerHTML = cmpView();
    else {
      if (focused) { // 입력 중에는 입력창을 유지하고 아래만 갱신
        const keep = m.querySelector('.search');
        const tmp = document.createElement('div'); tmp.innerHTML = regionView();
        tmp.querySelector('.search').replaceWith(keep);
        while (m.firstChild && m.firstChild !== keep) m.removeChild(m.firstChild);
        m.innerHTML = ''; while (tmp.firstChild) m.appendChild(tmp.firstChild);
        const clr = keep.querySelector('.clear');
        if (st.query && !clr) keep.insertAdjacentHTML('beforeend', `<button class="clear" data-act="clearq" aria-label="지우기">${Icons.ui.x}</button>`);
        if (!st.query && clr) clr.remove();
      } else m.innerHTML = regionView();
    }
    if (lastScreen === st.screen) { m.scrollTop = scroll; const he = m.querySelector('.hours'); if (he) he.scrollLeft = hs; }
    else m.scrollTop = 0;
    lastScreen = st.screen;
    $('#nav').innerHTML = nav();
    if (st.screen === 'home' && document.querySelector('.tab.on') && lastScreen !== null) { }
  }

  function go(screen) {
    if (st.screen === screen) return;
    st.screen = screen; st.editMode = false;
    if (screen !== 'region') { st.query = ''; st.results = null; }
    render();
    if (screen === 'region') loadTemps();
    const on = document.querySelector('.tab.on'); if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' });
  }
  function selectPlaceChanged() {
    store.set('gpsOn', st.gpsOn); store.set('savedSel', st.savedSel);
    loadAll(false);
  }

  // ---------- 이벤트 ----------
  document.addEventListener('click', async e => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const a = el.dataset.act;
    if (a === 'go') go(el.dataset.s);
    else if (a === 'src') { st.src = el.dataset.k; store.set('src', st.src); render(); el.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); const p = place(); if (p) loadSrc(p, st.src, false); }
    else if (a === 'hday') { st.hourDay = +el.dataset.v; render(); const he = document.querySelector('.hours'); if (he) he.scrollLeft = 0; }
    else if (a === 'cmpv') { st.cmpView = el.dataset.v; render(); }
    else if (a === 'refresh') { toast('새로 불러오는 중'); refresh(true); }
    else if (a === 'retry') { const p = place(); if (p) loadSrc(p, el.dataset.k, true); }
    else if (a === 'edit') { st.editMode = !st.editMode; render(); }
    else if (a === 'clearq') { e.stopPropagation(); e.preventDefault(); st.query = ''; st.results = null; st.searching = false; render(); }
    else if (a === 'add') {
      const r = st.results && st.results[+el.dataset.i]; if (!r) return;
      st.saved.push({ name: r.name, sub: r.sub || '', lat: r.lat, lon: r.lon }); store.set('saved', st.saved);
      st.query = ''; st.results = null; toast(`${r.name}${r.sub ? ' ' + r.sub : ''}을(를) 저장했어요`);
      render(); loadTemps();
    } else if (a === 'del') {
      e.stopPropagation();
      const i = +el.dataset.i; const s = st.saved[i];
      st.saved.splice(i, 1); store.set('saved', st.saved);
      if (st.savedSel === i) st.savedSel = -1; else if (st.savedSel > i) st.savedSel--;
      store.set('savedSel', st.savedSel);
      if (!st.saved.length) st.editMode = false;
      toast(`${s.name}을(를) 삭제했어요`); render();
      if (!st.gpsOn) loadAll(false);
    } else if (a === 'pick') {
      if (st.editMode) return;
      st.gpsOn = false; st.savedSel = +el.dataset.i; selectPlaceChanged(); go('home');
    } else if (a === 'gps') {
      if (st.gpsOn) { st.gpsOn = false; selectPlaceChanged(); render(); }
      else {
        st.gpsOn = true; store.set('gpsOn', true); render();
        const ok = await locate(true);
        if (ok) { toast('현재 위치 날씨를 보여드려요'); loadAll(false); }
        else { st.gpsOn = false; store.set('gpsOn', false); render(); }
      }
    } else if (a === 'about') aboutSheet();
    else if (a === 'url') { if (window.NativeApi) window.NativeApi.openUrl(el.dataset.u); }
    else if (a === 'close') closeOverlay();
    else if (a === 'settings') { closeOverlay(); if (window.NativeApi) window.NativeApi.openAppSettings(); }
    else if (a === 'exit') { if (window.NativeApi) window.NativeApi.exitApp(); }
  });
  $('#overlay').addEventListener('click', e => { if (e.target.id === 'overlay') closeOverlay(); });
  let qT;
  document.addEventListener('input', e => {
    if (e.target.id !== 'q') return;
    st.query = e.target.value;
    clearTimeout(qT);
    const q = st.query.trim();
    if (q.length < 2) { st.results = null; st.searching = false; render(); return; }
    qT = setTimeout(() => doSearch(q), 450);
  });
  document.addEventListener('keydown', e => {
    if (e.target.id === 'q' && e.key === 'Enter') { clearTimeout(qT); const q = st.query.trim(); if (q) doSearch(q); e.target.blur(); }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadAll(false); });

  // ---------- 뒤로가기 ----------
  function onBack() {
    if (st.overlay) { closeOverlay(); return; }
    if (st.editMode) { st.editMode = false; render(); return; }
    if (st.screen === 'region' && (st.query || st.results)) { st.query = ''; st.results = null; st.searching = false; if (document.activeElement) document.activeElement.blur(); render(); return; }
    if (st.screen !== 'home') { go('home'); return; }
    showDialog('앱 종료', '앱을 종료하겠습니까?', [['아니오', 'close', 'ghost'], ['예', 'exit', '']]);
  }

  window.App = {
    nativeCb: U.nativeCb,
    onBack,
    setInsets(t, b) { document.documentElement.style.setProperty('--inset-top', t + 'px'); document.documentElement.style.setProperty('--inset-bottom', b + 'px'); },
    st
  };

  // ---------- 시작 ----------
  $('#skyline').innerHTML = Icons.skyline();
  render();
  (async () => {
    if (st.gpsOn) {
      if (st.gpsPlace) loadAll(false);
      const ok = await locate(false);
      if (ok) loadAll(false);
      else if (!st.gpsOn) loadAll(false);
    } else loadAll(false);
  })();
})();

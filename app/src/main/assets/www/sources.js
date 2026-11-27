// 기상 출처별 수집과 정규화
// 정규화 형식: { cur:{tp,fl,rh,ws,wc,pop,pr}, hours:[{k,tp,wc,pop,pr}], days:[{d,wc,mx,mn,pop,pr}], issued, at }
(function () {
  const { kst, dayKey, hourKey, addDays, pad, getJson, feels, dist } = U;

  const SOURCES = [
    { k: 'kma', n: '기상청', full: '대한민국 기상청 단기·중기예보', credit: '기상청 · 공공데이터포털' },
    { k: 'metno', n: '노르웨이 MET', full: '노르웨이 기상청 MET Norway', credit: 'MET Norway (yr.no) · CC BY 4.0' },
    { k: 'ecmwf', n: '유럽 ECMWF', full: '유럽중기예보센터 ECMWF IFS', credit: 'ECMWF IFS · Open-Meteo.com (CC BY 4.0)' },
    { k: 'gfs', n: '미국 GFS', full: '미국 해양대기청 NOAA GFS', credit: 'NOAA GFS · Open-Meteo.com (CC BY 4.0)' },
    { k: 'jma', n: '일본 JMA', full: '일본 기상청 JMA 모델', credit: 'JMA GSM · Open-Meteo.com (CC BY 4.0)' }
  ];

  // ---------- 기상청 ----------
  function toGrid(lat, lon) {
    const RE = 6371.00877, GRID = 5.0, SLAT1 = 30.0, SLAT2 = 60.0, OLON = 126.0, OLAT = 38.0, XO = 43, YO = 136;
    const D = Math.PI / 180, re = RE / GRID, s1 = SLAT1 * D, s2 = SLAT2 * D, olon = OLON * D, olat = OLAT * D;
    let sn = Math.tan(Math.PI * 0.25 + s2 * 0.5) / Math.tan(Math.PI * 0.25 + s1 * 0.5);
    sn = Math.log(Math.cos(s1) / Math.cos(s2)) / Math.log(sn);
    let sf = Math.tan(Math.PI * 0.25 + s1 * 0.5); sf = Math.pow(sf, sn) * Math.cos(s1) / sn;
    let ro = Math.tan(Math.PI * 0.25 + olat * 0.5); ro = re * sf / Math.pow(ro, sn);
    let ra = Math.tan(Math.PI * 0.25 + lat * D * 0.5); ra = re * sf / Math.pow(ra, sn);
    let th = lon * D - olon; if (th > Math.PI) th -= 2 * Math.PI; if (th < -Math.PI) th += 2 * Math.PI; th *= sn;
    return { nx: Math.floor(ra * Math.sin(th) + XO + 0.5), ny: Math.floor(ro - ra * Math.cos(th) + YO + 0.5) };
  }

  // 중기기온 지점(위도, 경도, 지점코드)
  const MID_TA = [
    ['서울', 37.57, 126.98, '11B10101'], ['인천', 37.46, 126.71, '11B20201'], ['수원', 37.26, 127.03, '11B20601'], ['파주', 37.76, 126.78, '11B20305'],
    ['이천', 37.27, 127.44, '11B20701'], ['평택', 36.99, 127.09, '11B20606'], ['춘천', 37.88, 127.73, '11D10301'], ['원주', 37.34, 127.92, '11D10401'],
    ['강릉', 37.75, 128.88, '11D20501'], ['속초', 38.21, 128.59, '11D20401'], ['대전', 36.35, 127.38, '11C20401'], ['세종', 36.48, 127.29, '11C20404'],
    ['홍성', 36.60, 126.66, '11C20104'], ['서산', 36.78, 126.45, '11C20101'], ['천안', 36.81, 127.11, '11C20301'], ['청주', 36.64, 127.49, '11C10301'],
    ['충주', 36.99, 127.93, '11C10101'], ['광주', 35.16, 126.85, '11F20501'], ['목포', 34.81, 126.39, '21F20801'], ['여수', 34.76, 127.66, '11F20401'],
    ['전주', 35.82, 127.15, '11F10201'], ['군산', 35.97, 126.74, '21F10501'], ['대구', 35.87, 128.60, '11H10701'], ['안동', 36.57, 128.73, '11H10501'],
    ['포항', 36.02, 129.34, '11H10201'], ['울릉', 37.48, 130.90, '11E00101'], ['부산', 35.18, 129.08, '11H20201'], ['울산', 35.54, 129.31, '11H20101'],
    ['창원', 35.23, 128.68, '11H20301'], ['진주', 35.18, 128.11, '11H20701'], ['통영', 34.85, 128.43, '11H20401'], ['제주', 33.50, 126.53, '11G00201'],
    ['서귀포', 33.25, 126.56, '11G00401']
  ];
  function landReg(ta) {
    if (ta.startsWith('11B')) return '11B00000';
    if (ta.startsWith('11D1')) return '11D10000';
    if (ta.startsWith('11D2')) return '11D20000';
    if (ta.startsWith('11C2')) return '11C20000';
    if (ta.startsWith('11C1')) return '11C10000';
    if (/^(11|21)F2/.test(ta)) return '11F20000';
    if (/^(11|21)F1/.test(ta)) return '11F10000';
    if (ta.startsWith('11H1') || ta.startsWith('11E')) return '11H10000';
    if (ta.startsWith('11H2')) return '11H20000';
    if (ta.startsWith('11G')) return '11G00000';
    return '11B00000';
  }
  function midRegion(lat, lon) {
    let best = MID_TA[0], bd = 1e9;
    for (const r of MID_TA) { const d = dist(lat, lon, r[1], r[2]); if (d < bd) { bd = d; best = r; } }
    return { ta: best[3], land: landReg(best[3]) };
  }

  const KMA = 'https://apis.data.go.kr/1360000/';
  async function kmaGet(path, params) {
    const key = window.NativeApi ? window.NativeApi.kmaKey() : (window.__KMA_KEY || '');
    if (!key) throw new Error('기상청 인증키가 설정되지 않았어요');
    const q = Object.entries(Object.assign({ serviceKey: key, dataType: 'JSON', pageNo: 1 }, params))
      .map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
    let json;
    try { json = await getJson(KMA + path + '?' + q, {}, 3); }
    catch (e) { throw new Error('기상청 서버 응답이 없어요'); }
    const h = json && json.response && json.response.header;
    if (!h) throw new Error('기상청 응답 형식 오류');
    if (h.resultCode === '03') return null;
    if (h.resultCode !== '00') throw new Error('기상청 오류: ' + h.resultMsg);
    const it = json.response.body.items.item;
    return Array.isArray(it) ? it : [it];
  }

  const PTY = { 1: 63, 2: 66, 3: 73, 4: 80, 5: 51, 6: 66, 7: 71 };
  const SKY = { 1: 0, 3: 2, 4: 3 };
  function pcp(v) {
    if (v == null || v === '' || v === '강수없음' || v === '0') return 0;
    if (/미만/.test(v)) return 0.5;
    const m = String(v).match(/([\d.]+)\s*~\s*([\d.]+)/);
    if (m) return (+m[1] + +m[2]) / 2;
    const n = parseFloat(v); return isNaN(n) ? 0 : n;
  }
  function wfCode(t) {
    if (!t) return null;
    if (/소나기/.test(t)) return 80;
    if (/비\/눈|눈\/비|진눈/.test(t)) return 66;
    if (/눈/.test(t)) return 73;
    if (/비/.test(t)) return 63;
    if (/흐림/.test(t)) return 3;
    if (/구름/.test(t)) return 2;
    if (/맑음/.test(t)) return 0;
    return 3;
  }

  function vilBase(now) {
    // 02,05,...,23시 발표, 10분 이후 제공
    const bases = [2, 5, 8, 11, 14, 17, 20, 23];
    const mins = now.h * 60 + now.mi;
    let b = null;
    for (const x of bases) if (mins >= x * 60 + 10) b = x;
    if (b == null) return { date: addDays(dayKey(now), -1), time: '2300' };
    return { date: dayKey(now), time: pad(b) + '00' };
  }

  async function kmaFetch(loc) {
    const now = kst();
    const { nx, ny } = toGrid(loc.lat, loc.lon);
    const today = dayKey(now);
    const vb = vilBase(now);
    const jobs = [];
    jobs.push(kmaGet('VilageFcstInfoService_2.0/getVilageFcst', { numOfRows: 1500, base_date: vb.date, base_time: vb.time, nx, ny }));
    const early = vb.date === today && vb.time !== '0200';
    jobs.push(early ? kmaGet('VilageFcstInfoService_2.0/getVilageFcst', { numOfRows: 400, base_date: today, base_time: '0200', nx, ny }).catch(() => null) : Promise.resolve(null));
    // 초단기실황: 매시 정각 관측, 40분 이후 제공
    const ob = kst(Date.now() - 40 * 60e3);
    jobs.push(kmaGet('VilageFcstInfoService_2.0/getUltraSrtNcst', { numOfRows: 20, base_date: dayKey(ob), base_time: pad(ob.h) + '00', nx, ny })
      .then(r => r || kmaGet('VilageFcstInfoService_2.0/getUltraSrtNcst', { numOfRows: 20, base_date: dayKey(kst(ob.ms - 3600e3)), base_time: pad(kst(ob.ms - 3600e3).h) + '00', nx, ny }))
      .catch(() => null));
    const mr = midRegion(loc.lat, loc.lon);
    jobs.push(midFetch(mr).catch(() => null));
    let [vil, vil02, ncst, mid] = await Promise.all(jobs);
    if (!vil) { // 직전 발표로 재시도
      const prev = kst(Date.UTC(+vb.date.slice(0, 4), +vb.date.slice(4, 6) - 1, +vb.date.slice(6, 8), +vb.time.slice(0, 2) - 9 - 3, 30));
      const pb = vilBase(prev);
      vil = await kmaGet('VilageFcstInfoService_2.0/getVilageFcst', { numOfRows: 1500, base_date: pb.date, base_time: pb.time, nx, ny });
    }
    if (!vil) throw new Error('기상청 예보 자료가 아직 없어요');

    // 시간별 병합(최신 발표 우선)
    const H = {};
    const dayMinMax = {};
    const put = (items, override) => {
      for (const it of items || []) {
        const k = it.fcstDate + it.fcstTime.slice(0, 2);
        if (it.category === 'TMN' || it.category === 'TMX') {
          const o = dayMinMax[it.fcstDate] = dayMinMax[it.fcstDate] || {};
          if (override || o[it.category] == null) o[it.category] = parseFloat(it.fcstValue);
          continue;
        }
        const h = H[k] = H[k] || {};
        if (override || h[it.category] == null) h[it.category] = it.fcstValue;
      }
    };
    put(vil02, false); put(vil, true);
    const hours = Object.keys(H).sort().map(k => {
      const h = H[k];
      const pty = +h.PTY || 0;
      return { k, tp: h.TMP != null ? +h.TMP : null, wc: pty ? PTY[pty] : SKY[+h.SKY] ?? null, pop: h.POP != null ? +h.POP : null, pr: pcp(h.PCP), rh: h.REH != null ? +h.REH : null, ws: h.WSD != null ? +h.WSD : null };
    }).filter(h => h.tp != null);

    // 일별(단기)
    const days = [];
    const byDay = {};
    for (const h of hours) (byDay[h.k.slice(0, 8)] = byDay[h.k.slice(0, 8)] || []).push(h);
    for (let i = 0; i < 7; i++) {
      const d = addDays(today, i);
      const hs = byDay[d] || [];
      const mm = dayMinMax[d] || {};
      if (hs.length >= 12 || (i === 0 && hs.length)) {
        const tps = hs.map(h => h.tp);
        const daytime = hs.filter(h => +h.k.slice(8) >= 6 && +h.k.slice(8) <= 20);
        const wet = daytime.filter(h => h.wc != null && h.wc >= 51);
        let wc;
        if (wet.length) wc = mode(wet.map(h => h.wc));
        else wc = mode((daytime.length ? daytime : hs).map(h => h.wc).filter(x => x != null));
        days.push({ d, wc, mx: mm.TMX ?? Math.max(...tps), mn: mm.TMN ?? Math.min(...tps), pop: Math.max(...hs.map(h => h.pop ?? 0)), pr: round1(hs.reduce((s, h) => s + (h.pr || 0), 0)) });
      } else if (mid && mid.days[d]) {
        days.push(Object.assign({ d }, mid.days[d]));
      } else if (hs.length) {
        const tps = hs.map(h => h.tp);
        days.push({ d, wc: mode(hs.map(h => h.wc)), mx: mm.TMX ?? Math.max(...tps), mn: mm.TMN ?? Math.min(...tps), pop: Math.max(...hs.map(h => h.pop ?? 0)), pr: null });
      }
    }

    // 현재
    const curH = hours.find(h => h.k === hourKey(now)) || hours.find(h => h.k > hourKey(now)) || hours[0];
    const cur = { tp: curH.tp, rh: curH.rh, ws: curH.ws, wc: curH.wc, pop: curH.pop, pr: curH.pr };
    if (ncst) {
      const o = {}; ncst.forEach(i => o[i.category] = i.obsrValue);
      if (o.T1H != null) cur.tp = +o.T1H;
      if (o.REH != null) cur.rh = +o.REH;
      if (o.WSD != null) cur.ws = +o.WSD;
      if (o.PTY != null && +o.PTY) cur.wc = PTY[+o.PTY];
      if (o.RN1 != null) cur.pr = pcp(o.RN1);
      cur.observed = true;
    }
    cur.fl = feels(cur.tp, cur.ws, cur.rh);
    const tdy = days.find(d => d.d === today);
    if (tdy) {
      const curHr = hours.filter(h => h.k.startsWith(today) && h.k >= hourKey(now));
      tdy.popRest = curHr.length ? Math.max(...curHr.map(h => h.pop ?? 0)) : tdy.pop;
      if (cur.tp != null) { tdy.mx = Math.max(tdy.mx, cur.tp); tdy.mn = Math.min(tdy.mn, cur.tp); }
    }
    return { cur, hours, days, issued: `${vb.date.slice(4, 6)}.${vb.date.slice(6)} ${vb.time.slice(0, 2)}시 발표`, grid: { nx, ny } };
  }

  async function midFetch(reg) {
    const now = kst();
    // 06시·18시 발표. 최신부터 거꾸로 시도
    const cands = [];
    let t = now.h >= 18 ? { d: dayKey(now), h: '1800' } : now.h >= 6 ? { d: dayKey(now), h: '0600' } : { d: addDays(dayKey(now), -1), h: '1800' };
    for (let i = 0; i < 3; i++) {
      cands.push(t);
      t = t.h === '1800' ? { d: t.d, h: '0600' } : { d: addDays(t.d, -1), h: '1800' };
    }
    for (const c of cands) {
      const tmFc = c.d + c.h;
      const [land, ta] = await Promise.all([
        kmaGet('MidFcstInfoService/getMidLandFcst', { numOfRows: 10, regId: reg.land, tmFc }),
        kmaGet('MidFcstInfoService/getMidTa', { numOfRows: 10, regId: reg.ta, tmFc })
      ]);
      if (!land || !ta) continue;
      const L = land[0], T = ta[0], days = {};
      for (let n = 3; n <= 10; n++) {
        if (T['taMax' + n] == null) continue;
        const d = addDays(c.d, n);
        const am = L['wf' + n + 'Am'], pm = L['wf' + n + 'Pm'], one = L['wf' + n];
        const cAm = wfCode(am), cPm = wfCode(pm), c1 = wfCode(one);
        const wc = c1 != null ? c1 : (cAm != null && cAm >= 51 ? cAm : (cPm ?? cAm));
        const pop = L['rnSt' + n] != null ? L['rnSt' + n] : Math.max(L['rnSt' + n + 'Am'] ?? 0, L['rnSt' + n + 'Pm'] ?? 0);
        days[d] = { wc, mx: +T['taMax' + n], mn: +T['taMin' + n], pop: +pop, pr: null };
      }
      return { days, tmFc };
    }
    return null;
  }

  // ---------- 노르웨이 MET ----------
  const MET_SYM = { clearsky: 0, fair: 1, partlycloudy: 2, cloudy: 3, fog: 45, lightrain: 61, rain: 63, heavyrain: 65, lightrainshowers: 80, rainshowers: 81, heavyrainshowers: 82, lightsleet: 66, sleet: 66, heavysleet: 67, lightsleetshowers: 66, sleetshowers: 66, heavysleetshowers: 67, lightsnow: 71, snow: 73, heavysnow: 75, lightsnowshowers: 85, snowshowers: 85, heavysnowshowers: 86 };
  function metCode(sym) {
    if (!sym) return null;
    const s = sym.split('_')[0];
    if (/thunder/.test(s)) return 95;
    return MET_SYM[s] ?? 3;
  }
  async function metFetch(loc) {
    const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${loc.lat.toFixed(4)}&lon=${loc.lon.toFixed(4)}`;
    const j = await getJson(url, { 'User-Agent': 'TodayWeatherKR/1.0 github.com/happyfamily1984/today-weather' }, 2);
    const ts = j.properties.timeseries;
    const hours = [], byDay = {};
    for (const e of ts) {
      const t = kst(Date.parse(e.time));
      const k = hourKey(t), d = dayKey(t);
      const inst = e.data.instant.details;
      const n1 = e.data.next_1_hours, n6 = e.data.next_6_hours;
      const wc = metCode((n1 || n6 || {}).summary && (n1 || n6).summary.symbol_code);
      const pr = n1 ? n1.details.precipitation_amount ?? 0 : null;
      if (n1) hours.push({ k, tp: inst.air_temperature, wc, pop: null, pr, rh: inst.relative_humidity, ws: inst.wind_speed });
      const b = byDay[d] = byDay[d] || { tps: [], codes: [], pr: 0, prHours: new Set() };
      b.tps.push(inst.air_temperature);
      if (t.h >= 6 && t.h <= 20 && wc != null) b.codes.push(wc);
      // 강수 합계: 1시간 자료가 있으면 1시간, 아니면 6시간 자료로
      if (n1) { b.pr += n1.details.precipitation_amount || 0; b.prHours.add(t.h); }
      else if (n6 && !b.prHours.has(t.h)) { b.pr += n6.details.precipitation_amount || 0; for (let i = 0; i < 6; i++) b.prHours.add(t.h + i); }
    }
    const today = dayKey(kst());
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(today, i), b = byDay[d];
      if (!b || !b.tps.length) continue;
      const wet = b.codes.filter(c => c >= 51);
      days.push({ d, wc: wet.length ? mode(wet) : mode(b.codes.length ? b.codes : [3]), mx: Math.max(...b.tps), mn: Math.min(...b.tps), pop: null, pr: round1(b.pr) });
    }
    const f = ts[0].data.instant.details;
    const c0 = hours[0] || {};
    const cur = { tp: f.air_temperature, rh: f.relative_humidity, ws: f.wind_speed, wc: c0.wc, pop: null, pr: c0.pr };
    cur.fl = feels(cur.tp, cur.ws, cur.rh);
    const upd = kst(Date.parse(j.properties.meta.updated_at));
    return { cur, hours, days, issued: `${pad(upd.m)}.${pad(upd.d)} ${pad(upd.h)}:${pad(upd.mi)} 갱신` };
  }

  // ---------- Open-Meteo (ECMWF · GFS · JMA) ----------
  const OM_MODELS = { ecmwf: 'ecmwf_ifs025', gfs: 'gfs_seamless', jma: 'jma_seamless' };
  const omCache = {};
  function omFetchAll(loc) {
    const key = loc.lat.toFixed(3) + ',' + loc.lon.toFixed(3);
    const c = omCache[key];
    if (c && Date.now() - c.t < 60e3) return c.p;
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + loc.lat.toFixed(4) + '&longitude=' + loc.lon.toFixed(4) +
      '&timezone=Asia%2FSeoul&wind_speed_unit=ms&forecast_days=8&models=' + Object.values(OM_MODELS).join(',') +
      '&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,precipitation_probability,precipitation,wind_speed_10m' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum';
    const p = getJson(url, {}, 2);
    omCache[key] = { t: Date.now(), p };
    p.catch(() => delete omCache[key]);
    return p;
  }
  async function omFetch(src, loc) {
    const j = await omFetchAll(loc);
    const m = OM_MODELS[src];
    const H = j.hourly, D = j.daily;
    const g = (o, f) => o[f + '_' + m] || o[f] || [];
    const hk = s => s.slice(0, 4) + s.slice(5, 7) + s.slice(8, 10) + s.slice(11, 13);
    const tps = g(H, 'temperature_2m');
    const hours = [];
    H.time.forEach((t, i) => {
      if (tps[i] == null) return;
      hours.push({ k: hk(t), tp: tps[i], wc: g(H, 'weather_code')[i], pop: g(H, 'precipitation_probability')[i] ?? null, pr: g(H, 'precipitation')[i] ?? null, rh: g(H, 'relative_humidity_2m')[i], ws: g(H, 'wind_speed_10m')[i], fl: g(H, 'apparent_temperature')[i] });
    });
    if (!hours.length) throw new Error('이 지역 예보가 없어요');
    const today = dayKey(kst());
    const days = [];
    D.time.forEach((t, i) => {
      const d = t.replace(/-/g, '');
      if (d < today || days.length >= 7) return;
      const mx = g(D, 'temperature_2m_max')[i];
      if (mx == null) return;
      days.push({ d, wc: g(D, 'weather_code')[i], mx, mn: g(D, 'temperature_2m_min')[i], pop: g(D, 'precipitation_probability_max')[i] ?? null, pr: g(D, 'precipitation_sum')[i] ?? null });
    });
    const nowK = hourKey(kst());
    const ch = hours.find(h => h.k === nowK) || hours[0];
    const cur = { tp: ch.tp, rh: ch.rh, ws: ch.ws, wc: ch.wc, pop: ch.pop, pr: ch.pr, fl: ch.fl ?? feels(ch.tp, ch.ws, ch.rh) };
    return { cur, hours, days, issued: '모델 예보' };
  }

  // 저장 지역 목록용 현재 기온(한 번에)
  async function quickTemps(locs) {
    if (!locs.length) return [];
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + locs.map(l => l.lat.toFixed(3)).join(',') + '&longitude=' + locs.map(l => l.lon.toFixed(3)).join(',') + '&current=temperature_2m,weather_code&timezone=Asia%2FSeoul';
    const j = await getJson(url, {}, 1);
    const arr = Array.isArray(j) ? j : [j];
    return arr.map(x => ({ tp: x.current.temperature_2m, wc: x.current.weather_code }));
  }

  async function geocodeFallback(q) {
    const j = await getJson('https://geocoding-api.open-meteo.com/v1/search?count=10&language=ko&countryCode=KR&name=' + encodeURIComponent(q), {}, 1);
    return (j.results || []).map(r => ({ name: [r.admin1, r.admin2, r.admin3, r.name].filter((v, i, a) => v && a.indexOf(v) === i).join(' '), lat: r.latitude, lon: r.longitude }));
  }

  function mode(arr) {
    const c = {}; let best = arr[0], bc = 0;
    for (const v of arr) { c[v] = (c[v] || 0) + 1; if (c[v] > bc) { bc = c[v]; best = v; } }
    return best;
  }
  const round1 = v => Math.round(v * 10) / 10;

  function fetchSource(src, loc) {
    if (src === 'kma') return kmaFetch(loc);
    if (src === 'metno') return metFetch(loc);
    return omFetch(src, loc);
  }

  window.Sources = { SOURCES, fetchSource, toGrid, quickTemps, geocodeFallback };
})();

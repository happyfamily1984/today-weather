// 공통 도구: 한국시간, 네이티브 브리지 통신, 저장소, 날씨 코드
(function () {
  const pad = n => String(n).padStart(2, '0');
  // 기준: 한국 표준시(KST). 모든 키는 'YYYYMMDD', 'YYYYMMDDHH' 문자열
  function kst(ms = Date.now()) {
    const d = new Date(ms + 9 * 3600e3);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), dow: d.getUTCDay(), ms };
  }
  const dayKey = t => `${t.y}${pad(t.m)}${pad(t.d)}`;
  const hourKey = t => `${dayKey(t)}${pad(t.h)}`;
  const addDays = (key, n) => { // key 'YYYYMMDD'
    const ms = Date.UTC(+key.slice(0, 4), +key.slice(4, 6) - 1, +key.slice(6, 8)) + n * 864e5;
    const d = new Date(ms);
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
  };
  const dowOf = key => new Date(Date.UTC(+key.slice(0, 4), +key.slice(4, 6) - 1, +key.slice(6, 8))).getUTCDay();
  const DOW = '일월화수목금토';

  // 네이티브 콜백
  const cbs = {};
  let seq = 0;
  function nativeCall(fn, ...args) {
    return new Promise(resolve => {
      const id = 'c' + (++seq);
      cbs[id] = resolve;
      window.NativeApi[fn](id, ...args);
    });
  }
  function nativeCb(id, res) { const f = cbs[id]; delete cbs[id]; if (f) f(res); }

  async function httpGet(url, headers = {}) {
    if (window.NativeApi) {
      const r = await nativeCall('httpGet', url, JSON.stringify(headers));
      if (!r.ok) throw new Error(r.data && r.data.status ? 'HTTP ' + r.data.status : '네트워크 연결을 확인하세요');
      return r.data.body;
    }
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 12000);
    try {
      const res = await fetch(url, { signal: ctl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.text();
    } finally { clearTimeout(t); }
  }
  async function getJson(url, headers, tries = 1) {
    let err;
    for (let i = 0; i < tries; i++) {
      try {
        const body = await httpGet(url, headers);
        if (!body || !body.trim()) throw new Error('빈 응답');
        return JSON.parse(body);
      } catch (e) { err = e; if (i < tries - 1) await new Promise(r => setTimeout(r, 600 * (i + 1))); }
    }
    throw err;
  }

  const store = {
    get(k, def) { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  };

  function wcText(c) {
    if (c == null) return '-';
    if (c === 0) return '맑음';
    if (c === 1) return '대체로 맑음';
    if (c === 2) return '구름많음';
    if (c === 3) return '흐림';
    if (c === 45 || c === 48) return '안개';
    if (c >= 51 && c <= 57) return '이슬비';
    if (c >= 61 && c <= 65) return c === 65 ? '강한 비' : '비';
    if (c === 66 || c === 67 || c === 68 || c === 69) return '비/눈';
    if (c >= 71 && c <= 77) return '눈';
    if (c >= 80 && c <= 82) return '소나기';
    if (c === 85 || c === 86) return '눈 소나기';
    if (c >= 95) return '뇌우';
    return '흐림';
  }
  const isWet = c => c != null && c >= 51;

  // 체감온도(겨울 풍속냉각 / 여름은 기온 그대로)
  function feels(t, wsMs, rh) {
    if (t == null) return null;
    const v = (wsMs || 0) * 3.6;
    if (t <= 10 && v > 4.8) return 13.12 + 0.6215 * t - 11.37 * Math.pow(v, 0.16) + 0.3965 * t * Math.pow(v, 0.16);
    if (t >= 27 && rh != null) { // 간이 열지수
      return t + 0.33 * (rh / 100 * 6.105 * Math.exp(17.27 * t / (237.7 + t))) - 0.7 * (wsMs || 0) - 4;
    }
    return t;
  }

  const r0 = v => v == null || isNaN(v) ? null : Math.round(v);
  const deg = v => v == null || isNaN(v) ? '–' : Math.round(v) + '°';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dist = (a, b, c, d) => { const R = 6371, p = Math.PI / 180; const x = (d - b) * p * Math.cos((a + c) / 2 * p), y = (c - a) * p; return Math.sqrt(x * x + y * y) * R; };

  window.U = { pad, kst, dayKey, hourKey, addDays, dowOf, DOW, nativeCb, nativeCall, httpGet, getJson, store, wcText, isWet, feels, r0, deg, esc, dist };
})();

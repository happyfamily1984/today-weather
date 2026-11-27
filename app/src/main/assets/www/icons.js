// 날씨 아이콘(부드러운 입체감 SVG)과 UI 아이콘
(function () {
  let uid = 0;
  function cloud(id, x, y, s, tone) {
    const top = tone === 'dark' ? '#B4C3D8' : '#FFFFFF';
    const bot = tone === 'dark' ? '#7F95B4' : '#C8D9F2';
    return `<defs><linearGradient id="c${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bot}"/></linearGradient></defs>
    <g transform="translate(${x} ${y}) scale(${s})"><path d="M14 46h38a12 12 0 0 0 1.5-23.9A17 17 0 0 0 21 20.5 13 13 0 0 0 14 46z" fill="url(#c${id})"/>
    <path d="M14 46h38a12 12 0 0 0 5-1.1C50 47 22 48 14 46z" fill="${bot}" opacity=".6"/></g>`;
  }
  function sun(id, cx, cy, r, rays) {
    let g = `<defs><radialGradient id="s${id}" cx=".38" cy=".35" r=".7"><stop offset="0" stop-color="#FFE97A"/><stop offset=".6" stop-color="#FFC233"/><stop offset="1" stop-color="#FF9419"/></radialGradient></defs>`;
    if (rays) {
      g += '<g stroke="#FFC233" stroke-width="3.6" stroke-linecap="round">';
      for (let a = 0; a < 360; a += 45) {
        const t = a * Math.PI / 180;
        g += `<line x1="${cx + Math.cos(t) * (r + 5)}" y1="${cy + Math.sin(t) * (r + 5)}" x2="${cx + Math.cos(t) * (r + 10)}" y2="${cy + Math.sin(t) * (r + 10)}"/>`;
      }
      g += '</g>';
    }
    return g + `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#s${id})"/>`;
  }
  function moon(id, cx, cy, r) {
    return `<defs><linearGradient id="m${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFF3B8"/><stop offset="1" stop-color="#F7C948"/></linearGradient></defs>
    <path d="M${cx + r * .35} ${cy - r}a${r} ${r} 0 1 0 ${r * .65} ${r * 1.55}A${r * .82} ${r * .82} 0 0 1 ${cx + r * .35} ${cy - r}z" fill="url(#m${id})"/>`;
  }
  const drops = (n, color) => {
    let g = `<g stroke="${color}" stroke-width="3.2" stroke-linecap="round">`;
    const xs = n === 2 ? [27, 37] : [22, 32, 42];
    xs.forEach(x => g += `<line x1="${x}" y1="51" x2="${x - 2.5}" y2="58"/>`);
    return g + '</g>';
  };
  const flakes = () => '<g fill="#8EC5F5">' + [[22, 53], [32, 57], [42, 53]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.8"/>`).join('') + '</g>';
  const bolt = '<path d="M33 46l-6 10h5l-3 8 9-12h-5l3-6z" fill="#FFB020"/>';

  function kind(code) {
    if (code == null) return 'cloud';
    if (code <= 1) return 'clear';
    if (code === 2) return 'partly';
    if (code === 3 || code === 45 || code === 48) return 'cloud';
    if (code >= 95) return 'storm';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
    if (code === 66 || code === 67 || code === 68 || code === 69) return 'sleet';
    if (code >= 51 && code <= 57) return 'drizzle';
    return 'rain';
  }

  window.Icons = {
    kind,
    weather(code, size = 40, night = false) {
      const id = ++uid, k = kind(code);
      let g = '';
      if (k === 'clear') g = night ? moon(id, 30, 32, 17) : sun(id, 32, 32, 14, true);
      else if (k === 'partly') g = (night ? moon(id, 24, 22, 12) : sun(id, 24, 22, 10, true)) + cloud(id, 6, 12, .95);
      else if (k === 'cloud') g = cloud(id, 0, 6, 1);
      else if (k === 'drizzle') g = cloud(id, 0, 0, 1, 'dark') + drops(2, '#2F7FE8');
      else if (k === 'rain') g = cloud(id, 0, 0, 1, 'dark') + drops(3, '#2F7FE8');
      else if (k === 'snow') g = cloud(id, 0, 0, 1) + flakes();
      else if (k === 'sleet') g = cloud(id, 0, 0, 1, 'dark') + drops(2, '#2F7FE8') + '<circle cx="42" cy="55" r="2.8" fill="#8EC5F5"/>';
      else if (k === 'storm') g = cloud(id, 0, 0, 1, 'dark') + bolt;
      return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">${g}</svg>`;
    },
    ui: {
      pin: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
      nav: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M21.5 2.5 2.8 10.3c-.9.4-.8 1.6.1 1.9l7.1 2 2 7.1c.3.9 1.5 1 1.9.1z"/></svg>',
      chev: '<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
      right: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
      refresh: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1"/><path d="M20.5 3.5v5h-5"/></svg>',
      home: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>',
      week: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8.5 3v4M15.5 3v4"/></svg>',
      cmp: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 20V11M10 20V5M15 20v-6M20 20V9M2.5 20.5h19"/></svg>',
      clock: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
      cal: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8.5 3v4M15.5 3v4"/></svg>',
      info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9.5"/><path d="M12 11v6M12 7.5v.5" stroke-linecap="round"/></svg>',
      search: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
      x: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
      minus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"><path d="M5 12h14"/></svg>',
      target: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3"/></svg>',
      thermo: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2F7FE8" stroke-width="2.2" stroke-linecap="round"><path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z"/></svg>',
      drop: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2F7FE8" stroke-width="2.2"><path d="M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11z"/></svg>',
      wind: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2F7FE8" stroke-width="2.2" stroke-linecap="round"><path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8"/></svg>',
      umb: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2F7FE8" stroke-width="2.2" stroke-linecap="round"><path d="M12 3a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9zM12 12v7a2 2 0 0 0 4 0"/></svg>',
      dropS: '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2s7 7.6 7 12.5a7 7 0 0 1-14 0C5 9.6 12 2 12 2z"/></svg>'
    },
    // 도시 실루엣(남산 언덕과 탑, 빌딩, 다리, 물결)
    skyline() {
      let seed = 7;
      const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
      let b = '';
      for (let x = -4; x < 400; x += 9 + rnd() * 8) {
        const w = 7 + rnd() * 9, h = 18 + rnd() * 46 * (x > 210 ? 1.25 : 0.8);
        b += `<rect x="${x.toFixed(1)}" y="${(150 - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="1" fill="url(#bd)"/>`;
        for (let wy = 150 - h + 5; wy < 146; wy += 7) b += `<rect x="${(x + 2).toFixed(1)}" y="${wy.toFixed(1)}" width="${(w - 4).toFixed(1)}" height="1.4" fill="rgba(255,255,255,.35)"/>`;
      }
      return `<svg viewBox="0 0 390 190" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
        <defs><linearGradient id="hl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7FB8E9"/><stop offset="1" stop-color="#A9D2F3"/></linearGradient>
        <linearGradient id="bd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8EBFEA"/><stop offset="1" stop-color="#B8DAF5"/></linearGradient>
        <linearGradient id="wt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#CFE7FA"/><stop offset="1" stop-color="rgba(230,243,253,0)"/></linearGradient></defs>
        <path d="M170 150 C220 95 250 70 290 66 C330 64 360 92 400 112 L400 150z" fill="url(#hl)" opacity=".9"/>
        <rect x="288" y="18" width="3.2" height="50" fill="#7AAFE0"/><rect x="284.5" y="38" width="10" height="7" rx="2" fill="#7AAFE0"/><rect x="286" y="10" width="1.4" height="10" fill="#7AAFE0"/>
        ${b}
        <rect x="0" y="148" width="390" height="4" fill="#9CC8EE"/>
        <g fill="#9CC8EE">${Array.from({ length: 22 }, (_, i) => `<rect x="${i * 18}" y="150" width="2.2" height="8"/>`).join('')}</g>
        <rect x="0" y="156" width="390" height="34" fill="url(#wt)"/>
      </svg>`;
    }
  };
})();

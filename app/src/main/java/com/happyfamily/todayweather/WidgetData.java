package com.happyfamily.todayweather;

import org.json.JSONArray;
import org.json.JSONObject;

import java.net.URLEncoder;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.TreeMap;

/** 위젯용 예보 수집(앱의 sources.js 와 같은 규칙) */
final class WidgetData {
    private WidgetData() {}

    static final TimeZone KST = TimeZone.getTimeZone("Asia/Seoul");
    static final String[] SRC_KEYS = {"kma", "metno", "ecmwf", "gfs", "jma"};
    static final String[] SRC_NAMES = {"기상청", "노르웨이", "유럽", "미국", "일본"};
    static final int[] SRC_COLORS = {0xFF1E6FE6, 0xFFE2324A, 0xFF18A36C, 0xFF7A4DE0, 0xFFF08A12};

    static final class Hour { String k; double tp; Integer wc; Integer pop; Double pr; Double rh; Double ws; Double fl; }
    static final class Day { String d; Integer wc; double mx, mn; Integer pop; Double pr; }
    static final class Fc { Hour cur; List<Hour> hours = new ArrayList<>(); List<Day> days = new ArrayList<>(); }

    // ---------- 시간 ----------
    static String fmt(long ms, String p) { SimpleDateFormat f = new SimpleDateFormat(p, Locale.US); f.setTimeZone(KST); return f.format(new Date(ms)); }
    static String dayKey(long ms) { return fmt(ms, "yyyyMMdd"); }
    static String hourKey(long ms) { return fmt(ms, "yyyyMMddHH"); }
    static String addDays(String key, int n) {
        Calendar c = Calendar.getInstance(KST);
        c.clear();
        c.set(Integer.parseInt(key.substring(0, 4)), Integer.parseInt(key.substring(4, 6)) - 1, Integer.parseInt(key.substring(6, 8)), 12, 0);
        c.add(Calendar.DAY_OF_MONTH, n);
        return dayKey(c.getTimeInMillis());
    }
    static int dow(String key) {
        Calendar c = Calendar.getInstance(KST);
        c.clear();
        c.set(Integer.parseInt(key.substring(0, 4)), Integer.parseInt(key.substring(4, 6)) - 1, Integer.parseInt(key.substring(6, 8)), 12, 0);
        return c.get(Calendar.DAY_OF_WEEK) - 1;
    }
    static String pad(int n) { return n < 10 ? "0" + n : "" + n; }

    static Double feels(Double t, Double ws, Double rh) {
        if (t == null) return null;
        double v = (ws == null ? 0 : ws) * 3.6;
        if (t <= 10 && v > 4.8) return 13.12 + 0.6215 * t - 11.37 * Math.pow(v, 0.16) + 0.3965 * t * Math.pow(v, 0.16);
        return t;
    }

    // ---------- 기상청 ----------
    static int[] toGrid(double lat, double lon) {
        double RE = 6371.00877, GRID = 5.0, SLAT1 = 30.0, SLAT2 = 60.0, OLON = 126.0, OLAT = 38.0; int XO = 43, YO = 136;
        double D = Math.PI / 180, re = RE / GRID, s1 = SLAT1 * D, s2 = SLAT2 * D, olon = OLON * D, olat = OLAT * D;
        double sn = Math.tan(Math.PI * 0.25 + s2 * 0.5) / Math.tan(Math.PI * 0.25 + s1 * 0.5);
        sn = Math.log(Math.cos(s1) / Math.cos(s2)) / Math.log(sn);
        double sf = Math.tan(Math.PI * 0.25 + s1 * 0.5); sf = Math.pow(sf, sn) * Math.cos(s1) / sn;
        double ro = Math.tan(Math.PI * 0.25 + olat * 0.5); ro = re * sf / Math.pow(ro, sn);
        double ra = Math.tan(Math.PI * 0.25 + lat * D * 0.5); ra = re * sf / Math.pow(ra, sn);
        double th = lon * D - olon; if (th > Math.PI) th -= 2 * Math.PI; if (th < -Math.PI) th += 2 * Math.PI; th *= sn;
        return new int[]{(int) Math.floor(ra * Math.sin(th) + XO + 0.5), (int) Math.floor(ro - ra * Math.cos(th) + YO + 0.5)};
    }

    static final Object[][] MID_TA = {
        {37.57, 126.98, "11B10101"}, {37.46, 126.71, "11B20201"}, {37.26, 127.03, "11B20601"}, {37.76, 126.78, "11B20305"},
        {37.27, 127.44, "11B20701"}, {36.99, 127.09, "11B20606"}, {37.88, 127.73, "11D10301"}, {37.34, 127.92, "11D10401"},
        {37.75, 128.88, "11D20501"}, {38.21, 128.59, "11D20401"}, {36.35, 127.38, "11C20401"}, {36.48, 127.29, "11C20404"},
        {36.60, 126.66, "11C20104"}, {36.78, 126.45, "11C20101"}, {36.81, 127.11, "11C20301"}, {36.64, 127.49, "11C10301"},
        {36.99, 127.93, "11C10101"}, {35.16, 126.85, "11F20501"}, {34.81, 126.39, "21F20801"}, {34.76, 127.66, "11F20401"},
        {35.82, 127.15, "11F10201"}, {35.97, 126.74, "21F10501"}, {35.87, 128.60, "11H10701"}, {36.57, 128.73, "11H10501"},
        {36.02, 129.34, "11H10201"}, {37.48, 130.90, "11E00101"}, {35.18, 129.08, "11H20201"}, {35.54, 129.31, "11H20101"},
        {35.23, 128.68, "11H20301"}, {35.18, 128.11, "11H20701"}, {34.85, 128.43, "11H20401"}, {33.50, 126.53, "11G00201"},
        {33.25, 126.56, "11G00401"}};

    static String landReg(String ta) {
        if (ta.startsWith("11B")) return "11B00000";
        if (ta.startsWith("11D1")) return "11D10000";
        if (ta.startsWith("11D2")) return "11D20000";
        if (ta.startsWith("11C2")) return "11C20000";
        if (ta.startsWith("11C1")) return "11C10000";
        if (ta.matches("^(11|21)F2.*")) return "11F20000";
        if (ta.matches("^(11|21)F1.*")) return "11F10000";
        if (ta.startsWith("11H1") || ta.startsWith("11E")) return "11H10000";
        if (ta.startsWith("11H2")) return "11H20000";
        if (ta.startsWith("11G")) return "11G00000";
        return "11B00000";
    }

    static double dist(double a, double b, double c, double d) {
        double p = Math.PI / 180, x = (d - b) * p * Math.cos((a + c) / 2 * p), y = (c - a) * p;
        return Math.sqrt(x * x + y * y) * 6371;
    }

    static JSONArray kma(String path, String params) throws Exception {
        String key = BuildConfig.KMA_KEY;
        if (key == null || key.isEmpty()) throw new Exception("no key");
        String url = "https://apis.data.go.kr/1360000/" + path + "?serviceKey=" + URLEncoder.encode(key, "UTF-8") + "&dataType=JSON&pageNo=1&" + params;
        JSONObject j = Http.obj(url, null, 3);
        JSONObject h = j.getJSONObject("response").getJSONObject("header");
        String code = h.optString("resultCode");
        if ("03".equals(code)) return null;
        if (!"00".equals(code)) throw new Exception(h.optString("resultMsg"));
        Object it = j.getJSONObject("response").getJSONObject("body").getJSONObject("items").get("item");
        if (it instanceof JSONArray) return (JSONArray) it;
        JSONArray a = new JSONArray(); a.put(it); return a;
    }

    static final Map<Integer, Integer> PTY = new HashMap<>();
    static final Map<Integer, Integer> SKY = new HashMap<>();
    static {
        PTY.put(1, 63); PTY.put(2, 66); PTY.put(3, 73); PTY.put(4, 80); PTY.put(5, 51); PTY.put(6, 66); PTY.put(7, 71);
        SKY.put(1, 0); SKY.put(3, 2); SKY.put(4, 3);
    }

    static double pcp(String v) {
        if (v == null || v.isEmpty() || v.equals("강수없음") || v.equals("0")) return 0;
        if (v.contains("미만")) return 0.5;
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("([\\d.]+)\\s*~\\s*([\\d.]+)").matcher(v);
        if (m.find()) return (Double.parseDouble(m.group(1)) + Double.parseDouble(m.group(2))) / 2;
        m = java.util.regex.Pattern.compile("([\\d.]+)").matcher(v);
        return m.find() ? Double.parseDouble(m.group(1)) : 0;
    }

    static Integer wfCode(String t) {
        if (t == null || t.isEmpty()) return null;
        if (t.contains("소나기")) return 80;
        if (t.contains("비/눈") || t.contains("눈/비") || t.contains("진눈")) return 66;
        if (t.contains("눈")) return 73;
        if (t.contains("비")) return 63;
        if (t.contains("흐림")) return 3;
        if (t.contains("구름")) return 2;
        if (t.contains("맑음")) return 0;
        return 3;
    }

    static String[] vilBase(long ms) {
        int[] bases = {2, 5, 8, 11, 14, 17, 20, 23};
        String hm = fmt(ms, "HHmm");
        int mins = Integer.parseInt(hm.substring(0, 2)) * 60 + Integer.parseInt(hm.substring(2));
        int b = -1;
        for (int x : bases) if (mins >= x * 60 + 10) b = x;
        if (b < 0) return new String[]{addDays(dayKey(ms), -1), "2300"};
        return new String[]{dayKey(ms), pad(b) + "00"};
    }

    static Integer mode(List<Integer> l) {
        Map<Integer, Integer> c = new HashMap<>(); Integer best = null; int bc = 0;
        for (Integer v : l) { if (v == null) continue; int n = c.containsKey(v) ? c.get(v) + 1 : 1; c.put(v, n); if (n > bc) { bc = n; best = v; } }
        return best;
    }

    static Fc kmaFetch(double lat, double lon) throws Exception {
        long now = System.currentTimeMillis();
        int[] g = toGrid(lat, lon);
        String grid = "&nx=" + g[0] + "&ny=" + g[1];
        String today = dayKey(now);
        String[] vb = vilBase(now);
        JSONArray vil = kma("VilageFcstInfoService_2.0/getVilageFcst", "numOfRows=1500&base_date=" + vb[0] + "&base_time=" + vb[1] + grid);
        if (vil == null) {
            String[] pb = vilBase(now - 3 * 3600_000L);
            vil = kma("VilageFcstInfoService_2.0/getVilageFcst", "numOfRows=1500&base_date=" + pb[0] + "&base_time=" + pb[1] + grid);
        }
        if (vil == null) throw new Exception("no data");
        JSONArray vil02 = null;
        if (vb[0].equals(today) && !vb[1].equals("0200")) {
            try { vil02 = kma("VilageFcstInfoService_2.0/getVilageFcst", "numOfRows=400&base_date=" + today + "&base_time=0200" + grid); } catch (Exception ignored) {}
        }
        JSONArray ncst = null;
        try {
            long ob = now - 40 * 60_000L;
            ncst = kma("VilageFcstInfoService_2.0/getUltraSrtNcst", "numOfRows=20&base_date=" + dayKey(ob) + "&base_time=" + fmt(ob, "HH") + "00" + grid);
        } catch (Exception ignored) {}

        TreeMap<String, Map<String, String>> H = new TreeMap<>();
        Map<String, Map<String, Double>> mm = new HashMap<>();
        JSONArray[] sets = {vil02, vil};
        for (int s = 0; s < 2; s++) {
            JSONArray arr = sets[s]; if (arr == null) continue;
            boolean override = s == 1;
            for (int i = 0; i < arr.length(); i++) {
                JSONObject it = arr.getJSONObject(i);
                String cat = it.getString("category"), fd = it.getString("fcstDate");
                if (cat.equals("TMN") || cat.equals("TMX")) {
                    Map<String, Double> o = mm.get(fd); if (o == null) { o = new HashMap<>(); mm.put(fd, o); }
                    if (override || !o.containsKey(cat)) o.put(cat, Double.parseDouble(it.getString("fcstValue")));
                    continue;
                }
                String k = fd + it.getString("fcstTime").substring(0, 2);
                Map<String, String> h = H.get(k); if (h == null) { h = new HashMap<>(); H.put(k, h); }
                if (override || !h.containsKey(cat)) h.put(cat, it.getString("fcstValue"));
            }
        }
        Fc fc = new Fc();
        for (Map.Entry<String, Map<String, String>> e : H.entrySet()) {
            Map<String, String> h = e.getValue();
            if (!h.containsKey("TMP")) continue;
            Hour x = new Hour(); x.k = e.getKey(); x.tp = Double.parseDouble(h.get("TMP"));
            int pty = h.containsKey("PTY") ? (int) Double.parseDouble(h.get("PTY")) : 0;
            x.wc = pty != 0 ? PTY.get(pty) : (h.containsKey("SKY") ? SKY.get((int) Double.parseDouble(h.get("SKY"))) : null);
            x.pop = h.containsKey("POP") ? (int) Double.parseDouble(h.get("POP")) : null;
            x.pr = pcp(h.get("PCP"));
            x.rh = h.containsKey("REH") ? Double.parseDouble(h.get("REH")) : null;
            x.ws = h.containsKey("WSD") ? Double.parseDouble(h.get("WSD")) : null;
            fc.hours.add(x);
        }
        Map<String, JSONObject> mid = null;
        try { mid = midFetch(lat, lon); } catch (Exception ignored) {}
        for (int i = 0; i < 7; i++) {
            String d = addDays(today, i);
            List<Hour> hs = new ArrayList<>();
            for (Hour h : fc.hours) if (h.k.startsWith(d)) hs.add(h);
            Map<String, Double> m = mm.get(d);
            if (hs.size() >= 12 || (i == 0 && !hs.isEmpty())) {
                Day day = new Day(); day.d = d;
                double mx = -99, mn = 99; int pop = 0; double pr = 0;
                List<Integer> wet = new ArrayList<>(), dayCodes = new ArrayList<>();
                for (Hour h : hs) {
                    mx = Math.max(mx, h.tp); mn = Math.min(mn, h.tp); if (h.pop != null) pop = Math.max(pop, h.pop); if (h.pr != null) pr += h.pr;
                    int hr = Integer.parseInt(h.k.substring(8));
                    if (hr >= 6 && hr <= 20) { dayCodes.add(h.wc); if (h.wc != null && h.wc >= 51) wet.add(h.wc); }
                }
                if (m != null && m.containsKey("TMX")) mx = m.get("TMX");
                if (m != null && m.containsKey("TMN")) mn = m.get("TMN");
                day.mx = mx; day.mn = mn; day.pop = pop; day.pr = Math.round(pr * 10) / 10.0;
                day.wc = !wet.isEmpty() ? mode(wet) : mode(dayCodes.isEmpty() ? codes(hs) : dayCodes);
                fc.days.add(day);
            } else if (mid != null && mid.containsKey(d)) {
                JSONObject o = mid.get(d);
                Day day = new Day(); day.d = d; day.wc = o.has("wc") ? o.optInt("wc") : null; day.mx = o.optDouble("mx"); day.mn = o.optDouble("mn"); day.pop = o.optInt("pop"); fc.days.add(day);
            } else if (!hs.isEmpty()) {
                Day day = new Day(); day.d = d; double mx = -99, mn = 99; int pop = 0;
                for (Hour h : hs) { mx = Math.max(mx, h.tp); mn = Math.min(mn, h.tp); if (h.pop != null) pop = Math.max(pop, h.pop); }
                day.mx = mx; day.mn = mn; day.pop = pop; day.wc = mode(codes(hs)); fc.days.add(day);
            }
        }
        String nk = hourKey(now);
        Hour ch = null;
        for (Hour h : fc.hours) if (h.k.compareTo(nk) >= 0) { ch = h; break; }
        if (ch == null && !fc.hours.isEmpty()) ch = fc.hours.get(fc.hours.size() - 1);
        if (ch == null) throw new Exception("no hours");
        Hour cur = new Hour(); cur.k = ch.k; cur.tp = ch.tp; cur.wc = ch.wc; cur.pop = ch.pop; cur.pr = ch.pr; cur.rh = ch.rh; cur.ws = ch.ws;
        if (ncst != null) {
            for (int i = 0; i < ncst.length(); i++) {
                JSONObject o = ncst.getJSONObject(i); String c = o.getString("category"); String v = o.getString("obsrValue");
                try {
                    if (c.equals("T1H")) cur.tp = Double.parseDouble(v);
                    else if (c.equals("REH")) cur.rh = Double.parseDouble(v);
                    else if (c.equals("WSD")) cur.ws = Double.parseDouble(v);
                    else if (c.equals("PTY") && (int) Double.parseDouble(v) != 0) cur.wc = PTY.get((int) Double.parseDouble(v));
                } catch (Exception ignored) {}
            }
        }
        cur.fl = feels(cur.tp, cur.ws, cur.rh);
        fc.cur = cur;
        if (!fc.days.isEmpty() && fc.days.get(0).d.equals(today)) {
            Day t = fc.days.get(0);
            t.mx = Math.max(t.mx, cur.tp); t.mn = Math.min(t.mn, cur.tp);
            int rest = 0; boolean any = false;
            for (Hour h : fc.hours) if (h.k.startsWith(today) && h.k.compareTo(nk) >= 0 && h.pop != null) { rest = Math.max(rest, h.pop); any = true; }
            if (any) t.pop = rest;
        }
        return fc;
    }

    static List<Integer> codes(List<Hour> hs) { List<Integer> l = new ArrayList<>(); for (Hour h : hs) l.add(h.wc); return l; }

    static Map<String, JSONObject> midFetch(double lat, double lon) throws Exception {
        String ta = (String) MID_TA[0][2]; double bd = 1e9;
        for (Object[] r : MID_TA) { double d = dist(lat, lon, (double) r[0], (double) r[1]); if (d < bd) { bd = d; ta = (String) r[2]; } }
        String land = landReg(ta);
        long now = System.currentTimeMillis();
        int h = Integer.parseInt(fmt(now, "HH"));
        String d = h >= 6 ? dayKey(now) : addDays(dayKey(now), -1);
        String t = h >= 18 ? "1800" : h >= 6 ? "0600" : "1800";
        for (int i = 0; i < 3; i++) {
            String tmFc = d + t;
            JSONArray L = kma("MidFcstInfoService/getMidLandFcst", "numOfRows=10&regId=" + land + "&tmFc=" + tmFc);
            JSONArray T = L == null ? null : kma("MidFcstInfoService/getMidTa", "numOfRows=10&regId=" + ta + "&tmFc=" + tmFc);
            if (L != null && T != null) {
                JSONObject l = L.getJSONObject(0), tt = T.getJSONObject(0);
                Map<String, JSONObject> out = new HashMap<>();
                for (int n = 3; n <= 10; n++) {
                    if (!tt.has("taMax" + n)) continue;
                    Integer c1 = wfCode(l.optString("wf" + n, null)), cAm = wfCode(l.optString("wf" + n + "Am", null)), cPm = wfCode(l.optString("wf" + n + "Pm", null));
                    Integer wc = c1 != null ? c1 : (cAm != null && cAm >= 51 ? cAm : (cPm != null ? cPm : cAm));
                    int pop = l.has("rnSt" + n) ? l.optInt("rnSt" + n) : Math.max(l.optInt("rnSt" + n + "Am"), l.optInt("rnSt" + n + "Pm"));
                    JSONObject o = new JSONObject();
                    if (wc != null) o.put("wc", wc);
                    o.put("mx", tt.optDouble("taMax" + n)); o.put("mn", tt.optDouble("taMin" + n)); o.put("pop", pop);
                    out.put(addDays(d, n), o);
                }
                return out;
            }
            if (t.equals("1800")) t = "0600"; else { t = "1800"; d = addDays(d, -1); }
        }
        return null;
    }

    // ---------- MET Norway ----------
    static Integer metCode(String sym) {
        if (sym == null) return null;
        String s = sym.split("_")[0];
        if (s.contains("thunder")) return 95;
        switch (s) {
            case "clearsky": return 0; case "fair": return 1; case "partlycloudy": return 2; case "cloudy": return 3; case "fog": return 45;
            case "lightrain": return 61; case "rain": return 63; case "heavyrain": return 65;
            case "lightrainshowers": return 80; case "rainshowers": return 81; case "heavyrainshowers": return 82;
            case "lightsnow": return 71; case "snow": return 73; case "heavysnow": return 75;
            case "lightsnowshowers": case "snowshowers": return 85; case "heavysnowshowers": return 86;
            default: return s.contains("sleet") ? 66 : 3;
        }
    }

    static Fc metFetch(double lat, double lon) throws Exception {
        Map<String, String> hd = new HashMap<>();
        hd.put("User-Agent", "TodayWeatherKR/1.0 github.com/happyfamily1984/today-weather");
        JSONObject j = Http.obj(String.format(Locale.US, "https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=%.4f&lon=%.4f", lat, lon), hd, 2);
        JSONArray ts = j.getJSONObject("properties").getJSONArray("timeseries");
        SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US); iso.setTimeZone(TimeZone.getTimeZone("UTC"));
        Fc fc = new Fc();
        Map<String, double[]> mm = new TreeMap<>(); Map<String, Double> pr = new HashMap<>(); Map<String, List<Integer>> cs = new HashMap<>();
        for (int i = 0; i < ts.length(); i++) {
            JSONObject e = ts.getJSONObject(i);
            long ms = iso.parse(e.getString("time")).getTime();
            String k = hourKey(ms), d = dayKey(ms);
            JSONObject data = e.getJSONObject("data"), inst = data.getJSONObject("instant").getJSONObject("details");
            JSONObject n1 = data.optJSONObject("next_1_hours"), n6 = data.optJSONObject("next_6_hours");
            JSONObject n = n1 != null ? n1 : n6;
            Integer wc = n != null ? metCode(n.getJSONObject("summary").optString("symbol_code")) : null;
            double tp = inst.getDouble("air_temperature");
            if (n1 != null) {
                Hour h = new Hour(); h.k = k; h.tp = tp; h.wc = wc; h.pr = n1.getJSONObject("details").optDouble("precipitation_amount", 0);
                h.rh = inst.optDouble("relative_humidity"); h.ws = inst.optDouble("wind_speed"); fc.hours.add(h);
            }
            double[] v = mm.get(d); if (v == null) { v = new double[]{-99, 99}; mm.put(d, v); }
            v[0] = Math.max(v[0], tp); v[1] = Math.min(v[1], tp);
            double add = n1 != null ? n1.getJSONObject("details").optDouble("precipitation_amount", 0) : 0;
            pr.put(d, (pr.containsKey(d) ? pr.get(d) : 0) + add);
            int hr = Integer.parseInt(k.substring(8));
            if (hr >= 6 && hr <= 20 && wc != null) { List<Integer> l = cs.get(d); if (l == null) { l = new ArrayList<>(); cs.put(d, l); } l.add(wc); }
        }
        for (Map.Entry<String, double[]> e : mm.entrySet()) {
            Day day = new Day(); day.d = e.getKey(); day.mx = e.getValue()[0]; day.mn = e.getValue()[1];
            day.pr = Math.round(pr.get(day.d) * 10) / 10.0;
            List<Integer> l = cs.get(day.d); List<Integer> wet = new ArrayList<>();
            if (l != null) for (Integer c : l) if (c >= 51) wet.add(c);
            day.wc = !wet.isEmpty() ? mode(wet) : (l != null ? mode(l) : Integer.valueOf(3));
            fc.days.add(day);
        }
        if (fc.hours.isEmpty()) throw new Exception("no hours");
        Hour c = fc.hours.get(0); Hour cur = new Hour(); cur.k = c.k; cur.tp = c.tp; cur.wc = c.wc; cur.pr = c.pr; cur.rh = c.rh; cur.ws = c.ws; cur.fl = feels(cur.tp, cur.ws, cur.rh);
        fc.cur = cur;
        return fc;
    }

    // ---------- Open-Meteo ----------
    static final String[] OM = {"ecmwf_ifs025", "gfs_seamless", "jma_seamless"};

    static Map<String, Fc> omFetch(double lat, double lon) throws Exception {
        String url = String.format(Locale.US, "https://api.open-meteo.com/v1/forecast?latitude=%.4f&longitude=%.4f", lat, lon) +
                "&timezone=Asia%2FSeoul&wind_speed_unit=ms&forecast_days=8&models=ecmwf_ifs025,gfs_seamless,jma_seamless" +
                "&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,precipitation_probability,precipitation,wind_speed_10m" +
                "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum";
        JSONObject j = Http.obj(url, null, 2);
        JSONObject H = j.getJSONObject("hourly"), D = j.getJSONObject("daily");
        JSONArray ht = H.getJSONArray("time"), dt = D.getJSONArray("time");
        String today = dayKey(System.currentTimeMillis()), nk = hourKey(System.currentTimeMillis());
        Map<String, Fc> out = new HashMap<>();
        for (int m = 0; m < 3; m++) {
            String s = "_" + OM[m];
            Fc fc = new Fc();
            JSONArray tp = H.optJSONArray("temperature_2m" + s);
            if (tp == null) continue;
            for (int i = 0; i < ht.length(); i++) {
                if (tp.isNull(i)) continue;
                String t = ht.getString(i);
                Hour h = new Hour(); h.k = t.substring(0, 4) + t.substring(5, 7) + t.substring(8, 10) + t.substring(11, 13);
                h.tp = tp.getDouble(i);
                h.wc = optInt(H.optJSONArray("weather_code" + s), i);
                h.pop = optInt(H.optJSONArray("precipitation_probability" + s), i);
                h.pr = optD(H.optJSONArray("precipitation" + s), i);
                h.rh = optD(H.optJSONArray("relative_humidity_2m" + s), i);
                h.ws = optD(H.optJSONArray("wind_speed_10m" + s), i);
                h.fl = optD(H.optJSONArray("apparent_temperature" + s), i);
                fc.hours.add(h);
            }
            for (int i = 0; i < dt.length(); i++) {
                String d = dt.getString(i).replace("-", "");
                if (d.compareTo(today) < 0) continue;
                Double mx = optD(D.optJSONArray("temperature_2m_max" + s), i);
                if (mx == null) continue;
                Day day = new Day(); day.d = d; day.mx = mx; day.mn = optD(D.optJSONArray("temperature_2m_min" + s), i);
                day.wc = optInt(D.optJSONArray("weather_code" + s), i); day.pop = optInt(D.optJSONArray("precipitation_probability_max" + s), i);
                day.pr = optD(D.optJSONArray("precipitation_sum" + s), i);
                fc.days.add(day);
            }
            if (fc.hours.isEmpty()) continue;
            Hour c = fc.hours.get(0);
            for (Hour h : fc.hours) if (h.k.equals(nk)) { c = h; break; }
            Hour cur = new Hour(); cur.k = c.k; cur.tp = c.tp; cur.wc = c.wc; cur.pop = c.pop; cur.pr = c.pr; cur.rh = c.rh; cur.ws = c.ws;
            cur.fl = c.fl != null ? c.fl : feels(c.tp, c.ws, c.rh);
            fc.cur = cur;
            out.put(m == 0 ? "ecmwf" : m == 1 ? "gfs" : "jma", fc);
        }
        return out;
    }

    static Integer optInt(JSONArray a, int i) { return a == null || a.isNull(i) ? null : a.optInt(i); }
    static Double optD(JSONArray a, int i) { return a == null || a.isNull(i) ? null : a.optDouble(i); }

    // ---------- 스냅샷 ----------
    static JSONObject build(double lat, double lon, boolean withCompare) throws Exception {
        final Fc[] res = new Fc[5];
        final Exception[] errs = new Exception[5];
        List<Thread> ts = new ArrayList<>();
        ts.add(new Thread(() -> { try { res[0] = kmaFetch(lat, lon); } catch (Exception e) { errs[0] = e; } }));
        ts.add(new Thread(() -> { try { Map<String, Fc> m = omFetch(lat, lon); res[2] = m.get("ecmwf"); res[3] = m.get("gfs"); res[4] = m.get("jma"); } catch (Exception e) { errs[2] = e; } }));
        if (withCompare) ts.add(new Thread(() -> { try { res[1] = metFetch(lat, lon); } catch (Exception e) { errs[1] = e; } }));
        for (Thread t : ts) t.start();
        for (Thread t : ts) t.join(60000);
        Fc main = res[0] != null ? res[0] : res[2];
        String mainSrc = res[0] != null ? "기상청" : "유럽 ECMWF";
        if (main == null) throw new Exception("fetch failed");
        long now = System.currentTimeMillis();
        String today = dayKey(now), nk = hourKey(now);
        JSONObject o = new JSONObject();
        o.put("at", now); o.put("src", mainSrc); o.put("kmaOk", res[0] != null);
        Hour c = main.cur;
        JSONObject cur = new JSONObject();
        cur.put("tp", c.tp); cur.put("wc", c.wc == null ? 3 : c.wc); if (c.fl != null) cur.put("fl", c.fl); if (c.rh != null) cur.put("rh", c.rh);
        o.put("cur", cur);
        Day td = null; for (Day d : main.days) if (d.d.equals(today)) td = d;
        if (td == null && !main.days.isEmpty()) td = main.days.get(0);
        JSONObject t = new JSONObject();
        if (td != null) { t.put("mx", td.mx); t.put("mn", td.mn); if (td.pop != null) t.put("pop", td.pop); if (td.pr != null) t.put("pr", td.pr); }
        o.put("today", t);
        JSONArray hs = new JSONArray();
        for (Hour h : main.hours) {
            if (h.k.compareTo(nk) < 0) continue;
            JSONObject x = new JSONObject(); x.put("k", h.k); x.put("tp", h.tp); x.put("wc", h.wc == null ? 3 : h.wc); if (h.pop != null) x.put("pop", h.pop); if (h.pr != null) x.put("pr", h.pr);
            hs.put(x); if (hs.length() >= 24) break;
        }
        o.put("hours", hs);
        JSONArray ds = new JSONArray();
        for (Day d : main.days) {
            if (d.d.compareTo(today) < 0) continue;
            JSONObject x = new JSONObject(); x.put("d", d.d); x.put("wc", d.wc == null ? 3 : d.wc); x.put("mx", d.mx); x.put("mn", d.mn); if (d.pop != null) x.put("pop", d.pop); if (d.pr != null) x.put("pr", d.pr);
            ds.put(x); if (ds.length() >= 7) break;
        }
        o.put("days", ds);
        JSONArray cmp = new JSONArray();
        for (int i = 0; i < 5; i++) {
            JSONObject x = new JSONObject();
            x.put("n", SRC_NAMES[i]); x.put("color", SRC_COLORS[i]);
            Fc f = res[i];
            if (f != null && f.cur != null) {
                x.put("tp", f.cur.tp); x.put("wc", f.cur.wc == null ? 3 : f.cur.wc);
                Day d = null; for (Day z : f.days) if (z.d.equals(today)) d = z;
                if (d != null) {
                    x.put("mx", d.mx); x.put("mn", d.mn);
                    if (d.pop != null) x.put("rain", d.pop + "%"); else if (d.pr != null) x.put("rain", d.pr < 0.05 ? "0㎜" : (Math.round(d.pr * 10) / 10.0) + "㎜");
                }
            }
            cmp.put(x);
        }
        o.put("cmp", cmp);
        return o;
    }
}

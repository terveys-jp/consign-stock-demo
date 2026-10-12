// 流動在庫 最適配分ダッシュボード（デモ）2026-10-12
// 画面は4つ（全体／需要予測／配置と振り替え／予実と要因）。#overview などで切り替える。
// ?nologin=1 を付けて開くとログイン画面を飛ばす（画面写真を撮るとき用）。数字はすべて data.js（model.py が書き出す）から読む。
(function () {
  var D = window.D19;
  var app = document.getElementById("app");
  var TABS = [
    ["overview", "全体"],
    ["forecast", "需要予測"],
    ["placement", "配置と振り替え"],
    ["yoy", "予実と要因"]
  ];
  var C = { now: "#9aa8b6", opt: "#0f7c76", navy: "#14365d", grid: "#e6ebf0", text: "#5d6d7e", bad: "#b03a2e", band: "rgba(15,124,118,.16)" };
  var pickH = null;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmt(n) { return Math.round(Number(n)).toLocaleString("ja-JP"); }
  function fmt1(n) { return Number(n).toLocaleString("ja-JP", { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
  function signed(n, unit) { var r = Math.round(n); return (r > 0 ? "＋" : r < 0 ? "−" : "±") + fmt(Math.abs(r)) + (unit || ""); }
  // 今→最適化の変化。lowerBetter＝下がるほうが良い指標。3%未満の変化は「ほぼ同じ」の色にする
  function chg(a, b, lowerBetter) {
    if (!a) return "";
    var p = (b - a) / a * 100, r = Math.round(p);
    var cls = Math.abs(p) < 3 ? "flat" : ((p < 0) === lowerBetter ? "good" : "bad");
    return '<span class="' + cls + '">' + (r > 0 ? "＋" : r < 0 ? "−" : "±") + Math.abs(r) + "%</span>";
  }
  function sum(a) { return a.reduce(function (x, y) { return x + y; }, 0); }
  function cumsum(a) { var s = 0; return a.map(function (v) { s += v; return s; }); }

  function authed() { try { return sessionStorage.getItem("csd-auth") === "1"; } catch (e) { return false; } }
  function setAuthed() { try { sessionStorage.setItem("csd-auth", "1"); } catch (e) {} }

  // ---------- ログイン ----------
  function viewLogin() {
    app.innerHTML =
      '<div class="login"><form class="login-card" id="loginForm">' +
      '<span class="badge">デモ・架空のデータ</span>' +
      "<h1>流動在庫 最適配分ダッシュボード</h1>" +
      '<p class="sub">' + esc(D.company) + "（架空）様　需要予測 × 数理最適化</p>" +
      '<div class="field"><label for="uid">ID</label><input id="uid" value="demo@example.com" readonly></div>' +
      '<div class="field"><label for="pw">パスワード</label><input id="pw" type="password" value="demo1234" readonly></div>' +
      '<button class="btn" type="submit">ログイン</button>' +
      '<p class="login-note">デモ用の ID とパスワードは入力済みです。このデモの会社・病院・製品・数字はすべて架空です。</p>' +
      "</form></div>";
    document.getElementById("loginForm").addEventListener("submit", function (e) {
      e.preventDefault();
      setAuthed();
      if (!location.hash) location.hash = "#overview";
      render();
    });
  }

  // ---------- 共通の枠 ----------
  function header(tab) {
    var tabs = TABS.map(function (t) {
      return '<button class="tab' + (t[0] === tab ? " on" : "") + '" data-tab="' + t[0] + '">' + t[1] + "</button>";
    }).join("");
    return '<header class="topbar"><div class="topbar-in">' +
      '<div class="brand"><h1>流動在庫 最適配分ダッシュボード</h1><span class="badge">デモ・架空のデータ</span></div>' +
      '<p class="brand-sub">' + esc(D.company) + "（架空）　病院 " + D.hospitals.length + " か所 × 製品 " + D.products.length +
      " 種類（循環器のカテーテル類）　｜　使った分を補充する在庫（使用補充）</p>" +
      '<nav class="tabs">' + tabs + "</nav></div></header>";
  }
  function footer() {
    return "<footer>このデモの会社・病院・製品・数字はすべて架空です。実際のご支援では、御社の使用（補充）・在庫・出荷のデータをつないで、同じ画面をつくります。<br>" +
      "作成：Terveys Technology Solutions 日本支店（2026年10月）</footer>";
  }
  function kpi(label, val, unit, was, wasTxt, lowerBetter) {
    return '<div class="kpi"><div class="k">' + esc(label) + '</div><div class="v num">' + val + "<small>" + esc(unit) + "</small></div>" +
      (was == null ? "" : '<div class="d">' + chg(was.a, was.b, lowerBetter) + ' <span class="was">' + esc(wasTxt) + "</span></div>") + "</div>";
  }

  // ---------- グラフ（線） ----------
  function niceStep(span, n) {
    var raw = span / n, p = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  function lineChart(id, o) {
    var box = document.getElementById(id);
    if (!box) return;
    var W = Math.max(280, Math.min(1080, box.clientWidth)), H = o.h || (W < 500 ? 210 : 240);
    var m = { l: 46, r: 12, t: 22, b: 26 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b, n = o.labels.length;
    var vals = [];
    o.series.forEach(function (se) { se.values.forEach(function (v) { if (v != null) vals.push(v); }); });
    if (o.band) o.band.hi.forEach(function (v) { vals.push(v); });
    var vmax = Math.max.apply(null, vals);
    var step = niceStep(vmax || 1, 4), y1 = Math.ceil(vmax / step) * step || step;
    function X(i) { return m.l + (n === 1 ? iw / 2 : iw * i / (n - 1)); }
    function Y(v) { return m.t + ih - ih * v / y1; }
    var fs = W < 500 ? 10 : 11;
    var s = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(o.aria || "") + '">';
    for (var v = 0; v <= y1 + 1e-9; v += step) {
      var y = Y(v);
      s += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y + '" y2="' + y + '" stroke="' + C.grid + '"/>';
      s += '<text x="' + (m.l - 6) + '" y="' + (y + 4) + '" font-size="' + fs + '" fill="' + C.text + '" text-anchor="end">' + fmt(v) + "</text>";
    }
    if (o.unit) s += '<text x="' + (m.l - 6) + '" y="' + (m.t - 9) + '" font-size="' + fs + '" fill="' + C.text + '" text-anchor="end">' + esc(o.unit) + "</text>";
    var every = Math.max(1, Math.ceil(n / (W < 500 ? 5 : 9)));
    for (var i = 0; i < n; i += every) {
      s += '<text x="' + X(i) + '" y="' + (H - 8) + '" font-size="' + fs + '" fill="' + C.text + '" text-anchor="middle">' + esc(o.labels[i]) + "</text>";
    }
    if (o.band) {
      var up = [], dn = [];
      for (var j = 0; j < n; j++) { up.push(X(j) + "," + Y(o.band.hi[j])); dn.unshift(X(j) + "," + Y(o.band.lo[j])); }
      s += '<polygon points="' + up.concat(dn).join(" ") + '" fill="' + C.band + '" stroke="none"/>';
    }
    if (o.mark) {
      var mx = X(o.mark.index), right = mx > W - 140;
      s += '<line x1="' + mx + '" x2="' + mx + '" y1="' + (m.t - 6) + '" y2="' + (m.t + ih) + '" stroke="' + C.bad + '" stroke-dasharray="4 3"/>';
      s += '<text x="' + (right ? mx - 5 : mx + 5) + '" y="' + (m.t - 9) + '" font-size="' + fs + '" fill="' + C.bad + '" text-anchor="' + (right ? "end" : "start") + '">' + esc(o.mark.label) + "</text>";
    }
    o.series.forEach(function (se) {
      var seg = [], segs = [];
      se.values.forEach(function (v, k) {
        if (v == null) { if (seg.length) segs.push(seg); seg = []; } else seg.push(X(k) + "," + Y(v));
      });
      if (seg.length) segs.push(seg);
      segs.forEach(function (sg) {
        s += '<polyline points="' + sg.join(" ") + '" fill="none" stroke="' + se.color + '" stroke-width="' + (se.width || 2.2) + '" stroke-linejoin="round"' +
          (se.dash ? ' stroke-dasharray="' + se.dash + '"' : "") + "/>";
      });
      if (se.dots) se.values.forEach(function (v, k) {
        if (v != null) s += '<circle cx="' + X(k) + '" cy="' + Y(v) + '" r="' + (W < 500 ? 2 : 2.5) + '" fill="' + se.color + '"><title>' + esc(o.labels[k]) + "　" + esc(se.name) + " " + fmt(v) + "</title></circle>";
      });
    });
    s += "</svg>";
    box.innerHTML = s;
  }
  // ---------- グラフ（並べた棒） ----------
  function barChart(id, o) {
    var box = document.getElementById(id);
    if (!box) return;
    var W = Math.max(280, Math.min(1080, box.clientWidth)), H = W < 500 ? 210 : 240;
    var m = { l: 52, r: 10, t: 22, b: 26 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b, n = o.labels.length, k = o.series.length;
    var vmax = Math.max.apply(null, o.series.map(function (se) { return Math.max.apply(null, se.values); }));
    var step = niceStep(vmax, 4), y1 = Math.ceil(vmax / step) * step;
    var slot = iw / n, bw = Math.min(30, slot * 0.72 / k), fs = W < 500 ? 10 : 11;
    var s = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(o.aria || "") + '">';
    for (var v = 0; v <= y1 + 1e-9; v += step) {
      var y = m.t + ih - ih * v / y1;
      s += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y + '" y2="' + y + '" stroke="' + C.grid + '"/>';
      s += '<text x="' + (m.l - 6) + '" y="' + (y + 4) + '" font-size="' + fs + '" fill="' + C.text + '" text-anchor="end">' + fmt(v) + "</text>";
    }
    if (o.unit) s += '<text x="' + (m.l - 6) + '" y="' + (m.t - 9) + '" font-size="' + fs + '" fill="' + C.text + '" text-anchor="end">' + esc(o.unit) + "</text>";
    for (var i = 0; i < n; i++) {
      var cx = m.l + slot * i + slot / 2;
      o.series.forEach(function (se, q) {
        var h = ih * se.values[i] / y1, x = cx - bw * k / 2 + bw * q;
        s += '<rect x="' + (x + 1) + '" y="' + (m.t + ih - h) + '" width="' + (bw - 2) + '" height="' + h + '" rx="2" fill="' + se.color + '"><title>' +
          esc(o.labels[i]) + "　" + esc(se.name) + " " + fmt(se.values[i]) + esc(o.unit || "") + "</title></rect>";
      });
      s += '<text x="' + cx + '" y="' + (H - 8) + '" font-size="' + fs + '" fill="' + C.text + '" text-anchor="middle">' + esc(o.labels[i]) + "</text>";
    }
    s += "</svg>";
    box.innerHTML = s;
  }

  // ---------- 全体 ----------
  function viewOverview() {
    var n = D.policies.now, o = D.policies.opt, a = D.alt.opt;
    var costRows = [["今のやり方", n], ["予測＋最適化", o]];
    var cmax = Math.max(n.total_cost, o.total_cost);
    var costs = costRows.map(function (r) {
      var x = r[1];
      function seg(cls, v, name) { return '<div class="cost-seg ' + cls + '" style="width:' + (v / cmax * 100).toFixed(2) + '%" title="' + name + " " + fmt(v) + '万円"></div>'; }
      return '<div class="cost-row"><div class="cost-name">' + r[0] + '</div><div class="cost-track">' +
        seg("c-short", x.cost_short, "欠品") + seg("c-hold", x.cost_hold, "保管") + seg("c-exp", x.cost_exp, "期限切れ") + seg("c-move", x.cost_move, "振り替え") +
        '</div><div class="cost-val num">' + fmt(x.total_cost) + "万円</div></div>";
    }).join("");
    return '<p class="lead">病院に置いている在庫（使った分を補充する流動在庫）を、今のやり方と「需要予測＋数理最適化」で、' + esc(D.periods.bt) +
      "について試算して比べました。置く在庫の総額の上限は、今の定数の合計額と同じにしています。</p>" +
      '<p class="period"><span>試算の期間　<b>' + esc(D.periods.bt) + "</b></span><span>置く在庫の総額の上限　<b>" + fmt(D.budget.value) +
      "万円</b>（今の定数の合計額と同じ）</span><span>棚の広さ　<b>病院ごとに今の定数の合計本数の" + D.budget.cap_f + "倍</b></span></p>" +
      '<div class="kpis">' +
      kpi("欠品（使いたい時に無かった本数）", fmt(o.short), "本", { a: n.short, b: o.short }, "今 " + fmt(n.short) + "本", true) +
      kpi("欠品が出た回数（病院×製品×週）", fmt(o.short_events), "回", { a: n.short_events, b: o.short_events }, "今 " + fmt(n.short_events) + "回", true) +
      kpi("期限切れ（金額）", fmt(o.expired_v), "万円", { a: n.expired_v, b: o.expired_v }, "今 " + fmt(n.expired_v) + "万円", true) +
      kpi("在庫の金額（各週の終わりの平均）", fmt(o.avg_inv), "万円", { a: n.avg_inv, b: o.avg_inv }, "今 " + fmt(n.avg_inv) + "万円", true) +
      kpi("費用の合計（欠品・保管・期限切れ・振り替え）", fmt(o.total_cost), "万円", { a: n.total_cost, b: o.total_cost }, "今 " + fmt(n.total_cost) + "万円", true) +
      "</div>" +
      '<section class="card"><h2>比べた2つのやり方</h2><div class="ways">' +
      '<div class="way"><h3>今のやり方</h3><ul><li>年に1回、前年度（2025年4月〜2026年3月）の平均の3週分を、病院×製品ごとの「定数」に決める（最低2本）</li>' +
      "<li>毎週、使った分を定数まで補充する</li><li>期限の近い在庫の振り替えは担当者の判断（この試算では行わない）</li></ul></div>" +
      '<div class="way opt"><h3>予測＋最適化</h3><ol><li>毎週、病院×製品ごとに来週の使用本数を予測する（幅つき）</li>' +
      "<li>置く在庫の総額の上限と病院ごとの棚の広さの中で、欠品・保管・期限切れの費用の見込みが最も小さくなる本数を、数理最適化で決めて補充する</li>" +
      "<li>期限まで7週未満で、その病院では使い切れない在庫を、近くの地域で使い切れる病院へ振り替える</li></ol></div>" +
      "</div></section>" +
      '<div class="grid2">' +
      '<section class="card"><h2>週ごとの在庫の金額</h2><p class="hint">各週の使用のあとに残っている在庫の金額です。</p>' +
      '<div class="legend"><span><span class="legend-line" style="border-color:' + C.now + '"></span>今のやり方</span><span><span class="legend-line" style="border-color:' + C.opt + '"></span>予測＋最適化</span></div>' +
      '<div id="invChart"></div></section>' +
      '<section class="card"><h2>欠品の累計</h2><p class="hint">4月からの欠品の本数を積み上げたものです。</p>' +
      '<div class="legend"><span><span class="legend-line" style="border-color:' + C.now + '"></span>今のやり方</span><span><span class="legend-line" style="border-color:' + C.opt + '"></span>予測＋最適化</span></div>' +
      '<div id="shortChart"></div></section></div>' +
      '<section class="card" style="margin-top:16px"><h2>費用の内訳（半年の合計）</h2>' +
      '<div class="legend"><span><span class="legend-dot c-short"></span>欠品</span><span><span class="legend-dot c-hold"></span>保管</span>' +
      '<span><span class="legend-dot c-exp"></span>期限切れ</span><span><span class="legend-dot c-move"></span>振り替え</span></div>' +
      costs +
      '<p class="note">上限を今の' + Math.round(D.alt.f * 100) + "%（" + fmt(D.budget.par_value * D.alt.f) + "万円）に下げた場合は、欠品 " + fmt(a.short) + "本・期限切れ " +
      fmt(a.expired_v) + "万円・在庫の金額 " + fmt(a.avg_inv) + "万円・費用 " + fmt(a.total_cost) + "万円でした。在庫の金額を" +
      Math.round((1 - a.avg_inv / n.avg_inv) * 100) + "%下げても、欠品は今（" + fmt(n.short) + "本）と同じくらいです。</p></section>" +
      '<section class="card"><h2>試算の前提</h2><dl class="defs">' +
      "<dt>データ</dt><dd>架空の病院20か所・製品10種類の、" + esc(D.periods.hist) + "の週ごとの使用本数。症例数の増減・医師の使い分けの変化・論文の公表・季節・休みの週・使用量の波を入れて作りました。</dd>" +
      "<dt>試算のしかた</dt><dd>毎週「補充 → その週の使用 → 期限切れ」を順に計算し、2つのやり方を同じ使用の実績で比べています。予測には、その時点までに分かっているデータだけを使っています。</dd>" +
      "<dt>欠品の費用</dt><dd>" + esc(D.costs.short) + "（緊急配送・手技の遅れ・他社品への置き換え）</dd>" +
      "<dt>保管の費用</dt><dd>" + esc(D.costs.hold) + "</dd>" +
      "<dt>期限切れの費用</dt><dd>" + esc(D.costs.expire) + "</dd>" +
      "<dt>振り替えの費用</dt><dd>" + esc(D.costs.move) + "</dd>" +
      "</dl></section>";
  }
  function drawOverview() {
    var w = D.weekly;
    lineChart("invChart", { labels: w.labels, unit: "万円", aria: "週ごとの在庫の金額",
      series: [{ name: "今のやり方", values: w.now.inv, color: C.now }, { name: "予測＋最適化", values: w.opt.inv, color: C.opt }] });
    lineChart("shortChart", { labels: w.labels, unit: "本", aria: "欠品の累計",
      series: [{ name: "今のやり方", values: cumsum(w.now.short), color: C.now }, { name: "予測＋最適化", values: cumsum(w.opt.short), color: C.opt }] });
  }

  // ---------- 需要予測 ----------
  function viewForecast() {
    var f = D.forecast, ex0 = f.examples[0], last = ex0.fc.length - 1;
    var lv = f.levels.map(function (x) {
      var better = x.ai < x.naive - 0.5, same = Math.abs(x.ai - x.naive) <= 0.5;
      return "<tr><td>" + esc(x.level) + '</td><td class="r num"><b>' + fmt1(x.ai) + '%</b></td><td class="r num">' + fmt1(x.naive) + "%</td>" +
        '<td class="c">' + (better ? '<span class="pill up">AI が小さい</span>' : same ? '<span class="pill">ほぼ同じ</span>' : '<span class="pill">移動平均が小さい</span>') + "</td></tr>";
    }).join("");
    var exs = f.examples.map(function (x, i) {
      return '<div class="ex"><p class="ex-title">' + esc(x.hosp) + "<small>" + esc(x.prod) + '</small></p><p class="ex-note">' + esc(x.note || "") + "</p>" +
        '<div id="ex' + i + '"></div></div>';
    }).join("");
    var big = f.importance.filter(function (x) { return x.share >= 1; });
    var small = f.importance.filter(function (x) { return x.share < 1; });
    var mx = Math.max.apply(null, big.map(function (x) { return x.share; }));
    var imp = big.map(function (x) {
      return '<div class="imp-row"><div class="imp-name">' + esc(x.name) + '</div><div><div class="imp-bar" style="width:' + (x.share / mx * 100).toFixed(1) +
        '%"></div></div><div class="imp-val num">' + fmt1(x.share) + "%</div></div>";
    }).join("");
    var s = f.select;
    return '<p class="lead">病院×製品ごとに、来週の使用本数を予測します。1症例あたりの使用本数を機械学習で予測し、病院ごとの予定の症例数を掛けます。予測は1つの数ではなく、幅（ばらつき）で持ちます。</p>' +
      '<div class="kpis">' +
      kpi("来週（" + D.periods.next + "）の予測・会社全体", fmt(ex0.fc[last]), "本", null) +
      kpi("80%の幅（会社全体）", fmt(ex0.lo[last]) + "〜" + fmt(ex0.hi[last]), "本", null) +
      kpi("予測の外れ（製品×月）", fmt1(f.levels[1].ai), "%", null) +
      kpi("予測の外れ（病院×月）", fmt1(f.levels[2].ai), "%", null) +
      "</div>" +
      '<section class="card"><h2>予測の外れ（' + esc(D.periods.bt) + "）</h2>" +
      '<p class="hint">外れ＝（実績と予測の差の合計）÷（実績の合計）。比べる相手は、直近8週の平均（移動平均）です。</p>' +
      '<div class="tablewrap"><table><thead><tr><th>集計の単位</th><th class="r">AI の予測</th><th class="r">直近8週の平均</th><th class="c">比べると</th></tr></thead><tbody>' +
      lv + "</tbody></table></div>" +
      '<p class="note">細かい単位ほど偶然のばらつきが大きく、どの方法でも外れが大きくなります。このため置く本数は、予測の幅まで含めて最適化で決めています（「配置と振り替え」）。</p></section>' +
      '<section class="card"><h2>予測の見本</h2>' +
      '<div class="legend"><span><span class="legend-line" style="border-color:' + C.opt + '"></span>予測</span><span><span class="legend-band"></span>80%の幅</span>' +
      '<span><span class="legend-dot" style="background:' + C.navy + ';border-radius:50%"></span>実績</span><span>週ごとの本数。最後の点は来週の予測です。</span></div>' +
      '<div class="ex-grid">' + exs + "</div></section>" +
      '<section class="card"><h2>予測に効いている要因</h2>' +
      '<p class="hint">機械学習の部分で、その要因の値をでたらめに入れ替えたときに、予測の外れがどれだけ増えるかの割合です。</p>' + imp +
      (small.length ? '<p class="note">ほぼ0%：' + small.map(function (x) { return esc(x.name); }).join("・") +
        "。「論文の公表」（公表からの週数）は、学習の期間に公表後の8週分しかなく、予測にはほとんど使われていません。公表のあとの増加は直近の使用実績を通して予測に入るため、遅れが出ます（全病院のバルーン J は、4〜6月の予測が実績を約13%下回りました）。</p>" : "") +
      "</section>" +
      '<section class="card"><h2>予測のつくり方</h2><dl class="defs">' +
      "<dt>予測するもの</dt><dd>1症例あたりの使用本数（病院×製品×週）。これに病院ごとの予定の症例数を掛けて本数にします。予定の症例数は前もって分かっているものとしました（このデモの前提）。</dd>" +
      "<dt>モデル</dt><dd>" + esc(f.model) + "</dd>" +
      "<dt>使う情報（" + f.features + "項目）</dt><dd>病院・製品／前週・直近4週・8週・13週・26週の使用率／去年の同じ時期の使用率／製品の使い分け（同じ分類の中の割合）／季節・休みの週／論文の公表からの週数／時間</dd>" +
      "<dt>学習の期間</dt><dd>" + esc(D.periods.train) + "（" + fmt(f.train_rows) + "行）</dd>" +
      "<dt>設定の選び方</dt><dd>" + s.n + "通りの設定を、" + esc(D.periods.val) + "（検証の期間）の外れで比べ、最も外れが小さいものを使いました＝" + esc(s.text) +
      "。試算の期間の結果では選んでいません。</dd>" +
      "<dt>予測の幅</dt><dd>負の二項分布で表し、ばらつきの大きさは検証の期間の外れから推定しました。80%の幅＝下から10%〜90%の範囲です。</dd>" +
      "</dl></section>";
  }
  function drawForecast() {
    D.forecast.examples.forEach(function (x, i) {
      lineChart("ex" + i, { labels: x.weeks, unit: "本", aria: x.hosp + " " + x.prod + " の予測と実績", h: 220,
        band: { lo: x.lo, hi: x.hi }, mark: { index: x.bt_start, label: "試算の期間" },
        series: [{ name: "予測", values: x.fc, color: C.opt }, { name: "実績", values: x.actual, color: C.navy, width: 1, dots: true }] });
    });
  }

  // ---------- 配置と振り替え ----------
  function viewPlacement() {
    var nx = D.next, hs = nx.by_hosp;
    if (pickH == null) {
      pickH = 0;
      hs.forEach(function (h, i) { if (h.add_total > hs[pickH].add_total) pickH = i; });
    }
    var addAll = sum(hs.map(function (h) { return h.add_total; }));
    var valAll = sum(hs.map(function (h) { return h.target_value; }));
    var mvAll = D.moves_hist, mvVal = sum(mvAll.map(function (x) { return x.value; }));
    var rows = hs.map(function (h, i) {
      return '<tr class="click' + (i === pickH ? " sel" : "") + '" data-h="' + i + '"><td class="nw"><b>' + esc(h.hosp) + '</b><div class="sub">' + esc(h.type) + "・" + esc(h.area) + "</div></td>" +
        '<td class="r num">' + fmt(h.on_total) + '</td><td class="r num"><b>' + fmt(h.target_total) + '</b><div class="sub">今の定数 ' + fmt(h.par_total) + "</div></td>" +
        '<td class="r num"><b>' + fmt(h.add_total) + '</b></td><td class="r num">' + fmt(h.target_value) + '<div class="sub">今の定数 ' + fmt(h.par_value) + "</div></td>" +
        '<td class="r num">' + fmt(h.cap) + "</td></tr>";
    }).join("");
    var hp = hs[pickH];
    var opts = hs.map(function (h, i) { return '<option value="' + i + '"' + (i === pickH ? " selected" : "") + ">" + esc(h.hosp) + "</option>"; }).join("");
    var prows = hp.rows.map(function (r) {
      var d = r.target - r.par;
      return "<tr><td>" + esc(r.prod) + '</td><td class="r num">' + fmt1(r.fc) + '</td><td class="r num">' + fmt(r.on) + '</td><td class="r num"><b>' + fmt(r.target) +
        '</b></td><td class="r num">' + (r.add ? "<b>" + fmt(r.add) + "</b>" : "0") + '</td><td class="r num">' + fmt(r.par) +
        (d ? ' <span class="sub">(' + (d > 0 ? "＋" : "−") + Math.abs(d) + ")</span>" : "") + "</td></tr>";
    }).join("");
    var mrows = mvAll.map(function (x) {
      return '<tr><td class="nw">' + esc(x.week) + '</td><td class="nw">' + esc(x.from) + '<span class="arrow">→</span>' + esc(x.to) + "</td><td>" + esc(x.prod) +
        '</td><td class="r num">' + x.n + '本</td><td class="r num">' + x.weeks + '週</td><td class="r num">' + fmt1(x.value) + "万円</td></tr>";
    }).join("");
    var kh = D.hosp_kpi.map(function (k) {
      function pair(a, b, u, dig) { var f = dig ? fmt1 : fmt; return '<td class="r num">' + f(a) + u + '<span class="arrow">→</span><b>' + f(b) + u + "</b></td>"; }
      return '<tr><td class="nw">' + esc(k.hosp) + "</td>" + pair(k.now.turn, k.opt.turn, "回", true) + pair(k.now.fill, k.opt.fill, "%", true) +
        pair(k.now.short, k.opt.short, "本") + pair(k.now.exp, k.opt.exp, "万円", true) + pair(k.now.avg_inv, k.opt.avg_inv, "万円") + "</tr>";
    }).join("");
    var m = D.milp;
    return '<p class="lead">来週（' + esc(D.periods.next) + "）に各病院へ置く本数と、補充する本数です。置く在庫の総額の上限と病院ごとの棚の広さの中で、" +
      "欠品・保管・期限切れの費用の見込みが最も小さくなる本数を、数理最適化で決めました。</p>" +
      '<div class="kpis">' +
      kpi("来週補充する本数（20病院の合計）", fmt(addAll), "本", null) +
      kpi("置く在庫の金額（来週）", fmt(valAll), "万円", null) +
      kpi("置く在庫の総額の上限", fmt(D.budget.value), "万円", null) +
      kpi("振り替え（試算の半年）", fmt(mvAll.length), "件", null) +
      "</div>" +
      '<section class="card"><h2>病院ごとの来週の指示</h2><p class="hint">行を押すと、下に製品ごとの内訳が出ます。「今の定数」は今のやり方で置いている本数です。</p>' +
      '<div class="tablewrap"><table class="wide"><thead><tr><th>病院</th><th class="r">今ある本数</th><th class="r">来週置く本数</th><th class="r">補充する本数</th>' +
      '<th class="r">置く在庫の金額（万円）</th><th class="r">棚の広さ（本）</th></tr></thead><tbody>' + rows + "</tbody></table></div></section>" +
      '<section class="card"><h2>製品ごとの内訳</h2>' +
      '<div class="pick"><label for="hsel">病院</label><select id="hsel">' + opts + '</select><span class="sub">' + esc(hp.type) + "・" + esc(hp.area) + "</span></div>" +
      '<div class="tablewrap"><table class="wide"><thead><tr><th>製品</th><th class="r">来週の予測（本）</th><th class="r">今ある本数</th><th class="r">来週置く本数</th><th class="r">補充する本数</th><th class="r">今の定数（差）</th></tr></thead><tbody>' +
      prows + "</tbody></table></div>" +
      '<p class="note">置く本数は、来週の予測そのものではなく、予測の幅と費用（欠品・保管・期限切れ）から決めます。使用の少ない製品ほど、予測に対して多めに置きます。上限の金額は、1万円あたりで費用の見込みを最も減らせる製品・病院から順に割り当てられます。</p></section>' +
      '<section class="card"><h2>期限の近い在庫の振り替え</h2>' +
      '<p class="hint">期限まで7週未満で、その病院では3週のうちに使い切れない見込みの在庫を、近くの地域で使い切れる病院へ回します。' +
      (D.next.moves.length ? "" : "来週は、期限まで7週未満の在庫が無いため、振り替えの指示はありません。") + "下は試算の半年に行った振り替え（" + mvAll.length + "件・" + fmt1(mvVal) + "万円分）です。</p>" +
      '<div class="tablewrap"><table class="wide"><thead><tr><th>週</th><th>振り替え元 → 先</th><th>製品</th><th class="r">本数</th><th class="r">期限まで</th><th class="r">金額</th></tr></thead><tbody>' +
      mrows + "</tbody></table></div></section>" +
      '<section class="card"><h2>最適化の中身</h2><dl class="defs">' +
      "<dt>決めること</dt><dd>来週、病院×製品ごとに置く本数。「k本目を置くかどうか」を0か1で表した変数 約" + fmt(m.target_vars) + "個</dd>" +
      "<dt>目的</dt><dd>費用の見込みの合計を最も小さくする＝保管の費用＋欠品の見込み＋期限切れの見込み（どちらも予測の幅から計算）</dd>" +
      "<dt>制約</dt><dd>置く在庫の総額が上限（" + fmt(D.budget.value) + "万円）以内・病院ごとの棚の広さ以内（制約の式 " + m.target_cons + "本）</dd>" +
      "<dt>振り替え</dt><dd>回す在庫の金額から振り替えの手間（1回 " + esc(D.costs.move.replace(/^.*）/, "")) + "）を引いたものを最も大きくする。送り元で使い切れない分だけ・送り先で使い切れる分だけ・近くの地域どうし・1週に8組まで" +
      "（変数 平均" + m.move_vars + "個・式 平均" + m.move_cons + "本）</dd>" +
      "<dt>解き方</dt><dd>混合整数計画（ソルバー HiGHS）。置く本数は1回 約" + fmt1(m.target_ms / 1000) + "秒、振り替えは1回 " + m.move_ms + "ミリ秒ほどで解けます（半年の試算で合わせて " + m.solves + "回解いています）。</dd>" +
      "</dl></section>" +
      '<section class="card"><h2>病院ごとの管理の指標（試算の半年・今 → 予測＋最適化）</h2>' +
      '<p class="hint">回転＝使った金額÷在庫の金額（1年あたり）。充足率＝使いたい本数のうち、その場に在庫があった割合。</p>' +
      '<div class="tablewrap"><table class="wider"><thead><tr><th>病院</th><th class="r">在庫の回転</th><th class="r">充足率</th><th class="r">欠品</th><th class="r">期限切れ</th><th class="r">在庫の金額（平均）</th></tr></thead><tbody>' +
      kh + "</tbody></table></div>" +
      (D.hosp_kpi_note ? '<p class="note">' + esc(D.hosp_kpi_note) + "</p>" : "") + "</section>";
  }

  // ---------- 予実と要因 ----------
  function viewYoy() {
    var y = D.yoy, bud = sum(y.by_month.map(function (x) { return x.budget; })), act = sum(y.by_month.map(function (x) { return x.actual; }));
    var fx = y.factors, mx = Math.max.apply(null, fx.map(function (x) { return Math.abs(x.value); }));
    var frows = fx.map(function (x) {
      var w = (Math.abs(x.value) / mx * 100).toFixed(1);
      return '<div class="div-row"><div class="div-name">' + esc(x.name) + '</div><div class="div-neg">' + (x.value < 0 ? '<div class="div-bar n" style="width:' + w + '%"></div>' : "") +
        '</div><div class="div-pos">' + (x.value > 0 ? '<div class="div-bar p" style="width:' + w + '%"></div>' : "") + '</div><div class="div-val num">' + signed(x.value, "万円") + "</div></div>";
    }).join("");
    var prows = y.by_product.map(function (r) {
      var d = r.actual - r.budget;
      return "<tr><td>" + esc(r.prod) + '</td><td class="r num">' + fmt(r.budget) + '</td><td class="r num">' + fmt(r.actual) + '</td><td class="r num"><b class="' +
        (d >= 0 ? "good" : "bad") + '">' + signed(d) + "</b></td><td>" + esc(r.main) + ' <span class="sub">' + signed(r.factors[r.main], "万円") + "</span></td></tr>";
    }).join("");
    return '<p class="lead">売上（使われた分の金額）を予算と比べ、差がどこから来たかを要因に分けます。予算は、前年の同じ週の実績×1.03 としています（このデモの置き方）。</p>' +
      '<div class="kpis">' +
      kpi("予算（" + esc(D.periods.bt.replace(/（.*$/, "")) + "）", fmt(bud), "万円", null) +
      kpi("実績", fmt(act), "万円", null) +
      kpi("実績−予算", signed(act - bud), "万円", null) +
      kpi("予算に対して", (act >= bud ? "＋" : "−") + fmt1(Math.abs(act / bud - 1) * 100), "%", null) +
      "</div>" +
      '<section class="card"><h2>月ごとの予算と実績</h2>' +
      '<div class="legend"><span><span class="legend-dot" style="background:#b4c0cc"></span>予算</span><span><span class="legend-dot" style="background:' + C.navy + '"></span>実績</span></div>' +
      '<div id="yoyChart"></div></section>' +
      '<section class="card"><h2>差の要因（半年の合計）</h2><p class="hint">左に伸びる棒は実績を下げた要因、右に伸びる棒は上げた要因です。</p>' + frows +
      '<div class="div-row total"><div class="div-name">実績−予算</div><div></div><div></div><div class="div-val num">' + signed(act - bud, "万円") + "</div></div>" +
      '<p class="note">分け方：1症例あたりの使用を機械学習で表し、症例数・製品の使い分け・論文の公表からの週数の値を、1つずつ前年の値から今年の値に入れ替えて差を求めました。' +
      "予算の上乗せ分は、予算を前年の実績より3%高く置いた分です。その他は、どの要因でも説明できない残り（偶然のばらつき・休みの週の位置など）です。</p></section>" +
      '<section class="card"><h2>製品ごとの予実</h2><p class="hint">差の主な要因＝予算の上乗せ分を除いて、金額がいちばん大きい要因です。単位は万円。</p>' +
      '<div class="tablewrap"><table class="wide"><thead><tr><th>製品</th><th class="r">予算</th><th class="r">実績</th><th class="r">差</th><th>差の主な要因</th></tr></thead><tbody>' +
      prows + "</tbody></table></div></section>";
  }
  function drawYoy() {
    var y = D.yoy;
    barChart("yoyChart", { labels: y.by_month.map(function (x) { return Number(x.month.slice(5)) + "月"; }), unit: "万円", aria: "月ごとの予算と実績",
      series: [{ name: "予算", values: y.by_month.map(function (x) { return x.budget; }), color: "#b4c0cc" },
               { name: "実績", values: y.by_month.map(function (x) { return x.actual; }), color: C.navy }] });
  }

  // ---------- 切り替え ----------
  function currentTab() {
    var t = (location.hash || "#overview").slice(1);
    for (var i = 0; i < TABS.length; i++) if (TABS[i][0] === t) return t;
    return "overview";
  }
  function draw(tab) {
    if (tab === "overview") drawOverview();
    if (tab === "forecast") drawForecast();
    if (tab === "yoy") drawYoy();
  }
  function render() {
    if (/[?&]nologin=1(&|$)/.test(location.search)) setAuthed();
    if (!authed()) return viewLogin();
    var tab = currentTab();
    var body = tab === "forecast" ? viewForecast() : tab === "placement" ? viewPlacement() : tab === "yoy" ? viewYoy() : viewOverview();
    app.innerHTML = header(tab) + "<main>" + body + "</main>" + footer();
    draw(tab);
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (b) {
      b.addEventListener("click", function () { location.hash = "#" + b.getAttribute("data-tab"); });
    });
    Array.prototype.forEach.call(document.querySelectorAll("tr[data-h]"), function (r) {
      r.addEventListener("click", function () { pickH = Number(r.getAttribute("data-h")); render(); });
    });
    var sel = document.getElementById("hsel");
    if (sel) sel.addEventListener("change", function () { pickH = Number(sel.value); render(); });
  }
  var rt;
  window.addEventListener("hashchange", function () { render(); window.scrollTo(0, 0); });
  window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { draw(currentTab()); }, 150); });
  render();
})();

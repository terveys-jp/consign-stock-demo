// 簡単版（index.html）の数字と指示の例を data.js から入れる。2026-10-13
// 補充の例＝来週の A大学病院 × 止血デバイス G、振り替えの例＝試算の半年の振り替えのうち金額が最も大きいもの
(function () {
  var D = window.D19;
  if (!D) return;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmt(n) { return Math.round(Number(n)).toLocaleString("ja-JP"); }
  function set(id, html) { var el = document.getElementById(id); if (el) el.innerHTML = html; }
  function hide(id) { var el = document.getElementById(id); if (el) el.style.display = "none"; }
  function weekLabel(w) { var p = String(w).split("/"); return p.length === 2 ? p[0] + "月" + p[1] + "日の週" : w; }

  var now = D.policies.now, opt = D.policies.opt;
  set("bt", esc(String(D.periods.bt).replace(/（.*?）/, "")));
  set("shortNow", fmt(now.short) + "本");
  set("shortOpt", fmt(opt.short) + "本");
  set("expNow", fmt(now.expired_v) + "万円");
  set("expOpt", fmt(opt.expired_v) + "万円");

  var h = (D.next && D.next.by_hosp || []).filter(function (x) { return x.hosp === "A大学病院"; })[0];
  var r = h && h.rows.filter(function (x) { return x.prod.indexOf("止血デバイス G") === 0; })[0];
  if (r && r.add > 0) {
    set("exRep", '<span class="s-tag">補充</span><span class="s-when">来週</span><b>' + esc(h.hosp) + "</b>：" + esc(r.prod) +
      "を<b>" + fmt(r.add) + "本</b>補充（いまの在庫 " + fmt(r.on) + "本 → " + fmt(r.target) + "本に）");
  } else {
    hide("exRep");
  }

  var mv = (D.moves_hist || []).slice().sort(function (a, b) { return b.value - a.value; })[0];
  if (mv) {
    set("exMove", '<span class="s-tag">振り替え</span><span class="s-when">' + esc(weekLabel(mv.week)) + "</span><b>" + esc(mv.from) + " → " + esc(mv.to) +
      "</b>：" + esc(mv.prod) + "を<b>" + fmt(mv.n) + "本</b>回す（<span class=\"s-nw\">期限まで" + fmt(mv.weeks) + "週</span>。" + esc(mv.from) + "では使い切れない見込み）");
  } else {
    hide("exMove");
  }
})();

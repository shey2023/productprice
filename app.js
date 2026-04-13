/**
 * מחשבון הצעת מחיר לתכשיט — לוגיקה פנימית.
 * PDF ללקוח: ללא פירוט עלויות — רק תיאור (אופציונלי) ומחיר סופי.
 */
"use strict";

/** @typedef {{ id: string, label: string, count: number, carat: number, price: number }} GemStone */
/** @typedef {{ id: string, label: string, amount: number }} DynCost */

const DENS = { gold14: 13.1, gold18: 15.6, silver: 10.49, platinum: 21.45 };
const MLBL = { gold14: "זהב 14K", gold18: "זהב 18K", silver: "כסף", platinum: "פלטינה" };
const JLBL = { ring: "טבעת", pendant: "תליון", bracelet: "צמיד", earrings: "עגילים", other: "אחר" };
const RDIAM = {
  1: 12.8, 2: 13.2, 3: 13.5, 4: 13.9, 5: 14.3, 6: 14.7, 7: 15.1, 8: 15.4, 9: 15.8, 10: 16.2,
  11: 16.6, 12: 16.9, 13: 17.3, 14: 17.7, 15: 18.1, 16: 18.5, 17: 18.8, 18: 19.2, 19: 19.6, 20: 20,
  21: 20.4, 22: 20.7, 23: 21.1, 24: 21.5, 25: 21.9, 26: 22.2, 27: 22.6, 28: 23, 29: 23.4, 30: 23.7,
  31: 24.1, 32: 24.5, 33: 24.9, 34: 25.2, 35: 25.6, 36: 26,
};
const HK = "jc_hist_v2";

/** @type {'ring'|'pendant'|'bracelet'|'earrings'|'other'} */
let jewType = "ring";

function jewLabel() {
  if (jewType === "other") {
    const t = ($("jewTypeOther").value || "").trim();
    return t || JLBL.other;
  }
  return JLBL[jewType] || JLBL.ring;
}

function updateJewOtherUi() {
  const on = jewType === "other";
  $("jewOtherWrap").classList.toggle("hidden", !on);
}
let useCalc = false;
/** @type {ReturnType<typeof calc>|null} */
let lastRes = null;
/** @type {DynCost[]} */
let dynCosts = [];
/** @type {GemStone[]} */
let gemStones = [];
let calcTimer = null;
/** @type {BeforeInstallPromptEvent|null} */
let deferredPrompt = null;
/** @type {'client'|'internal'} */
let pdfMode = "client";
/** @type {'uni'|'multi'} */
let diaMode = "uni";

const $ = (id) => {
  const el = document.getElementById(id);
  if (!el) throw new Error("Missing #" + id);
  return el;
};

const fmt = (n, d = 2) =>
  n === 0 ? "₪0" : "₪" + n.toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: d });
const fmtN = (n, d = 3) =>
  n.toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: d });

function uid() {
  return "x" + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
}

function smartRound(n) {
  if (n <= 0) return n;
  if (n < 500) return Math.ceil(n / 10) * 10;
  if (n < 2000) return Math.ceil(n / 50) * 50;
  if (n < 5000) return Math.ceil(n / 100) * 100;
  return Math.ceil(n / 500) * 500;
}

function calc() {
  const mt = $("metalType").value;
  const ppg = parseFloat($("pricePg").value) || 0;
  let wt = 0;
  let wSrc = "manual";
  let rDiam = 0;
  let rCirc = 0;
  let rVol = 0;
  const sz = parseInt($("rSize").value, 10) || 0;
  const rw = parseFloat($("rWidth").value) || 0;
  const rt = parseFloat($("rThick").value) || 0;

  if (useCalc && sz && rw && rt) {
    const dn = DENS[mt] || 13.1;
    rDiam = RDIAM[sz] || 0;
    rCirc = Math.PI * rDiam;
    rVol = rCirc * rw * rt;
    wt = (rVol / 1000) * dn;
    wSrc = "calc";
  } else {
    wt = parseFloat($("wManual").value) || 0;
  }
  const mCost = wt * ppg;

  const diaCount = parseInt($("diaCount").value, 10) || 0;
  const diaTotalCt = parseFloat($("diaTotalCt").value) || 0;
  const diaPrice = parseFloat($("diaPrice").value) || 0;
  const diaG1Count = parseInt($("diaG1Count").value, 10) || 0;
  const diaG1Ct = parseFloat($("diaG1Ct").value) || 0;
  const diaG1Price = parseFloat($("diaG1Price").value) || 0;
  const diaG2Count = parseInt($("diaG2Count").value, 10) || 0;
  const diaG2Ct = parseFloat($("diaG2Ct").value) || 0;
  const diaG2Price = parseFloat($("diaG2Price").value) || 0;
  const diaCombinedCt = diaG1Ct + diaG2Ct;

  let diaCost = 0;
  if (diaMode === "uni") {
    diaCost = diaTotalCt * diaPrice;
  } else {
    diaCost = diaG1Ct * diaG1Price + diaG2Ct * diaG2Price;
  }

  const gemTotal = gemStones.reduce((s, g) => s + (g.count || 0) * (g.carat || 0) * (g.price || 0), 0);
  const settingCost = parseFloat($("settingCost").value) || 0;
  const stoneCost = diaCost + gemTotal + settingCost;

  const lPack = parseFloat($("lPack").value) || 0;
  const lc = parseFloat($("lCast").value) || 0;
  const lModel = parseFloat($("lModel").value) || 0;
  const lp = parseFloat($("lPol").value) || 0;
  const lr = parseFloat($("lRhod").value) || 0;
  const complexity = parseFloat($("complexity").value) || 0;
  const dynTotal = dynCosts.reduce((s, c) => s + (c.amount || 0), 0);
  const lTot = lPack + lc + lModel + lp + lr + complexity + dynTotal;

  const sub = mCost + stoneCost + lTot;
  const pct = parseFloat($("profit").value) || 0;
  const prof = sub * (pct / 100);
  const final = sub + prof;

  return {
    wt,
    wSrc,
    rDiam,
    rCirc,
    rVol,
    mCost,
    diaMode,
    diaCount,
    diaTotalCt,
    diaPrice,
    diaG1Count,
    diaG1Ct,
    diaG1Price,
    diaG2Count,
    diaG2Ct,
    diaG2Price,
    diaCombinedCt,
    diaCost,
    gemTotal,
    gemStones: [...gemStones],
    settingCost,
    stoneCost,
    lPack,
    lc,
    lModel,
    lp,
    lr,
    complexity,
    dynTotal,
    dynCosts: [...dynCosts],
    lTot,
    sub,
    pct,
    prof,
    final,
    mt,
    ppg,
  };
}

function setDiaMode(mode) {
  diaMode = mode;
  const uni = mode === "uni";
  $("diaTabUni").classList.toggle("on", uni);
  $("diaTabMulti").classList.toggle("on", !uni);
  $("diaTabUni").setAttribute("aria-selected", uni ? "true" : "false");
  $("diaTabMulti").setAttribute("aria-selected", uni ? "false" : "true");
  $("diaPanelUni").classList.toggle("hidden", !uni);
  $("diaPanelMulti").classList.toggle("hidden", uni);
  $("diaHintUni").classList.toggle("hidden", !uni);
  $("diaHintMulti").classList.toggle("hidden", uni);
}

function updateDiaFormFeedback(r) {
  $("diaUniSubtotal").textContent = fmt(r.diaMode === "uni" ? r.diaCost : 0);
  $("diaCombinedCtDisp").textContent = fmtN(r.diaCombinedCt, 3);

  const lineEl = $("diaClientLine");
  if (r.diaMode === "uni") {
    if (r.diaCount > 0 || r.diaTotalCt > 0 || r.diaPrice > 0) {
      lineEl.textContent =
        "התכשיט משובץ ב-" +
        r.diaCount +
        " אבנים, במשקל כולל של " +
        fmtN(r.diaTotalCt, 3) +
        " קראט.\nעלות לפי " +
        fmtN(r.diaPrice, 0) +
        " ₪ לקראט.";
    } else {
      lineEl.textContent = "מלאו כמות אבנים, סה״כ קראט ומחיר לקראט — כאן יופיע ניסוח קצר להעתקה.";
    }
  } else if (r.diaG1Ct > 0 || r.diaG2Ct > 0 || r.diaG1Price > 0 || r.diaG2Price > 0) {
    lineEl.textContent =
      "מרכזית: " +
      fmtN(r.diaG1Ct, 3) +
      " קראט (" +
      fmtN(r.diaG1Price, 0) +
      " ₪/קראט). צדדיות: " +
      fmtN(r.diaG2Ct, 3) +
      " קראט (" +
      fmtN(r.diaG2Price, 0) +
      " ₪/קראט).\nסה״כ משקל: " +
      fmtN(r.diaCombinedCt, 3) +
      " קראט.";
  } else {
    lineEl.textContent =
      "מלאו משקל ומחיר לקראט לכל קבוצה — כאן יופיע ניסוח לפי שתי הקבוצות וסה״כ המשקל המשולב.";
  }
}

function scheduleCalc() {
  clearTimeout(calcTimer);
  calcTimer = setTimeout(() => {
    const r = calc();
    updateDiaFormFeedback(r);
    const hasData = r.mCost > 0 || r.stoneCost > 0 || r.lTot > 0;
    if (hasData) {
      lastRes = r;
      renderRes(r);
    } else {
      lastRes = null;
      $("resEmpty").classList.remove("hidden");
      $("resContent").classList.add("hidden");
    }
  }, 120);
}

function updateProfitUI(pct) {
  const warn = $("profitWarn");
  const badge = $("profitBadge");
  const txt = $("profitWarnTxt");
  badge.classList.remove("hidden");
  if (pct < 10) {
    warn.classList.add("show");
    txt.textContent = "הרווח נמוך מאוד — מומלץ לפחות 20%";
    badge.className = "profit-badge pb-red";
    badge.textContent = "רווח נמוך ⚠";
    document.documentElement.style.setProperty("--profit-color", "#A32D2D");
  } else if (pct < 20) {
    warn.classList.add("show");
    txt.textContent = "רווח גבולי — שקול להעלות";
    badge.className = "profit-badge pb-orange";
    badge.textContent = "רווח גבולי";
    document.documentElement.style.setProperty("--profit-color", "#BA7517");
  } else {
    warn.classList.remove("show");
    badge.className = "profit-badge pb-green";
    badge.textContent = "רווח טוב ✓";
    document.documentElement.style.setProperty("--profit-color", "#27500A");
  }
}

function mkRow(label, value, sub, cls) {
  const d = document.createElement("div");
  d.className = "brow" + (sub ? " sub" : "");
  const ll = document.createElement("span");
  ll.className = "brow-l";
  ll.textContent = label;
  const vv = document.createElement("span");
  vv.className = "brow-v" + (cls ? " " + cls : "");
  vv.textContent = value;
  d.appendChild(ll);
  d.appendChild(vv);
  return d;
}

function mkDotRow(label, value, dotColor, cls) {
  const d = document.createElement("div");
  d.className = "brow";
  const ll = document.createElement("span");
  ll.className = "brow-l";
  const dot = document.createElement("span");
  dot.className = "brow-dot";
  dot.style.background = dotColor;
  ll.appendChild(dot);
  ll.appendChild(document.createTextNode(label));
  const vv = document.createElement("span");
  vv.className = "brow-v" + (cls ? " " + cls : "");
  vv.textContent = value;
  d.appendChild(ll);
  d.appendChild(vv);
  return d;
}

function updateComplexityChip(r) {
  const chip = $("complexityChip");
  if (!r.complexity) {
    chip.style.display = "none";
    chip.textContent = "";
    return;
  }
  chip.style.display = "flex";
  chip.classList.remove("low", "high");
  if (r.complexity <= 120) {
    chip.classList.add("low");
    chip.textContent = "מורכבות: בינונית ומטה";
  } else {
    chip.classList.add("high");
    chip.textContent = "מורכבות: גבוהה — ודא תמחור";
  }
}

function renderRes(r) {
  $("resEmpty").classList.add("hidden");
  $("resContent").classList.remove("hidden");
  updateProfitUI(r.pct);
  updateComplexityChip(r);

  const bd = $("resBD");
  bd.replaceChildren();

  bd.appendChild(mkDotRow("מתכת (" + MLBL[r.mt] + ")", fmt(r.mCost), "#C9A84C", "cost"));
  if (r.wt > 0) {
    const wNote = r.wSrc === "calc" ? "משקל מחושב" : "משקל";
    bd.appendChild(
      mkRow(wNote + " · " + fmtN(r.wt, 2) + " גרם · " + fmtN(r.ppg, 2) + " ₪/ג׳", fmt(r.mCost), true, "cost")
    );
  }

  if (r.diaCost > 0) {
    bd.appendChild(mkDotRow("יהלומים", fmt(r.diaCost), "#3C3489", "cost"));
    if (r.diaMode === "uni") {
      bd.appendChild(
        mkRow(
          r.diaCount + " אבנים · סה״כ " + fmtN(r.diaTotalCt, 3) + " קראט · " + fmtN(r.diaPrice, 0) + " ₪/קראט",
          "—",
          true,
          "cost"
        )
      );
    } else {
      const l1 = r.diaG1Ct * r.diaG1Price;
      const l2 = r.diaG2Ct * r.diaG2Price;
      if (l1 > 0) {
        bd.appendChild(
          mkRow(
            "קבוצה 1 (מרכזית) · " +
              r.diaG1Count +
              " · " +
              fmtN(r.diaG1Ct, 3) +
              " קראט · " +
              fmtN(r.diaG1Price, 0) +
              " ₪/קראט",
            fmt(l1),
            true,
            "cost"
          )
        );
      }
      if (l2 > 0) {
        bd.appendChild(
          mkRow(
            "קבוצה 2 (צדדיות) · " +
              r.diaG2Count +
              " · " +
              fmtN(r.diaG2Ct, 3) +
              " קראט · " +
              fmtN(r.diaG2Price, 0) +
              " ₪/קראט",
            fmt(l2),
            true,
            "cost"
          )
        );
      }
      if (r.diaCombinedCt > 0) {
        bd.appendChild(mkRow("סה״כ משקל (Combined CT)", fmtN(r.diaCombinedCt, 3) + " קראט", true, "cost"));
      }
    }
  }
  if (r.gemTotal > 0) {
    bd.appendChild(mkDotRow("אבני חן (סה״כ)", fmt(r.gemTotal), "#3C3489", "cost"));
    r.gemStones.forEach((g) => {
      const line = (g.count || 0) * (g.carat || 0) * (g.price || 0);
      if (line <= 0) return;
      const name = (g.label || "אבן").trim() || "אבן";
      bd.appendChild(mkRow(name, fmt(line), true, "cost"));
    });
  }
  if (r.settingCost > 0) {
    bd.appendChild(mkRow("שיבוץ", fmt(r.settingCost), false, "cost"));
  }

  const labLines = [
    ["אריזה", r.lPack],
    ["הדפסה", r.lc],
    ["מודל 3D", r.lModel],
    ["ליטוש", r.lp],
    ["ציפוי", r.lr],
  ];
  labLines.forEach(([name, amt]) => {
    if (amt > 0) bd.appendChild(mkRow(name, fmt(amt), false, "cost"));
  });
  r.dynCosts.forEach((c) => {
    if ((c.amount || 0) > 0) bd.appendChild(mkRow(c.label || "עלות", fmt(c.amount), false, "cost"));
  });
  if (r.complexity > 0) {
    bd.appendChild(mkRow("תוספת מורכבות", fmt(r.complexity), false, "cost"));
  }

  const totals = $("resTotals");
  totals.replaceChildren();
  totals.appendChild(mkRow("עלות כוללת (לפני רווח)", fmt(r.sub), false, "normal"));
  totals.appendChild(mkRow("רווח " + r.pct + "%", fmt(r.prof), false, "profit-val"));

  const rounded = smartRound(r.final);
  const diff = rounded - r.final;
  $("totalLbl").textContent = "מחיר סופי (מעוגל)";
  $("totalVal").innerHTML = "";
  $("totalVal").appendChild(document.createTextNode(fmt(rounded)));
  if (Math.abs(diff) > 0.5) {
    const b = document.createElement("span");
    b.className = "rounded-badge";
    b.textContent = "לפני עיגול: " + fmt(r.final);
    $("totalVal").appendChild(b);
  }
  $("totalSub").textContent =
    diff > 0.5 ? "עיגול מעלה את המחיר ב־" + fmt(diff) + " לנוחות תמחור" : "";
}

/**
 * פירוט עלויות מלא ל-PDF פנימי (תואם ללוח התוצאות).
 * @param {(lab: string, val: string, sub?: boolean) => void} addPdfRow
 * @param {ReturnType<typeof calc>} r
 */
function renderInternalPdfCostBreakdown(r, addPdfRow) {
  addPdfRow("מתכת (" + MLBL[r.mt] + ")", fmt(r.mCost));
  if (r.wt > 0) {
    const wNote = r.wSrc === "calc" ? "משקל מחושב" : "משקל";
    addPdfRow(wNote + " · " + fmtN(r.wt, 2) + " גרם · " + fmtN(r.ppg, 2) + " ₪/ג׳", fmt(r.mCost), true);
  }

  if (r.diaCost > 0) {
    addPdfRow("יהלומים", fmt(r.diaCost));
    if (r.diaMode === "uni") {
      addPdfRow(
        r.diaCount +
          " אבנים · סה״כ " +
          fmtN(r.diaTotalCt, 3) +
          " קראט · " +
          fmtN(r.diaPrice, 0) +
          " ₪/קראט",
        "—",
        true
      );
    } else {
      const l1 = r.diaG1Ct * r.diaG1Price;
      const l2 = r.diaG2Ct * r.diaG2Price;
      if (l1 > 0) {
        addPdfRow(
          "קבוצה 1 (מרכזית) · " +
            r.diaG1Count +
            " · " +
            fmtN(r.diaG1Ct, 3) +
            " קראט · " +
            fmtN(r.diaG1Price, 0) +
            " ₪/קראט",
          fmt(l1),
          true
        );
      }
      if (l2 > 0) {
        addPdfRow(
          "קבוצה 2 (צדדיות) · " +
            r.diaG2Count +
            " · " +
            fmtN(r.diaG2Ct, 3) +
            " קראט · " +
            fmtN(r.diaG2Price, 0) +
            " ₪/קראט",
          fmt(l2),
          true
        );
      }
      if (r.diaCombinedCt > 0) {
        addPdfRow("סה״כ משקל (Combined CT)", fmtN(r.diaCombinedCt, 3) + " קראט", true);
      }
    }
  }

  if (r.gemTotal > 0) {
    addPdfRow("אבני חן (סה״כ)", fmt(r.gemTotal));
    r.gemStones.forEach((g) => {
      const line = (g.count || 0) * (g.carat || 0) * (g.price || 0);
      if (line <= 0) return;
      const name = (g.label || "אבן").trim() || "אבן";
      addPdfRow(name, fmt(line), true);
    });
  }

  if (r.settingCost > 0) addPdfRow("שיבוץ", fmt(r.settingCost));

  const labLines = [
    ["אריזה", r.lPack],
    ["הדפסה", r.lc],
    ["מודל 3D", r.lModel],
    ["ליטוש", r.lp],
    ["ציפוי", r.lr],
  ];
  labLines.forEach(([name, amt]) => {
    if (amt > 0) addPdfRow(name, fmt(amt));
  });

  r.dynCosts.forEach((c) => {
    if ((c.amount || 0) > 0) addPdfRow(c.label || "עלות", fmt(c.amount));
  });

  if (r.complexity > 0) addPdfRow("תוספת מורכבות", fmt(r.complexity));
}

function buildCopyText(r) {
  const name = ($("clientName").value || "").trim();
  const lines = [];
  lines.push("הצעת מחיר — " + jewLabel());
  if (name) lines.push("לקוח: " + name);
  lines.push("מחיר סופי: " + fmt(smartRound(r.final)));
  lines.push("--- פנימי ---");
  lines.push("עלות לפני רווח: " + fmt(r.sub));
  lines.push("רווח " + r.pct + "%: " + fmt(r.prof));
  const notes = ($("privateNotes").value || "").trim();
  if (notes) lines.push("הערות פנימיות: " + notes);
  return lines.join("\n");
}

function openPdf(mode) {
  pdfMode = mode;
  const r = lastRes || calc();
  if (!r || (r.sub <= 0 && r.final <= 0)) {
    setFb("אין נתונים מספיקים ליצירת PDF", false);
    return;
  }
  const overlay = $("pdfOverlay");
  const clientName = ($("clientName").value || "").trim() || "לקוח";
  const clientDesc = ($("clientDesc").value || "").trim();
  $("pdfTitle").textContent = jewLabel();
  $("pdfClient").textContent = clientName;
  $("pdfType").textContent = MLBL[r.mt] + " · " + jewLabel();

  const now = new Date();
  $("pdfDate").textContent = now.toLocaleDateString("he-IL", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  $("pdfFooterDate").textContent = now.toLocaleString("he-IL");
  $("pdfQuoteNum").textContent = "מס׳ הצעה: " + now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0") + "-" + String(now.getHours()).padStart(2, "0") + String(now.getMinutes()).padStart(2, "0");

  const pdfRows = $("pdfRows");
  const pdfTotals = $("pdfTotals");
  const secCosts = $("pdfSectionCostsTitle");
  const secPricing = $("pdfSectionPricing");
  const descEl = $("pdfClientDesc");

  pdfRows.replaceChildren();
  pdfTotals.replaceChildren();

  const rounded = smartRound(r.final);

  if (mode === "client") {
    secCosts.textContent = "פרטי ההצעה";
    descEl.classList.toggle("hidden", !clientDesc);
    descEl.textContent = clientDesc;
    const row = document.createElement("div");
    row.className = "pdf-row";
    row.innerHTML =
      "<span class=\"pdf-row-label\">סוג תכשיט</span><span class=\"pdf-row-value\">" + escapeHtml(jewLabel()) + "</span>";
    pdfRows.appendChild(row);
    const row2 = document.createElement("div");
    row2.className = "pdf-row";
    row2.innerHTML = "<span class=\"pdf-row-label\">מתכת</span><span class=\"pdf-row-value\">" + MLBL[r.mt] + "</span>";
    pdfRows.appendChild(row2);
    secPricing.style.display = "none";
    pdfTotals.replaceChildren();
    $("pdfTotalLbl").textContent = "מחיר ללקוח";
    $("pdfTotalAmt").textContent = fmt(rounded);
    $("pdfTotalNote").textContent = "המחיר כולל עבודה ואבנים כפי שסוכם בעל פה · ללא פירוט עלויות ייצור";
  } else {
    secCosts.textContent = "פירוט עלויות (פנימי)";
    descEl.classList.add("hidden");
    secPricing.style.display = "";
    $("pdfTotalLbl").textContent = "מחיר סופי (מעוגל)";
    $("pdfTotalAmt").textContent = fmt(rounded);
    $("pdfTotalNote").textContent =
      Math.abs(rounded - r.final) > 0.5 ? "לפני עיגול: " + fmt(r.final) : "";

    const addPdfRow = (lab, val, sub) => {
      const row = document.createElement("div");
      row.className = "pdf-row" + (sub ? " sub" : "");
      row.innerHTML =
        "<span class=\"pdf-row-label\">" +
        escapeHtml(String(lab)) +
        "</span><span class=\"pdf-row-value\">" +
        escapeHtml(String(val)) +
        "</span>";
      pdfRows.appendChild(row);
    };

    renderInternalPdfCostBreakdown(r, addPdfRow);

    const pnotes = ($("privateNotes").value || "").trim();
    if (pnotes) addPdfRow("הערות פנימיות", pnotes, false);

    pdfTotals.replaceChildren();
    const addTot = (lab, val, sub) => {
      const row = document.createElement("div");
      row.className = "pdf-row" + (sub ? " sub" : "");
      row.innerHTML =
        "<span class=\"pdf-row-label\">" +
        escapeHtml(String(lab)) +
        "</span><span class=\"pdf-row-value\">" +
        escapeHtml(String(val)) +
        "</span>";
      pdfTotals.appendChild(row);
    };
    addTot("עלות כוללת (לפני רווח)", fmt(r.sub));
    addTot("רווח " + r.pct + "%", fmt(r.prof), true);
    addTot("מחיר לפני עיגול", fmt(r.final), true);
    const diffR = rounded - r.final;
    if (Math.abs(diffR) > 0.5) {
      addTot("הפרש עיגול (מעוגל − לפני עיגול)", fmt(diffR), true);
    }
  }

  overlay.classList.add("show");
  overlay.setAttribute("aria-hidden", "false");
  $("btnPrint").focus();
}

function closePdf() {
  $("pdfOverlay").classList.remove("show");
  $("pdfOverlay").setAttribute("aria-hidden", "true");
}

function setFb(msg, ok) {
  const fb = $("fb");
  fb.textContent = msg;
  fb.className = "fb " + (ok ? "fb-ok" : "fb-sv");
  if (msg) setTimeout(() => { fb.textContent = ""; fb.className = "fb"; }, 2800);
}

function loadHist() {
  try {
    const raw = localStorage.getItem(HK);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHist(arr) {
  localStorage.setItem(HK, JSON.stringify(arr));
}

function renderHist() {
  const body = $("histBody");
  const list = loadHist();
  $("hBadge").hidden = list.length === 0;
  $("hBadge").textContent = list.length + " שמורות";

  if (!list.length) {
    body.innerHTML = "<div class=\"hist-empty\">עדיין אין הצעות שמורות.<br>לחץ <strong>שמור ★</strong> אחרי חישוב.</div>";
    return;
  }
  const wrap = document.createElement("div");
  wrap.className = "hist-list";

  list.forEach((item) => {
    const card = document.createElement("div");
    card.className = "hcard";
    card.innerHTML =
      "<div class=\"hcard-top\"><span class=\"hcard-name\">" +
      escapeHtml(item.client || "ללא שם") +
      "</span><span class=\"hcard-date\">" +
      escapeHtml(item.date || "") +
      "</span></div>" +
      "<div class=\"hcard-type\">" +
      escapeHtml(item.jewLabel || "") +
      " · " +
      escapeHtml(item.metalLabel || "") +
      "</div>" +
      "<div class=\"hcard-price\">" +
      fmt(item.total || 0) +
      "</div>" +
      (item.note
        ? "<div class=\"hcard-note\">" + escapeHtml(item.note) + "</div>"
        : "") +
      "<div class=\"hcard-ac\">" +
      "<button type=\"button\" class=\"btn-hl\" data-a=\"load\" data-id=\"" +
      item.id +
      "\">טען</button>" +
      "<button type=\"button\" class=\"btn-hd\" data-a=\"del\" data-id=\"" +
      item.id +
      "\">מחק</button>" +
      "</div>";
    wrap.appendChild(card);
  });

  body.replaceChildren(wrap);
  wrap.querySelectorAll("button[data-a=\"load\"]").forEach((btn) => {
    btn.addEventListener("click", () => loadQuote(btn.getAttribute("data-id")));
  });
  wrap.querySelectorAll("button[data-a=\"del\"]").forEach((btn) => {
    btn.addEventListener("click", () => deleteQuote(btn.getAttribute("data-id")));
  });
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function loadQuote(id) {
  const list = loadHist();
  const item = list.find((x) => x.id === id);
  if (!item || !item.payload) return;
  const p = item.payload;
  jewType = ["ring", "pendant", "bracelet", "earrings", "other"].includes(p.jewType) ? p.jewType : "ring";
  document.querySelectorAll("#jewTiles .tile").forEach((t) => {
    const on = t.getAttribute("data-val") === jewType;
    t.classList.toggle("sel", on);
    t.setAttribute("aria-pressed", on ? "true" : "false");
  });
  $("metalType").value = p.mt || "gold14";
  $("pricePg").value = p.ppg ?? "";
  $("wManual").value = p.wManual ?? "";
  useCalc = jewType === "ring" && !!p.useCalc;
  $("tabM").classList.toggle("on", !useCalc);
  $("tabC").classList.toggle("on", useCalc);
  $("tabM").setAttribute("aria-selected", useCalc ? "false" : "true");
  $("tabC").setAttribute("aria-selected", useCalc ? "true" : "false");
  $("panM").classList.toggle("hidden", useCalc);
  $("panC").classList.toggle("hidden", !useCalc);
  if (useCalc) $("panC").removeAttribute("hidden");
  else $("panC").setAttribute("hidden", "");
  $("rSize").value = p.rSize ?? "";
  $("rWidth").value = p.rWidth ?? "";
  $("rThick").value = p.rThick ?? "";
  setDiaMode(p.diaMode === "multi" ? "multi" : "uni");
  $("diaCount").value = p.diaCount ?? "";
  $("diaPrice").value = p.diaPrice ?? "";
  const hasNewTotal = p.diaTotalCt != null && String(p.diaTotalCt).trim() !== "";
  if (hasNewTotal) {
    $("diaTotalCt").value = p.diaTotalCt;
  } else if (p.diaCarat != null && String(p.diaCarat).trim() !== "") {
    const c = parseInt(String(p.diaCount ?? "0"), 10) || 0;
    const per = parseFloat(String(p.diaCarat)) || 0;
    $("diaTotalCt").value = c && per ? String(c * per) : p.diaCarat;
  } else {
    $("diaTotalCt").value = p.diaTotalCt ?? "";
  }
  $("diaG1Count").value = p.diaG1Count ?? "";
  $("diaG1Ct").value = p.diaG1Ct ?? "";
  $("diaG1Price").value = p.diaG1Price ?? "";
  $("diaG2Count").value = p.diaG2Count ?? "";
  $("diaG2Ct").value = p.diaG2Ct ?? "";
  $("diaG2Price").value = p.diaG2Price ?? "";
  $("settingCost").value = p.settingCost ?? 0;
  $("lPack").value = p.lPack ?? 0;
  $("lCast").value = p.lCast ?? 0;
  $("lModel").value = p.lModel ?? 0;
  $("lPol").value = p.lPol ?? 0;
  $("lRhod").value = p.lRhod ?? 0;
  $("complexity").value = String(p.complexity ?? 0);
  $("profit").value = p.profit ?? 30;
  $("clientName").value = p.clientName ?? "";
  $("clientDesc").value = p.clientDesc ?? "";
  $("privateNotes").value = p.privateNotes ?? "";
  $("jewTypeOther").value = p.jewOther ?? "";
  dynCosts = Array.isArray(p.dynCosts) ? p.dynCosts.map((c) => ({ ...c, id: c.id || uid() })) : [];
  gemStones = Array.isArray(p.gemStones) ? p.gemStones.map((g) => ({ ...g, id: g.id || uid() })) : [];
  renderDynCosts();
  renderGemRows();
  updateRingUi();
  updateJewOtherUi();
  scheduleCalc();
  setFb("הצעה נטענה מההיסטוריה", true);
}

function deleteQuote(id) {
  saveHist(loadHist().filter((x) => x.id !== id));
  renderHist();
}

function saveQuote() {
  const r = lastRes || calc();
  if (!r || (r.sub <= 0 && r.final <= 0)) {
    setFb("אין מה לשמור — הזן נתונים", false);
    return;
  }
  const payload = {
    jewType,
    mt: r.mt,
    ppg: r.ppg,
    wManual: $("wManual").value,
    useCalc,
    rSize: $("rSize").value,
    rWidth: $("rWidth").value,
    rThick: $("rThick").value,
    diaMode,
    diaCount: $("diaCount").value,
    diaTotalCt: $("diaTotalCt").value,
    diaPrice: $("diaPrice").value,
    diaG1Count: $("diaG1Count").value,
    diaG1Ct: $("diaG1Ct").value,
    diaG1Price: $("diaG1Price").value,
    diaG2Count: $("diaG2Count").value,
    diaG2Ct: $("diaG2Ct").value,
    diaG2Price: $("diaG2Price").value,
    settingCost: $("settingCost").value,
    lPack: $("lPack").value,
    lCast: $("lCast").value,
    lModel: $("lModel").value,
    lPol: $("lPol").value,
    lRhod: $("lRhod").value,
    complexity: $("complexity").value,
    profit: $("profit").value,
    clientName: $("clientName").value,
    clientDesc: $("clientDesc").value,
    privateNotes: $("privateNotes").value,
    jewOther: $("jewTypeOther").value,
    dynCosts,
    gemStones,
  };
  const entry = {
    id: uid(),
    date: new Date().toLocaleString("he-IL"),
    client: ($("clientName").value || "").trim() || "ללא שם",
    jewLabel: jewLabel(),
    metalLabel: MLBL[r.mt],
    total: smartRound(r.final),
    note: ($("privateNotes").value || "").trim().slice(0, 120),
    payload,
  };
  const list = [entry, ...loadHist()].slice(0, 50);
  saveHist(list);
  renderHist();
  setFb("נשמר בהיסטוריה", true);
}

function renderDynCosts() {
  const el = $("dynCosts");
  el.replaceChildren();
  dynCosts.forEach((c) => {
    const row = document.createElement("div");
    row.className = "dyn-row";
    row.dataset.id = c.id;
    row.innerHTML =
      "<input type=\"text\" class=\"inp dyn-label\" placeholder=\"תיאור\" value=\"" +
      escapeAttr(c.label) +
      "\"/>" +
      "<input type=\"number\" class=\"inp dyn-amt\" min=\"0\" step=\"1\" value=\"" +
      (c.amount || 0) +
      "\"/>" +
      "<button type=\"button\" class=\"btn-rm\" aria-label=\"הסר\">×</button>";
    el.appendChild(row);
    row.querySelector(".dyn-label").addEventListener("input", (e) => {
      c.label = /** @type {HTMLInputElement} */ (e.target).value;
      scheduleCalc();
    });
    row.querySelector(".dyn-amt").addEventListener("input", (e) => {
      c.amount = parseFloat(/** @type {HTMLInputElement} */ (e.target).value) || 0;
      scheduleCalc();
    });
    row.querySelector(".btn-rm").addEventListener("click", () => {
      dynCosts = dynCosts.filter((x) => x.id !== c.id);
      renderDynCosts();
      scheduleCalc();
    });
  });
}

function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function renderGemRows() {
  const el = $("gemRows");
  el.replaceChildren();
  gemStones.forEach((g) => {
    const row = document.createElement("div");
    row.className = "gem-row";
    row.dataset.id = g.id;
    row.innerHTML =
      "<input type=\"text\" class=\"inp gem-label\" placeholder=\"סוג אבן\" value=\"" +
      escapeAttr(g.label) +
      "\"/>" +
      "<input type=\"number\" class=\"inp gem-cnt\" min=\"0\" step=\"1\" value=\"" +
      (g.count || 0) +
      "\"/>" +
      "<input type=\"number\" class=\"inp gem-car\" min=\"0\" step=\"0.01\" value=\"" +
      (g.carat || 0) +
      "\"/>" +
      "<input type=\"number\" class=\"inp gem-prc\" min=\"0\" step=\"1\" value=\"" +
      (g.price || 0) +
      "\"/>" +
      "<button type=\"button\" class=\"btn-rm\" aria-label=\"הסר\">×</button>";
    el.appendChild(row);
    const q = (sel) => row.querySelector(sel);
    q(".gem-label").addEventListener("input", (e) => {
      g.label = /** @type {HTMLInputElement} */ (e.target).value;
      scheduleCalc();
    });
    q(".gem-cnt").addEventListener("input", (e) => {
      g.count = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10) || 0;
      scheduleCalc();
    });
    q(".gem-car").addEventListener("input", (e) => {
      g.carat = parseFloat(/** @type {HTMLInputElement} */ (e.target).value) || 0;
      scheduleCalc();
    });
    q(".gem-prc").addEventListener("input", (e) => {
      g.price = parseFloat(/** @type {HTMLInputElement} */ (e.target).value) || 0;
      scheduleCalc();
    });
    q(".btn-rm").addEventListener("click", () => {
      gemStones = gemStones.filter((x) => x.id !== g.id);
      renderGemRows();
      scheduleCalc();
    });
  });
}

function updateRingUi() {
  const ringOnly = jewType === "ring";
  $("ringNotice").classList.toggle("hidden", ringOnly);
  $("ringFields").style.opacity = ringOnly ? "1" : "0.45";
  $("ringFields").style.pointerEvents = ringOnly ? "" : "none";
  if (!ringOnly) {
    useCalc = false;
    $("tabM").classList.add("on");
    $("tabC").classList.remove("on");
    $("panM").classList.remove("hidden");
    $("panC").classList.add("hidden");
    $("panC").setAttribute("hidden", "");
  }
}

function updateCalcPreview() {
  const el = $("calcPrev");
  if (!useCalc || jewType !== "ring") {
    el.innerHTML = "";
    return;
  }
  const r = calc();
  if (r.wSrc !== "calc" || r.wt <= 0) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML =
    "<span class=\"prev-pill\">משקל משוער: " +
    fmtN(r.wt, 2) +
    " גרם · עלות מתכת: " +
    fmt(r.mCost) +
    "</span>";
}

/* ── אתחול ── */
const manifest = {
  name: "Shey · מחשבון הצעת מחיר",
  short_name: "Shey",
  description: "מחשבון הצעות מחיר לתכשיטים — מתכת, אבנים ועבודה.",
  start_url: ".",
  display: "standalone",
  background_color: "#F4F2EE",
  theme_color: "#D4537E",
  orientation: "portrait",
  lang: "he",
  dir: "rtl",
  icons: [
    {
      src: "images/Red-Symbol.svg",
      sizes: "any",
      type: "image/svg+xml",
    },
  ],
};
$("manifestLink").href = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: "application/json" }));

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
});

document.querySelectorAll("#jewTiles .tile").forEach((tile) => {
  tile.addEventListener("click", () => {
    jewType = /** @type {HTMLButtonElement} */ (tile).getAttribute("data-val") || "ring";
    document.querySelectorAll("#jewTiles .tile").forEach((t) => {
      const on = t === tile;
      t.classList.toggle("sel", on);
      t.setAttribute("aria-pressed", on ? "true" : "false");
    });
    updateRingUi();
    updateJewOtherUi();
    scheduleCalc();
    updateCalcPreview();
  });
});

$("tabM").addEventListener("click", () => {
  useCalc = false;
  $("tabM").classList.add("on");
  $("tabC").classList.remove("on");
  $("tabM").setAttribute("aria-selected", "true");
  $("tabC").setAttribute("aria-selected", "false");
  $("panM").classList.remove("hidden");
  $("panC").classList.add("hidden");
  $("panC").setAttribute("hidden", "");
  scheduleCalc();
  updateCalcPreview();
});

$("tabC").addEventListener("click", () => {
  if (jewType !== "ring") return;
  useCalc = true;
  $("tabC").classList.add("on");
  $("tabM").classList.remove("on");
  $("tabC").setAttribute("aria-selected", "true");
  $("tabM").setAttribute("aria-selected", "false");
  $("panM").classList.add("hidden");
  $("panC").classList.remove("hidden");
  $("panC").removeAttribute("hidden");
  scheduleCalc();
  updateCalcPreview();
});

[
  "metalType",
  "pricePg",
  "wManual",
  "rSize",
  "rWidth",
  "rThick",
  "diaCount",
  "diaTotalCt",
  "diaPrice",
  "diaG1Count",
  "diaG1Ct",
  "diaG1Price",
  "diaG2Count",
  "diaG2Ct",
  "diaG2Price",
  "settingCost",
  "lPack",
  "lCast",
  "lModel",
  "lPol",
  "lRhod",
  "complexity",
  "profit",
  "clientName",
  "clientDesc",
  "privateNotes",
  "jewTypeOther",
].forEach((id) => {
  $(id).addEventListener("input", () => {
    if (id === "profit") updateProfitUI(parseFloat($("profit").value) || 0);
    scheduleCalc();
    if (["rSize", "rWidth", "rThick", "metalType", "pricePg"].includes(id)) updateCalcPreview();
  });
});

$("diaTabUni").addEventListener("click", () => {
  setDiaMode("uni");
  scheduleCalc();
});
$("diaTabMulti").addEventListener("click", () => {
  setDiaMode("multi");
  scheduleCalc();
});

$("btnAddCost").addEventListener("click", () => {
  dynCosts.push({ id: uid(), label: "", amount: 0 });
  renderDynCosts();
});

$("btnAddGem").addEventListener("click", () => {
  gemStones.push({ id: uid(), label: "", count: 0, carat: 0, price: 0 });
  renderGemRows();
});

$("btnClr").addEventListener("click", () => {
  if (!confirm("לנקות את כל השדות?")) return;
  $("pricePg").value = "";
  $("wManual").value = "";
  $("rSize").value = "";
  $("rWidth").value = "";
  $("rThick").value = "";
  setDiaMode("uni");
  $("diaCount").value = "0";
  $("diaTotalCt").value = "0";
  $("diaPrice").value = "0";
  $("diaG1Count").value = "0";
  $("diaG1Ct").value = "0";
  $("diaG1Price").value = "0";
  $("diaG2Count").value = "0";
  $("diaG2Ct").value = "0";
  $("diaG2Price").value = "0";
  $("settingCost").value = "0";
  $("lPack").value = "0";
  $("lCast").value = "0";
  $("lModel").value = "0";
  $("lPol").value = "0";
  $("lRhod").value = "0";
  $("complexity").value = "0";
  $("profit").value = "30";
  $("clientName").value = "";
  $("clientDesc").value = "";
  $("privateNotes").value = "";
  $("jewTypeOther").value = "";
  dynCosts = [];
  gemStones = [];
  renderDynCosts();
  renderGemRows();
  lastRes = null;
  $("resEmpty").classList.remove("hidden");
  $("resContent").classList.add("hidden");
  scheduleCalc();
});

$("btnCopy").addEventListener("click", async () => {
  const r = lastRes || calc();
  if (!r || (r.sub <= 0 && r.final <= 0)) {
    setFb("אין נתונים להעתקה", false);
    return;
  }
  const text = buildCopyText(r);
  try {
    await navigator.clipboard.writeText(text);
    setFb("הועתק ללוח", true);
  } catch {
    setFb("לא ניתן להעתיק — העתק ידנית", false);
  }
});

$("btnSave").addEventListener("click", () => saveQuote());

$("btnPdfClient").addEventListener("click", () => openPdf("client"));
$("btnPdfInternal").addEventListener("click", () => openPdf("internal"));

$("btnPdfClose").addEventListener("click", () => closePdf());
$("btnPrint").addEventListener("click", () => window.print());

$("pdfOverlay").addEventListener("click", (e) => {
  if (e.target === $("pdfOverlay")) closePdf();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("pdfOverlay").classList.contains("show")) closePdf();
});

$("btnClrHist").addEventListener("click", () => {
  if (confirm("למחוק את כל ההיסטוריה?")) {
    localStorage.removeItem(HK);
    renderHist();
  }
});

updateRingUi();
updateJewOtherUi();
renderDynCosts();
renderGemRows();
updateProfitUI(parseFloat($("profit").value) || 30);
renderHist();
scheduleCalc();

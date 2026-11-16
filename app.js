"use strict";

/* Courbe de charge DC générique : fraction de la puissance max selon le niveau de charge. */
const COURBE_DC = [
  [0, 0.55], [5, 0.92], [10, 1.0], [30, 1.0], [50, 0.85],
  [70, 0.60], [80, 0.42], [90, 0.22], [100, 0.08]
];

const $ = (id) => document.getElementById(id);

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
function num(id, defaut) {
  const v = parseFloat($(id).value);
  return isFinite(v) ? v : defaut;
}
function fmt(x, d = 0) {
  return x.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtHeure(t) {
  if (!isFinite(t) || t < 0) return "—";
  const h = Math.floor(t);
  const m = Math.round((t - h) * 60);
  if (m === 60) return (h + 1) + " h 00 min";
  return h + " h " + String(m).padStart(2, "0") + " min";
}
function fmtHeureCourt(t) {
  if (t < 1) return Math.round(t * 60) + " min";
  return fmt(t, 1) + " h";
}
function interp(x, pts) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const x0 = pts[i - 1][0], y0 = pts[i - 1][1];
      const x1 = pts[i][0], y1 = pts[i][1];
      return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    }
  }
  return pts[pts.length - 1][1];
}

/* Pertes effectives : augmentées par le froid. */
function perteEffective(pertesPct, T) {
  let p = pertesPct;
  if (T < 5) p += Math.min(8, (5 - T) * 0.4);
  return clamp(p, 0, 40) / 100;
}

/* Facteur de réduction de puissance DC à froid sans préconditionnement. */
function facteurTempDC(T, precond) {
  if (precond || T >= 10) return 1;
  return Math.max(0.5, 1 - (10 - T) * 0.05);
}

function puissanceDC(soc, pmax, fT) {
  return Math.max(0.1, pmax * interp(soc, COURBE_DC) * fT);
}

/* Temps de charge de soc0 à soc1.
   AC : puissance constante = min(borne, chargeur embarqué).
   DC : intégration pas à pas de la courbe de charge (ralentissement haut dans la plage). */
function calculCharge(o, soc0, soc1) {
  const perte = perteEffective(o.pertes, o.temperature);
  const eBatTotal = o.capaUtile * (soc1 - soc0) / 100;
  if (soc1 <= soc0) return null;

  if (o.typeBorne === "AC") {
    const P = Math.min(o.puisBorne, o.obc);
    if (P <= 0) return null;
    const eGrid = eBatTotal / (1 - perte);
    return {
      t: eGrid / P, eBat: eBatTotal, eGrid, avgP: P, pmax: P,
      echantillons: [[0, soc0], [eGrid / P, soc1]],
      courbeP: [[soc0, P], [soc1, P]]
    };
  }

  const pmax = Math.min(o.puisBorne, o.dcMax);
  if (pmax <= 0) return null;
  const fT = facteurTempDC(o.temperature, o.precond);
  const pas = 0.25;
  let t = 0, eBat = 0, eGrid = 0, pSum = 0, n = 0;
  const echantillons = [[0, soc0]];
  const courbeP = [];
  for (let s = soc0; s < soc1 - 1e-9; s += pas) {
    const s1 = Math.min(s + pas, soc1);
    const sMid = (s + s1) / 2;
    const P = puissanceDC(sMid, pmax, fT);
    const dBat = o.capaUtile * (s1 - s) / 100;
    const dGrid = dBat / (1 - perte);
    const dt = dGrid / P;
    t += dt; eBat += dBat; eGrid += dGrid; pSum += P; n++;
    echantillons.push([t, s1]);
    if (courbeP.length === 0 || sMid - courbeP[courbeP.length - 1][0] >= 2) {
      courbeP.push([sMid, P]);
    }
  }
  courbeP.push([soc1, puissanceDC(soc1, pmax, fT)]);
  return { t, eBat, eGrid, avgP: pSum / n, pmax, echantillons, courbeP };
}

/* Consommation ajustée par cycle : température, vitesse (part autoroute), options. */
function consoParCycle(base, o) {
  const fT = 1 + Math.min(0.5, Math.max(0, 20 - o.temperature) * 0.012);
  const fV = Math.pow(clamp(o.vitesse, 50, 150) / 130, 2);
  const add = o.chauffage ? 2 + Math.max(0, -o.temperature) * 0.15 : 0;
  const mult = (o.coffre ? 1.06 : 1) * (o.vallonne ? 1.08 : 1) * (o.charge ? 1.03 : 1);
  return {
    urbain: Math.max(1, (base.urbain * fT + add) * mult),
    campagne: Math.max(1, (base.campagne * fT + add) * mult),
    autoroute: Math.max(1, (base.autoroute * fT * fV + add) * mult),
    mixte: Math.max(1, (base.mixte * fT + add) * mult)
  };
}

function consoChoisie(cycles, o) {
  if (o.scenario === "perso") {
    const tot = o.mix.u + o.mix.r + o.mix.a;
    if (tot <= 0) return cycles.mixte;
    return (cycles.urbain * o.mix.u + cycles.campagne * o.mix.r + cycles.autoroute * o.mix.a) / tot;
  }
  return cycles[o.scenario] || cycles.mixte;
}

function distanceJusqua(soc, capa, conso, seuil = 10) {
  return Math.max(0, (soc - seuil) / 100 * capa) * 100 / Math.max(1, conso);
}

/* Simulation d'un long trajet : on roule jusqu'à 10 %, puis on recharge en DC rapide.
   Si la borne sélectionnée est en AC, on suppose une borne rapide HPC 150 kW en route.
   Le dernier arrêt ne charge que l'énergie nécessaire pour finir le trajet. */
function simulerTrajet(o, conso) {
  let borneRoute = o;
  if (o.dcMax > 0) {
    borneRoute = { ...o, typeBorne: "DC", puisBorne: o.typeBorne === "DC" ? o.puisBorne : 150 };
  }
  let reste = o.distTrajet, soc = o.socInitial, arrets = 0, tCharge = 0;
  while (reste > 0.01 && arrets < 60) {
    const dMax = distanceJusqua(soc, o.capaUtile, conso);
    if (dMax >= reste) { reste = 0; break; }
    reste -= dMax;
    const socCible = Math.min(80, 10 + reste * conso / 100 / o.capaUtile * 100);
    const leg = calculCharge(borneRoute, 10, Math.max(socCible, 10.5));
    if (leg) tCharge += leg.t;
    arrets++;
    soc = Math.max(10, Math.min(80, socCible));
  }
  const tRoute = o.distTrajet / clamp(o.vitesse, 30, 200);
  return { arrets, tCharge, tRoute, tTotal: tRoute + tCharge };
}

function nomScenario(s) {
  return {
    urbain: "Urbain", campagne: "Campagne / route", autoroute: "Autoroute",
    mixte: "Mixte (WLTP)", perso: "Mix personnalisé"
  }[s] || s;
}

function majMixLabels(o) {
  const tot = o.mix.u + o.mix.r + o.mix.a || 1;
  $("mixUVal").textContent = Math.round(o.mix.u / tot * 100) + " %";
  $("mixRVal").textContent = Math.round(o.mix.r / tot * 100) + " %";
  $("mixAVal").textContent = Math.round(o.mix.a / tot * 100) + " %";
  $("blocMix").style.display = o.scenario === "perso" ? "grid" : "none";
}

function setBar(barId, valId, d, max) {
  $(barId).style.width = (d / max * 100).toFixed(1) + "%";
  $(valId).textContent = fmt(d, 0) + " km";
}

function preparerCanvas(c) {
  const dpr = window.devicePixelRatio || 1;
  const rect = c.getBoundingClientRect();
  c.width = Math.max(1, rect.width * dpr);
  c.height = Math.max(1, rect.height * dpr);
  const ctx = c.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: rect.width, h: rect.height };
}

function dessinerCourbeSoc(ech, soc1) {
  const c = $("graphSoc");
  const { ctx, w, h } = preparerCanvas(c);
  ctx.clearRect(0, 0, w, h);
  const marg = { g: 44, d: 12, h: 12, b: 30 };
  const iw = w - marg.g - marg.d, ih = h - marg.h - marg.b;
  const tMax = Math.max(ech[ech.length - 1][0] * 1.05, 0.01);
  const x = (t) => marg.g + (t / tMax) * iw;
  const y = (s) => marg.h + ih - (s / 100) * ih;

  ctx.strokeStyle = "#24365c";
  ctx.fillStyle = "#8ea0c0";
  ctx.lineWidth = 1;
  ctx.font = "11px system-ui";
  for (let s = 0; s <= 100; s += 20) {
    ctx.beginPath(); ctx.moveTo(marg.g, y(s)); ctx.lineTo(marg.g + iw, y(s)); ctx.stroke();
    ctx.fillText(s + " %", 8, y(s) + 4);
  }
  const pasT = tMax / 5;
  for (let i = 0; i <= 5; i++) {
    ctx.fillText(fmtHeureCourt(pasT * i), Math.max(marg.g, x(pasT * i) - 14), h - 8);
  }

  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = "#4ade80";
  ctx.beginPath(); ctx.moveTo(marg.g, y(soc1)); ctx.lineTo(marg.g + iw, y(soc1)); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#4ade80";
  ctx.fillText("objectif " + soc1 + " %", marg.g + 6, y(soc1) - 6);

  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ech.forEach(([t, s], i) => { if (i === 0) ctx.moveTo(x(t), y(s)); else ctx.lineTo(x(t), y(s)); });
  ctx.stroke();
}

function dessinerCourbeP(courbe, pmax) {
  const c = $("graphPuissance");
  const { ctx, w, h } = preparerCanvas(c);
  ctx.clearRect(0, 0, w, h);
  const marg = { g: 44, d: 12, h: 12, b: 30 };
  const iw = w - marg.g - marg.d, ih = h - marg.h - marg.b;
  const yMax = Math.max(pmax * 1.1, 10);
  const x = (s) => marg.g + (s / 100) * iw;
  const y = (p) => marg.h + ih - (p / yMax) * ih;

  ctx.strokeStyle = "#24365c";
  ctx.fillStyle = "#8ea0c0";
  ctx.lineWidth = 1;
  ctx.font = "11px system-ui";
  for (let s = 0; s <= 100; s += 20) {
    ctx.beginPath(); ctx.moveTo(x(s), marg.h); ctx.lineTo(x(s), marg.h + ih); ctx.stroke();
    ctx.fillText(s + " %", x(s) - 8, h - 8);
  }
  for (let i = 0; i <= 4; i++) {
    const p = yMax * i / 4;
    ctx.beginPath(); ctx.moveTo(marg.g, y(p)); ctx.lineTo(marg.g + iw, y(p)); ctx.stroke();
    ctx.fillText(fmt(p, 0) + " kW", 4, y(p) + 4);
  }

  ctx.beginPath();
  courbe.forEach(([s, p], i) => { if (i === 0) ctx.moveTo(x(s), y(p)); else ctx.lineTo(x(s), y(p)); });
  ctx.strokeStyle = "#fbbf24";
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.lineTo(x(courbe[courbe.length - 1][0]), y(0));
  ctx.lineTo(x(courbe[0][0]), y(0));
  ctx.closePath();
  ctx.fillStyle = "rgba(251, 191, 36, 0.15)";
  ctx.fill();
}

function compute() {
  const o = {
    capaUtile: clamp(num("capaUtile", 60), 1, 300),
    capaBrute: num("capaBrute", 0),
    obc: num("obc", 11),
    dcMax: num("dcMax", 130),
    typeBorne: $("typeBorne").value,
    puisBorne: num("puisBorne", 150),
    socInitial: clamp(num("socInitial", 20), 0, 100),
    socCible: clamp(num("socCible", 80), 0, 100),
    pertes: clamp(num("pertes", 10), 0, 40),
    temperature: num("temperature", 15),
    precond: $("precond").checked,
    scenario: $("scenario").value,
    mix: { u: num("mixU", 30), r: num("mixR", 40), a: num("mixA", 30) },
    chauffage: $("chauffage").checked,
    coffre: $("coffre").checked,
    vallonne: $("vallonne").checked,
    charge: $("charge").checked,
    vitesse: num("vitesse", 110),
    distTrajet: num("distTrajet", 500),
    prixKwh: num("prixKwh", 0.25),
    prixCarb: num("prixCarb", 1.8),
    co2Elec: num("co2Elec", 50),
    consoTherm: num("consoTherm", 6.5),
    co2Carb: num("co2Carb", 2.9),
    consoBase: {
      urbain: num("consoUrbain", 14),
      campagne: num("consoCampagne", 16),
      autoroute: num("consoAutoroute", 20),
      mixte: num("consoMixte", 16)
    }
  };

  $("socInitialVal").textContent = o.socInitial + " %";
  $("socCibleVal").textContent = o.socCible + " %";
  majMixLabels(o);

  const cycles = consoParCycle(o.consoBase, o);
  const conso = Math.max(1, consoChoisie(cycles, o));
  $("resScenario").textContent =
    "Scénario : " + nomScenario(o.scenario) + " — consommation estimée " + fmt(conso, 1) +
    " kWh/100 km (température " + fmt(o.temperature, 0) + " °C, vitesse " + fmt(o.vitesse, 0) + " km/h)";

  let indice = "";
  if (o.typeBorne === "AC") {
    const P = Math.min(o.puisBorne, o.obc);
    indice = o.obc < o.puisBorne
      ? "⚠ Charge limitée à " + fmt(P, 1) + " kW par le chargeur embarqué (" + fmt(o.obc, 1) + " kW)."
      : "Puissance AC effective : " + fmt(P, 1) + " kW.";
  } else {
    const P = Math.min(o.puisBorne, o.dcMax);
    indice = o.dcMax < o.puisBorne
      ? "⚠ Charge limitée à " + fmt(P, 1) + " kW par le véhicule (max " + fmt(o.dcMax, 1) + " kW)."
      : "Puissance DC effective : " + fmt(P, 1) + " kW.";
  }
  if (o.temperature < 10 && !o.precond && o.typeBorne === "DC") {
    indice += " ❄ Puissance réduite à froid — préconditionnez la batterie pour éviter cela.";
  }
  $("indiceBorne").textContent = indice;

  const erreur = $("erreur");
  let charge = null;
  if (o.socCible <= o.socInitial) {
    erreur.hidden = false;
    erreur.textContent = "Le niveau d'arrêt de la charge doit être supérieur au niveau initial.";
  } else if (o.puisBorne <= 0 || o.capaUtile <= 0) {
    erreur.hidden = false;
    erreur.textContent = "Vérifiez la capacité de la batterie et la puissance de la borne.";
  } else {
    erreur.hidden = true;
    charge = calculCharge(o, o.socInitial, o.socCible);
  }

  if (charge) {
    $("resTemps").textContent = fmtHeure(charge.t);
    $("resEnergie").textContent = fmt(charge.eBat, 1) + " kWh";
    $("resReseau").textContent = "dont " + fmt(charge.eGrid, 1) + " kWh soutirés au réseau (pertes effectives " +
      fmt(perteEffective(o.pertes, o.temperature) * 100, 1) + " %)";
    $("resPuissance").textContent = fmt(charge.avgP, 1) + " kW";
    $("resPuissanceMax").textContent = "puissance max : " + fmt(charge.pmax, 1) + " kW";
    const p1 = calculCharge(o, 10, 80);
    const p2 = calculCharge(o, 80, 100);
    $("resPaliers").textContent = "Paliers : 10→80 % en " + fmtHeure(p1 ? p1.t : 0) +
      " · 80→100 % en " + fmtHeure(p2 ? p2.t : 0);
    dessinerCourbeSoc(charge.echantillons, o.socCible);
    dessinerCourbeP(charge.courbeP, charge.pmax);
    $("resCoutCharge").textContent = fmt(charge.eGrid * o.prixKwh, 2) + " €";
  } else {
    $("resTemps").textContent = "—";
    $("resEnergie").textContent = "—";
    $("resReseau").textContent = "";
    $("resPuissance").textContent = "—";
    $("resPuissanceMax").textContent = "";
    $("resPaliers").textContent = "";
    $("resCoutCharge").textContent = "—";
  }

  $("resDistActuel").textContent = fmt(distanceJusqua(o.socInitial, o.capaUtile, conso), 0) + " km";
  $("resDistApres").textContent = fmt(distanceJusqua(o.socCible, o.capaUtile, conso), 0) + " km";

  const cout100VE = conso * o.prixKwh;
  const cout100Th = o.consoTherm * o.prixCarb;
  $("resCout100").textContent = "Coût au 100 km : " + fmt(cout100VE, 2) + " € (VE) vs " +
    fmt(cout100Th, 2) + " € (thermique)";

  const co2VE = o.distTrajet * conso / 100 * o.co2Elec / 1000;
  const co2Th = o.distTrajet * o.consoTherm / 100 * o.co2Carb;
  $("resCo2").textContent = fmt(co2VE, 0) + " kg CO₂";
  $("resCo2Therm").textContent = "VE : " + fmt(co2VE, 0) + " kg · thermique : " + fmt(co2Th, 0) +
    " kg → économie de " + fmt(co2Th - co2VE, 0) + " kg sur " + fmt(o.distTrajet, 0) + " km";

  const sim = simulerTrajet(o, conso);
  $("resTrajet").textContent = (sim.arrets === 0 ? "aucun arrêt" : sim.arrets + " arrêt" + (sim.arrets > 1 ? "s" : "")) +
    " · " + fmtHeure(sim.tTotal);
  $("resTrajetDetail").textContent = "Temps de route : " + fmtHeure(sim.tRoute) +
    " + recharges DC en route : " + fmtHeure(sim.tCharge) +
    " (10→80 %, dernier arrêt ajusté au trajet restant)";

  const dCycles = {
    urbain: distanceJusqua(o.socInitial, o.capaUtile, cycles.urbain),
    campagne: distanceJusqua(o.socInitial, o.capaUtile, cycles.campagne),
    autoroute: distanceJusqua(o.socInitial, o.capaUtile, cycles.autoroute),
    mixte: distanceJusqua(o.socInitial, o.capaUtile, cycles.mixte)
  };
  const max = Math.max(...Object.values(dCycles), 1);
  setBar("barU", "valU", dCycles.urbain, max);
  setBar("barC", "valC", dCycles.campagne, max);
  setBar("barA", "valA", dCycles.autoroute, max);
  setBar("barM", "valM", dCycles.mixte, max);
}

function appliquerVehicule() {
  const v = VEHICULES[+$("vehicule").value] || VEHICULES[VEHICULES.length - 1];
  $("capaUtile").value = v.capaUtile;
  $("capaBrute").value = v.capaBrute;
  $("obc").value = v.obc;
  $("dcMax").value = v.dcMax;
  $("consoUrbain").value = v.conso.urbain;
  $("consoCampagne").value = v.conso.campagne;
  $("consoAutoroute").value = v.conso.autoroute;
  $("consoMixte").value = v.conso.mixte;
}

function init() {
  const sel = $("vehicule");
  VEHICULES.forEach((v, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = v.nom;
    sel.appendChild(opt);
  });

  sel.addEventListener("change", () => { appliquerVehicule(); compute(); });

  $("socInitial").addEventListener("input", () => {
    $("socCible").min = +$("socInitial").value + 1;
    if (+$("socCible").value <= +$("socInitial").value) {
      $("socCible").value = Math.min(100, +$("socInitial").value + 10);
    }
    compute();
  });
  $("socCible").addEventListener("input", () => {
    $("socInitial").max = +$("socCible").value - 1;
    compute();
  });
  $("typeBorne").addEventListener("change", () => {
    if ($("typeBorne").value === "AC") {
      $("puisBorne").value = 22;
      $("labelBorne").textContent = "Puissance de la borne AC (kW)";
    } else {
      $("puisBorne").value = 150;
      $("labelBorne").textContent = "Puissance de la borne DC (kW)";
    }
    compute();
  });

  document.querySelectorAll("main input, main select").forEach((el) => {
    if (el.id === "vehicule" || el.id === "socInitial" || el.id === "socCible" || el.id === "typeBorne") return;
    el.addEventListener("input", compute);
    el.addEventListener("change", compute);
  });

  window.addEventListener("resize", compute);
  appliquerVehicule();
  compute();
}

document.addEventListener("DOMContentLoaded", init);

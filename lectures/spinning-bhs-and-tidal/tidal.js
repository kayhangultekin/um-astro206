// Interactive tidal-force figure for ASTRO 206, Lecture 2.
//
// THE DESIGN CONSTRAINT THAT SHAPES EVERYTHING HERE: distance is measured in
// units of r_S, and the horizon is a FIXED circle on screen.
//
// If the knobs were mass and a distance in km, a student holding d fixed and
// raising M would watch the tidal force GO UP, because F_t ~ M/d^3. That is
// true, and it is the exact opposite of what this section teaches. The 1/M^2
// result exists ONLY at the horizon, where d is tied to M. Scaling distance by
// r_S keeps the two knobs tied together, so the widget delivers the lesson by
// itself: leave the body at d/r_S = 1, drag the mass, and watch the number
// fall twelve orders of magnitude while the picture does not change at all.
//
// What DOES change with mass is the scale bar, which is the "visual indication
// of how much physical distance is spanned by some distance on the screen"
// that Kayhan asked for.

import { select } from "https://cdn.jsdelivr.net/npm/d3-selection@3/+esm";
import { drag } from "https://cdn.jsdelivr.net/npm/d3-drag@3/+esm";

const root = document.getElementById("td-fig");
if (root) init(root);

function init(root) {
  // ---- physical constants, cgs ----------------------------------------
  // Values match astropy's, so this widget agrees with the printed table in
  // the Numerical exploration tab rather than quietly disagreeing with it.
  const G = 6.6743e-8;
  const C = 2.99792458e10;
  const MSUN = 1.988409870698051e33;
  const G0 = 980.665;

  // Body sizes as the length s over which the tide acts.
  const BODIES = {
    person: { s: 180.0, label: "a person", note: "1.8 m tall" },
    star: { s: 1.3914e11, label: "a Sun-like star", note: "1.39 million km across" },
  };

  // Beyond this the derivation's own assumption, dr << d, has failed and the
  // formula is not applicable. A whole star is NOT a test body beside a 30 km
  // horizon; it only becomes one next to a supermassive black hole.
  const SMALL_BODY_LIMIT = 0.1;

  // ---- geometry --------------------------------------------------------
  // 5 r_S rather than a wider field: the interesting action is between 1 and
  // 2 r_S, and at 8 the horizon became a dot in a sea of empty rings. Dragging
  // still spans a factor of 125 in a_t, and the badge ladder was re-swept at
  // this range -- all eleven rungs stay reachable.
  const DR_MIN = 1, DR_MAX = 5;   // d / r_S
  const R0 = 52;                  // px per r_S -- the horizon's fixed radius
  const PAD = 22;
  const SCALE_H = 30;             // strip under the disc for the scale bar
  const PLOT = 2 * R0 * DR_MAX;
  const W = PLOT + 2 * PAD;
  const H = W + SCALE_H;
  const CX = W / 2, CY = PAD + R0 * DR_MAX;

  const COL = {
    ink: "#0b0b0b", ink2: "#52514e", muted: "#898781",
    grid: "#e1e0d9", axis: "#c3c2b7", surface: "#fcfcfb",
    body: "#eb6834", horizon: "#0b0b0b", ring: "#2a78d6",
  };

  // ---- the badge ladder ------------------------------------------------
  // Ordered high to low; the first threshold met wins. Anchors are computed,
  // not guessed -- see the conversion log. Three of these are Kayhan's own
  // wording; the rest are the assistant's and he has read them.
  const RUNGS = [
    [1e9, "pulled apart atom from atom"],
    [1e6, "a steel cable would snap"],
    [1e3, "past what a human body holds together"],
    [1e2, "more than any roller coaster ever built"],
    [2e1, "like a hippopotamus sitting on you"],
    [9e0, "the most a fighter pilot can take"],
    [1e0, "as if a second you were hanging from your feet"],
    [1e-1, "like leaning into a strong breeze"],
    [1e-4, "roughly the tug of a spider's web"],
    [1e-7, "about Earth's own tide across your body"],
    [0, "far too small to detect by any means"],
  ];
  const badge = (g) => (RUNGS.find(([t]) => g >= t) || RUNGS[RUNGS.length - 1])[1];

  // ---- physics ---------------------------------------------------------
  const rS = (Msun) => (2 * G * Msun * MSUN) / (C * C);          // cm
  const aTidal = (Msun, dr, s) => (2 * G * Msun * MSUN * s) / Math.pow(dr * rS(Msun), 3) / G0;

  // ---- state -----------------------------------------------------------
  const state = { logM: 1, dr: 1, body: "person", angle: -Math.PI / 5 };

  // ---- number formatting ----------------------------------------------
  const SUP = { "-": "−", 0: "⁰", 1: "¹", 2: "²", 3: "³",
                4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
  const sup = (n) => String(n).split("").map((ch) => SUP[ch] ?? ch).join("");

  // Plain decimals stay plain; anything outside a comfortable range goes to
  // scientific with real superscripts, because this quantity spans twenty
  // decades and "0.0000000019" is unreadable.
  function fmt(v, sig = 3) {
    if (!isFinite(v)) return "—";
    if (v === 0) return "0";
    const e = Math.floor(Math.log10(Math.abs(v)));
    if (e >= -2 && e < 5) {
      const d = Math.max(0, sig - 1 - e);
      return v.toFixed(Math.min(d, 6)).replace(/\.?0+$/, "");
    }
    const m = v / Math.pow(10, e);
    return `${m.toFixed(sig - 1)} × 10${sup(e)}`;
  }
  // Spoken form for the aria-live region: superscripts do not read aloud well.
  function speak(v, sig = 3) {
    if (v === 0) return "zero";
    const e = Math.floor(Math.log10(Math.abs(v)));
    if (e >= -2 && e < 5) return fmt(v, sig);
    return `${(v / Math.pow(10, e)).toFixed(sig - 1)} times ten to the ${e}`;
  }

  // ---- DOM -------------------------------------------------------------
  const massInput = root.querySelector(".td-mass");
  const bodyInputs = [...root.querySelectorAll("input[name='td-body']")];
  const live = root.querySelector(".td-live");
  const plot = select(root).select(".td-plot");

  const svg = plot.append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("width", "100%")
    .attr("role", "img")
    .attr("aria-label",
      "A black disc marks the event horizon, fixed in size. Faint rings mark "
      + "distances of two, four, six and eight Schwarzschild radii. A draggable "
      + "marker shows the falling body. Because distance is measured in units of "
      + "the Schwarzschild radius, changing the black hole's mass does not change "
      + "this picture -- only the scale bar and the readouts below it change.");

  // rings at integer multiples of r_S
  const gRings = svg.append("g");
  for (let k = 2; k <= DR_MAX; k += 1) {
    gRings.append("circle")
      .attr("cx", CX).attr("cy", CY).attr("r", k * R0)
      .attr("fill", "none").attr("stroke", COL.grid).attr("stroke-width", 1);
    gRings.append("text")
      .attr("x", CX + k * R0 - 3).attr("y", CY - 4)
      .attr("text-anchor", "end").attr("font-size", 11).attr("fill", COL.muted)
      .text(`${k}`);
  }
  // Without this the ring numbers are unexplained.
  const ringCap = gRings.append("text")
    .attr("x", CX + DR_MAX * R0 - 3).attr("y", CY - 20)
    .attr("text-anchor", "end").attr("font-size", 11).attr("fill", COL.muted);
  ringCap.append("tspan").text("d / r");
  ringCap.append("tspan").attr("baseline-shift", "sub").attr("font-size", 8).text("S");

  // the horizon: a FIXED disc, and that is the whole point of the design
  svg.append("circle")
    .attr("cx", CX).attr("cy", CY).attr("r", R0)
    .attr("fill", COL.horizon);
  svg.append("text")
    .attr("x", CX).attr("y", CY + R0 + 15)
    .attr("text-anchor", "middle").attr("font-size", 11).attr("fill", COL.ink2)
    .text("horizon");

  const spoke = svg.append("line")
    .attr("stroke", COL.axis).attr("stroke-width", 1).attr("stroke-dasharray", "3 3");

  const bodyDot = svg.append("circle")
    .attr("r", 7)
    .attr("fill", COL.body)
    .attr("stroke", COL.surface).attr("stroke-width", 1.5)
    .attr("tabindex", 0)
    .attr("role", "slider")
    .attr("aria-label", "Distance from the black hole, in Schwarzschild radii")
    .attr("aria-valuemin", DR_MIN).attr("aria-valuemax", DR_MAX)
    .style("cursor", "grab");

  // scale bar -- one horizon radius of screen, labelled with what that IS
  // Centred under the disc, and one horizon radius long, so its LABEL is the
  // only thing that changes when the mass does. That is the whole "visual
  // indication of how much physical distance is spanned by some distance on
  // the screen" that this design owes the reader.
  const SB_X = CX - 108;   // bar + label reads near-centred under the disc
  const SB_Y = H - 11;
  const gScale = svg.append("g");
  gScale.append("line")
    .attr("x1", SB_X).attr("x2", SB_X + R0).attr("y1", SB_Y).attr("y2", SB_Y)
    .attr("stroke", COL.ink2).attr("stroke-width", 2);
  [SB_X, SB_X + R0].forEach((x) => gScale.append("line")
    .attr("x1", x).attr("x2", x).attr("y1", SB_Y - 4).attr("y2", SB_Y + 4)
    .attr("stroke", COL.ink2).attr("stroke-width", 2));
  const scaleText = gScale.append("text")
    .attr("x", SB_X + R0 + 8).attr("y", SB_Y + 4)
    .attr("font-size", 12).attr("fill", COL.ink2);
  scaleText.append("tspan").text("= one r");
  scaleText.append("tspan").attr("baseline-shift", "sub").attr("font-size", 9).text("S");
  const scaleVal = scaleText.append("tspan");

  // ---- interaction -----------------------------------------------------
  const clampDr = (v) => Math.min(DR_MAX, Math.max(DR_MIN, v));

  bodyDot.call(drag()
    .on("start", function () { select(this).style("cursor", "grabbing"); })
    .on("drag", (event) => {
      const dx = event.x - CX, dy = event.y - CY;
      const r = Math.hypot(dx, dy);
      state.angle = Math.atan2(dy, dx);
      state.dr = clampDr(r / R0);
      render();
    })
    .on("end", function () { select(this).style("cursor", "grab"); }));

  bodyDot.on("keydown", (event) => {
    const big = event.shiftKey ? 1.0 : 0.1;
    let handled = true;
    switch (event.key) {
      case "ArrowRight": case "ArrowUp": state.dr = clampDr(state.dr + big); break;
      case "ArrowLeft": case "ArrowDown": state.dr = clampDr(state.dr - big); break;
      case "PageUp": state.dr = clampDr(state.dr + 1); break;
      case "PageDown": state.dr = clampDr(state.dr - 1); break;
      case "Home": state.dr = DR_MIN; break;
      case "End": state.dr = DR_MAX; break;
      default: handled = false;
    }
    if (handled) { event.preventDefault(); render(); }
  });

  massInput.addEventListener("input", () => {
    state.logM = +massInput.value;
    render();
  });
  bodyInputs.forEach((el) => el.addEventListener("change", () => {
    if (el.checked) { state.body = el.value; render(); }
  }));

  // ---- render ----------------------------------------------------------
  function render() {
    const M = Math.pow(10, state.logM);
    const b = BODIES[state.body];
    const rs_cm = rS(M);
    const d_cm = state.dr * rs_cm;
    const at = aTidal(M, state.dr, b.s);
    const ratio = b.s / d_cm;
    const broken = ratio > SMALL_BODY_LIMIT;

    const px = CX + Math.cos(state.angle) * state.dr * R0;
    const py = CY + Math.sin(state.angle) * state.dr * R0;
    bodyDot.attr("cx", px).attr("cy", py)
      .attr("aria-valuenow", state.dr.toFixed(2))
      .attr("aria-valuetext", `${state.dr.toFixed(2)} Schwarzschild radii`);
    spoke.attr("x1", CX).attr("y1", CY).attr("x2", px).attr("y2", py);
    scaleVal.text(` = ${fmt(rs_cm / 1e5)} km`);

    root.querySelector(".td-out-mass").textContent = `${fmt(M)} M⊙`;
    root.querySelector(".td-out-rs").textContent = `${fmt(rs_cm / 1e5)} km`;
    root.querySelector(".td-out-dr").textContent = state.dr.toFixed(2);
    root.querySelector(".td-out-d").textContent = `${fmt(d_cm / 1e5)} km`;
    root.querySelector(".td-out-at").textContent = `${fmt(at)} g`;

    const badgeEl = root.querySelector(".td-badge");
    badgeEl.textContent = badge(at);
    badgeEl.hidden = broken;

    const warn = root.querySelector(".td-warn");
    warn.hidden = !broken;
    if (broken) {
      warn.textContent =
        `${b.label} is not small compared with this distance (s/d ≈ ${fmt(ratio, 2)}), `
        + "so the Δr ≪ d assumption behind the formula has broken down. "
        + "Try a heavier black hole, or move further out.";
    }

    live.textContent = broken
      ? `Approximation broken: s over d is ${speak(ratio, 2)}.`
      : `${state.dr.toFixed(2)} Schwarzschild radii. Tidal acceleration `
        + `${speak(at)} g. ${badge(at)}.`;
  }

  // Reflect the initial state back into the controls, so a reload that
  // restores form values cannot leave the picture disagreeing with them.
  massInput.value = state.logM;
  bodyInputs.forEach((el) => { el.checked = el.value === state.body; });
  render();

  // Exposed ONLY so the offline test harness can drive the widget and compare
  // against the Python reference implementation. Nothing in the page uses it.
  root.__tidal = {
    set(logM, dr, body) {
      state.logM = logM; state.dr = dr; state.body = body;
      // Keep the visible controls in step, so a screenshot taken after a
      // scripted set() cannot show a radio disagreeing with the readout.
      massInput.value = logM;
      bodyInputs.forEach((el) => { el.checked = el.value === body; });
      render();
    },
    read() {
      const M = Math.pow(10, state.logM);
      return { M, rS_km: rS(M) / 1e5, dr: state.dr,
               at_g: aTidal(M, state.dr, BODIES[state.body].s),
               badge: badge(aTidal(M, state.dr, BODIES[state.body].s)) };
    },
  };
}

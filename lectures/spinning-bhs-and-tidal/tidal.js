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
  const RSUN = 6.957e10;          // cm
  const BODIES = {
    person: { s: 180.0, label: "a person", note: "1.8 m tall" },
    star: { s: 2 * RSUN, label: "a Sun-like star", note: "one solar diameter" },
  };

  // The a_t formula assumes dr << d. For a star that close it does not hold,
  // so the NUMBER is indicative only -- but the disruption verdict below does
  // not depend on it, being a separate criterion.
  const SMALL_BODY_LIMIT = 0.1;

  // Tidal disruption radius, from the tide across the star beating its own
  // self-gravity:
  //     2 G M_BH R_* / r^3  ~  G M_* / R_*^2   ->   r ~ R_*(2 M_BH/M_*)^(1/3)
  //
  // NOTE ON THE EXPONENT. Kayhan's note wrote (2 M_BH/M_*)^(1/2). The cube
  // root is what the derivation above gives, and his factor of 2 matches that
  // derivation exactly, so the 1/2 reads as a slip. It is also self-checking:
  // with 1/2, "disrupted" is the ONLY verdict reachable anywhere in this
  // widget's range, so his own three-badge design collapses to one. Flagged
  // to him rather than changed silently.
  const rTidal = (Msun) => RSUN * Math.cbrt(2 * Msun);   // cm, solar star

  // ---- geometry --------------------------------------------------------
  // 5 r_S rather than a wider field: the interesting action is between 1 and
  // 2 r_S, and at 8 the horizon became a dot in a sea of empty rings. Dragging
  // still spans a factor of 125 in a_t, and the badge ladder was re-swept at
  // this range -- all eleven rungs stay reachable.
  const DR_MIN = 1, DR_MAX = 5;   // d / r_S
  const R0 = 52;                  // px per r_S -- the horizon's fixed radius
  const PAD = 22;
  const SCALE_H = 42;             // strip under the disc for the scale bar
                                  // (deep enough that the r_S subscript is
                                  //  not clipped by the viewBox edge)
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
    // The roller-coaster rung is GONE: Kayhan pointed out that the strongest
    // real coaster pulls about 6 g, which is BELOW the fighter pilot rung it
    // was sitting above. It was simply wrong.
    [2e1, "like a hippopotamus sitting on you"],
    [9e0, "the most a fighter pilot can take"],
    [1e0, "as if a second you were hanging from your feet"],
    [1e-1, "like leaning into a strong breeze"],
    [1e-4, "roughly the tug of a spider's web"],
    [1e-7, "about Earth's own tide across your body"],
    [0, "far too small to detect by any means"],
  ];
  const badge = (g) => (RUNGS.find(([t]) => g >= t) || RUNGS[RUNGS.length - 1])[1];
  const badgeTone = (g) => (g >= 1e3 ? "severe" : g >= 9 ? "warn" : "calm");

  // A star gets its own verdicts, because "what does this feel like" is the
  // wrong question for something held together by its own gravity.
  function starVerdict(Msun, dr) {
    const rt = rTidal(Msun) / rS(Msun);          // tidal radius in units of r_S
    if (dr <= rt) return { text: "the star is tidally disrupted this close!", tone: "severe", rt };
    if (dr <= 2 * rt) return { text: "the star is noticeably stretched out", tone: "warn", rt };
    return { text: "the star is not really perturbed", tone: "calm", rt };
  }

  // ---- physics ---------------------------------------------------------
  const rS = (Msun) => (2 * G * Msun * MSUN) / (C * C);          // cm
  const aTidal = (Msun, dr, s) => (2 * G * Msun * MSUN * s) / Math.pow(dr * rS(Msun), 3) / G0;

  // ---- crossing the horizon --------------------------------------------
  // The horizon is NOT a wall, and until now this widget behaved as though it
  // were: the faller clamped at d/r_S = 1 and bounced off. Section 2.3 says
  // outright that the horizon "is not a physical surface", and Section 2.1's
  // one-way-street analogy exists precisely to say that nothing stops you
  // going IN -- only coming back. A hard stop taught the opposite.
  //
  // So the faller can now be pushed through, falls to the centre, and stays
  // there until Reset. You cannot drag it back out; that asymmetry IS the
  // lesson, and it is something an interactive can do that prose cannot.
  //
  // THE DETENT is not a nicety. The widget's central lesson is "park at
  // d/r_S = 1 and sweep the mass", so without help the single most important
  // position would also be the edge of a cliff. Between these two bounds the
  // faller sticks to exactly 1, which makes parking at the horizon EASIER
  // than it was before, and makes crossing a deliberate extra push rather
  // than an accident.
  const SNAP_OUT = 0.15;   // pulled back to 1 from up to this far outside
  const SNAP_IN = 0.20;    // held at 1 until pushed this far inside
  const START_DR = 4, START_ANGLE = -Math.PI / 2;   // above the hole
  const FALL_MS = 900;

  // ---- state -----------------------------------------------------------
  // phase: "free" (draggable) | "falling" (animating in) | "gone" (at centre)
  const state = {
    logM: 1, dr: START_DR, body: "person", angle: START_ANGLE,
    phase: "free", fallFrom: START_DR, fallT0: 0,
  };

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
      + "distances of two, three, four and five Schwarzschild radii. A draggable "
      + "marker shows the falling body, which starts directly above the hole at "
      + "four Schwarzschild radii and settles onto the horizon when brought "
      + "close to it. Because distance is measured in units of the Schwarzschild "
      + "radius, changing the black hole's mass does not change this picture -- "
      + "only the scale bar and the readouts below it change. If the body is "
      + "pushed through the horizon it falls to the centre and stays there until "
      + "the Reset button is pressed.");

  // rings at integer multiples of r_S
  const gRings = svg.append("g");
  for (let k = 2; k <= DR_MAX; k += 1) {
    gRings.append("circle")
      .attr("cx", CX).attr("cy", CY).attr("r", k * R0)
      .attr("fill", "none").attr("stroke", COL.grid).attr("stroke-width", 1);
    gRings.append("text")
      .attr("x", CX + k * R0 - 3).attr("y", CY - 4)
      .attr("text-anchor", "end").attr("font-size", 15).attr("fill", COL.muted)
      .text(`${k}`);
  }
  // Without this the ring numbers are unexplained.
  const ringCap = gRings.append("text")
    .attr("x", CX + DR_MAX * R0 - 3).attr("y", CY - 28)
    .attr("text-anchor", "end").attr("font-size", 15).attr("fill", COL.muted);
  // House style: a maths VARIABLE is italic, a label subscript stays upright.
  // So d and r lean, S does not.
  ringCap.append("tspan").attr("font-style", "italic").text("d");
  ringCap.append("tspan").text(" / ");
  ringCap.append("tspan").attr("font-style", "italic").text("r");
  ringCap.append("tspan").attr("baseline-shift", "sub").attr("font-size", 11).text("S");

  // the horizon: a FIXED disc, and that is the whole point of the design
  svg.append("circle")
    .attr("cx", CX).attr("cy", CY).attr("r", R0)
    .attr("fill", COL.horizon);
  svg.append("text")
    .attr("x", CX).attr("y", CY + R0 + 15)
    .attr("text-anchor", "middle").attr("font-size", 16).attr("fill", COL.ink2)
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
    // valuemin is 0, not DR_MIN: the value really can reach 0 now, when the
    // faller is inside. There is no valid POSITION between 0 and 1 -- crossing
    // is a discrete event, not a range -- but the reported value must still
    // lie inside the advertised bounds or assistive tech is being lied to.
    .attr("aria-valuemin", 0).attr("aria-valuemax", DR_MAX)
    .style("cursor", "grab");

  // scale bar -- one horizon radius of screen, labelled with what that IS
  // Centred under the disc, and one horizon radius long, so its LABEL is the
  // only thing that changes when the mass does. That is the whole "visual
  // indication of how much physical distance is spanned by some distance on
  // the screen" that this design owes the reader.
  const SB_X = CX - 140;   // bar + label reads near-centred under the disc
  const SB_Y = H - 24;
  const gScale = svg.append("g");
  gScale.append("line")
    .attr("x1", SB_X).attr("x2", SB_X + R0).attr("y1", SB_Y).attr("y2", SB_Y)
    .attr("stroke", COL.ink2).attr("stroke-width", 2);
  [SB_X, SB_X + R0].forEach((x) => gScale.append("line")
    .attr("x1", x).attr("x2", x).attr("y1", SB_Y - 4).attr("y2", SB_Y + 4)
    .attr("stroke", COL.ink2).attr("stroke-width", 2));
  const scaleText = gScale.append("text")
    .attr("x", SB_X + R0 + 8).attr("y", SB_Y + 4)
    .attr("font-size", 17).attr("fill", COL.ink2);
  scaleText.append("tspan").text("= one ");
  scaleText.append("tspan").attr("font-style", "italic").text("r");
  scaleText.append("tspan").attr("baseline-shift", "sub").attr("font-size", 12).text("S");
  const scaleVal = scaleText.append("tspan");

  // ---- interaction -----------------------------------------------------
  const clampDr = (v) => Math.min(DR_MAX, Math.max(DR_MIN, v));

  function startFall() {
    if (state.phase !== "free") return;
    state.phase = "falling";
    state.fallFrom = state.dr;
    state.fallT0 = performance.now();
    requestAnimationFrame(stepFall);
    // requestAnimationFrame does NOT run in a hidden tab, and is throttled in
    // some environments. Without this the faller can be left stranded partway
    // in -- a real scenario: a student switches tab mid-fall and comes back to
    // a widget that looks broken. The timer guarantees the end state whether
    // or not a single frame ever renders.
    clearTimeout(state.fallGuard);
    state.fallGuard = setTimeout(() => {
      if (state.phase === "falling") { state.dr = 0; state.phase = "gone"; render(); }
    }, FALL_MS + 80);
    render();
  }

  function stepFall(now) {
    const t = Math.min(1, (now - state.fallT0) / FALL_MS);
    // Accelerating inward: r = r0(1 - t^2), so speed grows with t, which is
    // the right shape for something falling rather than being lowered.
    state.dr = state.fallFrom * (1 - t * t);
    if (state.phase !== "falling") return;          // the guard already landed it
    if (t < 1) { render(); requestAnimationFrame(stepFall); }
    else { clearTimeout(state.fallGuard); state.dr = 0; state.phase = "gone"; render(); }
  }

  function resetFaller() {
    clearTimeout(state.fallGuard);
    state.phase = "free";
    state.dr = START_DR;
    state.angle = START_ANGLE;
    render();
    bodyDot.node().focus();
  }

  bodyDot.call(drag()
    .on("start", function () {
      if (state.phase !== "free") return;
      select(this).style("cursor", "grabbing");
    })
    .on("drag", (event) => {
      if (state.phase !== "free") return;
      const dx = event.x - CX, dy = event.y - CY;
      const raw = Math.hypot(dx, dy) / R0;
      state.angle = Math.atan2(dy, dx);
      if (raw < 1 - SNAP_IN) { startFall(); return; }        // pushed through
      state.dr = raw < 1 + SNAP_OUT ? 1 : clampDr(raw);      // detent at 1
      render();
    })
    .on("end", function () { select(this).style("cursor", "grab"); }));

  bodyDot.on("keydown", (event) => {
    if (state.phase !== "free") return;
    const big = event.shiftKey ? 1.0 : 0.1;
    let handled = true, inward = false;
    switch (event.key) {
      case "ArrowRight": case "ArrowUp": state.dr = clampDr(state.dr + big); break;
      case "ArrowLeft": case "ArrowDown": inward = true; break;
      case "PageUp": state.dr = clampDr(state.dr + 1); break;
      case "PageDown": inward = true; break;
      case "Home": inward = true; break;
      case "End": state.dr = DR_MAX; break;
      default: handled = false;
    }
    if (inward) {
      // Plain arrows STOP at the horizon and never cross. This is the keyboard
      // half of the detent, and it is not optional: without it, holding the
      // left arrow walks straight through, so a keyboard user could never park
      // at d/r_S = 1 -- which is where the widget's central lesson lives. The
      // deliberate crossing is the "Fall in" button, which is reachable by
      // keyboard like any other button.
      const step = event.key === "Home" ? state.dr - DR_MIN
                 : event.key === "PageDown" ? 1 : big;
      state.dr = clampDr(state.dr - step);
    }
    if (handled) { event.preventDefault(); if (state.phase === "free") render(); }
  });

  root.querySelector(".td-reset").addEventListener("click", resetFaller);
  root.querySelector(".td-fall").addEventListener("click", () => {
    if (state.phase === "free") startFall();
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

    const gone = state.phase === "gone";
    const inside = state.phase !== "free";

    const px = CX + Math.cos(state.angle) * state.dr * R0;
    const py = CY + Math.sin(state.angle) * state.dr * R0;
    bodyDot.attr("cx", px).attr("cy", py)
      .attr("aria-valuenow", gone ? 0 : state.dr.toFixed(2))
      .attr("aria-disabled", gone ? "true" : null)
      .attr("opacity", gone ? 0.45 : 1)
      .attr("aria-valuetext",
        gone ? "inside the horizon"
             : Math.abs(state.dr - 1) < 1e-9
               ? "1.00 Schwarzschild radii, at the horizon. "
                 + "Use the Fall in button to cross it."
               : `${state.dr.toFixed(2)} Schwarzschild radii`);
    // No spoke once it is inside: there is no longer a radial distance to draw.
    spoke.attr("x1", CX).attr("y1", CY)
      .attr("x2", inside ? CX : px).attr("y2", inside ? CY : py)
      .attr("opacity", inside ? 0 : 1);
    scaleVal.text(` = ${fmt(rs_cm / 1e5)} km`);

    // "M⊙" with U+2299 rides the maths axis and floats high beside the digits;
    // a real <sub> sets it where a solar subscript belongs.
    const massOut = root.querySelector(".td-out-mass");
    massOut.textContent = `${fmt(M)} M`;
    massOut.appendChild(Object.assign(document.createElement("sub"), { textContent: "⊙" }));
    // r_S survives a fall -- it is a property of the black hole, not of the
    // faller. The other three do not: inside the horizon a_t would diverge as
    // r -> 0, and worse, the radial coordinate in there is not the distance
    // this readout implies. Printing a number would be quantitatively false,
    // so the row simply goes quiet. That silence is itself honest: the
    // description we derived has stopped applying.
    root.querySelector(".td-out-rs").textContent = `${fmt(rs_cm / 1e5)} km`;
    root.querySelector(".td-out-dr").textContent = inside ? "—" : state.dr.toFixed(2);
    root.querySelector(".td-out-d").textContent = inside ? "—" : `${fmt(d_cm / 1e5)} km`;
    root.querySelector(".td-out-at").textContent = inside ? "—" : `${fmt(at)} g`;

    // A star is judged by whether its own gravity still holds it together;
    // a person by what the tide would feel like. Different questions.
    const isStar = state.body === "star";
    const sv = isStar && !inside ? starVerdict(M, state.dr) : null;
    const lost = isStar
      ? "The star fell into the black hole, never to be seen again!"
      : "The astronaut fell into the black hole, never to be seen again!";
    const text = inside ? lost : isStar ? sv.text : badge(at);
    const tone = inside ? "severe" : isStar ? sv.tone : badgeTone(at);

    const badgeEl = root.querySelector(".td-badge");
    badgeEl.textContent = text;
    badgeEl.className = `td-badge td-badge-${tone}`;
    badgeEl.hidden = false;

    // Reset is always in the DOM so it can be found before it is needed --
    // a student who loses the faller and cannot see a way back concludes the
    // widget is broken. It only gains emphasis once it is the thing to press.
    root.querySelector(".td-reset").classList.toggle("td-reset-live", inside);
    root.querySelector(".td-reset").disabled = !inside;
    root.querySelector(".td-fall").disabled = inside;

    // The caveat is about the NUMBER, not the verdict: the disruption
    // criterion is independent of the small-body formula.
    const warn = root.querySelector(".td-warn");
    warn.hidden = !broken || inside;
    if (broken && !inside) {
      // Built from nodes rather than a string because the maths in it has to be
      // set properly: variables italic, the label subscript upright.
      //
      // HOUSE RULE, and it is easy to violate without noticing: do not open a
      // sentence with a maths symbol or a number. This one used to start
      // "a_t above uses...", which reads as though the symbol were a word.
      // "Above, a_t ..." costs nothing and fixes it.
      warn.textContent = "";
      const t = (x) => document.createTextNode(x);
      const it = (x) => Object.assign(document.createElement("i"), { textContent: x });
      const sub_ = (x) => Object.assign(document.createElement("sub"), { textContent: x });
      warn.append(
        t("Above, "), it("a"), sub_("t"),
        t(" uses the small-body formula, which assumes the body is much smaller than "),
        it("d"), t(`. For ${b.label} at this distance it is not (`),
        it("s"), t("/"), it("d"), t(` ≈ ${fmt(ratio, 2)}), so treat that number `),
        t("as indicative only. The verdict above does not depend on it."),
      );
    }

    live.textContent = gone
      ? `${lost} Press Reset to try again.`
      : state.phase === "falling"
        ? lost
        : isStar
          ? `${state.dr.toFixed(2)} Schwarzschild radii, tidal radius `
            + `${sv.rt.toFixed(2)}. ${sv.text}`
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
    // test-only, as above
    phase: () => state.phase,
    cross: () => { startFall(); },
    reset: () => { resetFaller(); },
    set(logM, dr, body) {
      state.phase = "free";
      state.logM = logM; state.dr = dr; state.body = body;
      // Keep the visible controls in step, so a screenshot taken after a
      // scripted set() cannot show a radio disagreeing with the readout.
      massInput.value = logM;
      bodyInputs.forEach((el) => { el.checked = el.value === body; });
      render();
    },
    read() {
      const M = Math.pow(10, state.logM);
      const at = aTidal(M, state.dr, BODIES[state.body].s);
      return { M, rS_km: rS(M) / 1e5, dr: state.dr, at_g: at,
               badge: state.body === "star" ? starVerdict(M, state.dr).text : badge(at),
               rt_rS: rTidal(M) / rS(M) };
    },
  };
}

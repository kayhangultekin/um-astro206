// Interactive spacetime diagram for ASTRO 206, Lecture 3.
//
// Two inertial frames on one set of axes: the unprimed lab frame (neutral,
// rectangular) and the primed frame moving at beta (red, skewed). Students
// place two events, read their coordinates in both frames, and watch the
// spacetime interval stay fixed while the individual coordinates change.
//
// Units: c = 1, so the vertical axis is ct and light travels on 45-degree
// lines. Internally the time coordinate is called `w` (for ct) to keep the
// Lorentz algebra readable.

import { scaleLinear } from "https://cdn.jsdelivr.net/npm/d3-scale@4/+esm";
import { select, pointer } from "https://cdn.jsdelivr.net/npm/d3-selection@3/+esm";
import { drag } from "https://cdn.jsdelivr.net/npm/d3-drag@3/+esm";
import { format } from "https://cdn.jsdelivr.net/npm/d3-format@3/+esm";

const root = document.getElementById("st-fig");
if (root) init(root);

function init(root) {
  // ---- constants -------------------------------------------------------
  // Equal domains + a square plot keep light rays at a true 45 degrees.
  const LIM = 3;
  const M = { top: 14, right: 16, bottom: 40, left: 46 };
  const PLOT = 470;
  const W = PLOT + M.left + M.right;
  const H = PLOT + M.top + M.bottom;

  const COL = {
    ink: "#0b0b0b",
    ink2: "#52514e",
    muted: "#898781",
    grid: "#e1e0d9",
    axis: "#c3c2b7",
    surface: "#fcfcfb",
    light: "#2a78d6", // light rays (validated against red, all-pairs)
    prime: "#e34948", // the primed frame
  };

  const f2 = format(".2f");
  const f3 = format("+.3f");

  // ---- state -----------------------------------------------------------
  const state = {
    beta: 0.5,
    events: [], // up to two {x, w}
    showGrid: true,
    showCone: true,
    showWorldline: true,
    showLight: false, // off by default: adds clutter more than insight
    metricTimelikePositive: true, // true => (+,-,-,-)
    cursor: { x: 0.6, w: 1.6 }, // keyboard crosshair
    keyboardMode: false,
  };

  const gamma = (b) => 1 / Math.sqrt(1 - b * b);

  // Lorentz boost along +x. Returns the primed coordinates of an event.
  function toPrimed(x, w, b) {
    const g = gamma(b);
    return { xp: g * (x - b * w), wp: g * (w - b * x) };
  }

  // ---- scales ----------------------------------------------------------
  const sx = scaleLinear().domain([-LIM, LIM]).range([0, PLOT]);
  const sw = scaleLinear().domain([-LIM, LIM]).range([PLOT, 0]);
  const px = (x) => sx(x);
  const pw = (w) => sw(w);
  const inv = ([mx, my]) => ({ x: sx.invert(mx), w: sw.invert(my) });
  const clampX = (x) => Math.max(-LIM, Math.min(LIM, x));

  // ---- scaffold --------------------------------------------------------
  const svg = select(root)
    .select(".st-plot")
    .append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("width", "100%")
    .style("max-width", W + "px")
    .style("height", "auto")
    .style("touch-action", "none")
    .attr("tabindex", 0)
    .attr("role", "application")
    .attr(
      "aria-label",
      "Interactive spacetime diagram. Use arrow keys to move the crosshair, " +
        "Enter to place an event, and C to clear."
    );

  const defs = svg.append("defs");
  defs
    .append("clipPath")
    .attr("id", "st-clip")
    .append("rect")
    .attr("width", PLOT)
    .attr("height", PLOT);

  const g = svg.append("g").attr("transform", `translate(${M.left},${M.top})`);

  // Background captures clicks anywhere in the plot.
  g.append("rect")
    .attr("class", "st-bg")
    .attr("width", PLOT)
    .attr("height", PLOT)
    .attr("fill", COL.surface)
    .style("cursor", "crosshair");

  // Painting order: cones under grids under axes under events.
  //
  // Every decorative layer is pointer-transparent. Without this, a click that
  // lands on a grid line, an axis, or (worst) the large light-cone polygon is
  // swallowed before it reaches the background rect, and the event silently
  // fails to place. Only the background and the draggable event handles take
  // pointer events.
  const decor = () =>
    g
      .append("g")
      .attr("clip-path", "url(#st-clip)")
      .style("pointer-events", "none");

  const layerCone = decor();
  const layerGridU = decor();
  const layerGridP = decor();
  const layerAxesU = decor();
  const layerLight = decor();
  const layerAxesP = decor();
  const layerWorld = decor();
  const layerCursor = decor();
  const layerEvents = g.append("g");
  const layerLabels = g.append("g").style("pointer-events", "none");

  // ---- static chrome: unprimed grid, axes, ticks ------------------------
  const ticks = [-3, -2, -1, 0, 1, 2, 3];

  layerGridU
    .selectAll("line.v")
    .data(ticks)
    .join("line")
    .attr("x1", px)
    .attr("x2", px)
    .attr("y1", 0)
    .attr("y2", PLOT)
    .attr("stroke", COL.grid)
    .attr("stroke-width", 1);

  layerGridU
    .selectAll("line.h")
    .data(ticks)
    .join("line")
    .attr("y1", pw)
    .attr("y2", pw)
    .attr("x1", 0)
    .attr("x2", PLOT)
    .attr("stroke", COL.grid)
    .attr("stroke-width", 1);

  // Unprimed axes through the origin.
  layerAxesU
    .append("line")
    .attr("x1", 0)
    .attr("x2", PLOT)
    .attr("y1", pw(0))
    .attr("y2", pw(0))
    .attr("stroke", COL.axis)
    .attr("stroke-width", 1.6);
  layerAxesU
    .append("line")
    .attr("x1", px(0))
    .attr("x2", px(0))
    .attr("y1", 0)
    .attr("y2", PLOT)
    .attr("stroke", COL.axis)
    .attr("stroke-width", 1.6);

  // Light rays through the origin (ct = +/- x) are toggleable, so they are
  // drawn in the dynamic pass rather than baked in as static chrome.
  function drawLight() {
    const rays = state.showLight ? [1, -1] : [];
    layerLight
      .selectAll("line")
      .data(rays)
      .join("line")
      .attr("x1", px(-LIM))
      .attr("y1", (s) => pw(-LIM * s))
      .attr("x2", px(LIM))
      .attr("y2", (s) => pw(LIM * s))
      .attr("stroke", COL.light)
      .attr("stroke-width", 1.8);

    layerLight
      .selectAll("text")
      .data(state.showLight ? [1] : [])
      .join("text")
      .attr("x", px(2.55))
      .attr("y", pw(2.72))
      .attr("fill", COL.light)
      .attr("font-size", 12)
      .attr("text-anchor", "middle")
      .text("light");
  }

  // Axis ticks and numbers.
  const axg = svg
    .append("g")
    .attr("transform", `translate(${M.left},${M.top})`);
  ticks.forEach((t) => {
    if (t !== 0) {
      axg
        .append("text")
        .attr("x", px(t))
        .attr("y", PLOT + 18)
        .attr("text-anchor", "middle")
        .attr("font-size", 12)
        .attr("fill", COL.ink2)
        .text(t);
      axg
        .append("text")
        .attr("x", -10)
        .attr("y", pw(t) + 4)
        .attr("text-anchor", "end")
        .attr("font-size", 12)
        .attr("fill", COL.ink2)
        .text(t);
    }
  });
  axg
    .append("text")
    .attr("x", PLOT / 2)
    .attr("y", PLOT + 36)
    .attr("text-anchor", "middle")
    .attr("font-size", 13)
    .attr("fill", COL.ink2)
    .text("x");
  axg
    .append("text")
    .attr("transform", `translate(-34,${PLOT / 2}) rotate(-90)`)
    .attr("text-anchor", "middle")
    .attr("font-size", 13)
    .attr("fill", COL.ink2)
    .text("ct");

  // ---- dynamic: primed frame -------------------------------------------
  // A line of constant x' = k satisfies x = k/gamma + beta*w  (parallel to
  // the ct' axis). A line of constant ct' = k satisfies w = k/gamma + beta*x
  // (parallel to the x' axis). Writing them this way avoids the 1/beta
  // blow-up at beta = 0.
  function drawPrimed() {
    const b = state.beta;
    const gm = gamma(b);
    const ks = [-6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6];

    const gridData = state.showGrid
      ? ks.flatMap((k) => [
          { type: "x", k, pts: [[k / gm + b * -LIM, -LIM], [k / gm + b * LIM, LIM]] },
          { type: "w", k, pts: [[-LIM, k / gm + b * -LIM], [LIM, k / gm + b * LIM]] },
        ])
      : [];

    layerGridP
      .selectAll("line")
      .data(gridData)
      .join("line")
      .attr("x1", (d) => px(d.pts[0][0]))
      .attr("y1", (d) => pw(d.pts[0][1]))
      .attr("x2", (d) => px(d.pts[1][0]))
      .attr("y2", (d) => pw(d.pts[1][1]))
      .attr("stroke", COL.prime)
      .attr("stroke-width", 0.8)
      .attr("opacity", 0.3);

    // The primed axes themselves (k = 0).
    const axes = [
      { pts: [[b * -LIM, -LIM], [b * LIM, LIM]] }, // ct' axis (x' = 0)
      { pts: [[-LIM, b * -LIM], [LIM, b * LIM]] }, // x' axis (ct' = 0)
    ];
    layerAxesP
      .selectAll("line")
      .data(axes)
      .join("line")
      .attr("x1", (d) => px(d.pts[0][0]))
      .attr("y1", (d) => pw(d.pts[0][1]))
      .attr("x2", (d) => px(d.pts[1][0]))
      .attr("y2", (d) => pw(d.pts[1][1]))
      .attr("stroke", COL.prime)
      .attr("stroke-width", 2.2);

    // Axis labels ride along with the axes.
    const lab = [
      { t: "ct′", x: b * 2.78, w: 2.78, dx: b > 0.55 ? -14 : 12, dy: 0 },
      { t: "x′", x: 2.78, w: b * 2.78, dx: 0, dy: b > 0.55 ? 16 : -10 },
    ];
    layerAxesP
      .selectAll("text")
      .data(lab)
      .join("text")
      .attr("x", (d) => px(clampX(d.x)) + d.dx)
      .attr("y", (d) => pw(clampX(d.w)) + d.dy)
      .attr("fill", COL.prime)
      .attr("font-size", 13)
      .attr("font-style", "italic")
      .attr("text-anchor", "middle")
      .text((d) => d.t);
  }

  // ---- dynamic: light cone from event A --------------------------------
  function drawCone() {
    const a = state.events[0];
    const show = state.showCone && a;
    const R = 4 * LIM;
    const wedges = show
      ? [
          [[a.x, a.w], [a.x - R, a.w + R], [a.x + R, a.w + R]], // future
          [[a.x, a.w], [a.x - R, a.w - R], [a.x + R, a.w - R]], // past
        ]
      : [];

    layerCone
      .selectAll("polygon")
      .data(wedges)
      .join("polygon")
      .attr("points", (d) => d.map(([x, w]) => `${px(x)},${pw(w)}`).join(" "))
      .attr("fill", COL.light)
      .attr("opacity", 0.09);
  }

  // ---- dynamic: worldline between the two events -----------------------
  function drawWorldline() {
    const [a, bEv] = state.events;
    const show = state.showWorldline && a && bEv;
    layerWorld
      .selectAll("line")
      .data(show ? [[a, bEv]] : [])
      .join("line")
      .attr("x1", (d) => px(d[0].x))
      .attr("y1", (d) => pw(d[0].w))
      .attr("x2", (d) => px(d[1].x))
      .attr("y2", (d) => pw(d[1].w))
      .attr("stroke", COL.ink2)
      .attr("stroke-width", 1.4);
  }

  // ---- dynamic: events -------------------------------------------------
  const NAMES = ["A", "B"];

  function drawEvents() {
    const sel = layerEvents
      .selectAll("g.st-ev")
      .data(state.events, (d, i) => i);

    const enter = sel
      .enter()
      .append("g")
      .attr("class", "st-ev")
      .style("cursor", "grab");
    enter
      .append("circle")
      .attr("r", 12)
      .attr("fill", "transparent"); // enlarged hit target
    enter
      .append("circle")
      .attr("class", "dot")
      .attr("r", 6.5)
      .attr("fill", COL.ink)
      .attr("stroke", COL.surface)
      .attr("stroke-width", 2);
    enter
      .append("text")
      .attr("class", "lbl")
      .attr("dx", 11)
      .attr("dy", -9)
      .attr("font-size", 14)
      .attr("font-weight", 600)
      .attr("fill", COL.ink);

    const merged = enter.merge(sel);
    merged.attr("transform", (d) => `translate(${px(d.x)},${pw(d.w)})`);
    merged.select("text.lbl").text((d, i) => NAMES[i]);
    sel.exit().remove();

    merged.call(
      drag()
        .on("start", function () {
          select(this).style("cursor", "grabbing");
        })
        .on("drag", function (ev, d) {
          const [mx, my] = pointer(ev, g.node());
          d.x = clampX(sx.invert(mx));
          d.w = clampX(sw.invert(my));
          redrawDynamic();
        })
        .on("end", function () {
          select(this).style("cursor", "grab");
          announce();
        })
    );
  }

  // ---- dynamic: keyboard crosshair -------------------------------------
  function drawCursor() {
    const show = state.keyboardMode;
    const c = state.cursor;
    const marks = show ? [c] : [];

    // Dashed, and only a short reticle around the point rather than full-width
    // rules — so it never reads as another coordinate system.
    const R = 26; // reticle half-length, px
    const sel = layerCursor.selectAll("g.st-cur").data(marks);
    const enter = sel.enter().append("g").attr("class", "st-cur");
    enter
      .append("line")
      .attr("class", "h")
      .attr("stroke", COL.prime)
      .attr("stroke-width", 1.2)
      .attr("stroke-dasharray", "3 3");
    enter
      .append("line")
      .attr("class", "v")
      .attr("stroke", COL.prime)
      .attr("stroke-width", 1.2)
      .attr("stroke-dasharray", "3 3");
    enter
      .append("circle")
      .attr("class", "ring")
      .attr("r", 7)
      .attr("fill", "none")
      .attr("stroke", COL.prime)
      .attr("stroke-width", 1.2);
    const m = enter.merge(sel);
    m.select("line.h")
      .attr("x1", (d) => px(d.x) - R)
      .attr("x2", (d) => px(d.x) + R)
      .attr("y1", (d) => pw(d.w))
      .attr("y2", (d) => pw(d.w));
    m.select("line.v")
      .attr("y1", (d) => pw(d.w) - R)
      .attr("y2", (d) => pw(d.w) + R)
      .attr("x1", (d) => px(d.x))
      .attr("x2", (d) => px(d.x));
    m.select("circle.ring")
      .attr("cx", (d) => px(d.x))
      .attr("cy", (d) => pw(d.w));
    sel.exit().remove();
  }

  // ---- readout ---------------------------------------------------------
  const elBeta = root.querySelector(".st-beta-val");
  const elGamma = root.querySelector(".st-gamma-val");
  const elRows = root.querySelector(".st-rows");
  const elInterval = root.querySelector(".st-interval");
  const elLive = root.querySelector(".st-live");

  function classify(dx, dw) {
    const EPS = 1e-9;
    const d = Math.abs(dw) - Math.abs(dx);
    if (Math.abs(d) < 1e-6) return "lightlike";
    return d > EPS ? "timelike" : "spacelike";
  }

  function updateReadout() {
    const b = state.beta;
    elBeta.textContent = f2(b);
    elGamma.textContent = f2(gamma(b));

    // Coordinate rows.
    let rows = "";
    state.events.forEach((e, i) => {
      const { xp, wp } = toPrimed(e.x, e.w, b);
      rows +=
        `<tr><th scope="row">${NAMES[i]}</th>` +
        `<td>${f2(e.x)}</td><td>${f2(e.w)}</td>` +
        `<td class="st-p">${f2(xp)}</td><td class="st-p">${f2(wp)}</td></tr>`;
    });
    for (let i = state.events.length; i < 2; i++) {
      rows +=
        `<tr class="st-empty"><th scope="row">${NAMES[i]}</th>` +
        `<td colspan="4">not placed</td></tr>`;
    }
    elRows.innerHTML = rows;

    // Interval.
    if (state.events.length < 2) {
      elInterval.innerHTML =
        '<p class="st-hint">Place two events to see the interval.</p>';
      return;
    }
    const [a, bb] = state.events;
    const dx = bb.x - a.x;
    const dw = bb.w - a.w;
    const kind = classify(dx, dw);

    // The sign flips with the convention; the classification does not.
    const sPos = dw * dw - dx * dx; // (+,-,-,-)
    const s2 = state.metricTimelikePositive ? sPos : -sPos;
    const conv = state.metricTimelikePositive
      ? "(+,−,−,−)"
      : "(−,+,+,+)";
    const formula = state.metricTimelikePositive
      ? "(cΔt)² − (Δx)²"
      : "(Δx)² − (cΔt)²";

    // Same interval computed from the primed coordinates, to show invariance.
    const pa = toPrimed(a.x, a.w, b);
    const pb = toPrimed(bb.x, bb.w, b);
    const dxp = pb.xp - pa.xp;
    const dwp = pb.wp - pa.wp;
    const s2p = (state.metricTimelikePositive ? 1 : -1) * (dwp * dwp - dxp * dxp);

    let travel = "";
    if (kind === "timelike") {
      const need = Math.abs(dx / dw);
      travel =
        `<li>A massive particle can travel between them, at ` +
        `β = ${f2(need)}.</li>`;
    } else if (kind === "lightlike") {
      travel = "<li>Only light can connect them (β = 1).</li>";
    } else {
      travel =
        "<li>Nothing can travel between them — they are causally " +
        "disconnected.</li>";
    }

    elInterval.innerHTML =
      `<p class="st-s2"><span class="st-s2-label">Δs² = ${formula} =</span> ` +
      `<strong>${f3(s2)}</strong> ` +
      `<span class="st-kind st-kind-${kind}">${kind}</span></p>` +
      `<ul class="st-notes">` +
      `<li>From the primed coordinates: Δs² = ${f3(s2p)} — ` +
      `<em>the same number</em>. Move the β slider and watch ` +
      `x′ and ct′ change while Δs² does not.</li>` +
      travel +
      `<li>Convention ${conv}: ${kind} is ` +
      `${
        (kind === "timelike") === state.metricTimelikePositive
          ? "positive"
          : kind === "lightlike"
          ? "zero"
          : "negative"
      }. Flipping the convention flips the sign but never the ` +
      `classification.</li>` +
      `</ul>`;
  }

  function announce() {
    if (!elLive) return;
    const n = state.events.length;
    if (n === 0) {
      elLive.textContent = "Events cleared.";
      return;
    }
    const e = state.events[n - 1];
    const { xp, wp } = toPrimed(e.x, e.w, state.beta);
    let msg = `Event ${NAMES[n - 1]} at x ${f2(e.x)}, ct ${f2(e.w)}; primed x ${f2(
      xp
    )}, ct ${f2(wp)}.`;
    if (n === 2) {
      const [a, bb] = state.events;
      msg += ` Separation is ${classify(bb.x - a.x, bb.w - a.w)}.`;
    }
    elLive.textContent = msg;
  }

  // ---- redraw ----------------------------------------------------------
  function redrawDynamic() {
    drawPrimed();
    drawLight();
    drawCone();
    drawWorldline();
    drawEvents();
    drawCursor();
    updateReadout();
  }

  // ---- interaction: click to place -------------------------------------
  function placeEvent(x, w) {
    if (state.events.length >= 2) state.events = [];
    state.events.push({ x: clampX(x), w: clampX(w) });
    redrawDynamic();
    announce();
  }

  g.select("rect.st-bg").on("click", (ev) => {
    const { x, w } = inv(pointer(ev, g.node()));
    placeEvent(x, w);
  });

  // ---- interaction: keyboard -------------------------------------------
  // The crosshair is shown only for genuine keyboard use. Showing it on
  // `focus` was wrong: clicking the plot focuses the SVG (it is tabbable),
  // so a mouse user got a stray crosshair parked at the initial cursor
  // position, which reads as a spurious second set of grey axes.
  svg.on("pointerdown", () => {
    state.keyboardMode = false;
    drawCursor();
  });
  svg.on("blur", () => {
    state.keyboardMode = false;
    drawCursor();
  });

  svg.on("keydown", (ev) => {
    const step = ev.shiftKey ? 0.5 : 0.1;
    const c = state.cursor;
    let handled = true;
    switch (ev.key) {
      case "ArrowLeft":
        c.x = clampX(c.x - step);
        break;
      case "ArrowRight":
        c.x = clampX(c.x + step);
        break;
      case "ArrowUp":
        c.w = clampX(c.w + step);
        break;
      case "ArrowDown":
        c.w = clampX(c.w - step);
        break;
      case "Enter":
      case " ":
        placeEvent(c.x, c.w);
        break;
      case "c":
      case "C":
        clearEvents();
        break;
      default:
        handled = false;
    }
    if (handled) {
      ev.preventDefault();
      state.keyboardMode = true;
      drawCursor();
      if (ev.key.startsWith("Arrow") && elLive) {
        elLive.textContent = `Crosshair at x ${f2(c.x)}, ct ${f2(c.w)}.`;
      }
    }
  });

  // ---- controls --------------------------------------------------------
  function clearEvents() {
    state.events = [];
    redrawDynamic();
    announce();
  }

  const inBeta = root.querySelector(".st-beta");
  inBeta.addEventListener("input", () => {
    state.beta = +inBeta.value;
    redrawDynamic();
  });

  root.querySelector(".st-clear").addEventListener("click", clearEvents);

  const bind = (cls, key) => {
    const el = root.querySelector(cls);
    el.addEventListener("change", () => {
      state[key] = el.checked;
      redrawDynamic();
    });
  };
  bind(".st-toggle-grid", "showGrid");
  bind(".st-toggle-cone", "showCone");
  bind(".st-toggle-world", "showWorldline");
  bind(".st-toggle-light", "showLight");

  const inConv = root.querySelector(".st-conv");
  inConv.addEventListener("change", () => {
    state.metricTimelikePositive = inConv.value === "tplus";
    updateReadout();
  });

  // ---- go --------------------------------------------------------------
  redrawDynamic();
}

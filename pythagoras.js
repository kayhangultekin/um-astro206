// Interactive right triangle for the ASTRO 206 landing page.
//
// The same 3-4-5 triangle as the static figure above it, but the two legs are
// draggable. Vertex C stays pinned at the origin and each handle is confined to
// the axis it starts on, so the angle at C stays right no matter what the
// student does -- which is the whole point: a and b move freely, and c is not
// free, it is whatever the theorem says it is.
//
// Colours come from the same validated palette as the matplotlib figures, so
// the hypotenuse is the same blue here as it is above.
//
// Accessibility: each handle is a real `role="slider"` rather than a bare
// draggable dot, so it is reachable by Tab, driven by the arrow keys, and
// reports its value to a screen reader. Numeric state is also mirrored into an
// aria-live region, because a slider's own value announcement cannot say what
// happened to c.

import { scaleLinear } from "https://cdn.jsdelivr.net/npm/d3-scale@4/+esm";
import { select } from "https://cdn.jsdelivr.net/npm/d3-selection@3/+esm";
import { drag } from "https://cdn.jsdelivr.net/npm/d3-drag@3/+esm";

const root = document.getElementById("py-fig");
if (root) init(root);

function init(root) {
  // ---- constants -------------------------------------------------------
  // Legs run to 15 rather than 10 so that every triple in the table above is
  // reachable here: 1-10 admits only (3,4,5) and its double (6,8,10), while
  // 1-15 also admits (5,12,13), (8,15,17) and (9,12,15). The grid is drawn one
  // unit further out so a full-length leg still has air beyond it.
  const LIM = 16;
  const MIN_LEG = 1;
  const MAX_LEG = 15;
  const PLOT = 460;        // square: a right angle has to LOOK like one
  const M = { top: 14, right: 18, bottom: 38, left: 44 };
  const W = PLOT + M.left + M.right;
  const H = PLOT + M.top + M.bottom;

  const COL = {
    ink: "#0b0b0b",
    ink2: "#52514e",
    muted: "#898781",
    grid: "#e1e0d9",
    axis: "#c3c2b7",
    surface: "#fcfcfb",
    hyp: "#2a78d6",        // BLUE -- the static figure's hypotenuse colour
    handle: "#eb6834",     // ORANGE -- the palette slot that says "grab me"
  };

  const state = { a: 4, b: 3, snap: true };

  // ---- scales ----------------------------------------------------------
  const sx = scaleLinear().domain([0, LIM]).range([0, PLOT]);
  const sy = scaleLinear().domain([0, LIM]).range([PLOT, 0]);

  const clampLeg = (v) => Math.max(MIN_LEG, Math.min(MAX_LEG, v));
  const quant = (v) => (state.snap ? Math.round(v) : Math.round(v * 100) / 100);
  const isWhole = (v) => Math.abs(v - Math.round(v)) < 1e-9;
  const hyp = () => Math.sqrt(state.a * state.a + state.b * state.b);

  const fmtLeg = (v) => (isWhole(v) ? String(Math.round(v)) : v.toFixed(2));
  const fmtC = (v) => (isWhole(v) ? String(Math.round(v)) : v.toFixed(3));
  const fmtSq = (v) => (isWhole(v) ? String(Math.round(v)) : v.toFixed(2));

  // ---- svg scaffold ----------------------------------------------------
  const svg = select(root).select(".py-plot").append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("width", "100%")
    .attr("class", "py-svg")
    .attr("role", "group")
    .attr("aria-label",
      "Interactive right triangle on a coordinate grid. The right angle is " +
      "pinned at the origin; the two legs can be lengthened and shortened.");

  const g = svg.append("g").attr("transform", `translate(${M.left},${M.top})`);

  // ---- static layer: grid, axes, ticks ---------------------------------
  const gGrid = g.append("g").attr("aria-hidden", "true");
  for (let i = 0; i <= LIM; i++) {
    gGrid.append("line")
      .attr("x1", sx(i)).attr("x2", sx(i)).attr("y1", sy(0)).attr("y2", sy(LIM))
      .attr("stroke", COL.grid).attr("stroke-width", 1);
    gGrid.append("line")
      .attr("x1", sx(0)).attr("x2", sx(LIM)).attr("y1", sy(i)).attr("y2", sy(i))
      .attr("stroke", COL.grid).attr("stroke-width", 1);
  }
  // Axes sit on top of the grid, a shade darker.
  gGrid.append("line")
    .attr("x1", sx(0)).attr("x2", sx(LIM)).attr("y1", sy(0)).attr("y2", sy(0))
    .attr("stroke", COL.axis).attr("stroke-width", 1.4);
  gGrid.append("line")
    .attr("x1", sx(0)).attr("x2", sx(0)).attr("y1", sy(0)).attr("y2", sy(LIM))
    .attr("stroke", COL.axis).attr("stroke-width", 1.4);

  for (let i = 1; i <= MAX_LEG; i++) {
    gGrid.append("text").attr("class", "py-tick")
      .attr("x", sx(i)).attr("y", sy(0) + 18)
      .attr("text-anchor", "middle").attr("fill", COL.ink2).text(i);
    gGrid.append("text").attr("class", "py-tick")
      .attr("x", sx(0) - 10).attr("y", sy(i) + 4)
      .attr("text-anchor", "end").attr("fill", COL.ink2).text(i);
  }

  // ---- dynamic layer ---------------------------------------------------
  const gTri = g.append("g").attr("aria-hidden", "true");
  const legA = gTri.append("line").attr("stroke", COL.ink).attr("stroke-width", 3)
    .attr("stroke-linecap", "round");
  const legB = gTri.append("line").attr("stroke", COL.ink).attr("stroke-width", 3)
    .attr("stroke-linecap", "round");
  const hypLine = gTri.append("line").attr("stroke", COL.hyp).attr("stroke-width", 3)
    .attr("stroke-linecap", "round");
  const rightAngle = gTri.append("path")
    .attr("fill", "none").attr("stroke", COL.muted).attr("stroke-width", 1.4);

  // Only c is labelled on the figure. The legs carried "a = 7" / "b = 10"
  // labels, which collided with the axis ticks and duplicated the readout
  // below; c stays because it is the derived value and sits in open space.
  const labC = gTri.append("text").attr("class", "py-side").attr("fill", COL.hyp);

  const vertC = gTri.append("text").attr("class", "py-vertex").attr("fill", COL.ink2).text("C");
  const vertA = gTri.append("text").attr("class", "py-vertex").attr("fill", COL.ink2).text("A");
  const vertB = gTri.append("text").attr("class", "py-vertex").attr("fill", COL.ink2).text("B");

  const gHandles = g.append("g");

  // The handle on the horizontal axis sets side a; the one on the vertical
  // axis sets side b. Labelled by the side each one CONTROLS, which is the
  // functional description a screen-reader user needs.
  const handleA = gHandles.append("circle")
    .attr("class", "py-handle").attr("r", 9)
    .attr("fill", COL.handle).attr("stroke", COL.surface).attr("stroke-width", 2)
    .attr("tabindex", 0).attr("role", "slider")
    .attr("aria-label", "Length of side a, the horizontal leg")
    .attr("aria-valuemin", MIN_LEG).attr("aria-valuemax", MAX_LEG);

  const handleB = gHandles.append("circle")
    .attr("class", "py-handle").attr("r", 9)
    .attr("fill", COL.handle).attr("stroke", COL.surface).attr("stroke-width", 2)
    .attr("tabindex", 0).attr("role", "slider")
    .attr("aria-label", "Length of side b, the vertical leg")
    .attr("aria-valuemin", MIN_LEG).attr("aria-valuemax", MAX_LEG);

  // ---- readout ---------------------------------------------------------
  const outA = select(root).select(".py-val-a");
  const outB = select(root).select(".py-val-b");
  const outC = select(root).select(".py-val-c");
  const outId = select(root).select(".py-identity");
  const badge = select(root).select(".py-badge");
  const live = select(root).select(".py-live");

  function draw() {
    const { a, b } = state;
    const c = hyp();
    const ox = sx(0), oy = sy(0);

    legA.attr("x1", ox).attr("y1", oy).attr("x2", sx(a)).attr("y2", oy);
    legB.attr("x1", ox).attr("y1", oy).attr("x2", ox).attr("y2", sy(b));
    hypLine.attr("x1", ox).attr("y1", sy(b)).attr("x2", sx(a)).attr("y2", oy);

    // Right-angle marker, sized in pixels so it never distorts.
    const m = 14;
    rightAngle.attr("d", `M ${ox + m} ${oy} L ${ox + m} ${oy - m} L ${ox} ${oy - m}`);

    // Push the c label off the midpoint of the hypotenuse along that line's own
    // OUTWARD NORMAL. Two nearer-looking choices are both wrong: a fixed offset
    // collides with vertex B on small triangles, and pushing radially out from
    // C fails on flat ones -- when b is 1 the radial direction is almost
    // horizontal, so it slides the label straight into B. The normal is the
    // only direction that stays clear at every a and b (swept, all 225).
    const mx = (ox + sx(a)) / 2, my = (sy(b) + oy) / 2;
    const dx = sx(a) - ox, dy = oy - sy(b);       // A -> B, in screen coords
    const dlen = Math.hypot(dx, dy) || 1;
    const push = 30;
    labC.attr("x", mx + (dy / dlen) * push)       // (dy, -dx) points away from C
      .attr("y", my - (dx / dlen) * push)
      .attr("text-anchor", "start")
      .text(`c ${isWhole(c) ? "=" : "≈"} ${fmtC(c)}`);

    // A sits just INSIDE the vertical axis and B just ABOVE the horizontal one,
    // so neither can land on an axis tick number. The hypotenuse leaves A going
    // down-right and enters B from up-left, so both of these corners are clear.
    vertC.attr("x", ox - 14).attr("y", oy + 20).attr("text-anchor", "middle");
    vertA.attr("x", ox + 14).attr("y", sy(b) - 12).attr("text-anchor", "start");
    vertB.attr("x", sx(a) + 13).attr("y", oy - 12).attr("text-anchor", "middle");

    handleA.attr("cx", sx(a)).attr("cy", oy)
      .attr("aria-valuenow", a).attr("aria-valuetext", `side a equals ${fmtLeg(a)}`);
    handleB.attr("cx", ox).attr("cy", sy(b))
      .attr("aria-valuenow", b).attr("aria-valuetext", `side b equals ${fmtLeg(b)}`);

    const a2 = a * a, b2 = b * b, c2 = a2 + b2;
    outA.text(fmtLeg(a));
    outB.text(fmtLeg(b));
    // The relation symbol lives HERE, not in the markup: c is exact only when
    // it lands whole. (The markup used to hardcode "c = " and this line added
    // its own, which shipped "c = ≈ 5.099".)
    outC.text(`${isWhole(c) ? "=" : "≈"} ${fmtC(c)}`);
    outId.text(
      `a² + b² = ${fmtSq(a2)} + ${fmtSq(b2)} = ${fmtSq(c2)} = c²`
    );

    const triple = isWhole(a) && isWhole(b) && isWhole(c);
    badge.classed("py-badge-on", triple)
      .text(triple ? "a Pythagorean triple" : "");
  }

  let liveTimer = null;
  function announce() {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => {
      const c = hyp();
      const triple = isWhole(state.a) && isWhole(state.b) && isWhole(c);
      live.text(
        `a ${fmtLeg(state.a)}, b ${fmtLeg(state.b)}, c ` +
        `${isWhole(c) ? "" : "about "}${fmtC(c)}` +
        (triple ? ", a Pythagorean triple" : "")
      );
    }, 250);
  }

  function update() { draw(); announce(); }

  // ---- pointer dragging ------------------------------------------------
  // Each handle is confined to its own axis, so the right angle survives every
  // interaction. There is no code path that can move vertex C.
  handleA.call(drag().on("start drag", (event) => {
    state.a = clampLeg(quant(sx.invert(event.x)));
    update();
  }));
  handleB.call(drag().on("start drag", (event) => {
    state.b = clampLeg(quant(sy.invert(event.y)));
    update();
  }));

  // ---- keyboard --------------------------------------------------------
  function keyFor(which) {
    return (event) => {
      const step = (state.snap ? 1 : 0.1) * (event.shiftKey ? 2 : 1);
      const cur = state[which];
      let next = cur;
      switch (event.key) {
        case "ArrowRight": case "ArrowUp":   next = cur + step; break;
        case "ArrowLeft":  case "ArrowDown": next = cur - step; break;
        case "Home": next = MIN_LEG; break;
        case "End":  next = MAX_LEG; break;
        case "PageUp":   next = cur + step * 5; break;
        case "PageDown": next = cur - step * 5; break;
        default: return;
      }
      event.preventDefault();
      state[which] = clampLeg(state.snap ? Math.round(next) : Math.round(next * 100) / 100);
      update();
    };
  }
  handleA.on("keydown", keyFor("a"));
  handleB.on("keydown", keyFor("b"));

  // ---- controls --------------------------------------------------------
  select(root).select(".py-snap").on("change", function () {
    state.snap = this.checked;
    if (state.snap) {
      state.a = clampLeg(Math.round(state.a));
      state.b = clampLeg(Math.round(state.b));
    }
    update();
  });

  select(root).select(".py-reset").on("click", () => {
    state.a = 4; state.b = 3;
    update();
  });

  update();
}

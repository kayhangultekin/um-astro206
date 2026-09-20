// The two gravitational-wave polarizations, drawn as a ring of free test
// particles. ASTRO 206 lecture 10.
//
// Deliberately NOT a widget: there is exactly one control, a play/pause
// button, because Kayhan ruled against an interactive figure for this lecture
// (2026-09-20) but asked for the plus/cross animation. Nothing here is
// adjustable by the reader, so there is no state to get wrong.
//
// No external dependency -- plain SVG built in the DOM, no D3, no CDN.
//
// The strain is exaggerated by about twenty orders of magnitude. A real
// gravitational wave moves these dots by far less than the width of an atomic
// nucleus; the point of the picture is the SHAPE of the motion, not its size.

const NS = "http://www.w3.org/2000/svg";

const RING = 78;        // rest radius of the ring, in viewBox units
const N = 18;           // particles in the ring
const AMP = 0.34;       // exaggerated strain amplitude
const PERIOD = 4000;    // ms for one full cycle

const BLUE = "#2a78d6";
const ORANGE = "#eb6834";
const AXIS = "#c3c2b7";
const INK2 = "#52514e";

function el(name, attrs) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
  return node;
}

/** Displace one ring point under a given polarization.
 *  `a` is half the strain, signed; it oscillates between -AMP/2 and +AMP/2. */
function displace(mode, x, y, a) {
  if (mode === "plus") return [x * (1 + a), y * (1 - a)];
  return [x + a * y, y + a * x];               // cross
}

function buildPanel(svg, cx, cy, mode, color, label) {
  // The undeformed ring, for reference: without it the eye has nothing to
  // judge the distortion against and the motion reads as a wobble.
  svg.appendChild(el("circle", {
    cx, cy, r: RING, fill: "none", stroke: AXIS,
    "stroke-width": 1, "stroke-dasharray": "3 4",
  }));

  const dots = [];
  for (let i = 0; i < N; i++) {
    const th = (2 * Math.PI * i) / N;
    const x0 = RING * Math.cos(th);
    const y0 = RING * Math.sin(th);
    const dot = el("circle", { r: 4.6, fill: color });
    svg.appendChild(dot);
    dots.push({ x0, y0, dot });
  }

  const caption = el("text", {
    x: cx, y: cy + RING + 34, "text-anchor": "middle",
    fill: INK2, "font-size": "15",
  });
  caption.textContent = label;
  svg.appendChild(caption);

  return (a) => {
    for (const d of dots) {
      const [x, y] = displace(mode, d.x0, d.y0, a);
      d.dot.setAttribute("cx", cx + x);
      d.dot.setAttribute("cy", cy + y);
    }
  };
}

function start(root) {
  const svg = el("svg", {
    viewBox: "0 0 460 268",
    width: "100%",
    role: "img",
    "aria-label":
      "Two rings of particles. The left ring, labeled plus, stretches " +
      "horizontally while squeezing vertically, then reverses. The right " +
      "ring, labeled cross, does the same along diagonal axes.",
  });
  svg.classList.add("pol-svg");
  root.querySelector(".pol-plot").appendChild(svg);

  const draw = [
    buildPanel(svg, 120, 118, "plus", BLUE, "plus"),
    buildPanel(svg, 340, 118, "cross", ORANGE, "cross"),
  ];

  const button = root.querySelector(".pol-play");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let running = !reduce;
  let phase = 0;            // radians
  let last = null;

  function paint() {
    const a = (AMP / 2) * Math.cos(phase);
    for (const d of draw) d(a);
  }

  function label() {
    button.textContent = running ? "Pause" : "Play";
    button.setAttribute("aria-pressed", String(running));
  }

  function frame(now) {
    if (last !== null && running) {
      phase += (2 * Math.PI * (now - last)) / PERIOD;
      paint();
    }
    last = now;
    requestAnimationFrame(frame);
  }

  button.addEventListener("click", () => {
    running = !running;
    label();
  });

  label();
  paint();
  requestAnimationFrame(frame);
}

const root = document.getElementById("pol-fig");
if (root) start(root);

/*
  Flow Fields
  https://evoluteur.github.io/flow-fields/
  (c) 2026 Olivier Giulieri

  Thousands of particles follow an angle field, leaving thin, translucent
  trails. The field comes from Perlin noise (Ken Perlin, 1983 and 2002),
  its curl, or a few simple formulas.
*/

const FF = {
  w: 900,
  h: 600,
  parts: [],
  running: true,
  t: 0, // time, for the fields that drift
  steps: 0,
  seed: 1,
};

// ------------------------------------------------------------ Perlin noise

const ffPerm = new Uint8Array(512);
const ffSeedNoise = (seed) => {
  const p = Array.from({ length: 256 }, (_, i) => i);
  let s = seed >>> 0 || 1;
  const rnd = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) ffPerm[i] = p[i & 255];
};
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const grad3 = (h, x, y, z) => {
  const u = (h & 15) < 8 ? x : y;
  const v = (h & 15) < 4 ? y : (h & 15) === 12 || (h & 15) === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
};
// improved Perlin noise, 3D (x, y, time), about -1..1
const noise3 = (x, y, z) => {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const Z = Math.floor(z) & 255;
  x -= Math.floor(x);
  y -= Math.floor(y);
  z -= Math.floor(z);
  const u = fade(x);
  const v = fade(y);
  const w = fade(z);
  const P = ffPerm;
  const A = P[X] + Y;
  const AA = P[A] + Z;
  const AB = P[A + 1] + Z;
  const B = P[X + 1] + Y;
  const BA = P[B] + Z;
  const BB = P[B + 1] + Z;
  const lerp = (t, a, b) => a + t * (b - a);
  return lerp(
    w,
    lerp(v, lerp(u, grad3(P[AA], x, y, z), grad3(P[BA], x - 1, y, z)), lerp(u, grad3(P[AB], x, y - 1, z), grad3(P[BB], x - 1, y - 1, z))),
    lerp(
      v,
      lerp(u, grad3(P[AA + 1], x, y, z - 1), grad3(P[BA + 1], x - 1, y, z - 1)),
      lerp(u, grad3(P[AB + 1], x, y - 1, z - 1), grad3(P[BB + 1], x - 1, y - 1, z - 1)),
    ),
  );
};

// ------------------------------------------------------------ fields

// each field returns the direction (an angle) at (x, y), given the settings
const ffFields = {
  "Perlin noise": (x, y, o) => noise3(x * o.scale, y * o.scale, FF.t) * Math.PI * 2 * o.twist,
  "Curl noise": (x, y, o) => {
    // the curl of the noise is divergence free: the flow never bunches up
    const e = 0.5;
    const s = o.scale;
    const n1 = noise3(x * s, (y + e) * s, FF.t);
    const n2 = noise3(x * s, (y - e) * s, FF.t);
    const n3 = noise3((x + e) * s, y * s, FF.t);
    const n4 = noise3((x - e) * s, y * s, FF.t);
    const dx = (n1 - n2) / (2 * e);
    const dy = -(n3 - n4) / (2 * e);
    return Math.atan2(dy, dx) + (o.twist - 1) * 0.6;
  },
  Vortices: (x, y, o) => {
    // a few whirlpools, alternating directions, plus a little noise
    let vx = 0;
    let vy = 0;
    FF.vortices.forEach((c) => {
      const dx = x - c.x;
      const dy = y - c.y;
      const d2 = dx * dx + dy * dy + 400;
      vx += (-dy * c.s) / d2;
      vy += (dx * c.s) / d2;
    });
    return Math.atan2(vy, vx) + noise3(x * o.scale, y * o.scale, FF.t) * o.twist;
  },
  Spiral: (x, y, o) => {
    const a = Math.atan2(y - FF.h / 2, x - FF.w / 2);
    return a + Math.PI / 2 + 0.35 * o.twist + noise3(x * o.scale, y * o.scale, FF.t) * 0.6;
  },
  Waves: (x, y, o) => Math.sin(y * o.scale * 2) * o.twist + Math.cos(x * o.scale * 1.3) * 0.5,
  Grid: (x, y, o) => {
    // angles snapped to a few directions: a woven, circuit-like look
    const a = noise3(x * o.scale, y * o.scale, FF.t) * Math.PI * 2 * o.twist;
    const k = Math.PI / 4;
    return Math.round(a / k) * k;
  },
};

const FF_PALETTES = {
  "Ink on paper": { bg: "#f6f1e7", colors: ["#1b1b1b", "#2d3142", "#4f5d75"], mode: "multiply" },
  Neon: { bg: "#07070d", colors: ["#ff2e88", "#00e5ff", "#a855f7", "#faff00"], mode: "lighter" },
  Ocean: { bg: "#021526", colors: ["#03346e", "#6eacda", "#e2e2b6", "#00b4d8"], mode: "lighter" },
  Sunset: { bg: "#1d0b1f", colors: ["#ff7b00", "#ff4d6d", "#ffd166", "#c9184a"], mode: "lighter" },
  Forest: { bg: "#eef2e6", colors: ["#1b4332", "#2d6a4f", "#52796f", "#b08968"], mode: "multiply" },
  "Silver on black": { bg: "#000000", colors: ["#ffffff", "#c0c0c0"], mode: "lighter" },
};

// ------------------------------------------------------------ particles

const ffEl = (id) => document.getElementById(id);
const ffVal = (id) => ffEl(id).value;
const ffOpts = () => ({
  field: ffFields[ffVal("ff-field")],
  scale: 0.0004 + (+ffVal("ff-scale") / 100) * 0.008,
  twist: +ffVal("ff-twist"),
  speed: +ffVal("ff-speed"),
  colorBy: ffVal("ff-colorby"),
  pal: FF_PALETTES[ffVal("ff-palette")],
  alpha: +ffVal("ff-alpha") / 100,
  width: +ffVal("ff-width"),
});

let ffRnd = Math.random;
const ffSpawn = (p) => {
  p.x = ffRnd() * FF.w;
  p.y = ffRnd() * FF.h;
  p.life = 80 + ffRnd() * 220;
  p.k = ffRnd();
  return p;
};

const ffReset = (newSeed) => {
  if (newSeed) FF.seed = Math.floor(Math.random() * 1e9);
  let s = FF.seed;
  ffRnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  ffSeedNoise(FF.seed);
  FF.t = 0;
  FF.steps = 0;
  FF.vortices = Array.from({ length: 5 }, (_, i) => ({ x: ffRnd() * FF.w, y: ffRnd() * FF.h, s: (i % 2 ? -1 : 1) * (8000 + ffRnd() * 12000) }));
  const n = +ffVal("ff-count");
  FF.parts = Array.from({ length: n }, () => ffSpawn({}));
  ffClear();
  ffWriteHash();
};

const ffClear = () => {
  const cv = ffEl("ff-canvas");
  const ctx = cv.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0); // the steps leave a scaling transform behind
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.fillStyle = ffOpts().pal.bg;
  ctx.fillRect(0, 0, cv.width, cv.height);
  ffEl("ff-wrap").style.background = ffOpts().pal.bg;
  if (ffEl("ff-arrows").checked) ffDrawArrows(ctx);
};

const ffDrawArrows = (ctx) => {
  const o = ffOpts();
  const k = ffEl("ff-canvas").width / FF.w;
  ctx.save();
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = o.pal.colors[0];
  ctx.lineWidth = 1;
  for (let y = 15; y < FF.h; y += 30) {
    for (let x = 15; x < FF.w; x += 30) {
      const a = o.field(x, y, o);
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(a) * 10, y - Math.sin(a) * 10);
      ctx.lineTo(x + Math.cos(a) * 10, y + Math.sin(a) * 10);
      ctx.lineTo(x + Math.cos(a + 2.6) * 4 + Math.cos(a) * 10, y + Math.sin(a + 2.6) * 4 + Math.sin(a) * 10);
      ctx.stroke();
    }
  }
  ctx.restore();
};

const ffColor = (p, a, o) => {
  const c = o.pal.colors;
  if (o.colorBy === "Direction") return c[Math.floor((((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * c.length) % c.length];
  if (o.colorBy === "Position") return c[Math.min(c.length - 1, Math.floor((p.x / FF.w) * c.length))];
  if (o.colorBy === "One color") return c[0];
  return c[Math.floor(p.k * c.length)];
};

const ffStep = () => {
  const o = ffOpts();
  const cv = ffEl("ff-canvas");
  const ctx = cv.getContext("2d");
  const k = cv.width / FF.w;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.globalCompositeOperation = o.pal.mode;
  ctx.globalAlpha = o.alpha;
  ctx.lineWidth = o.width;
  ctx.lineCap = "round";
  // one path per color keeps the drawing fast
  const paths = {};
  for (const p of FF.parts) {
    const a = o.field(p.x, p.y, o);
    const nx = p.x + Math.cos(a) * o.speed;
    const ny = p.y + Math.sin(a) * o.speed;
    const col = ffColor(p, a, o);
    (paths[col] = paths[col] || []).push(p.x, p.y, nx, ny);
    p.x = nx;
    p.y = ny;
    p.life--;
    if (p.life < 0 || nx < -5 || ny < -5 || nx > FF.w + 5 || ny > FF.h + 5) ffSpawn(p);
  }
  for (const col in paths) {
    const s = paths[col];
    ctx.strokeStyle = col;
    ctx.beginPath();
    for (let i = 0; i < s.length; i += 4) {
      ctx.moveTo(s[i], s[i + 1]);
      ctx.lineTo(s[i + 2], s[i + 3]);
    }
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  if (ffEl("ff-drift").checked) FF.t += 0.0015;
  FF.steps++;
};

const ffLoop = () => {
  if (FF.running) {
    for (let i = 0; i < 2; i++) ffStep();
    if (FF.steps % 30 === 0) ffEl("ff-info").textContent = `Step ${FF.steps}.`;
  }
  requestAnimationFrame(ffLoop);
};

const ffSize = () => {
  const cv = ffEl("ff-canvas");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const px = Math.round(cv.clientWidth * dpr) || FF.w;
  if (cv.width !== px) {
    cv.width = px;
    cv.height = Math.round((px * FF.h) / FF.w);
    ffClear();
  }
};

// ------------------------------------------------------------ the address keeps the settings

const FF_KEYS = ["field", "scale", "twist", "speed", "count", "palette", "colorby", "alpha", "width"];
const ffWriteHash = () => {
  const q = FF_KEYS.map((k) => `${k}=${encodeURIComponent(ffVal("ff-" + k))}`).join("&");
  history.replaceState(null, "", `#${q}&seed=${FF.seed}`);
};
const ffReadHash = () => {
  const h = new URLSearchParams(location.hash.slice(1));
  FF_KEYS.forEach((k) => {
    if (h.has(k)) ffEl("ff-" + k).value = h.get(k);
  });
  if (h.has("seed")) FF.seed = +h.get("seed") || 1;
  else FF.seed = Math.floor(Math.random() * 1e9);
};

// ------------------------------------------------------------ setup

const initFlowFields = () => {
  const fill = (id, list) => (ffEl(id).innerHTML = list.map((n) => `<option>${n}</option>`).join(""));
  fill("ff-field", Object.keys(ffFields));
  fill("ff-palette", Object.keys(FF_PALETTES));
  fill("ff-colorby", ["Particle", "Direction", "Position", "One color"]);
  ffReadHash();
  const shows = { scale: (v) => v, twist: (v) => (+v).toFixed(1), speed: (v) => (+v).toFixed(1), count: (v) => v, alpha: (v) => v + "%", width: (v) => (+v).toFixed(1) };
  Object.entries(shows).forEach(([k, f]) => {
    const show = () => (ffEl(`ff-${k}-val`).textContent = f(ffVal("ff-" + k)));
    show();
    ffEl("ff-" + k).addEventListener("input", show);
  });
  // changing the look of the field starts a new drawing; changing the pen does not
  ["field", "scale", "twist", "count", "palette"].forEach((k) =>
    ffEl("ff-" + k).addEventListener("change", () => ffReset(false)),
  );
  ["speed", "colorby", "alpha", "width"].forEach((k) => ffEl("ff-" + k).addEventListener("change", ffWriteHash));
  ffEl("ff-arrows").addEventListener("change", ffClear);
  ffEl("ff-pause").addEventListener("click", () => {
    FF.running = !FF.running;
    ffEl("ff-pause").textContent = FF.running ? "Pause" : "Play";
  });
  ffEl("ff-new").addEventListener("click", () => ffReset(true));
  ffEl("ff-clear").addEventListener("click", ffClear);
  ffEl("ff-png").addEventListener("click", () =>
    ffEl("ff-canvas").toBlob((b) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = "flow-field.png";
      a.click();
    }),
  );
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && e.target === document.body) {
      e.preventDefault();
      ffEl("ff-pause").click();
    }
  });
  // drop particles where you click or drag
  const cv = ffEl("ff-canvas");
  const drop = (e) => {
    const r = cv.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * FF.w;
    const y = ((e.clientY - r.top) / r.height) * FF.h;
    for (let i = 0; i < 40; i++) {
      const p = FF.parts[Math.floor(Math.random() * FF.parts.length)];
      p.x = x + (Math.random() - 0.5) * 30;
      p.y = y + (Math.random() - 0.5) * 30;
      p.life = 150 + Math.random() * 150;
    }
  };
  let down = false;
  cv.addEventListener("pointerdown", (e) => {
    down = true;
    drop(e);
  });
  cv.addEventListener("pointermove", (e) => down && drop(e));
  window.addEventListener("pointerup", () => (down = false));
  window.addEventListener("resize", ffSize);
  ffSize();
  ffReset(false);
  requestAnimationFrame(ffLoop);
};

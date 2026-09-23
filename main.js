(() => {
  const UNLOCK_AT = Date.parse("2026-09-25T00:00:00+03:00");

  const SVG_NS = "http://www.w3.org/2000/svg";
  const CX = 500;
  const CY = 500;
  const SECTOR_COUNT = 12;
  const SECTOR_ANGLE = 360 / SECTOR_COUNT;
  const WIN_INDEX = 5;
  const EXTRA_TURNS = 8;
  const SPIN_MS = 11400;
  const CREEP_AT = 10680;
  const CREEP_MOD = 193;
  const SECTOR_R = 434;
  const LABEL_R = 366;
  const ICON = 104;
  const ICON_R = 250;
  const STUD_R = 390;

  // Pointer sits at the top. Sector i is centered at i * 30°.
  // Clockwise rotation R brings original angle (-R mod 360) under the pointer.
  const LANDING = (360 - WIN_INDEX * SECTOR_ANGLE) % 360;
  const FINAL_ROTATION = EXTRA_TURNS * 360 + LANDING;

  const PRIZES = [
    { src: "prizes/pizza.png", lines: ["Пицца", "на твой вкус"], fill: "#4C1D95", ink: "#FFFFFF", size: 24 },
    { src: "prizes/cake.png", lines: ["Торт", "к празднику"], fill: "#EDE9FE", ink: "#3B0764", size: 24 },
    { src: "prizes/bear.png", lines: ["Плюшевый", "медведь"], fill: "#6D28D9", ink: "#FFFFFF", size: 24 },
    { src: "prizes/money.png", lines: ["1 000 ₽", "на карту"], fill: "#FCE7F3", ink: "#3B0764", size: 24 },
    { src: "prizes/drink.png", lines: ["Любимый", "напиток"], fill: "#5B21B6", ink: "#FFFFFF", size: 24 },
    { src: "prizes/airpods.png", lines: ["AirPods 4"], fill: "#F3E8FF", ink: "#3B0764", size: 26 },
    { src: "prizes/certificate.png", lines: ["Сертификат", "в Золотое Яблоко"], fill: "#7C3AED", ink: "#FFFFFF", size: 19 },
    { src: "prizes/dance.png", lines: ["10 занятий", "танцами"], fill: "#E0E7FF", ink: "#312E81", size: 22 },
    { src: "prizes/gym.png", lines: ["Абонемент", "в спортзал"], fill: "#4C1D95", ink: "#FFFFFF", size: 22 },
    { src: "prizes/chocolate.png", lines: ["Большая", "шоколадка"], fill: "#FAE8FF", ink: "#3B0764", size: 24 },
    { src: "prizes/hoodie.png", lines: ["Стильная", "толстовка"], fill: "#9333EA", ink: "#FFFFFF", size: 22 },
    { src: "prizes/spa.png", lines: ["Спа-процедуры"], fill: "#DDD6FE", ink: "#3B0764", size: 20 },
  ];

  const FX_COLORS = ["#7C3AED", "#A855F7", "#C084FC", "#F6D98A", "#FDE68A", "#F9A8D4", "#FFFFFF", "#818CF8", "#E9D5FF", "#F472B6", "#C4B5FD"];
  const GOLD_COLORS = ["#F6D98A", "#FDE68A", "#E8B84A", "#FFF6D8", "#FFFFFF"];

  const hero = document.getElementById("hero");
  const wheelScreen = document.getElementById("wheel-screen");
  const winScreen = document.getElementById("win-screen");
  const tryBtn = document.getElementById("try-btn");
  const spinBtn = document.getElementById("spin-btn");
  const claimBtn = document.getElementById("claim-btn");
  const modal = document.getElementById("modal");
  const modalOk = document.getElementById("modal-ok");
  const tension = document.getElementById("tension");
  const rotor = document.getElementById("rotor");
  const rotorSvg = document.getElementById("rotor-svg");
  const staticSvg = document.getElementById("static-svg");
  const wheelWrap = document.getElementById("wheel-wrap");
  const flashEl = document.getElementById("flash");
  const fxCanvas = document.getElementById("fx");
  const fxCtx = fxCanvas.getContext("2d");

  const sectors = [];
  let pointerGroup = null;
  let pulseCircle = null;
  let spun = false;
  let peg = 0;
  let pegV = 0;
  let audioCtx = null;
  let master = null;
  let tickBuffer = null;
  let dingPlayed = false;
  let modalOpen = false;
  let viewW = window.innerWidth;
  let viewH = window.innerHeight;
  let particles = [];
  let fxOn = false;

  const rotationAt = createSpinMotion();

  function el(name, attrs) {
    const node = document.createElementNS(SVG_NS, name);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  }

  function polar(radius, angleDeg) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return {
      x: CX + radius * Math.cos(rad),
      y: CY + radius * Math.sin(rad),
    };
  }

  function wedgePath(start, end) {
    const p0 = polar(SECTOR_R, start);
    const p1 = polar(SECTOR_R, end);
    return `M ${CX} ${CY} L ${p0.x} ${p0.y} A ${SECTOR_R} ${SECTOR_R} 0 0 1 ${p1.x} ${p1.y} Z`;
  }

  function createSpinMotion() {
    const creep = EXTRA_TURNS * 360 + CREEP_MOD;
    const nudge = FINAL_ROTATION - creep;
    const accelEnd = 0.075;
    const cruiseEnd = 0.56;
    const power = 3.6;
    const floor = 0.006;
    const samples = 8000;
    const velocity = (t) => {
      if (t < accelEnd) return Math.sin((t / accelEnd) * Math.PI / 2);
      if (t < cruiseEnd) {
        const u = (t - accelEnd) / (cruiseEnd - accelEnd);
        return 1 - 0.12 * u;
      }
      const u = (t - cruiseEnd) / (1 - cruiseEnd);
      return (1 - 0.12) * Math.pow(1 - u, power) + floor;
    };
    const cum = new Float64Array(samples + 1);
    let prev = velocity(0);
    for (let i = 1; i <= samples; i += 1) {
      const v = velocity(i / samples);
      cum[i] = cum[i - 1] + ((prev + v) * 0.5) / samples;
      prev = v;
    }
    const total = cum[samples];
    const progress = (t) => {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      const x = t * samples;
      const i = Math.floor(x);
      const f = x - i;
      return (cum[i] * (1 - f) + cum[i + 1] * f) / total;
    };
    const endSlope = velocity(1) / total;
    const joinSpeed = endSlope * creep / (CREEP_AT / 1000);
    const v0 = joinSpeed * ((SPIN_MS - CREEP_AT) / 1000) / nudge;
    const nudgeEase = (u) => {
      const u2 = u * u;
      const u3 = u2 * u;
      return v0 * (u3 - 2 * u2 + u) + (-2 * u3 + 3 * u2);
    };
    return (elapsed) => {
      if (elapsed >= SPIN_MS) return FINAL_ROTATION;
      if (elapsed <= CREEP_AT) return creep * progress(elapsed / CREEP_AT);
      const u = (elapsed - CREEP_AT) / (SPIN_MS - CREEP_AT);
      return creep + nudge * nudgeEase(u);
    };
  }

  function boundaryIndex(rotation) {
    return Math.floor((rotation - SECTOR_ANGLE / 2) / SECTOR_ANGLE);
  }

  function buildWheel() {
    const defs = el("defs", {});
    defs.innerHTML = `
      <filter id="winGlow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="#E8B84A" flood-opacity="0.95"/>
      </filter>
      <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#FFF7DE"/>
        <stop offset="45%" stop-color="#F6D98A"/>
        <stop offset="100%" stop-color="#D9A441"/>
      </linearGradient>
      <radialGradient id="hubFill" cx="38%" cy="32%" r="70%">
        <stop offset="0%" stop-color="#FFFFFF"/>
        <stop offset="70%" stop-color="#F6F2FF"/>
        <stop offset="100%" stop-color="#E9E0FA"/>
      </radialGradient>
      <filter id="pegShadow" x="-60%" y="-60%" width="220%" height="220%">
        <feDropShadow dx="0" dy="3" stdDeviation="3.5" flood-color="#4C1D95" flood-opacity="0.35"/>
      </filter>
    `;
    rotorSvg.appendChild(defs);

    PRIZES.forEach((prize, index) => {
      const center = index * SECTOR_ANGLE;
      const group = el("g", {
        class: "sector",
        "data-index": String(index),
      });
      const wedge = el("path", {
        class: "wedge",
        d: wedgePath(center - SECTOR_ANGLE / 2, center + SECTOR_ANGLE / 2),
        fill: prize.fill,
        stroke: "#F8F5FF",
        "stroke-width": "3",
      });
      const clip = el("clipPath", { id: `sector-clip-${index}`, clipPathUnits: "userSpaceOnUse" });
      clip.appendChild(el("path", {
        d: wedgePath(center - SECTOR_ANGLE / 2, center + SECTOR_ANGLE / 2),
      }));
      defs.appendChild(clip);

      const content = el("g", { transform: `rotate(${center} ${CX} ${CY})` });
      const icon = el("image", {
        x: String(CX - ICON / 2),
        y: String(CY - ICON_R - ICON / 2),
        width: String(ICON),
        height: String(ICON),
        preserveAspectRatio: "xMidYMid meet",
      });
      icon.setAttribute("href", prize.src);
      icon.setAttributeNS("http://www.w3.org/1999/xlink", "href", prize.src);

      const lineH = Math.round(prize.size * 1.15);
      const label = el("text", {
        class: "label",
        "text-anchor": "middle",
        "dominant-baseline": "central",
        "font-size": String(prize.size),
        "font-weight": "700",
        fill: prize.ink,
        "font-family": '"Segoe UI", system-ui, sans-serif',
      });
      const firstY = CY - LABEL_R - (lineH * (prize.lines.length - 1)) / 2;
      prize.lines.forEach((line, lineIndex) => {
        const span = el("tspan", {
          x: String(CX),
          y: String(firstY + lineIndex * lineH),
        });
        span.textContent = line;
        label.appendChild(span);
      });
      content.append(icon, label);
      const clipped = el("g", { "clip-path": `url(#sector-clip-${index})` });
      clipped.appendChild(content);
      group.append(wedge, clipped);
      rotorSvg.appendChild(group);
      sectors.push({ group, wedge, label });
    });

    for (let i = 0; i < SECTOR_COUNT; i += 1) {
      const point = polar(STUD_R, i * SECTOR_ANGLE - SECTOR_ANGLE / 2);
      rotorSvg.appendChild(el("circle", {
        cx: point.x,
        cy: point.y,
        r: "9",
        fill: "#F6D98A",
        stroke: "#FFFFFF",
        "stroke-width": "2.5",
      }));
    }

    const staticDefs = staticSvg.querySelector("defs") || document.createElementNS(SVG_NS, "defs");
    staticSvg.appendChild(el("circle", {
      cx: CX,
      cy: CY + 8,
      r: "470",
      fill: "rgba(76, 29, 149, 0.06)",
    }));
    staticSvg.appendChild(el("circle", {
      cx: CX,
      cy: CY,
      r: "450",
      fill: "none",
      stroke: "#F7F3FF",
      "stroke-width": "58",
    }));
    staticSvg.appendChild(el("circle", {
      cx: CX,
      cy: CY,
      r: "478",
      fill: "none",
      stroke: "#F0D48A",
      "stroke-width": "4",
    }));
    staticSvg.appendChild(el("circle", {
      cx: CX,
      cy: CY,
      r: "422",
      fill: "none",
      stroke: "rgba(255,255,255,0.9)",
      "stroke-width": "3",
    }));
    staticSvg.appendChild(el("circle", {
      cx: CX,
      cy: CY,
      r: "450",
      fill: "none",
      stroke: "#FFFFFF",
      "stroke-opacity": "0.7",
      "stroke-width": "10",
      "stroke-linecap": "round",
      "stroke-dasharray": "150 2400",
      transform: "rotate(206 500 500)",
    }));

    pulseCircle = el("circle", {
      id: "pulse",
      cx: CX,
      cy: CY,
      r: "424",
      fill: "none",
      stroke: "#F6C453",
      "stroke-width": "0",
      opacity: "0",
    });
    staticSvg.appendChild(pulseCircle);

    staticSvg.appendChild(el("circle", {
      cx: CX,
      cy: CY + 5,
      r: "96",
      fill: "rgba(76, 29, 149, 0.12)",
    }));
    staticSvg.appendChild(el("circle", {
      cx: CX,
      cy: CY,
      r: "94",
      fill: "#FFFFFF",
    }));
    staticSvg.appendChild(el("circle", {
      cx: CX,
      cy: CY,
      r: "86",
      fill: "url(#hubFill)",
      stroke: "url(#gold)",
      "stroke-width": "5",
    }));

    const hubIcon = el("text", {
      x: CX,
      y: CY + 2,
      "text-anchor": "middle",
      "dominant-baseline": "central",
      "font-size": "58",
      "font-family": '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif',
    });
    hubIcon.textContent = "🎁";
    staticSvg.appendChild(hubIcon);

    const gold = rotorSvg.querySelector("#gold");
    const hubFill = rotorSvg.querySelector("#hubFill");
    const pegShadow = rotorSvg.querySelector("#pegShadow");
    const staticDefWrap = el("defs", {});
    if (gold) staticDefWrap.appendChild(gold.cloneNode(true));
    if (hubFill) staticDefWrap.appendChild(hubFill.cloneNode(true));
    if (pegShadow) staticDefWrap.appendChild(pegShadow.cloneNode(true));
    staticSvg.insertBefore(staticDefWrap, staticSvg.firstChild);

    pointerGroup = el("g", { id: "pointer", filter: "url(#pegShadow)" });
    pointerGroup.appendChild(el("polygon", {
      points: "500,148 456,26 544,26",
      fill: "url(#gold)",
      stroke: "#FFFFFF",
      "stroke-width": "5",
      "stroke-linejoin": "round",
    }));
    pointerGroup.appendChild(el("circle", {
      cx: "500",
      cy: "28",
      r: "22",
      fill: "url(#gold)",
      stroke: "#FFFFFF",
      "stroke-width": "5",
    }));
    staticSvg.appendChild(pointerGroup);
  }

  function unlockAudio() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audioCtx) {
        audioCtx = new AC();
        master = audioCtx.createGain();
        master.gain.value = 0.85;
        const comp = audioCtx.createDynamicsCompressor();
        comp.threshold.value = -16;
        comp.knee.value = 10;
        comp.ratio.value = 8;
        comp.attack.value = 0.003;
        comp.release.value = 0.12;
        master.connect(comp);
        comp.connect(audioCtx.destination);
        tickBuffer = makeTickBuffer(audioCtx);
      }
      if (audioCtx.state === "suspended") audioCtx.resume();
      const silent = audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
      const src = audioCtx.createBufferSource();
      src.buffer = silent;
      src.connect(audioCtx.destination);
      src.start(0);
    } catch (err) {
      audioCtx = null;
    }
  }

  function makeTickBuffer(ctx) {
    const length = Math.floor(ctx.sampleRate * 0.042);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      const t = i / ctx.sampleRate;
      const env = Math.exp(-t / 0.0075);
      const n = Math.sin(i * 12.9898) * 43758.5453;
      const noise = (n - Math.floor(n)) * 2 - 1;
      data[i] = noise * env;
    }
    return buffer;
  }

  function playTick(weight, when) {
    if (!audioCtx || !tickBuffer || !master) return;
    const t0 = when ?? audioCtx.currentTime;
    const slow = Math.min(1, Math.max(0, weight));

    const src = audioCtx.createBufferSource();
    src.buffer = tickBuffer;
    const hp = audioCtx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 850;
    const ng = audioCtx.createGain();
    ng.gain.setValueAtTime((0.42 + slow * 0.28) / 18, t0);
    src.connect(hp);
    hp.connect(ng);
    ng.connect(master);
    src.playbackRate.value = 1.12 - slow * 0.28;
    src.start(t0);

    const click = audioCtx.createOscillator();
    const clickFilter = audioCtx.createBiquadFilter();
    const clickGain = audioCtx.createGain();
    click.type = "square";
    click.frequency.setValueAtTime(1700 - slow * 420, t0);
    clickFilter.type = "highpass";
    clickFilter.frequency.value = 1400;
    clickGain.gain.setValueAtTime(0.0001, t0);
    clickGain.gain.exponentialRampToValueAtTime((0.055 + slow * 0.05) / 18, t0 + 0.0012);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.011);
    click.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickGain.connect(master);
    click.start(t0);
    click.stop(t0 + 0.018);

    const body = audioCtx.createOscillator();
    const bodyGain = audioCtx.createGain();
    body.type = "triangle";
    body.frequency.setValueAtTime(190 + (1 - slow) * 120, t0);
    body.frequency.exponentialRampToValueAtTime(65, t0 + 0.04);
    bodyGain.gain.setValueAtTime(0.0001, t0);
    bodyGain.gain.exponentialRampToValueAtTime((0.16 + slow * 0.14) / 18, t0 + 0.0025);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.038 + slow * 0.02);
    body.connect(bodyGain);
    bodyGain.connect(master);
    body.start(t0);
    body.stop(t0 + 0.07);
  }

  function scheduleTicks(count, weight) {
    const n = Math.min(count, 5);
    const gap = n >= 4 ? 0.014 : n >= 2 ? 0.026 : 0;
    const now = audioCtx ? audioCtx.currentTime : 0;
    for (let i = 0; i < n; i += 1) playTick(weight, now + i * gap);
  }

  function playDing() {
    if (!audioCtx || dingPlayed) return;
    dingPlayed = true;
    const now = audioCtx.currentTime;
    [880, 1318.5, 1760].forEach((freq, index) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + index * 0.012;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(index === 0 ? 0.22 : 0.07, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.85);
      osc.connect(gain);
      gain.connect(master);
      osc.start(start);
      osc.stop(start + 0.9);
    });
  }

  function setTension(text, hot) {
    tension.classList.toggle("hot", Boolean(hot));
    if (!text) {
      tension.replaceChildren();
      return;
    }
    const span = document.createElement("span");
    span.textContent = text;
    tension.replaceChildren(span);
  }

  function showWheel() {
    unlockAudio();
    document.body.dataset.phase = "wheel";
    hero.classList.remove("active");
    hero.setAttribute("inert", "");
    wheelScreen.classList.add("active");
    wheelScreen.removeAttribute("inert");
  }

  function startSpin() {
    rotor.style.willChange = "transform";
    const started = performance.now();
    let prevRotation = 0;
    let prevBoundary = boundaryIndex(0);
    let lastFrame = started;
    let sawSlow = false;
    let sawCloser = false;
    let sawFinal = false;

    const frame = (now) => {
      const elapsed = now - started;
      const rotation = rotationAt(elapsed);
      rotor.style.transform = `rotate(${rotation}deg)`;

      const dt = Math.max(0.008, (now - lastFrame) / 1000);
      const degPerSec = Math.max(0, (rotation - prevRotation) / dt);
      lastFrame = now;
      const blur = degPerSec > 320 ? Math.min(0.55, (degPerSec - 320) / 1600) : 0;
      rotor.style.filter = blur > 0.05 ? `blur(${blur}px)` : "none";

      const boundary = boundaryIndex(rotation);
      const crossed = boundary - prevBoundary;
      if (crossed > 0) {
        const weight = Math.min(1, Math.max(0.2, 1 - degPerSec / 340));
        scheduleTicks(crossed, weight);
        pegV = degPerSec > 400 ? -7 : degPerSec > 120 ? -12 : -16;
      }
      prevBoundary = boundary;
      prevRotation = rotation;

      peg += pegV;
      pegV *= 0.7;
      peg *= 0.8;
      if (Math.abs(peg) < 0.04) peg = 0;
      if (pointerGroup) pointerGroup.setAttribute("transform", `rotate(${peg.toFixed(2)} 500 28)`);

      if (elapsed > 7400) document.body.classList.add("is-tense");
      if (!sawSlow && elapsed > 7400) {
        sawSlow = true;
        setTension("Так…");
      }
      if (!sawCloser && elapsed > 8800) {
        sawCloser = true;
        setTension("Кажется, осталось совсем немного… 👀");
      }
      if (!sawFinal && elapsed > 10000) {
        sawFinal = true;
        setTension("ЕЩЁ ЧУТЬ-ЧУТЬ…", true);
      }

      if (elapsed < SPIN_MS) {
        requestAnimationFrame(frame);
        return;
      }

      rotor.style.transform = `rotate(${FINAL_ROTATION}deg)`;
      rotor.style.filter = "none";
      rotor.style.willChange = "auto";
      document.body.classList.remove("is-tense");
      document.body.dataset.phase = "landed";
      setTension("");
      window.setTimeout(revealWin, 680);
    };

    requestAnimationFrame(frame);
  }

  function highlightWinner() {
    const sector = sectors[WIN_INDEX];
    sector.group.classList.add("is-winner");
    sector.wedge.style.fill = "#FDE68A";
    sector.label.setAttribute("fill", "#4C1D95");
    wheelWrap.classList.add("is-pop");
    if (pulseCircle) {
      pulseCircle.classList.remove("go");
      void pulseCircle.getBoundingClientRect();
      pulseCircle.classList.add("go");
    }
    playDing();
  }

  async function revealWin() {
    highlightWinner();
    await wait(540);
    celebrate();
    document.body.dataset.phase = "won";
    document.body.classList.add("is-celebrating");
    wheelScreen.classList.remove("active");
    wheelScreen.setAttribute("inert", "");
    winScreen.classList.add("active");
    winScreen.removeAttribute("inert");
  }

  function wait(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  function resizeFx() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    viewW = window.innerWidth;
    viewH = window.innerHeight;
    fxCanvas.width = Math.floor(viewW * dpr);
    fxCanvas.height = Math.floor(viewH * dpr);
    fxCanvas.style.width = `${viewW}px`;
    fxCanvas.style.height = `${viewH}px`;
    fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function ensureFx() {
    if (fxOn) return;
    fxOn = true;
    requestAnimationFrame(drawFx);
  }

  function pushParticle(particle) {
    if (particles.length > 520) return;
    particles.push(particle);
    ensureFx();
  }

  function confettiBurst({ x, y, angle, spread, count, power }) {
    for (let i = 0; i < count; i += 1) {
      const a = angle + (Math.random() - 0.5) * spread;
      const speed = power * (0.45 + Math.random() * 0.75);
      pushParticle({
        kind: "confetti",
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        w: 7 + Math.random() * 7,
        h: 9 + Math.random() * 8,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.28,
        color: FX_COLORS[i % FX_COLORS.length],
        gy: 0.11 + Math.random() * 0.05,
        drag: 0.992,
        life: 1,
        decay: 0.0032 + Math.random() * 0.0022,
        shape: i % 3,
      });
    }
  }

  function rain(count) {
    for (let i = 0; i < count; i += 1) {
      pushParticle({
        kind: "confetti",
        x: Math.random() * viewW,
        y: -20 - Math.random() * 80,
        vx: (Math.random() - 0.5) * 2.4,
        vy: 2.2 + Math.random() * 3.4,
        w: 6 + Math.random() * 7,
        h: 10 + Math.random() * 8,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.2,
        color: FX_COLORS[i % FX_COLORS.length],
        gy: 0.035,
        drag: 0.998,
        life: 1,
        decay: 0.0024,
        shape: i % 3,
      });
    }
  }

  function explode(x, y, palette) {
    const colors = palette || FX_COLORS;
    const count = 78;
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2;
      const speed = 1.6 + (i % 5) * 0.72 + Math.random() * 1.4;
      pushParticle({
        kind: "spark",
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        r: i % 9 === 0 ? 3.4 : 2.1,
        color: colors[i % colors.length],
        gy: 0.028,
        drag: 0.986,
        life: 1,
        decay: 0.008 + (i % 4) * 0.0015,
        star: i % 9 === 0,
      });
    }
  }

  function launchRocket(x, color) {
    pushParticle({
      kind: "rocket",
      x,
      y: viewH + 8,
      vx: (Math.random() - 0.5) * 0.8,
      vy: -7.2 - Math.random() * 2.4,
      targetY: viewH * (0.18 + Math.random() * 0.28),
      color,
      life: 1,
      decay: 0.004,
    });
  }

  function goldDust() {
    for (let i = 0; i < 36; i += 1) {
      pushParticle({
        kind: "spark",
        x: viewW * (0.2 + Math.random() * 0.6),
        y: viewH * (0.35 + Math.random() * 0.4),
        vx: (Math.random() - 0.5) * 0.7,
        vy: -0.35 - Math.random() * 0.9,
        r: 1.4 + Math.random() * 1.8,
        color: GOLD_COLORS[i % GOLD_COLORS.length],
        gy: -0.004,
        drag: 0.99,
        life: 1,
        decay: 0.004,
        star: i % 3 === 0,
      });
    }
  }

  function drawStar(x, y, r) {
    fxCtx.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const radius = i % 2 === 0 ? r : r * 0.38;
      const a = (i * Math.PI) / 4 - Math.PI / 2;
      const px = x + Math.cos(a) * radius;
      const py = y + Math.sin(a) * radius;
      if (i === 0) fxCtx.moveTo(px, py);
      else fxCtx.lineTo(px, py);
    }
    fxCtx.closePath();
    fxCtx.fill();
  }

  function drawFx() {
    fxCtx.clearRect(0, 0, viewW, viewH);
    particles = particles.filter((p) => p.life > 0.02);

    particles.forEach((p) => {
      if (p.kind === "rocket") {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.045;
        p.life -= p.decay;
        fxCtx.globalAlpha = 0.9;
        fxCtx.fillStyle = p.color;
        fxCtx.beginPath();
        fxCtx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
        fxCtx.fill();
        if (p.y <= p.targetY) {
          p.life = 0;
          explode(p.x, p.y, [p.color, "#FFFFFF", "#F6D98A", "#C084FC"]);
        }
        return;
      }

      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gy;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.life -= p.decay;
      if (p.rot != null) p.rot += p.vr;

      fxCtx.globalAlpha = Math.max(0, p.life);
      fxCtx.fillStyle = p.color;
      if (p.kind === "confetti") {
        fxCtx.save();
        fxCtx.translate(p.x, p.y);
        fxCtx.rotate(p.rot);
        if (p.shape === 1) {
          fxCtx.beginPath();
          fxCtx.arc(0, 0, p.w * 0.45, 0, Math.PI * 2);
          fxCtx.fill();
        } else if (p.shape === 2) {
          fxCtx.fillRect(-p.w * 0.7, -p.h * 0.2, p.w * 1.4, p.h * 0.35);
        } else {
          fxCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        fxCtx.restore();
      } else if (p.star) {
        drawStar(p.x, p.y, p.r * 2.1);
      } else {
        fxCtx.beginPath();
        fxCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        fxCtx.fill();
      }
    });

    fxCtx.globalAlpha = 1;
    if (particles.length) requestAnimationFrame(drawFx);
    else fxOn = false;
  }

  function boom() {
    flash();
    confettiBurst({ x: 0, y: viewH * 0.72, angle: -0.85, spread: 0.85, count: 70, power: 15 });
    confettiBurst({ x: viewW, y: viewH * 0.72, angle: Math.PI + 0.85, spread: 0.85, count: 70, power: 15 });
    launchRocket(viewW * 0.28, "#C084FC");
    launchRocket(viewW * 0.72, "#F6D98A");
    window.setTimeout(() => rain(70), 280);
    window.setTimeout(() => explode(viewW * 0.5, viewH * 0.3, GOLD_COLORS), 620);
    window.setTimeout(() => {
      confettiBurst({ x: viewW * 0.15, y: viewH * 0.62, angle: -1.1, spread: 0.7, count: 46, power: 13 });
      confettiBurst({ x: viewW * 0.85, y: viewH * 0.62, angle: Math.PI + 1.1, spread: 0.7, count: 46, power: 13 });
    }, 980);
    window.setTimeout(() => explode(viewW * 0.32, viewH * 0.24, FX_COLORS), 1400);
    window.setTimeout(() => explode(viewW * 0.68, viewH * 0.22, ["#A855F7", "#FFFFFF", "#F9A8D4"]), 1750);
    window.setTimeout(() => rain(50), 1600);
    window.setTimeout(goldDust, 400);
    window.setTimeout(goldDust, 1200);
    window.setTimeout(() => rain(36), 2300);
  }

  function celebrate() {
    boom();
  }

  function flash() {
    flashEl.classList.remove("on");
    void flashEl.offsetWidth;
    flashEl.classList.add("on");
  }

  function encore() {
    flash();
    confettiBurst({ x: viewW * 0.5, y: viewH * 0.45, angle: -Math.PI / 2, spread: 2.4, count: 90, power: 12 });
    explode(viewW * 0.5, viewH * 0.38, GOLD_COLORS);
    goldDust();
  }

  function openModal() {
    if (modalOpen) return;
    modalOpen = true;
    modal.classList.remove("is-leaving");
    modal.hidden = false;
    modalOk.focus();
  }

  function closeModal(withParty) {
    if (!modalOpen) return;
    modal.classList.add("is-leaving");
    window.setTimeout(() => {
      modal.hidden = true;
      modal.classList.remove("is-leaving");
      modalOpen = false;
      claimBtn.focus();
      if (withParty) encore();
    }, 220);
  }

  function buildAtmosphere() {
    const sky = document.querySelector(".sky");
    for (let i = 0; i < 18; i += 1) {
      const spark = document.createElement("span");
      spark.className = i % 4 === 0 ? "spark gold" : "spark";
      spark.style.left = `${(i * 53) % 100}%`;
      spark.style.top = `${(i * 37) % 100}%`;
      spark.style.animationDelay = `${(i * 0.41) % 5}s`;
      spark.style.animationDuration = `${3.6 + (i % 5) * 0.45}s`;
      sky.appendChild(spark);
    }
    const bits = ["#c4b5fd", "#e9d5ff", "#f6d98a", "#f9a8d4", "#bfdbfe", "#ddd6fe"];
    for (let i = 0; i < 12; i += 1) {
      const bit = document.createElement("span");
      bit.className = "floater";
      bit.style.left = `${(i * 8.2 + 3) % 100}%`;
      bit.style.background = bits[i % bits.length];
      bit.style.animationDuration = `${16 + (i % 7) * 1.6}s`;
      bit.style.animationDelay = `${-i * 1.7}s`;
      bit.style.width = i % 3 === 0 ? "7px" : "9px";
      bit.style.height = i % 2 === 0 ? "12px" : "8px";
      bit.style.borderRadius = i % 3 === 0 ? "50%" : "2px";
      sky.appendChild(bit);
    }
  }

  tryBtn.addEventListener("click", showWheel);

  spinBtn.addEventListener("click", () => {
    if (spun) return;
    spun = true;
    unlockAudio();
    spinBtn.disabled = true;
    spinBtn.textContent = "Крутится…";
    document.body.dataset.phase = "spin";
    startSpin();
  });

  claimBtn.addEventListener("click", openModal);
  modalOk.addEventListener("click", () => closeModal(true));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modalOpen) closeModal(false);
  });

  window.addEventListener("resize", resizeFx);

  startSiteLock();
  buildAtmosphere();
  buildWheel();
  resizeFx();

  function startSiteLock() {
    const lock = document.getElementById("lock");
    const mainEl = document.querySelector("main");
    const fx = document.getElementById("lock-fx");
    const parts = {
      h: document.getElementById("lock-hh"),
      m: document.getElementById("lock-mm"),
      s: document.getElementById("lock-ss"),
    };
    if (!lock || !mainEl || !parts.h) return;

    if (Date.now() >= UNLOCK_AT) {
      document.body.classList.remove("is-locked");
      document.documentElement.classList.add("is-open");
      mainEl.inert = false;
      lock.hidden = true;
      lock.setAttribute("aria-hidden", "true");
      return;
    }

    let timer = 0;
    let released = false;
    let lastShown = -1;
    mainEl.inert = true;
    document.body.classList.add("is-locked");

    const pad = (value) => String(value).padStart(2, "0");

    const write = (totalSeconds) => {
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      parts.h.textContent = pad(hours);
      parts.m.textContent = pad(minutes);
      parts.s.textContent = pad(seconds);
    };

    const paint = () => {
      const left = UNLOCK_AT - Date.now();
      if (left <= 0) {
        write(0);
        release();
        return;
      }
      const shown = Math.floor(left / 1000);
      if (shown !== lastShown) {
        lastShown = shown;
        write(shown);
      }
      document.body.classList.toggle("is-lock-final", left <= 5000);
    };

    const burst = () => {
      if (!fx) return;
      const ctx = fx.getContext("2d");
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      fx.width = Math.floor(window.innerWidth * dpr);
      fx.height = Math.floor(window.innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const colors = ["#7C3AED", "#C4B5FD", "#F6D98A", "#F9A8D4", "#FFFFFF", "#A78BFA"];
      const bits = Array.from({ length: 42 }, () => ({
        x: window.innerWidth / 2 + (Math.random() - 0.5) * 80,
        y: window.innerHeight / 2,
        vx: (Math.random() - 0.5) * 7,
        vy: -3.2 - Math.random() * 4.2,
        g: 0.12 + Math.random() * 0.06,
        w: 5 + Math.random() * 5,
        h: 7 + Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        rot: Math.random() * 6,
        spin: (Math.random() - 0.5) * 0.2,
      }));
      const born = performance.now();
      const draw = (now) => {
        const t = (now - born) / 1000;
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        bits.forEach((bit) => {
          bit.x += bit.vx;
          bit.y += bit.vy;
          bit.vy += bit.g;
          bit.rot += bit.spin;
          ctx.save();
          ctx.translate(bit.x, bit.y);
          ctx.rotate(bit.rot);
          ctx.globalAlpha = Math.max(0, 1 - t / 1.15);
          ctx.fillStyle = bit.color;
          ctx.fillRect(-bit.w / 2, -bit.h / 2, bit.w, bit.h);
          ctx.restore();
        });
        if (t < 1.2) requestAnimationFrame(draw);
        else ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      };
      requestAnimationFrame(draw);
    };

    const release = () => {
      if (released) return;
      released = true;
      clearInterval(timer);
      write(0);
      document.body.classList.remove("is-lock-final");
      lock.classList.add("is-opening");
      burst();
      window.setTimeout(() => {
        lock.classList.add("is-gone");
        window.setTimeout(() => {
          document.body.classList.remove("is-locked");
          mainEl.inert = false;
          lock.hidden = true;
          lock.setAttribute("aria-hidden", "true");
        }, 880);
      }, 720);
    };

    document.addEventListener("visibilitychange", () => {
      if (released || document.visibilityState !== "visible") return;
      paint();
    });

    paint();
    timer = window.setInterval(paint, 250);
  }
})();

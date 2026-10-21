/* =========================================================
 * A-log - 자비스 스타일 아크 세그먼트 마인드맵 (SVG)
 * ---------------------------------------------------------
 * 중앙 코어를 감싸는 링을 각 항목 비중만큼 arc 세그먼트로 나눈다.
 * 세그먼트를 누르면 onSelect(key)로 하위 단계로 드릴다운.
 * ========================================================= */

const SVGNS = "http://www.w3.org/2000/svg";

function el(tag, attrs, children) {
  const e = document.createElementNS(SVGNS, tag);
  if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (children) (Array.isArray(children) ? children : [children]).forEach((c) => {
    e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  });
  return e;
}

function polar(cx, cy, r, deg) {
  const a = (deg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

/* 도넛 arc(두께 있는 세그먼트) path */
function arcPath(cx, cy, rInner, rOuter, startDeg, endDeg) {
  const large = (endDeg - startDeg) % 360 > 180 ? 1 : 0;
  const o1 = polar(cx, cy, rOuter, startDeg);
  const o2 = polar(cx, cy, rOuter, endDeg);
  const i2 = polar(cx, cy, rInner, endDeg);
  const i1 = polar(cx, cy, rInner, startDeg);
  return [
    "M", o1.x, o1.y,
    "A", rOuter, rOuter, 0, large, 1, o2.x, o2.y,
    "L", i2.x, i2.y,
    "A", rInner, rInner, 0, large, 0, i1.x, i1.y,
    "Z"
  ].join(" ");
}

/* 네온 라인 아이콘 그룹 */
function niconGroup(iconKey, cx, cy, size, color) {
  const pathStr = (typeof niconSvg === "function") ? niconSvg(iconKey) : "";
  const g = el("g", {
    transform: `translate(${cx - size / 2}, ${cy - size / 2}) scale(${size / 24})`,
    stroke: color, fill: "none",
    "stroke-width": 1.7, "stroke-linecap": "round", "stroke-linejoin": "round"
  });
  const holder = document.createElementNS(SVGNS, "g");
  holder.innerHTML = pathStr;
  while (holder.firstChild) g.appendChild(holder.firstChild);
  return g;
}

/* container: div, data: {total, nodes:[{key,name,icon,issue,count,stores[]}]}, opts */
function renderMindmap(container, data, opts) {
  opts = opts || {};
  container.innerHTML = "";

  const W = 720, H = 600;
  const cx = W / 2, cy = H / 2;

  // 하위로 들어갈 때(in)는 전체 줌인 대신 페이드만 → 세그먼트가 중앙에서
  // 펼쳐지는 효과(mm-seg-expand)가 주연이 되도록 한다.
  const transCls = opts.transition === "in" ? "mm-enter"
                 : opts.transition === "out" ? "mm-zoom-out"
                 : "mm-enter";
  const svg = el("svg", {
    viewBox: `0 0 ${W} ${H}`, width: "100%",
    preserveAspectRatio: "xMidYMid meet",
    class: "mindmap-svg " + transCls
  });

  const defs = el("defs");
  defs.innerHTML = `
    <filter id="mmGlow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="3.5" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <radialGradient id="mmCore" cx="50%" cy="45%" r="62%">
      <stop offset="0%" stop-color="#0b2838" stop-opacity="0.98"/>
      <stop offset="60%" stop-color="#072030" stop-opacity="0.98"/>
      <stop offset="100%" stop-color="#38e1ff" stop-opacity="0.18"/>
    </radialGradient>`;
  svg.appendChild(defs);

  const nodes = (data.nodes || []).filter((n) => n.count > 0);
  const total = nodes.reduce((s, n) => s + n.count, 0) || 1;

  /* ---- 자비스 HUD 데코 ---- */
  const deco = el("g", { class: "mm-deco" });
  // 은은한 동심원 (바깥 장식 + 세그먼트 안쪽 보조선)
  [244, 218, 196, 128].forEach((r, i) => {
    deco.appendChild(el("circle", { cx, cy, r, fill: "none", stroke: "rgba(56,225,255," + (0.06 + i * 0.015) + ")", "stroke-width": 1 }));
  });

  // 코어~세그먼트 안쪽 사이를 채우는 레이더 스윕
  const sweepR = 130;
  const sweep = el("g", { class: "mm-spin" });
  sweep.style.transformOrigin = cx + "px " + cy + "px";
  sweep.style.animationDuration = "12s";
  const sweepGrad = "mmSweepGrad";
  defs.innerHTML += `
    <radialGradient id="${sweepGrad}" cx="50%" cy="50%" r="50%">
      <stop offset="40%" stop-color="rgba(56,225,255,0)"/>
      <stop offset="100%" stop-color="rgba(56,225,255,0.14)"/>
    </radialGradient>`;
  const sweepWedge = el("path", {
    d: `M ${cx} ${cy} L ${polar(cx, cy, sweepR, -26).x} ${polar(cx, cy, sweepR, -26).y} A ${sweepR} ${sweepR} 0 0 1 ${polar(cx, cy, sweepR, 26).x} ${polar(cx, cy, sweepR, 26).y} Z`,
    fill: `url(#${sweepGrad})`, opacity: 0.9
  });
  sweep.appendChild(sweepWedge);
  deco.appendChild(sweep);

  // 중간 틱 링 (느리게 반대로 회전) — 코어 바로 바깥
  const midTick = el("g", { class: "mm-spin-rev" });
  midTick.style.transformOrigin = cx + "px " + cy + "px";
  midTick.style.animationDuration = "40s";
  for (let a = 0; a < 360; a += 15) {
    const big = (a % 45 === 0);
    const p1 = polar(cx, cy, 124, a);
    const p2 = polar(cx, cy, 124 - (big ? 8 : 4), a);
    midTick.appendChild(el("line", { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, stroke: "rgba(79,140,255," + (big ? 0.4 : 0.18) + ")", "stroke-width": 1 }));
  }
  deco.appendChild(midTick);

  // 코어에서 세그먼트 안쪽으로 뻗는 짧은 방사형 라인 (연결감)
  const spokes = el("g");
  for (let a = 0; a < 360; a += 30) {
    const p1 = polar(cx, cy, 114, a);
    const p2 = polar(cx, cy, 134, a);
    spokes.appendChild(el("line", { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, stroke: "rgba(56,225,255,0.16)", "stroke-width": 1 }));
  }
  deco.appendChild(spokes);
  // 바깥 눈금 링 (전체 둘레 60틱)
  const tickRing = el("g", { class: "mm-spin" });
  tickRing.style.transformOrigin = cx + "px " + cy + "px";
  tickRing.style.animationDuration = "60s";
  for (let a = 0; a < 360; a += 6) {
    const big = (a % 30 === 0);
    const p1 = polar(cx, cy, 266, a);
    const p2 = polar(cx, cy, 266 - (big ? 12 : 6), a);
    tickRing.appendChild(el("line", { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, stroke: "rgba(56,225,255," + (big ? 0.5 : 0.22) + ")", "stroke-width": big ? 1.5 : 1 }));
  }
  deco.appendChild(tickRing);
  // 회전 점선 링(빠름/느림 2개)
  const tick = el("circle", { cx, cy, r: 256, fill: "none", stroke: "rgba(56,225,255,0.35)", "stroke-width": 2, "stroke-dasharray": "2 14", class: "mm-spin" });
  tick.style.transformOrigin = cx + "px " + cy + "px"; tick.style.animationDuration = "28s";
  deco.appendChild(tick);
  const tick2 = el("circle", { cx, cy, r: 124, fill: "none", stroke: "rgba(79,140,255,0.3)", "stroke-width": 1, "stroke-dasharray": "1 6", class: "mm-spin-rev" });
  tick2.style.transformOrigin = cx + "px " + cy + "px";
  deco.appendChild(tick2);
  // 네 방향 코너 브래킷 (HUD 프레임 느낌)
  const corners = [[0,0],[1,0],[0,1],[1,1]];
  const pad = 14, len = 26;
  corners.forEach(([hx, hy]) => {
    const x = hx ? W - pad : pad;
    const y = hy ? H - pad : pad;
    const dx = hx ? -len : len, dy = hy ? -len : len;
    const br = el("path", {
      d: `M ${x} ${y + dy} L ${x} ${y} L ${x + dx} ${y}`,
      fill: "none", stroke: "rgba(56,225,255,0.4)", "stroke-width": 2, "stroke-linecap": "round"
    });
    deco.appendChild(br);
  });
  svg.appendChild(deco);

  /* ---- 상위 경로(부모) 링: 안쪽에 겹겹이 (depth 표시) ---- */
  const path = (opts.path || []); // [{label}] 부모들 (가장 바깥=최상위)
  path.forEach((p, idx) => {
    const r = 116 - idx * 16;
    if (r < 60) return;
    const ring = el("circle", {
      cx, cy, r, fill: "none",
      stroke: "rgba(56,225,255,0.28)", "stroke-width": 2,
      "stroke-dasharray": "14 8", class: "mm-spin"
    });
    ring.style.transformOrigin = cx + "px " + cy + "px";
    ring.style.animationDuration = (16 + idx * 6) + "s";
    svg.appendChild(ring);
  });

  /* ---- 아크 세그먼트 링 ----
     코어(≈112)와 가깝게 당기고 더 두껍게 → 빈 간격 축소 + hover 히트영역 확대 */
  const rInner = 138, rOuter = 180;
  const gap = nodes.length > 1 ? 3 : 0; // 세그먼트 사이 간격(도)
  let cursor = 0;
  const segGroup = el("g");
  svg.appendChild(segGroup);

  nodes.forEach((node, i) => {
    const sweep = (node.count / total) * 360;
    const start = cursor + gap / 2;
    const end = cursor + sweep - gap / 2;
    const mid = (start + end) / 2;
    cursor += sweep;

    const color = node.issue ? "#ff5d6c" : "#38e1ff";
    const fill = node.issue ? "rgba(255,93,108,0.16)" : "rgba(56,225,255,0.16)";
    const selected = opts.selectedKey === node.key;

    // 전환 방향에 따라 등장 방식 결정:
    //  - "in"(하위로): 중앙에 모였다가 바깥으로 펼쳐짐 (mm-seg-expand)
    //  - 그 외: 제자리에서 가볍게 등장 (mm-seg)
    var segCls = (opts.transition === "in") ? "mm-seg-expand" : "mm-seg";
    const seg = el("g", { class: segCls, style: "cursor:pointer;" });
    // 중앙(코어) 기준으로 변형 → 중앙에서 퍼지는 느낌
    seg.style.transformBox = "view-box";
    seg.style.transformOrigin = cx + "px " + cy + "px";
    // 바깥(건수 적은 뒤쪽) 세그먼트일수록 살짝 늦게 도착 → 펼쳐지는 리듬
    seg.style.animationDelay = (0.05 * i) + "s";

    const path = el("path", {
      d: arcPath(cx, cy, rInner, rOuter, start, end),
      fill: selected ? (node.issue ? "rgba(255,93,108,0.34)" : "rgba(56,225,255,0.34)") : fill,
      stroke: color, "stroke-width": selected ? 2 : 1.2,
      filter: "url(#mmGlow)"
    });
    seg.appendChild(path);

    // 얇은 링 안을 가로지르는 비중 눈금 (자비스 느낌)
    const ticks = Math.max(2, Math.round((end - start) / 6));
    for (let t = 1; t < ticks; t++) {
      const td = start + ((end - start) * t) / ticks;
      const p1 = polar(cx, cy, rInner + 2, td);
      const p2 = polar(cx, cy, rOuter - 2, td);
      seg.appendChild(el("line", {
        x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
        stroke: color, "stroke-width": 1, opacity: 0.4
      }));
    }

    // 바깥 라벨: 아이콘 + 이름 + 건수 (세그먼트 바깥에 여유 있게)
    const lp = polar(cx, cy, rOuter + 46, mid);
    seg.appendChild(niconGroup(node.icon, lp.x, lp.y - 10, 20, color));
    seg.appendChild(el("text", {
      x: lp.x, y: lp.y + 12, "text-anchor": "middle",
      "font-size": 12, fill: "#eaf6ff", "font-weight": "700"
    }, node.name));
    seg.appendChild(el("text", {
      x: lp.x, y: lp.y + 27, "text-anchor": "middle",
      "font-size": 11, fill: node.issue ? "#ff9aa4" : "#7fd8ec"
    }, `${node.count}건 · ${Math.round((node.count / total) * 100)}%`));

    // 하위 미리보기: 안으로 들어가면 나올 "미니 코어" 형태를 흐릿하게 보여준다.
    //  - 가운데 작은 코어 원 + 둘레에 childCount만큼의 작은 아크 조각
    if (node.childCount && node.childCount > 0) {
      const gp = polar(cx, cy, rOuter + 70, mid); // 라벨 바깥, 바깥 틱 링 안쪽
      const ghost = el("g", { class: "mm-ghost" });
      ghost.style.transformBox = "fill-box";
      ghost.style.transformOrigin = "center";
      ghost.style.animationDelay = (0.2 + 0.05 * i) + "s";

      const gr = 13;        // 미니 미리보기 반지름
      const gcore = 4.5;    // 미니 코어 반지름
      // 미니 코어
      ghost.appendChild(el("circle", {
        cx: gp.x, cy: gp.y, r: gcore, fill: "none",
        stroke: color, "stroke-width": 1.2, opacity: 0.9
      }));
      // 둘레 아크 조각들 (최대 8개까지 표시해 과밀 방지)
      const n = Math.min(node.childCount, 8);
      const gGap = 10; // 조각 사이 간격(도)
      const seg360 = 360 / n;
      for (let k = 0; k < n; k++) {
        const s = k * seg360 + gGap / 2;
        const e = (k + 1) * seg360 - gGap / 2;
        ghost.appendChild(el("path", {
          d: arcPath(gp.x, gp.y, gr - 2.5, gr, s, e),
          fill: color, stroke: "none", opacity: 0.9
        }));
      }
      seg.appendChild(ghost);
    }

    seg.addEventListener("click", () => opts.onSelect && opts.onSelect(node.key));
    // hover 강조: 크기/필터 교체 없이 채움·테두리만 진하게 (색 유지, 흰톤 없음)
    var fillHover = node.issue ? "rgba(255,93,108,0.42)" : "rgba(56,225,255,0.42)";
    seg.addEventListener("mouseenter", () => {
      path.setAttribute("fill", fillHover);
      path.setAttribute("stroke-width", "2.4");
    });
    seg.addEventListener("mouseleave", () => {
      path.setAttribute("fill", selected ? (node.issue ? "rgba(255,93,108,0.34)" : "rgba(56,225,255,0.34)") : fill);
      path.setAttribute("stroke-width", selected ? "2" : "1.2");
    });
    segGroup.appendChild(seg);
  });

  /* ---- 중앙 코어 (상시 모션) ---- */
  const coreG = el("g", { class: "mm-core-pop", style: "cursor:pointer;" });
  coreG.style.transformOrigin = cx + "px " + cy + "px";
  // 상시 맥동하는 코어 배경
  const coreBg = el("circle", { cx, cy, r: 92, fill: "url(#mmCore)", stroke: "rgba(56,225,255,0.85)", "stroke-width": 2, filter: "url(#mmGlow)", class: "mm-core-pulse" });
  coreBg.style.transformOrigin = cx + "px " + cy + "px";
  coreG.appendChild(coreBg);
  // 코어를 도는 짧은 호(자비스 느낌)
  const coreArc = el("circle", {
    cx, cy, r: 104, fill: "none",
    stroke: "rgba(56,225,255,0.6)", "stroke-width": 2,
    "stroke-dasharray": "90 230", "stroke-linecap": "round", class: "mm-spin"
  });
  coreArc.style.transformOrigin = cx + "px " + cy + "px";
  coreArc.style.animationDuration = "6s";
  coreG.appendChild(coreArc);
  const coreArc2 = el("circle", {
    cx, cy, r: 112, fill: "none",
    stroke: "rgba(79,140,255,0.45)", "stroke-width": 1.5,
    "stroke-dasharray": "40 260", "stroke-linecap": "round", class: "mm-spin-rev"
  });
  coreArc2.style.transformOrigin = cx + "px " + cy + "px";
  coreArc2.style.animationDuration = "9s";
  coreG.appendChild(coreArc2);
  let label = opts.centerLabel || "전체";
  if (label.length > 9) label = label.slice(0, 8) + "…";
  coreG.appendChild(el("text", { x: cx, y: cy - 16, "text-anchor": "middle", "font-size": 14, fill: "#9fd9ec", "letter-spacing": "1" }, label));
  coreG.appendChild(el("text", { x: cx, y: cy + 18, "text-anchor": "middle", "font-size": 40, fill: "#ffffff", "font-weight": "800" }, String(data.total)));
  coreG.appendChild(el("text", { x: cx, y: cy + 40, "text-anchor": "middle", "font-size": 12, fill: "#9fd9ec" }, "건"));
  coreG.addEventListener("click", () => opts.onSelect && opts.onSelect(null));
  svg.appendChild(coreG);

  if (!nodes.length) {
    svg.appendChild(el("text", { x: cx, y: cy + 130, "text-anchor": "middle", "font-size": 13, fill: "#8aa0b8" }, "분석할 기록이 없습니다."));
  }

  container.appendChild(svg);
}

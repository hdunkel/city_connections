// web/js/map.js

function makeProjection(width, height) {
  return d3.geoMercator()
    .center([10.4, 51.2])
    .scale(width * 1.55)
    .translate([width / 2, height / 2]);
}

// Resolve 'var(--name)' to its computed value so Canvas can use it.
function _resolveCSSColor(color) {
  if (!color.startsWith('var(')) return color;
  const name = color.slice(4, -1).trim();
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || color;
}

function _makeCanvas(el, W, H) {
  const dpr = window.devicePixelRatio || 1;
  const c = document.createElement('canvas');
  c.width  = Math.round(W * dpr);
  c.height = Math.round(H * dpr);
  c.style.cssText = `display:block;cursor:grab;width:${W}px;height:${H}px`;
  el.appendChild(c);
  // Scale context once so all draw calls use logical (CSS) coordinates.
  if (dpr !== 1) c.getContext('2d').scale(dpr, dpr);
  return c;
}

// Wire up D3 zoom → redraw callback, draw once at identity.
function _setupZoom(canvas, draw) {
  d3.select(canvas).call(
    d3.zoom()
      .scaleExtent([0.5, 20])
      .on('zoom', e => { canvas.style.cursor = 'grabbing'; draw(e.transform); })
      .on('end',  () => { canvas.style.cursor = 'grab'; })
  );
  draw(d3.zoomIdentity);
}

function _addMapHint(el) {
  const p = document.createElement('p');
  p.className = 'map-hint';
  p.textContent = window.innerWidth <= 768
    ? 'pinch to zoom · drag to pan'
    : 'scroll to zoom · drag to pan';
  el.appendChild(p);
}

// Pre-project all nodes once; returns parallel Float32Arrays for speed.
function _preproject(nodes, proj) {
  const N = nodes.length;
  const px = new Float32Array(N);
  const py = new Float32Array(N);
  nodes.forEach((n, i) => { [px[i], py[i]] = proj([n.lon, n.lat]); });
  return { px, py, N };
}

// Draw all background dots in one batched path.
function _drawBg(ctx, px, py, N, t, W, H, r) {
  const { k, x: tx, y: ty } = t;
  ctx.beginPath();
  ctx.fillStyle = '#1e2235';
  for (let i = 0; i < N; i++) {
    const sx = px[i] * k + tx, sy = py[i] * k + ty;
    if (sx < -r || sx > W + r || sy < -r || sy > H + r) continue;
    ctx.moveTo(sx + r, sy);
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
  }
  ctx.fill();
}

// ── Overview map ────────────────────────────────────────────────────────────
function initMap(graphData) {
  const el = document.getElementById('map-overview');
  if (!el) return;
  const W = el.clientWidth || 800, H = el.clientHeight || 400;
  const proj = makeProjection(W, H);
  const { px, py, N } = _preproject(graphData.nodes, proj);

  // Population-scaled radii, capped so they stay readable
  const pr = new Float32Array(N);
  graphData.nodes.forEach((n, i) => {
    pr[i] = Math.max(1.5, Math.sqrt((n.population || 0) / 80000));
  });

  // Edge endpoints as index pairs
  const nodeIdx = new Map(graphData.nodes.map((n, i) => [n.id, i]));
  const E = graphData.edges.length;
  const eSrc = new Int32Array(E), eTgt = new Int32Array(E);
  graphData.edges.forEach((e, i) => {
    eSrc[i] = nodeIdx.get(e.source) ?? -1;
    eTgt[i] = nodeIdx.get(e.target) ?? -1;
  });

  const canvas = _makeCanvas(el, W, H);
  const ctx = canvas.getContext('2d');

  function draw(t) {
    const { k, x: tx, y: ty } = t;
    ctx.clearRect(0, 0, W, H);

    // Edges — single batched path
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(79,142,247,0.12)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < E; i++) {
      const si = eSrc[i], ti = eTgt[i];
      if (si < 0 || ti < 0) continue;
      const x1 = px[si]*k+tx, y1 = py[si]*k+ty;
      const x2 = px[ti]*k+tx, y2 = py[ti]*k+ty;
      // Cull only when both endpoints are clearly off-screen
      if ((x1 < -80 && x2 < -80) || (x1 > W+80 && x2 > W+80)) continue;
      if ((y1 < -80 && y2 < -80) || (y1 > H+80 && y2 > H+80)) continue;
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    }
    ctx.stroke();

    // Nodes — single batched path
    ctx.beginPath();
    ctx.fillStyle = 'rgba(79,142,247,0.7)';
    for (let i = 0; i < N; i++) {
      const sx = px[i]*k+tx, sy = py[i]*k+ty;
      const r = pr[i];
      if (sx < -r || sx > W+r || sy < -r || sy > H+r) continue;
      ctx.moveTo(sx + r, sy);
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  _setupZoom(canvas, draw);
  _addMapHint(el);
}

// ── Pathfinder result map ────────────────────────────────────────────────────
function highlightPath(graphData, pathIds) {
  const el = document.getElementById('map-path');
  if (!el) return;
  const W = el.clientWidth || 800, H = el.clientHeight || 400;
  const proj = makeProjection(W, H);

  el.querySelectorAll('canvas, p.map-hint').forEach(e => e.remove());

  const { px, py, N } = _preproject(graphData.nodes, proj);
  const nodeIdx = new Map(graphData.nodes.map((n, i) => [n.id, i]));
  const pathPts = pathIds
    .map(id => { const i = nodeIdx.get(id); return i !== undefined ? i : -1; })
    .filter(i => i >= 0);

  const canvas = _makeCanvas(el, W, H);
  const ctx = canvas.getContext('2d');

  function draw(t) {
    const { k, x: tx, y: ty } = t;
    ctx.clearRect(0, 0, W, H);

    _drawBg(ctx, px, py, N, t, W, H, 1.5);

    // Path lines
    if (pathPts.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = '#f7c04f';
      ctx.lineWidth = 2;
      ctx.moveTo(px[pathPts[0]]*k+tx, py[pathPts[0]]*k+ty);
      for (let i = 1; i < pathPts.length; i++) {
        ctx.lineTo(px[pathPts[i]]*k+tx, py[pathPts[i]]*k+ty);
      }
      ctx.stroke();
    }

    // Path nodes + labels
    ctx.font = '11px Inter, system-ui, sans-serif';
    pathPts.forEach((ni, idx) => {
      const sx = px[ni]*k+tx, sy = py[ni]*k+ty;
      const isEnd = idx === 0 || idx === pathPts.length - 1;
      ctx.beginPath();
      ctx.arc(sx, sy, isEnd ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = isEnd ? '#f7c04f' : '#4f8ef7';
      ctx.fill();
      ctx.fillStyle = '#e8eaf0';
      ctx.fillText(graphData.nodes[ni].name, sx + 8, sy + 4);
    });
  }

  _setupZoom(canvas, draw);
  _addMapHint(el);
}

// ── Islands / disconnected map ───────────────────────────────────────────────
function renderDisconnectedMap(graphData, nodeIds) {
  const el = document.getElementById('map-disconnected');
  if (!el) return;
  const W = el.clientWidth || 800, H = el.clientHeight || 400;
  const proj = makeProjection(W, H);
  const { px, py, N } = _preproject(graphData.nodes, proj);
  const nodeIdx = new Map(graphData.nodes.map((n, i) => [n.id, i]));

  const highlights = nodeIds.map((id, ci) => {
    const i = nodeIdx.get(id);
    return i !== undefined
      ? { i, name: graphData.nodes[i].name, color: ci === 0 ? '#4f8ef7' : '#f7c04f' }
      : null;
  }).filter(Boolean);

  const canvas = _makeCanvas(el, W, H);
  const ctx = canvas.getContext('2d');

  function draw(t) {
    const { k, x: tx, y: ty } = t;
    ctx.clearRect(0, 0, W, H);
    _drawBg(ctx, px, py, N, t, W, H, 1.5);

    ctx.font = '600 12px Inter, system-ui, sans-serif';
    highlights.forEach(({ i, name, color }) => {
      const sx = px[i]*k+tx, sy = py[i]*k+ty;
      ctx.beginPath();
      ctx.arc(sx, sy, 8, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
      ctx.fillStyle = '#e8eaf0';
      ctx.textAlign = sx > W / 2 ? 'right' : 'left';
      ctx.fillText(name, sx + (sx > W / 2 ? -12 : 12), sy + 4);
    });
    ctx.textAlign = 'left';
  }

  _setupZoom(canvas, draw);
  _addMapHint(el);
}

// ── City Explorer maps ───────────────────────────────────────────────────────
function renderExplorerMap(graphData, centerId, neighborIds, selector, neighborColor, clipSuffix) {
  const el = document.querySelector(selector);
  if (!el) return;
  const W = el.clientWidth || 360, H = el.clientHeight || 170;
  const proj = makeProjection(W, H);
  const color = _resolveCSSColor(neighborColor);

  el.querySelectorAll('canvas').forEach(c => c.remove());

  const { px, py, N } = _preproject(graphData.nodes, proj);
  const nodeIdx    = new Map(graphData.nodes.map((n, i) => [n.id, i]));
  const neighborPts = neighborIds.map(id => nodeIdx.get(id) ?? -1).filter(i => i >= 0);
  const centerI    = nodeIdx.get(centerId) ?? -1;

  // Typed boolean array — faster than Set<string> for 11k iterations
  const isSpecial = new Uint8Array(N);
  if (centerI >= 0) isSpecial[centerI] = 1;
  neighborPts.forEach(i => { isSpecial[i] = 1; });

  const canvas = _makeCanvas(el, W, H);
  const ctx = canvas.getContext('2d');

  function draw(t) {
    const { k, x: tx, y: ty } = t;
    ctx.clearRect(0, 0, W, H);

    // Background (skip neighbors + center so highlights render cleanly on top)
    ctx.beginPath();
    ctx.fillStyle = '#1e2235';
    for (let i = 0; i < N; i++) {
      if (isSpecial[i]) continue;
      const sx = px[i]*k+tx, sy = py[i]*k+ty;
      if (sx < -5 || sx > W+5 || sy < -5 || sy > H+5) continue;
      ctx.moveTo(sx + 1.2, sy);
      ctx.arc(sx, sy, 1.2, 0, Math.PI * 2);
    }
    ctx.fill();

    // Neighbours
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = color;
    ctx.beginPath();
    neighborPts.forEach(i => {
      const sx = px[i]*k+tx, sy = py[i]*k+ty;
      ctx.moveTo(sx + 3, sy); ctx.arc(sx, sy, 3, 0, Math.PI * 2);
    });
    ctx.fill();
    ctx.globalAlpha = 1;

    // Center
    if (centerI >= 0) {
      const sx = px[centerI]*k+tx, sy = py[centerI]*k+ty;
      ctx.beginPath();
      ctx.arc(sx, sy, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff'; ctx.fill();
    }
  }

  _setupZoom(canvas, draw);
}

// ── Uncharted — cities with zero incoming connections ────────────────────────
function renderUnchartedMap(graphData, unknownIds) {
  const el = document.getElementById('map-uncharted');
  if (!el) return;
  const W = el.clientWidth || 800, H = el.clientHeight || 400;
  const proj = makeProjection(W, H);
  const { px, py, N } = _preproject(graphData.nodes, proj);
  const nodeIdx = new Map(graphData.nodes.map((n, i) => [n.id, i]));

  const isUnknown = new Uint8Array(N);
  unknownIds.forEach(id => { const i = nodeIdx.get(id); if (i !== undefined) isUnknown[i] = 1; });

  const canvas = _makeCanvas(el, W, H);
  const ctx = canvas.getContext('2d');

  function draw(t) {
    const { k, x: tx, y: ty } = t;
    ctx.clearRect(0, 0, W, H);

    // Referenced cities — dim background
    ctx.beginPath();
    ctx.fillStyle = '#1e2235';
    for (let i = 0; i < N; i++) {
      if (isUnknown[i]) continue;
      const sx = px[i]*k+tx, sy = py[i]*k+ty;
      if (sx < -3 || sx > W+3 || sy < -3 || sy > H+3) continue;
      ctx.moveTo(sx+1.5, sy); ctx.arc(sx, sy, 1.5, 0, Math.PI*2);
    }
    ctx.fill();

    // Uncharted cities — gold highlight
    ctx.beginPath();
    ctx.fillStyle = '#f7c04f';
    ctx.globalAlpha = 0.75;
    for (let i = 0; i < N; i++) {
      if (!isUnknown[i]) continue;
      const sx = px[i]*k+tx, sy = py[i]*k+ty;
      if (sx < -3 || sx > W+3 || sy < -3 || sy > H+3) continue;
      ctx.moveTo(sx+1.5, sy); ctx.arc(sx, sy, 1.5, 0, Math.PI*2);
    }
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  _setupZoom(canvas, draw);
  _addMapHint(el);
}

// ── Diameter / longest-road map ──────────────────────────────────────────────
function renderDiameterMap(graphData, pathIds) {
  const el = document.getElementById('map-diameter');
  if (!el) return;
  const W = el.clientWidth || 800, H = el.clientHeight || 400;
  const proj = makeProjection(W, H);

  el.querySelectorAll('canvas, p.map-hint').forEach(e => e.remove());

  const { px, py, N } = _preproject(graphData.nodes, proj);
  const nodeIdx = new Map(graphData.nodes.map((n, i) => [n.id, i]));
  const pathPts = pathIds.map(id => nodeIdx.get(id) ?? -1).filter(i => i >= 0);
  const endPts  = [pathPts[0], pathPts[pathPts.length - 1]];

  const canvas = _makeCanvas(el, W, H);
  const ctx = canvas.getContext('2d');

  function draw(t) {
    const { k, x: tx, y: ty } = t;
    ctx.clearRect(0, 0, W, H);
    _drawBg(ctx, px, py, N, t, W, H, 1.5);

    // Path line
    if (pathPts.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = '#f7c04f'; ctx.lineWidth = 2.5;
      ctx.moveTo(px[pathPts[0]]*k+tx, py[pathPts[0]]*k+ty);
      for (let i = 1; i < pathPts.length; i++) {
        ctx.lineTo(px[pathPts[i]]*k+tx, py[pathPts[i]]*k+ty);
      }
      ctx.stroke();
    }

    // Path nodes
    ctx.fillStyle = '#f7c04f';
    ctx.beginPath();
    pathPts.forEach(i => {
      const sx = px[i]*k+tx, sy = py[i]*k+ty;
      ctx.moveTo(sx + 5, sy); ctx.arc(sx, sy, 5, 0, Math.PI * 2);
    });
    ctx.fill();

    // Endpoint labels
    ctx.font = '600 11px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#e8eaf0';
    endPts.forEach(i => {
      if (i < 0) return;
      ctx.fillText(graphData.nodes[i].name, px[i]*k+tx + 8, py[i]*k+ty + 4);
    });
  }

  _setupZoom(canvas, draw);
  _addMapHint(el);
}

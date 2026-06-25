function bfs(adj, sourceId, targetId) {
  if (sourceId === targetId) return [sourceId];
  const visited = new Set([sourceId]);
  const queue = [[sourceId]];
  while (queue.length) {
    const path = queue.shift();
    const node = path[path.length - 1];
    for (const nbr of (adj.get(node) ?? [])) {
      if (nbr === targetId) return [...path, nbr];
      if (!visited.has(nbr)) {
        visited.add(nbr);
        queue.push([...path, nbr]);
      }
    }
  }
  return null;
}

function osmLink(street, lat, lon) {
  const a = document.createElement('a');
  a.href = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}&zoom=17`;
  a.target = '_blank';
  a.rel = 'noopener';
  a.className = 'street-link';
  a.textContent = street;
  return a;
}

function initPathfinder(graphData) {
  const nodeNames    = graphData.nodes.map(n => n.name);
  const nameToIdLow = {};
  for (const n of graphData.nodes) {
    const key = n.name.toLowerCase();
    if (!(key in nameToIdLow)) nameToIdLow[key] = n.id;
  }
  const idToName     = Object.fromEntries(graphData.nodes.map(n => [n.id, n.name]));
  const nameToId     = v => nameToIdLow[v.trim().toLowerCase()];

  // Adjacency list and edge lookup
  const adj = new Map();
  const edgeLookup = {};
  for (const e of graphData.edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source).push(e.target);
    if (!edgeLookup[e.source]) edgeLookup[e.source] = {};
    edgeLookup[e.source][e.target] = e;
  }

  const inputFrom = document.getElementById('input-from');
  const inputTo   = document.getElementById('input-to');
  const btn       = document.getElementById('btn-find');
  const result    = document.getElementById('path-result');

  function attachAutocomplete(input) {
    const listId = input.id + '-list';
    const dl = document.createElement('datalist');
    dl.id = listId;
    input.setAttribute('list', listId);
    input.parentNode.appendChild(dl);
    input.addEventListener('input', () => {
      const val = input.value.trim().toLowerCase();
      const matches = nodeNames.filter(n => n.toLowerCase().startsWith(val)).slice(0, 10);
      dl.replaceChildren(...matches.map(n => {
        const o = document.createElement('option');
        o.value = n;
        return o;
      }));
    });
  }

  attachAutocomplete(inputFrom);
  attachAutocomplete(inputTo);

  const exBtn = document.getElementById('btn-example-path');
  if (exBtn) {
    exBtn.addEventListener('click', () => {
      inputFrom.value = 'Hamburg';
      inputTo.value = 'Berlin';
      btn.click();
    });
  }

  btn.addEventListener('click', () => {
    const fromId = nameToId(inputFrom.value);
    const toId   = nameToId(inputTo.value);
    result.replaceChildren();

    if (!fromId || !toId) {
      result.textContent = 'City not found — check spelling.';
      return;
    }

    const path = bfs(adj, fromId, toId);
    if (!path) {
      result.textContent = 'No path found between these cities.';
      document.querySelectorAll('#map-path canvas, #map-path p.map-hint')
        .forEach(e => e.remove());
      return;
    }

    // Summary line
    const summary = document.createElement('p');
    summary.className = 'path-summary';
    summary.textContent = path.map(id => idToName[id]).join(' → ');
    result.appendChild(summary);

    // Per-hop detail with street name + OSM link
    for (let i = 0; i < path.length - 1; i++) {
      const e = edgeLookup[path[i]]?.[path[i + 1]];
      if (!e) continue;
      const div = document.createElement('div');
      div.className = 'path-step';
      const from = document.createElement('span');
      from.textContent = idToName[path[i]];
      const to = document.createElement('span');
      to.textContent = idToName[path[i + 1]];
      div.append(from, document.createTextNode(' → '), to,
                 document.createTextNode(' via '), osmLink(e.street, e.lat, e.lon));
      result.appendChild(div);
    }

    highlightPath(graphData, path);
  });
}

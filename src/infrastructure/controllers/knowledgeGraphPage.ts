/**
 * Self-contained knowledge graph visualization page: inline CSS/JS, no CDN dependencies
 * (the D3 force-simulation and zoom/drag logic are hand-rolled to avoid an external script tag).
 *
 * SA-19 advanced features on top of the prior iteration's legend/pagination/filters:
 * - Visual grouping: convex-hull backdrops per department or per Louvain community.
 * - Community detection: prefers the backend's GDS Louvain `analytics` (community_id); when
 *   that's empty (GDS plugin unavailable server-side), falls back to a client-side label
 *   propagation pass over the currently-loaded person<->person (shared-topic) graph — an
 *   approximation limited to what's loaded on the page, not the full graph.
 * - Node sizing: prefers GDS PageRank `influence`; falls back to raw connection count.
 * - Broker highlighting: a ring around persons with a high GDS betweenness `broker_score` —
 *   the "riskiest to lose" signal (bridges otherwise-disconnected communities).
 * - Successor lookup: sidebar section listing GDS Node Similarity "who can cover for them".
 * - SVG/PNG export of the current view — fully client-side, no external services.
 * - Temporal timeline: a range slider over edge `created_at`/`last_seen`. Edges recorded
 *   before this feature shipped have neither timestamp and are always shown ("no history"
 *   is treated as "always present", not hidden) — documented limitation, not a bug.
 *
 * Postponed this iteration (documented, not silently dropped — see the SA-19 vault note):
 * minimap for very large graphs, and full touch-gesture parity (pan/zoom/drag already work
 * via pointer events on most touch browsers, but multi-touch pinch-zoom is not implemented).
 */
export const KNOWLEDGE_GRAPH_PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Offboard-Me Knowledge Graph</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #0b0e14; color: #e6e8ee; height: 100vh; overflow: hidden;
  }
  @media (prefers-color-scheme: light) {
    body { background: #f6f7fb; color: #1a1d24; }
  }
  #toolbar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 10;
    display: flex; gap: 12px; align-items: center; padding: 10px 16px; flex-wrap: wrap;
    background: rgba(20, 23, 32, 0.85); backdrop-filter: blur(6px);
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  @media (prefers-color-scheme: light) {
    #toolbar { background: rgba(255,255,255,0.85); border-bottom-color: rgba(0,0,0,0.08); }
  }
  #toolbar input[type="text"] {
    flex: 0 1 240px; padding: 6px 10px; border-radius: 6px;
    border: 1px solid rgba(128,128,128,0.4); background: transparent; color: inherit;
  }
  #toolbar label { display: flex; align-items: center; gap: 4px; font-size: 13px; }
  #toolbar h1 { font-size: 15px; margin: 0 12px 0 0; white-space: nowrap; }
  #toolbar button {
    font-size: 12px; padding: 6px 10px; border-radius: 6px; cursor: pointer;
    border: 1px solid rgba(128,128,128,0.4); background: transparent; color: inherit;
  }
  #toolbar button:disabled { opacity: 0.4; cursor: default; }
  #dept-filter { position: relative; }
  #dept-filter-toggle { min-width: 120px; text-align: left; }
  #dept-filter-menu {
    display: none; position: absolute; top: 100%; left: 0; margin-top: 4px; z-index: 20;
    background: rgba(20, 23, 32, 0.97); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px;
    padding: 8px 10px; min-width: 180px; max-height: 240px; overflow-y: auto;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  }
  @media (prefers-color-scheme: light) {
    #dept-filter-menu { background: rgba(255,255,255,0.98); border-color: rgba(0,0,0,0.12); }
  }
  #dept-filter-menu.open { display: block; }
  #dept-filter-menu label { padding: 3px 0; gap: 6px; }
  #status { position: fixed; top: 52px; left: 16px; font-size: 12px; opacity: 0.7; z-index: 10; }
  svg { width: 100vw; height: 100vh; display: block; }
  .node-label { font-size: 10px; fill: currentColor; pointer-events: none; }
  .link { stroke: currentColor; }
  #sidebar {
    position: fixed; top: 52px; right: 0; bottom: 0; width: 300px;
    background: rgba(20, 23, 32, 0.92); border-left: 1px solid rgba(255,255,255,0.08);
    padding: 16px; overflow-y: auto; display: none; font-size: 13px;
  }
  @media (prefers-color-scheme: light) {
    #sidebar { background: rgba(255,255,255,0.92); border-left-color: rgba(0,0,0,0.08); }
  }
  #sidebar.open { display: block; }
  #sidebar h2 { font-size: 14px; margin: 0 0 8px; }
  #sidebar .close { float: right; cursor: pointer; opacity: 0.6; }
  #sidebar ul { list-style: none; margin: 4px 0 0; padding: 0; }
  #sidebar li {
    display: flex; justify-content: space-between; gap: 8px; padding: 4px 0;
    border-bottom: 1px solid rgba(128,128,128,0.15);
  }
  #sidebar .score { opacity: 0.7; font-variant-numeric: tabular-nums; }
  #legend {
    position: fixed; bottom: 16px; left: 16px; z-index: 10; font-size: 12px;
    background: rgba(20, 23, 32, 0.85); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px;
    padding: 10px 12px; max-width: 220px; max-height: 40vh; overflow-y: auto;
  }
  @media (prefers-color-scheme: light) {
    #legend { background: rgba(255,255,255,0.85); border-color: rgba(0,0,0,0.08); }
  }
  #legend h3 { font-size: 11px; margin: 0 0 6px; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.04em; }
  #legend .row { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
  #legend .swatch { width: 10px; height: 10px; border-radius: 50%; flex: none; }
  #legend .sep { height: 1px; background: rgba(128,128,128,0.2); margin: 6px 0; }
  #toolbar select {
    padding: 6px 8px; border-radius: 6px; border: 1px solid rgba(128,128,128,0.4);
    background: transparent; color: inherit; font-size: 12px;
  }
  .hull { stroke: none; opacity: 0.14; }
  .node-broker circle { stroke: #ff4757; stroke-width: 2.5; stroke-dasharray: 2 2; }
  #timeline {
    position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); z-index: 10;
    display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 8px;
    background: rgba(20, 23, 32, 0.85); border: 1px solid rgba(255,255,255,0.08); font-size: 12px;
  }
  @media (prefers-color-scheme: light) {
    #timeline { background: rgba(255,255,255,0.85); border-color: rgba(0,0,0,0.08); }
  }
  #timeline input[type="range"] { width: 220px; }
  #timeline-label { min-width: 90px; text-align: center; font-variant-numeric: tabular-nums; }
  #successors { margin-top: 10px; }
  #successors li { display: flex; justify-content: space-between; gap: 8px; padding: 4px 0; }
</style>
</head>
<body>
  <div id="toolbar">
    <h1>&#128202; Knowledge Graph</h1>
    <input type="text" id="search" placeholder="Search person or topic..." />
    <label><input type="checkbox" id="filter-person" checked /> People</label>
    <label><input type="checkbox" id="filter-topic" checked /> Topics</label>
    <div id="dept-filter">
      <button type="button" id="dept-filter-toggle">Departments &#9662;</button>
      <div id="dept-filter-menu"></div>
    </div>
    <label>Group by:
      <select id="group-by">
        <option value="none">None</option>
        <option value="department">Department</option>
        <option value="community">Community</option>
      </select>
    </label>
    <button type="button" id="export-svg">Export SVG</button>
    <button type="button" id="export-png">Export PNG</button>
    <button type="button" id="load-more">Load more</button>
  </div>
  <div id="status">Loading...</div>
  <div id="legend"></div>
  <svg id="graph"></svg>
  <div id="sidebar"><span class="close" id="sidebar-close">&#10005;</span><div id="sidebar-content"></div></div>
  <div id="timeline">
    <span>&#128337;</span>
    <input type="range" id="timeline-slider" min="0" max="0" value="0" step="1" disabled />
    <span id="timeline-label">No history</span>
  </div>

<script>
(function () {
  var svg = document.getElementById('graph');
  var ns = 'http://www.w3.org/2000/svg';
  var status = document.getElementById('status');
  var sidebar = document.getElementById('sidebar');
  var sidebarContent = document.getElementById('sidebar-content');
  var legend = document.getElementById('legend');
  var loadMoreBtn = document.getElementById('load-more');
  var deptToggle = document.getElementById('dept-filter-toggle');
  var deptMenu = document.getElementById('dept-filter-menu');
  var groupBySelect = document.getElementById('group-by');
  var timelineSlider = document.getElementById('timeline-slider');
  var timelineLabel = document.getElementById('timeline-label');
  document.getElementById('sidebar-close').onclick = function () { sidebar.classList.remove('open'); };

  var width = window.innerWidth, height = window.innerHeight;
  var PAGE_SIZE = 100;
  var TOPIC_COLOR = '#35c979';
  var DEFAULT_PERSON_COLOR = '#4c8dff';
  var DEPARTMENT_PALETTE = [
    '#4c8dff', '#ff9f43', '#ee5253', '#a55eea', '#feca57',
    '#54a0ff', '#1dd1a1', '#ff6b81', '#c8d6e5', '#5f27cd',
  ];
  // Throttle for hull recompute: recomputed every Nth simulation tick (~30ms each) rather
  // than every tick, since convex-hull geometry is rebuilt from scratch each time.
  var HULL_THROTTLE = 6;

  // Accumulated across pages so "Load more" grows the graph instead of replacing it.
  var nodesById = {};
  var edgeKeys = {};
  var rawEdges = []; // { source: id, target: id, weight, created_at?, last_seen? }
  var personsPagination = null;
  var topicsPagination = null;
  var currentPage = 0;
  var deselectedDepartments = {};
  var departmentColors = {};
  // Per-person GDS analytics (community/influence/broker), keyed by node id ("person:<id>"),
  // merged across pages. Empty when the backend's GDS plugin is unavailable (SA-19).
  var analyticsByPersonId = {};
  var communityColors = {};
  // 'none' | 'department' | 'community' — which grouping the hull overlay/node coloring uses.
  var groupMode = 'none';
  // Temporal timeline: null means "no relationship history recorded yet" (pre-SA-19 edges
  // only), in which case the slider stays disabled and everything is always shown.
  var timelineCurrent = null;

  // Derived, rebuilt after every merge.
  var nodesArr = [];
  var edgesArr = []; // resolved: { source: node, target: node, weight, created_at, last_seen, timeMs }
  var connectionCounts = {};
  var nodeEls = [];
  var linkEls = [];
  var hullGroup = null;
  var hullTickCounter = 0;

  loadPage(1);

  groupBySelect.addEventListener('change', function (ev) {
    groupMode = ev.target.value;
    // Node fill/hulls are baked in at element-creation time, so a full re-render is the
    // simplest correct way to reflect the new grouping (mirrors the existing "Load more"
    // rebuild, which already resets pan/zoom the same way).
    renderLegend(assignDepartmentColors(), assignCommunityColors());
    renderElements();
    applyFilters();
  });
  document.getElementById('export-svg').addEventListener('click', exportSvg);
  document.getElementById('export-png').addEventListener('click', exportPng);
  timelineSlider.addEventListener('input', function () {
    timelineCurrent = Number(timelineSlider.value);
    updateTimelineLabel();
    applyFilters();
  });

  deptToggle.addEventListener('click', function () {
    deptMenu.classList.toggle('open');
  });
  document.addEventListener('click', function (ev) {
    if (!document.getElementById('dept-filter').contains(ev.target)) {
      deptMenu.classList.remove('open');
    }
  });
  loadMoreBtn.addEventListener('click', function () {
    loadPage(currentPage + 1);
  });

  function loadPage(page) {
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = 'Loading...';
    fetch('/api/knowledge-graph/data?page=' + page + '&size=' + PAGE_SIZE)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        currentPage = page;
        mergeData(data);
        rebuild();
      })
      .catch(function (err) {
        status.textContent = 'Failed to load knowledge graph: ' + err;
        loadMoreBtn.disabled = false;
        loadMoreBtn.textContent = 'Load more';
      });
  }

  function mergeData(data) {
    data.nodes.forEach(function (n) {
      var existing = nodesById[n.id];
      if (existing) {
        existing.label = n.label;
        existing.department = n.department;
      } else {
        n.x = width / 2 + (Math.random() - 0.5) * 200;
        n.y = height / 2 + (Math.random() - 0.5) * 200;
        n.vx = 0; n.vy = 0;
        nodesById[n.id] = n;
      }
    });
    data.edges.forEach(function (e) {
      var key = e.source + '->' + e.target;
      if (edgeKeys[key]) return;
      edgeKeys[key] = true;
      rawEdges.push(e);
    });
    if (data.analytics) {
      Object.keys(data.analytics).forEach(function (nodeId) {
        analyticsByPersonId[nodeId] = data.analytics[nodeId];
      });
    }
    personsPagination = data.pagination.persons;
    topicsPagination = data.pagination.topics;
  }

  function hasMorePages() {
    var morePersons = personsPagination && personsPagination.page < personsPagination.total_pages;
    var moreTopics = topicsPagination && topicsPagination.page < topicsPagination.total_pages;
    return Boolean(morePersons || moreTopics);
  }

  function assignDepartmentColors() {
    var depts = {};
    nodesArr.forEach(function (n) {
      if (n.type === 'person' && n.department) depts[n.department] = true;
    });
    var names = Object.keys(depts).sort();
    names.forEach(function (name, i) {
      if (!departmentColors[name]) {
        departmentColors[name] = DEPARTMENT_PALETTE[i % DEPARTMENT_PALETTE.length];
      }
    });
    return names;
  }

  // --- Community detection (SA-19): prefer backend GDS analytics, fall back client-side ---

  function buildPersonAdjacency() {
    // Two persons are "adjacent" once per topic they both connect to, weighted by how many
    // topics they share — same relationship the backend projects for its GDS Louvain run.
    var personsByTopic = {};
    edgesArr.forEach(function (e) {
      if (e.source.type === 'person' && e.target.type === 'topic') {
        (personsByTopic[e.target.id] = personsByTopic[e.target.id] || []).push(e.source.id);
      }
    });
    var adjacency = {};
    Object.keys(personsByTopic).forEach(function (topicId) {
      var persons = personsByTopic[topicId];
      for (var i = 0; i < persons.length; i++) {
        for (var j = i + 1; j < persons.length; j++) {
          var a = persons[i], b = persons[j];
          adjacency[a] = adjacency[a] || {};
          adjacency[b] = adjacency[b] || {};
          adjacency[a][b] = (adjacency[a][b] || 0) + 1;
          adjacency[b][a] = (adjacency[b][a] || 0) + 1;
        }
      }
    });
    return adjacency;
  }

  // Deterministic (non-randomized-order) label propagation over the currently-loaded page's
  // person network — an approximation of real community detection, not equivalent to the
  // backend's GDS Louvain. Used only when the backend has no analytics at all (GDS off).
  function labelPropagation() {
    var adjacency = buildPersonAdjacency();
    var persons = nodesArr.filter(function (n) { return n.type === 'person'; });
    var labels = {};
    persons.forEach(function (p, i) { labels[p.id] = i; });
    var maxIterations = 10;
    for (var iter = 0; iter < maxIterations; iter++) {
      var changed = false;
      persons.forEach(function (p) {
        var neighbors = adjacency[p.id];
        if (!neighbors) return;
        var weightByLabel = {};
        Object.keys(neighbors).forEach(function (otherId) {
          var otherLabel = labels[otherId];
          if (otherLabel === undefined) return;
          weightByLabel[otherLabel] = (weightByLabel[otherLabel] || 0) + neighbors[otherId];
        });
        var bestLabel = labels[p.id], bestWeight = -1;
        Object.keys(weightByLabel).forEach(function (labelStr) {
          if (weightByLabel[labelStr] > bestWeight) {
            bestWeight = weightByLabel[labelStr];
            bestLabel = Number(labelStr);
          }
        });
        if (bestLabel !== labels[p.id]) { labels[p.id] = bestLabel; changed = true; }
      });
      if (!changed) break;
    }
    persons.forEach(function (p) { p.__community = 'local:' + labels[p.id]; });
  }

  function computeCommunities() {
    var hasBackendAnalytics = Object.keys(analyticsByPersonId).length > 0;
    nodesArr.forEach(function (n) {
      if (n.type !== 'person') return;
      var a = analyticsByPersonId[n.id];
      if (a) {
        n.__community = 'gds:' + a.community_id;
        n.__influence = a.influence;
        n.__broker = a.broker_score;
      } else {
        n.__community = undefined;
        n.__influence = undefined;
        n.__broker = undefined;
      }
    });
    if (!hasBackendAnalytics) labelPropagation();
  }

  function communityLabel(key) {
    var parts = String(key).split(':');
    return 'Community ' + parts[1] + (parts[0] === 'local' ? ' (approx.)' : '');
  }

  function assignCommunityColors() {
    var ids = {};
    nodesArr.forEach(function (n) {
      if (n.type === 'person' && n.__community !== undefined && n.__community !== null) ids[n.__community] = true;
    });
    var names = Object.keys(ids).sort();
    names.forEach(function (name, i) {
      if (!communityColors[name]) communityColors[name] = DEPARTMENT_PALETTE[i % DEPARTMENT_PALETTE.length];
    });
    return names;
  }

  // Nodes with a betweenness broker_score at or above 60% of the current page's max are
  // flagged as brokers (ring highlight) — an arbitrary-but-documented threshold, not a
  // backend-defined cutoff, since "high risk" is inherently relative to this graph's shape.
  function brokerThreshold() {
    var max = 0;
    nodesArr.forEach(function (n) { if (n.type === 'person' && n.__broker) max = Math.max(max, n.__broker); });
    return max > 0 ? max * 0.6 : Infinity;
  }

  function nodeColor(n) {
    if (n.type === 'topic') return TOPIC_COLOR;
    if (groupMode === 'community' && n.__community != null && communityColors[n.__community]) {
      return communityColors[n.__community];
    }
    if (n.department && departmentColors[n.department]) return departmentColors[n.department];
    return DEFAULT_PERSON_COLOR;
  }

  function nodeRadius(n) {
    var base = n.type === 'person' ? 7 : 6;
    if (n.type === 'person' && n.__influence != null) {
      // PageRank scores have no fixed scale; this multiplier is a visual heuristic tuned for
      // typical small/medium graphs, not a normalized mapping.
      return base + Math.min(14, n.__influence * 40);
    }
    var count = connectionCounts[n.id] || 0;
    return base + Math.min(14, Math.sqrt(count) * 3);
  }

  // --- Visual grouping: convex-hull backdrops per department or per community ---

  function currentGroupKey(n) {
    if (groupMode === 'department') return n.department || null;
    if (groupMode === 'community') return n.__community != null ? n.__community : null;
    return null;
  }

  function groupColor(key) {
    if (groupMode === 'department') return departmentColors[key];
    if (groupMode === 'community') return communityColors[key];
    return null;
  }

  function convexHull(points) {
    if (points.length < 3) return points.slice();
    var pts = points.slice().sort(function (a, b) { return a.x - b.x || a.y - b.y; });
    function cross(o, a, b) { return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x); }
    var lower = [];
    for (var i = 0; i < pts.length; i++) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pts[i]) <= 0) lower.pop();
      lower.push(pts[i]);
    }
    var upper = [];
    for (var j = pts.length - 1; j >= 0; j--) {
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pts[j]) <= 0) upper.pop();
      upper.push(pts[j]);
    }
    upper.pop(); lower.pop();
    return lower.concat(upper);
  }

  function expandHull(hullPts, padding) {
    if (hullPts.length === 0) return hullPts;
    var cx = 0, cy = 0;
    hullPts.forEach(function (p) { cx += p.x; cy += p.y; });
    cx /= hullPts.length; cy /= hullPts.length;
    return hullPts.map(function (p) {
      var dx = p.x - cx, dy = p.y - cy;
      var dist = Math.sqrt(dx * dx + dy * dy) || 1;
      return { x: p.x + (dx / dist) * padding, y: p.y + (dy / dist) * padding };
    });
  }

  function hullPathData(hullPts) {
    if (hullPts.length === 0) return '';
    var d = 'M ' + hullPts[0].x + ' ' + hullPts[0].y;
    for (var i = 1; i < hullPts.length; i++) d += ' L ' + hullPts[i].x + ' ' + hullPts[i].y;
    return d + ' Z';
  }

  function renderHulls() {
    if (!hullGroup) return;
    while (hullGroup.firstChild) hullGroup.removeChild(hullGroup.firstChild);
    if (groupMode === 'none') return;
    var groups = {};
    nodesArr.forEach(function (n) {
      if (n.type !== 'person' || !nodeVisible(n)) return;
      var key = currentGroupKey(n);
      if (key === null) return;
      (groups[key] = groups[key] || []).push(n);
    });
    Object.keys(groups).forEach(function (key) {
      var pts = groups[key];
      if (pts.length < 2) return;
      var hullPts = expandHull(convexHull(pts), 26);
      var path = document.createElementNS(ns, 'path');
      path.setAttribute('class', 'hull');
      path.setAttribute('d', hullPathData(hullPts));
      path.setAttribute('fill', groupColor(key) || DEFAULT_PERSON_COLOR);
      hullGroup.appendChild(path);
    });
  }

  function rebuild() {
    nodesArr = Object.keys(nodesById).map(function (id) { return nodesById[id]; });
    edgesArr = rawEdges
      .map(function (e) {
        return {
          source: nodesById[e.source],
          target: nodesById[e.target],
          weight: e.weight,
          created_at: e.created_at,
          last_seen: e.last_seen,
          timeMs: e.created_at ? Date.parse(e.created_at) : null,
        };
      })
      .filter(function (e) { return e.source && e.target; });

    connectionCounts = {};
    edgesArr.forEach(function (e) {
      connectionCounts[e.source.id] = (connectionCounts[e.source.id] || 0) + 1;
      connectionCounts[e.target.id] = (connectionCounts[e.target.id] || 0) + 1;
    });

    computeCommunities();

    var deptNames = assignDepartmentColors();
    var communityNames = assignCommunityColors();
    renderLegend(deptNames, communityNames);
    renderDeptFilterMenu(deptNames);
    renderElements();
    computeTimelineRange();
    applyFilters();
    updateStatus();

    loadMoreBtn.disabled = !hasMorePages();
    loadMoreBtn.textContent = hasMorePages() ? 'Load more' : 'All loaded';
  }

  function updateStatus() {
    var personsTotal = personsPagination ? personsPagination.total : 0;
    var topicsTotal = topicsPagination ? topicsPagination.total : 0;
    var personsLoaded = nodesArr.filter(function (n) { return n.type === 'person'; }).length;
    var topicsLoaded = nodesArr.filter(function (n) { return n.type === 'topic'; }).length;
    status.textContent = personsLoaded + ' of ' + personsTotal + ' people, ' +
      topicsLoaded + ' of ' + topicsTotal + ' topics, ' + edgesArr.length + ' relationships';
  }

  function renderLegend(deptNames, communityNames) {
    var html = '<h3>Legend</h3>' +
      '<div class="row"><span class="swatch" style="background:' + DEFAULT_PERSON_COLOR + '"></span>Person</div>' +
      '<div class="row"><span class="swatch" style="background:' + TOPIC_COLOR + '"></span>Topic</div>';
    var hasBrokers = nodesArr.some(function (n) { return n.type === 'person' && n.__broker; });
    if (hasBrokers) {
      html += '<div class="row"><span class="swatch" style="border:2px dashed #ff4757;background:transparent"></span>Knowledge broker (high risk)</div>';
    }
    if (groupMode === 'department' && deptNames.length > 0) {
      html += '<div class="sep"></div><h3>Department</h3>';
      html += deptNames.map(function (name) {
        return '<div class="row"><span class="swatch" style="background:' + departmentColors[name] + '"></span>' + escapeHtml(name) + '</div>';
      }).join('');
    }
    if (groupMode === 'community' && communityNames.length > 0) {
      html += '<div class="sep"></div><h3>Community</h3>';
      html += communityNames.map(function (key) {
        return '<div class="row"><span class="swatch" style="background:' + communityColors[key] + '"></span>' + escapeHtml(communityLabel(key)) + '</div>';
      }).join('');
    }
    legend.innerHTML = html;
  }

  function renderDeptFilterMenu(deptNames) {
    if (deptNames.length === 0) {
      deptMenu.innerHTML = '<div style="opacity:0.6">No department data</div>';
      return;
    }
    deptMenu.innerHTML = deptNames.map(function (name) {
      var checked = deselectedDepartments[name] ? '' : 'checked';
      return '<label><input type="checkbox" data-dept="' + escapeHtml(name) + '" ' + checked + ' /> ' + escapeHtml(name) + '</label>';
    }).join('');
    Array.prototype.forEach.call(deptMenu.querySelectorAll('input[type=checkbox]'), function (cb) {
      cb.addEventListener('change', function () {
        var dept = cb.getAttribute('data-dept');
        if (cb.checked) delete deselectedDepartments[dept];
        else deselectedDepartments[dept] = true;
        applyFilters();
      });
    });
  }

  function renderElements() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var g = document.createElementNS(ns, 'g');
    svg.appendChild(g);
    hullGroup = document.createElementNS(ns, 'g');
    var linkGroup = document.createElementNS(ns, 'g');
    var nodeGroup = document.createElementNS(ns, 'g');
    // Hulls sit beneath links/nodes so they read as backdrops, not overlays.
    g.appendChild(hullGroup);
    g.appendChild(linkGroup);
    g.appendChild(nodeGroup);

    linkEls = edgesArr.map(function (e) {
      var line = document.createElementNS(ns, 'line');
      line.setAttribute('class', 'link');
      // Ensure weak connections stay visible: enforce a minimum stroke-width and opacity,
      // and scale both up with edge weight rather than relying on width alone.
      line.setAttribute('stroke-width', Math.max(1.5, e.weight * 4));
      line.setAttribute('stroke-opacity', Math.max(0.25, Math.min(0.9, 0.25 + e.weight * 0.5)));
      linkGroup.appendChild(line);
      return line;
    });

    var brokerThresholdValue = brokerThreshold();

    nodeEls = nodesArr.map(function (n) {
      var el = document.createElementNS(ns, 'g');
      var cls = 'node-' + n.type;
      if (n.type === 'person' && n.__broker != null && n.__broker >= brokerThresholdValue) {
        cls += ' node-broker';
      }
      el.setAttribute('class', cls);
      var circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('r', nodeRadius(n));
      circle.setAttribute('fill', nodeColor(n));
      var label = document.createElementNS(ns, 'text');
      label.setAttribute('class', 'node-label');
      label.setAttribute('dx', 10);
      label.setAttribute('dy', 4);
      label.textContent = n.label;
      el.appendChild(circle);
      el.appendChild(label);
      el.style.cursor = 'pointer';
      el.addEventListener('click', function () { showDetails(n); });
      makeDraggable(el, n);
      nodeGroup.appendChild(el);
      return el;
    });

    setupPanZoom(g);
    hullTickCounter = 0;
    renderHulls();
  }

  function connectedTopicsForPerson(n) {
    return edgesArr
      .filter(function (e) { return e.source === n && e.target.type === 'topic'; })
      .map(function (e) { return { label: e.target.label, weight: e.weight }; })
      .sort(function (a, b) { return b.weight - a.weight; });
  }

  function connectedExpertsForTopic(n) {
    return edgesArr
      .filter(function (e) { return e.target === n && e.source.type === 'person'; })
      .map(function (e) { return { label: e.source.label, weight: e.weight }; })
      .sort(function (a, b) { return b.weight - a.weight; });
  }

  function showDetails(n) {
    var html = '<h2>' + escapeHtml(n.label) + '</h2>' +
      '<p>Type: ' + n.type + '</p>' +
      (n.department ? '<p>Department: ' + escapeHtml(n.department) + '</p>' : '') +
      '<p>Connections: ' + (connectionCounts[n.id] || 0) + '</p>';

    if (n.type === 'person') {
      var topics = connectedTopicsForPerson(n);
      html += '<h2>Topics</h2>';
      html += topics.length === 0
        ? '<p style="opacity:0.6">No known topics.</p>'
        : '<ul>' + topics.map(function (t) {
            return '<li><span>' + escapeHtml(t.label) + '</span><span class="score">' + t.weight.toFixed(2) + '</span></li>';
          }).join('') + '</ul>';
      html += '<div id="successors"><h2>Who can cover for them</h2><p style="opacity:0.6">Loading...</p></div>';
    } else {
      var experts = connectedExpertsForTopic(n);
      html += '<h2>Experts</h2>';
      html += experts.length === 0
        ? '<p style="opacity:0.6">No known experts.</p>'
        : '<ul>' + experts.map(function (e) {
            return '<li><span>' + escapeHtml(e.label) + '</span><span class="score">' + e.weight.toFixed(2) + '</span></li>';
          }).join('') + '</ul>';
    }

    sidebarContent.innerHTML = html;
    sidebar.classList.add('open');
    if (n.type === 'person') loadSuccessors(n.id.slice('person:'.length));
  }

  // GDS Node Similarity, fetched lazily per-person (not batched with the page data) since
  // it's only needed once a person is actually opened in the sidebar.
  function loadSuccessors(personId) {
    var container = document.getElementById('successors');
    if (!container) return;
    fetch('/api/knowledge-graph/successors?person_id=' + encodeURIComponent(personId) + '&limit=5')
      .then(function (r) { return r.json(); })
      .then(function (list) {
        if (!Array.isArray(list) || list.length === 0) {
          container.innerHTML = '<h2>Who can cover for them</h2>' +
            '<p style="opacity:0.6">No successor data (GDS unavailable, or no topic overlap with anyone else).</p>';
          return;
        }
        container.innerHTML = '<h2>Who can cover for them</h2><ul>' + list.map(function (s) {
          return '<li><span>' + escapeHtml(s.person.name) + '</span><span class="score">' + s.similarity.toFixed(2) + '</span></li>';
        }).join('') + '</ul>';
      })
      .catch(function () {
        container.innerHTML = '<h2>Who can cover for them</h2><p style="opacity:0.6">Failed to load successors.</p>';
      });
  }

  function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  // Minimal force simulation: repulsion between all nodes, attraction along edges, centering.
  function tick() {
    for (var i = 0; i < nodesArr.length; i++) {
      for (var j = i + 1; j < nodesArr.length; j++) {
        var a = nodesArr[i], b = nodesArr[j];
        var dx = b.x - a.x, dy = b.y - a.y;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        var force = 800 / (dist * dist);
        var fx = (dx / dist) * force, fy = (dy / dist) * force;
        a.vx -= fx; a.vy -= fy;
        b.vx += fx; b.vy += fy;
      }
    }
    edgesArr.forEach(function (e) {
      var dx = e.target.x - e.source.x, dy = e.target.y - e.source.y;
      var dist = Math.sqrt(dx * dx + dy * dy) || 1;
      var force = (dist - 100) * 0.02;
      var fx = (dx / dist) * force, fy = (dy / dist) * force;
      e.source.vx += fx; e.source.vy += fy;
      e.target.vx -= fx; e.target.vy -= fy;
    });
    nodesArr.forEach(function (n) {
      if (n.fixed) return;
      n.vx += (width / 2 - n.x) * 0.002;
      n.vy += (height / 2 - n.y) * 0.002;
      n.vx *= 0.85; n.vy *= 0.85;
      n.x += n.vx; n.y += n.vy;
    });
    render();
    hullTickCounter++;
    if (hullTickCounter % HULL_THROTTLE === 0) renderHulls();
  }

  function render() {
    linkEls.forEach(function (line, i) {
      var e = edgesArr[i];
      if (!e) return;
      line.setAttribute('x1', e.source.x); line.setAttribute('y1', e.source.y);
      line.setAttribute('x2', e.target.x); line.setAttribute('y2', e.target.y);
    });
    nodeEls.forEach(function (el, i) {
      var n = nodesArr[i];
      if (!n) return;
      el.setAttribute('transform', 'translate(' + n.x + ',' + n.y + ')');
    });
  }

  var simInterval = setInterval(tick, 30);
  window.addEventListener('beforeunload', function () { clearInterval(simInterval); });

  function makeDraggable(el, n) {
    var dragging = false;
    el.addEventListener('mousedown', function (ev) {
      dragging = true; n.fixed = true; ev.preventDefault();
    });
    window.addEventListener('mousemove', function (ev) {
      if (!dragging) return;
      var rect = svg.getBoundingClientRect();
      n.x = ev.clientX - rect.left; n.y = ev.clientY - rect.top;
    });
    window.addEventListener('mouseup', function () { dragging = false; });
  }

  // Pan + zoom
  function setupPanZoom(g) {
    var scale = 1, tx = 0, ty = 0, panning = false, lastX = 0, lastY = 0;
    function applyTransform() {
      g.setAttribute('transform', 'translate(' + tx + ',' + ty + ') scale(' + scale + ')');
    }
    svg.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      scale = Math.min(4, Math.max(0.2, scale * (ev.deltaY < 0 ? 1.1 : 0.9)));
      applyTransform();
    }, { passive: false });
    svg.addEventListener('mousedown', function (ev) {
      if (ev.target === svg) { panning = true; lastX = ev.clientX; lastY = ev.clientY; }
    });
    window.addEventListener('mousemove', function (ev) {
      if (!panning) return;
      tx += ev.clientX - lastX; ty += ev.clientY - lastY;
      lastX = ev.clientX; lastY = ev.clientY;
      applyTransform();
    });
    window.addEventListener('mouseup', function () { panning = false; });
  }

  // Filters: type (person/topic), department (multi-select), and search highlight.
  function isDeptFilterActive() {
    return Object.keys(deselectedDepartments).length > 0;
  }

  function personVisible(n) {
    var showPerson = document.getElementById('filter-person').checked;
    if (!showPerson) return false;
    if (n.department && deselectedDepartments[n.department]) return false;
    return true;
  }

  function topicVisible(n) {
    var showTopic = document.getElementById('filter-topic').checked;
    if (!showTopic) return false;
    // Only cascade-hide a topic when the department filter is actively narrowing the
    // person set (documented limitation: this only affects the currently loaded page).
    if (isDeptFilterActive()) {
      var hasVisibleExpert = edgesArr.some(function (e) {
        return e.target === n && e.source.type === 'person' && personVisible(e.source);
      });
      if (!hasVisibleExpert) return false;
    }
    return true;
  }

  // --- Temporal timeline (SA-19): filter by relationship created_at ---

  function edgeVisibleByTime(e) {
    // No scrub position set (no relationship history recorded at all yet) -> show everything.
    if (timelineCurrent == null) return true;
    // Edges predating the timestamp change carry no created_at — treat as "always present"
    // rather than hiding them, since we genuinely don't know when they appeared.
    if (e.timeMs == null || isNaN(e.timeMs)) return true;
    return e.timeMs <= timelineCurrent;
  }

  function nodeVisibleByTime(n) {
    if (timelineCurrent == null) return true;
    var edgesForNode = edgesArr.filter(function (e) { return e.source === n || e.target === n; });
    if (edgesForNode.length === 0) return true; // untimed/isolated node — not part of the filter
    return edgesForNode.some(edgeVisibleByTime);
  }

  function computeTimelineRange() {
    var times = edgesArr
      .map(function (e) { return e.timeMs; })
      .filter(function (t) { return t != null && !isNaN(t); });
    if (times.length === 0) {
      timelineSlider.disabled = true;
      timelineSlider.min = '0'; timelineSlider.max = '0'; timelineSlider.value = '0';
      timelineCurrent = null;
      timelineLabel.textContent = 'No history';
      return;
    }
    var min = Math.min.apply(null, times), max = Math.max.apply(null, times);
    timelineSlider.disabled = false;
    timelineSlider.min = String(min); timelineSlider.max = String(max);
    // Keep the user's scrub position if it's still meaningful; otherwise default to "now"
    // (the max, i.e. show everything loaded so far).
    if (timelineCurrent == null || timelineCurrent > max || timelineCurrent < min) {
      timelineCurrent = max;
    }
    timelineSlider.value = String(timelineCurrent);
    updateTimelineLabel();
  }

  function updateTimelineLabel() {
    if (timelineCurrent == null) { timelineLabel.textContent = 'No history'; return; }
    timelineLabel.textContent = new Date(timelineCurrent).toISOString().slice(0, 10);
  }

  function nodeVisible(n) {
    var typeVisible = n.type === 'person' ? personVisible(n) : topicVisible(n);
    return typeVisible && nodeVisibleByTime(n);
  }

  function applyFilters() {
    nodeEls.forEach(function (el, i) {
      var n = nodesArr[i];
      el.style.display = nodeVisible(n) ? '' : 'none';
    });
    linkEls.forEach(function (line, i) {
      var e = edgesArr[i];
      var visible = nodeVisible(e.source) && nodeVisible(e.target) && edgeVisibleByTime(e);
      line.style.display = visible ? '' : 'none';
    });
    applySearchHighlight();
    renderHulls();
  }

  function applySearchHighlight() {
    var q = document.getElementById('search').value.trim().toLowerCase();
    nodeEls.forEach(function (el, i) {
      var n = nodesArr[i];
      var match = q.length > 0 && n.label.toLowerCase().indexOf(q) !== -1;
      el.querySelector('circle').setAttribute('stroke', match ? '#ffd23f' : 'none');
      el.querySelector('circle').setAttribute('stroke-width', match ? '3' : '0');
    });
  }

  document.getElementById('filter-person').addEventListener('change', applyFilters);
  document.getElementById('filter-topic').addEventListener('change', applyFilters);
  document.getElementById('search').addEventListener('input', applySearchHighlight);

  // --- SVG/PNG export: fully client-side, no external service ---

  function serializeSvgClone() {
    var clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', ns);
    clone.setAttribute('width', String(width));
    clone.setAttribute('height', String(height));
    return new XMLSerializer().serializeToString(clone);
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function exportSvg() {
    var source = '<?xml version="1.0" standalone="no"?>\r\n' + serializeSvgClone();
    downloadBlob(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }), 'knowledge-graph.svg');
  }

  function exportPng() {
    var svgBlob = new Blob([serializeSvgClone()], { type: 'image/svg+xml;charset=utf-8' });
    var url = URL.createObjectURL(svgBlob);
    var img = new Image();
    img.onload = function () {
      var canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      var ctx = canvas.getContext('2d');
      // Fill the background first so transparent SVG areas don't render as black in
      // viewers that ignore alpha; matches the page's dark background.
      ctx.fillStyle = '#0b0e14';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob(function (blob) {
        if (blob) downloadBlob(blob, 'knowledge-graph.png');
      });
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      status.textContent = 'PNG export failed.';
    };
    img.src = url;
  }
})();
</script>
</body>
</html>
`;

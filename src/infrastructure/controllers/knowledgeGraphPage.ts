/**
 * Self-contained knowledge graph visualization page: inline CSS/JS, no CDN dependencies
 * (the D3 force-simulation and zoom/drag logic are hand-rolled to avoid an external script tag).
 */
export const KNOWLEDGE_GRAPH_PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>OffboardMe Knowledge Graph</title>
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
    <button type="button" id="load-more">Load more</button>
  </div>
  <div id="status">Loading...</div>
  <div id="legend"></div>
  <svg id="graph"></svg>
  <div id="sidebar"><span class="close" id="sidebar-close">&#10005;</span><div id="sidebar-content"></div></div>

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
  document.getElementById('sidebar-close').onclick = function () { sidebar.classList.remove('open'); };

  var width = window.innerWidth, height = window.innerHeight;
  var PAGE_SIZE = 100;
  var TOPIC_COLOR = '#35c979';
  var DEFAULT_PERSON_COLOR = '#4c8dff';
  var DEPARTMENT_PALETTE = [
    '#4c8dff', '#ff9f43', '#ee5253', '#a55eea', '#feca57',
    '#54a0ff', '#1dd1a1', '#ff6b81', '#c8d6e5', '#5f27cd',
  ];

  // Accumulated across pages so "Load more" grows the graph instead of replacing it.
  var nodesById = {};
  var edgeKeys = {};
  var rawEdges = []; // { source: id, target: id, weight }
  var personsPagination = null;
  var topicsPagination = null;
  var currentPage = 0;
  var deselectedDepartments = {};
  var departmentColors = {};

  // Derived, rebuilt after every merge.
  var nodesArr = [];
  var edgesArr = []; // resolved: { source: node, target: node, weight }
  var connectionCounts = {};
  var nodeEls = [];
  var linkEls = [];

  loadPage(1);

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

  function nodeColor(n) {
    if (n.type === 'topic') return TOPIC_COLOR;
    if (n.department && departmentColors[n.department]) return departmentColors[n.department];
    return DEFAULT_PERSON_COLOR;
  }

  function nodeRadius(n) {
    var base = n.type === 'person' ? 7 : 6;
    var count = connectionCounts[n.id] || 0;
    return base + Math.min(14, Math.sqrt(count) * 3);
  }

  function rebuild() {
    nodesArr = Object.keys(nodesById).map(function (id) { return nodesById[id]; });
    edgesArr = rawEdges
      .map(function (e) { return { source: nodesById[e.source], target: nodesById[e.target], weight: e.weight }; })
      .filter(function (e) { return e.source && e.target; });

    connectionCounts = {};
    edgesArr.forEach(function (e) {
      connectionCounts[e.source.id] = (connectionCounts[e.source.id] || 0) + 1;
      connectionCounts[e.target.id] = (connectionCounts[e.target.id] || 0) + 1;
    });

    var deptNames = assignDepartmentColors();
    renderLegend(deptNames);
    renderDeptFilterMenu(deptNames);
    renderElements();
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

  function renderLegend(deptNames) {
    var html = '<h3>Legend</h3>' +
      '<div class="row"><span class="swatch" style="background:' + DEFAULT_PERSON_COLOR + '"></span>Person</div>' +
      '<div class="row"><span class="swatch" style="background:' + TOPIC_COLOR + '"></span>Topic</div>';
    if (deptNames.length > 0) {
      html += '<div class="sep"></div><h3>Department</h3>';
      html += deptNames.map(function (name) {
        return '<div class="row"><span class="swatch" style="background:' + departmentColors[name] + '"></span>' + escapeHtml(name) + '</div>';
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
    var linkGroup = document.createElementNS(ns, 'g');
    var nodeGroup = document.createElementNS(ns, 'g');
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

    nodeEls = nodesArr.map(function (n) {
      var el = document.createElementNS(ns, 'g');
      el.setAttribute('class', 'node-' + n.type);
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

  function nodeVisible(n) {
    return n.type === 'person' ? personVisible(n) : topicVisible(n);
  }

  function applyFilters() {
    nodeEls.forEach(function (el, i) {
      var n = nodesArr[i];
      el.style.display = nodeVisible(n) ? '' : 'none';
    });
    linkEls.forEach(function (line, i) {
      var e = edgesArr[i];
      var visible = nodeVisible(e.source) && nodeVisible(e.target);
      line.style.display = visible ? '' : 'none';
    });
    applySearchHighlight();
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
})();
</script>
</body>
</html>
`;

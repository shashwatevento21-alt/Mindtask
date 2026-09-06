(() => {
  'use strict';

  /* ======================= Data layer ======================= */
  // Talks to api/tasks.php (PHP + MySQL) when available. Falls back to
  // localStorage so the app is fully usable/testable without a backend.

  const LocalDB = {
    key: 'mindtask_tasks_v1',
    nextId: 'mindtask_next_id_v1',
    read() { try { return JSON.parse(localStorage.getItem(this.key)) || []; } catch (e) { return []; } },
    write(arr) { localStorage.setItem(this.key, JSON.stringify(arr)); },
    list() { return Promise.resolve(this.read()); },
    create(data) {
      const arr = this.read();
      let id = parseInt(localStorage.getItem(this.nextId) || '1', 10);
      const now = new Date().toISOString();
      const task = Object.assign({
        id, parent_id: null, title: 'Untitled Task', description: '', priority: 'Medium',
        start_date: null, deadline: null, assignee_name: '', status: 'Not Started',
        is_expanded: 1, position_x: 0, position_y: 0, created_at: now, updated_at: now
      }, data, { id });
      arr.push(task);
      this.write(arr);
      localStorage.setItem(this.nextId, String(id + 1));
      return Promise.resolve(task);
    },
    update(data) {
      const arr = this.read();
      const idx = arr.findIndex(t => t.id === data.id);
      if (idx === -1) return Promise.resolve(null);
      arr[idx] = Object.assign({}, arr[idx], data, { updated_at: new Date().toISOString() });
      this.write(arr);
      return Promise.resolve(arr[idx]);
    },
    remove(id) {
      let arr = this.read();
      const toDelete = new Set([id]);
      let grew = true;
      while (grew) {
        grew = false;
        arr.forEach(t => {
          if (t.parent_id !== null && toDelete.has(t.parent_id) && !toDelete.has(t.id)) {
            toDelete.add(t.id);
            grew = true;
          }
        });
      }
      arr = arr.filter(t => !toDelete.has(t.id));
      this.write(arr);
      return Promise.resolve({ success: true });
    }
  };

  const API = {
    base: 'api/tasks.php',
    useLocal: false,
    async init() {
      try {
        const r = await fetch(this.base, { method: 'GET' });
        if (!r.ok) throw new Error('bad status');
        await r.json();
        this.useLocal = false;
      } catch (e) {
        this.useLocal = true;
        console.warn('MindTask: no PHP backend detected, using local browser storage instead.');
      }
    },
    list() { return this.useLocal ? LocalDB.list() : fetch(this.base).then(r => r.json()); },
    create(data) {
      return this.useLocal ? LocalDB.create(data) :
        fetch(this.base, { method: 'POST', body: JSON.stringify(data) }).then(r => r.json());
    },
    update(data) {
      return this.useLocal ? LocalDB.update(data) :
        fetch(this.base, { method: 'PUT', body: JSON.stringify(data) }).then(r => r.json());
    },
    remove(id) {
      return this.useLocal ? LocalDB.remove(id) :
        fetch(this.base + '?id=' + encodeURIComponent(id), { method: 'DELETE' }).then(r => r.json());
    }
  };

  /* ======================= State ======================= */

  let tasks = [];              // flat array from backend
  let byId = new Map();
  let childrenOf = new Map();
  let selectedId = null;
  let currentView = 'map';
  let filters = { search: '', priority: '', person: '', hideDone: false };

  const view = {
    pan: { x: 80, y: 80 },
    scale: 1
  };

  const priorityRank = { High: 3, Medium: 2, Low: 1 };

  /* ======================= DOM refs ======================= */

  const $ = sel => document.querySelector(sel);
  const canvasWrap = $('#canvas-wrap');
  const canvasEl = $('#canvas');
  const edgesSvg = $('#edges');
  const listView = $('#list-view');
  const emptyHint = $('#empty-hint');
  const sidePanel = $('#side-panel');
  const sidePanelOverlay = $('#side-panel-overlay');
  const searchInput = $('#search-input');
  const priorityFilter = $('#priority-filter');
  const personFilter = $('#person-filter');
  const hideDoneChk = $('#hide-done');
  const assigneeList = $('#assignee-list');

  /* ======================= Tree helpers ======================= */

  function rebuildIndexes() {
    byId = new Map(tasks.map(t => [t.id, t]));
    childrenOf = new Map();
    tasks.forEach(t => {
      const key = t.parent_id === null || t.parent_id === undefined ? 'root' : t.parent_id;
      if (!childrenOf.has(key)) childrenOf.set(key, []);
      childrenOf.get(key).push(t);
    });
  }

  function getChildren(id) { return childrenOf.get(id === null ? 'root' : id) || []; }

  function isAncestorExpanded(task) {
    let p = task.parent_id;
    while (p !== null && p !== undefined) {
      const parent = byId.get(p);
      if (!parent) return true;
      if (!Number(parent.is_expanded)) return false;
      p = parent.parent_id;
    }
    return true;
  }

  function nearestVisibleAncestorId(task) {
    // Used for edge source when hide-done removes a node from view.
    let p = task.parent_id;
    while (p !== null && p !== undefined) {
      const parent = byId.get(p);
      if (!parent) return null;
      if (!(filters.hideDone && parent.status === 'Done')) return parent.id;
      p = parent.parent_id;
    }
    return null;
  }

  function isOverdue(t) {
    if (!t.deadline || t.status === 'Done') return false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return new Date(t.deadline) < today;
  }

  function initials(name) {
    if (!name) return '?';
    return name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  }

  function fmtDate(d) {
    if (!d) return '';
    const dt = new Date(d);
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  /* ======================= Load ======================= */

  async function loadTasks() {
    tasks = (await API.list()).map(t => ({
      ...t,
      id: Number(t.id),
      parent_id: t.parent_id === null || t.parent_id === undefined || t.parent_id === '' ? null : Number(t.parent_id),
      position_x: Number(t.position_x) || 0,
      position_y: Number(t.position_y) || 0,
      is_expanded: Number(t.is_expanded)
    }));
    rebuildIndexes();
    refreshFilterOptions();
    render();
  }

  function refreshFilterOptions() {
    const names = Array.from(new Set(tasks.map(t => t.assignee_name).filter(Boolean))).sort();
    const prevPerson = personFilter.value;
    personFilter.innerHTML = '<option value="">All people</option>' +
      names.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
    personFilter.value = names.includes(prevPerson) ? prevPerson : '';
    assigneeList.innerHTML = names.map(n => `<option value="${escapeHtml(n)}">`).join('');
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ======================= Canvas transform ======================= */

  function applyTransform() {
    const t = `translate(${view.pan.x}px, ${view.pan.y}px) scale(${view.scale})`;
    canvasEl.style.transform = t;
    edgesSvg.style.transform = t;
  }

  function screenToCanvas(clientX, clientY) {
    const rect = canvasWrap.getBoundingClientRect();
    return {
      x: (clientX - rect.left - view.pan.x) / view.scale,
      y: (clientY - rect.top - view.pan.y) / view.scale
    };
  }

  /* ======================= Render (Mind Map view) ======================= */

  function render() {
    if (currentView === 'map') {
      renderMap();
    } else {
      renderList();
    }
  }

  function taskMatchesFilters(t) {
    if (filters.hideDone && t.status === 'Done') return false;
    return true;
  }

  function taskIsDimmed(t) {
    if (filters.priority && priorityRank[t.priority] < priorityRank[filters.priority]) return true;
    if (filters.person && t.assignee_name !== filters.person) return true;
    return false;
  }

  function taskMatchesSearch(t) {
    if (!filters.search) return false;
    return t.title.toLowerCase().includes(filters.search.toLowerCase());
  }

  function renderMap() {
    canvasEl.innerHTML = '';
    edgesSvg.innerHTML = '';

    const visible = tasks.filter(t => isAncestorExpanded(t) && taskMatchesFilters(t));
    emptyHint.style.display = tasks.length === 0 ? 'block' : 'none';

    const nodeEls = new Map();

    visible.forEach(t => {
      const el = buildNodeEl(t);
      canvasEl.appendChild(el);
      nodeEls.set(t.id, el);
    });

    // edges
    const visibleIds = new Set(visible.map(t => t.id));
    visible.forEach(t => {
      let sourceId = t.parent_id;
      if (sourceId !== null && !visibleIds.has(sourceId)) {
        sourceId = nearestVisibleAncestorId(t);
      }
      if (sourceId === null || sourceId === undefined) return;
      const source = byId.get(sourceId);
      if (!source) return;
      drawEdge(source, t);
    });

    applyTransform();
  }

  function buildNodeEl(t) {
    const el = document.createElement('div');
    el.className = `node priority-${t.priority}`;
    if (t.status === 'Done') el.classList.add('done');
    if (isOverdue(t)) el.classList.add('overdue');
    if (taskIsDimmed(t)) el.style.opacity = '0.28';
    if (taskMatchesSearch(t)) el.style.boxShadow = '0 0 0 2px #5b8def';
    if (t.id === selectedId) el.classList.add('selected');
    el.style.left = t.position_x + 'px';
    el.style.top = t.position_y + 'px';
    el.dataset.id = t.id;

    const kids = getChildren(t.id);
    const doneKids = kids.filter(k => k.status === 'Done').length;

    el.innerHTML = `
      <div class="node-title">${escapeHtml(t.title)}</div>
      <div class="node-meta">
        <span class="node-status-dot status-${t.status}" title="Click to change status"></span>
        ${t.deadline ? `<span class="chip ${isOverdue(t) ? 'overdue-chip' : ''}">Due ${fmtDate(t.deadline)}</span>` : ''}
        ${t.assignee_name ? `<span class="avatar" title="${escapeHtml(t.assignee_name)}">${initials(t.assignee_name)}</span>` : ''}
        ${kids.length ? `<span class="chip">${doneKids}/${kids.length} done</span>` : ''}
      </div>
      ${kids.length ? `<div class="progress-bar-track"><div class="progress-bar-fill" style="width:${Math.round(100 * doneKids / kids.length)}%"></div></div>` : ''}
      <div class="node-controls">
        <button data-act="add">+ Sub-task</button>
        ${kids.length ? `<button data-act="toggle">${Number(t.is_expanded) ? 'Collapse' : 'Expand'}</button>` : ''}
        <button data-act="delete" class="danger">Delete</button>
      </div>
    `;

    // dragging (handled by one shared window listener set up once, see activeDrag below)
    el.addEventListener('mousedown', (e) => {
      if (e.target.closest('.node-controls') || e.target.closest('.node-status-dot')) return;
      const c = screenToCanvas(e.clientX, e.clientY);
      activeDrag = {
        task: t, el, moved: false,
        offset: { x: c.x - t.position_x, y: c.y - t.position_y }
      };
      e.stopPropagation();
    });

    el.addEventListener('click', (e) => {
      if (el.dataset.justDragged === '1') { delete el.dataset.justDragged; return; }
      const act = e.target.dataset.act;
      if (act === 'add') { addChild(t); return; }
      if (act === 'delete') { deleteTask(t); return; }
      if (act === 'toggle') { toggleExpand(t); return; }
      if (e.target.classList.contains('node-status-dot')) { cycleStatus(t); return; }
      openPanel(t);
    });

    return el;
  }

  // Single shared drag handler for all nodes, attached once (avoids leaking
  // a new window listener pair on every render, which would slow the map
  // down badly once there are hundreds of nodes).
  let activeDrag = null;
  window.addEventListener('mousemove', (e) => {
    if (!activeDrag) return;
    activeDrag.moved = true;
    const c = screenToCanvas(e.clientX, e.clientY);
    activeDrag.task.position_x = c.x - activeDrag.offset.x;
    activeDrag.task.position_y = c.y - activeDrag.offset.y;
    activeDrag.el.style.left = activeDrag.task.position_x + 'px';
    activeDrag.el.style.top = activeDrag.task.position_y + 'px';
    redrawEdgesOnly();
  });
  window.addEventListener('mouseup', () => {
    if (!activeDrag) return;
    if (activeDrag.moved) {
      activeDrag.el.dataset.justDragged = '1';
      API.update({ id: activeDrag.task.id, position_x: activeDrag.task.position_x, position_y: activeDrag.task.position_y });
    }
    activeDrag = null;
  });

  function drawEdge(from, to) {
    const x1 = from.position_x + 220, y1 = from.position_y + 34;
    const x2 = to.position_x, y2 = to.position_y + 34;
    const midX = (x1 + x2) / 2;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`);
    path.setAttribute('stroke', '#3a4150');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('fill', 'none');
    edgesSvg.appendChild(path);
  }

  function redrawEdgesOnly() {
    if (currentView !== 'map') return;
    edgesSvg.innerHTML = '';
    const visible = tasks.filter(t => isAncestorExpanded(t) && taskMatchesFilters(t));
    const visibleIds = new Set(visible.map(t => t.id));
    visible.forEach(t => {
      let sourceId = t.parent_id;
      if (sourceId !== null && !visibleIds.has(sourceId)) sourceId = nearestVisibleAncestorId(t);
      if (sourceId === null || sourceId === undefined) return;
      const source = byId.get(sourceId);
      if (source) drawEdge(source, t);
    });
  }

  /* ======================= List views (Timeline / By Person) ======================= */

  function renderList() {
    let visibleTasks = tasks.filter(taskMatchesFilters);
    if (filters.priority) visibleTasks = visibleTasks.filter(t => priorityRank[t.priority] >= priorityRank[filters.priority]);
    if (filters.person) visibleTasks = visibleTasks.filter(t => t.assignee_name === filters.person);
    if (filters.search) visibleTasks = visibleTasks.filter(t => t.title.toLowerCase().includes(filters.search.toLowerCase()));

    if (currentView === 'timeline') {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const weekAhead = new Date(today); weekAhead.setDate(weekAhead.getDate() + 7);
      const withDates = visibleTasks.filter(t => t.deadline).sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
      const noDates = visibleTasks.filter(t => !t.deadline);
      const groups = { Overdue: [], 'This week': [], Later: [], 'No deadline': noDates };
      withDates.forEach(t => {
        const d = new Date(t.deadline);
        if (d < today && t.status !== 'Done') groups.Overdue.push(t);
        else if (d <= weekAhead) groups['This week'].push(t);
        else groups.Later.push(t);
      });
      listView.innerHTML = Object.entries(groups).map(([label, items]) => renderListGroup(label, items)).join('');
    } else {
      const byPerson = new Map();
      visibleTasks.forEach(t => {
        const key = t.assignee_name || 'Unassigned';
        if (!byPerson.has(key)) byPerson.set(key, []);
        byPerson.get(key).push(t);
      });
      const sortedKeys = Array.from(byPerson.keys()).sort();
      listView.innerHTML = sortedKeys.map(name => {
        const items = byPerson.get(name);
        const done = items.filter(t => t.status === 'Done').length;
        return renderListGroup(`${name} (${done}/${items.length} done)`, items);
      }).join('');
    }
    attachListRowHandlers();
  }

  function renderListGroup(label, items) {
    if (!items.length) return '';
    return `<div class="list-group"><h4>${escapeHtml(label)}</h4>${items.map(rowHtml).join('')}</div>`;
  }

  function rowHtml(t) {
    return `
      <div class="list-row priority-${t.priority} ${t.status === 'Done' ? 'done' : ''}" data-id="${t.id}">
        <span class="node-status-dot status-${t.status}" data-act="status"></span>
        <span class="list-title">${escapeHtml(t.title)}</span>
        ${t.assignee_name ? `<span class="avatar">${initials(t.assignee_name)}</span>` : ''}
        ${t.deadline ? `<span class="chip ${isOverdue(t) ? 'overdue-chip' : ''}">Due ${fmtDate(t.deadline)}</span>` : ''}
      </div>`;
  }

  function attachListRowHandlers() {
    listView.querySelectorAll('.list-row').forEach(row => {
      const id = Number(row.dataset.id);
      row.addEventListener('click', (e) => {
        const t = byId.get(id);
        if (e.target.dataset.act === 'status') { cycleStatus(t); return; }
        openPanel(t);
      });
    });
  }

  /* ======================= Task operations ======================= */

  async function addRootTask(x, y) {
    const t = await API.create({ title: 'New Task', position_x: x, position_y: y, parent_id: null });
    tasks.push(normalizeTask(t));
    rebuildIndexes();
    render();
    openPanel(byId.get(Number(t.id)));
  }

  async function addChild(parent) {
    parent.is_expanded = 1;
    await API.update({ id: parent.id, is_expanded: 1 });
    const siblingCount = getChildren(parent.id).length;
    const t = await API.create({
      title: 'New Sub-task',
      parent_id: parent.id,
      position_x: parent.position_x + 300,
      position_y: parent.position_y + siblingCount * 110
    });
    tasks.push(normalizeTask(t));
    rebuildIndexes();
    render();
  }

  function normalizeTask(t) {
    return {
      ...t,
      id: Number(t.id),
      parent_id: t.parent_id === null || t.parent_id === undefined || t.parent_id === '' ? null : Number(t.parent_id),
      position_x: Number(t.position_x) || 0,
      position_y: Number(t.position_y) || 0,
      is_expanded: Number(t.is_expanded)
    };
  }

  async function deleteTask(t) {
    const kidCount = countDescendants(t.id);
    const msg = kidCount > 0
      ? `Delete "${t.title}" and its ${kidCount} sub-task${kidCount > 1 ? 's' : ''}?`
      : `Delete "${t.title}"?`;
    if (!confirm(msg)) return;
    await API.remove(t.id);
    const toRemove = new Set([t.id]);
    let grew = true;
    while (grew) {
      grew = false;
      tasks.forEach(x => {
        if (x.parent_id !== null && toRemove.has(x.parent_id) && !toRemove.has(x.id)) { toRemove.add(x.id); grew = true; }
      });
    }
    tasks = tasks.filter(x => !toRemove.has(x.id));
    rebuildIndexes();
    refreshFilterOptions();
    render();
    closePanel();
  }

  function countDescendants(id) {
    let count = 0;
    const walk = (pid) => {
      getChildren(pid).forEach(c => { count++; walk(c.id); });
    };
    walk(id);
    return count;
  }

  async function toggleExpand(t) {
    t.is_expanded = Number(t.is_expanded) ? 0 : 1;
    await API.update({ id: t.id, is_expanded: t.is_expanded });
    render();
  }

  async function cycleStatus(t) {
    const order = ['Not Started', 'In Progress', 'Done'];
    t.status = order[(order.indexOf(t.status) + 1) % order.length];
    await API.update({ id: t.id, status: t.status });
    render();
  }

  /* ======================= Side panel ======================= */

  function openPanel(t) {
    selectedId = t.id;
    $('#panel-heading').textContent = 'Edit Task';
    $('#f-title').value = t.title || '';
    $('#f-description').value = t.description || '';
    $('#f-priority').value = t.priority || 'Medium';
    $('#f-status').value = t.status || 'Not Started';
    $('#f-start').value = t.start_date ? t.start_date.substring(0, 10) : '';
    $('#f-deadline').value = t.deadline ? t.deadline.substring(0, 10) : '';
    $('#f-assignee').value = t.assignee_name || '';
    sidePanel.classList.add('open');
    sidePanelOverlay.classList.add('open');
    render();

    const save = debounce(async () => {
      const updated = {
        id: t.id,
        title: $('#f-title').value.trim() || 'Untitled Task',
        description: $('#f-description').value,
        priority: $('#f-priority').value,
        status: $('#f-status').value,
        start_date: $('#f-start').value || null,
        deadline: $('#f-deadline').value || null,
        assignee_name: $('#f-assignee').value.trim()
      };
      Object.assign(t, updated);
      await API.update(updated);
      refreshFilterOptions();
      render();
    }, 300);

    ['f-title', 'f-description', 'f-priority', 'f-status', 'f-start', 'f-deadline', 'f-assignee'].forEach(id => {
      const el = document.getElementById(id);
      el.oninput = save;
      el.onchange = save;
    });

    $('#panel-delete').onclick = () => deleteTask(t);
  }

  function closePanel() {
    selectedId = null;
    sidePanel.classList.remove('open');
    sidePanelOverlay.classList.remove('open');
    render();
  }

  function debounce(fn, ms) {
    let h;
    return (...args) => { clearTimeout(h); h = setTimeout(() => fn(...args), ms); };
  }

  /* ======================= Canvas pan / zoom ======================= */

  let panning = false, panStart = { x: 0, y: 0 }, panOrigin = { x: 0, y: 0 };

  canvasWrap.addEventListener('mousedown', (e) => {
    if (e.target !== canvasWrap && e.target !== edgesSvg) return;
    panning = true;
    canvasWrap.classList.add('grabbing');
    panStart = { x: e.clientX, y: e.clientY };
    panOrigin = { x: view.pan.x, y: view.pan.y };
  });
  window.addEventListener('mousemove', (e) => {
    if (!panning) return;
    view.pan.x = panOrigin.x + (e.clientX - panStart.x);
    view.pan.y = panOrigin.y + (e.clientY - panStart.y);
    applyTransform();
  });
  window.addEventListener('mouseup', () => { panning = false; canvasWrap.classList.remove('grabbing'); });

  canvasWrap.addEventListener('dblclick', (e) => {
    if (e.target !== canvasWrap && e.target !== edgesSvg) return;
    const c = screenToCanvas(e.clientX, e.clientY);
    addRootTask(c.x, c.y);
  });

  canvasWrap.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.min(2, Math.max(0.25, view.scale * factor));
    const rect = canvasWrap.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    view.pan.x = sx - (sx - view.pan.x) * (newScale / view.scale);
    view.pan.y = sy - (sy - view.pan.y) * (newScale / view.scale);
    view.scale = newScale;
    applyTransform();
  }, { passive: false });

  $('#zoom-in').onclick = () => { view.scale = Math.min(2, view.scale * 1.2); applyTransform(); };
  $('#zoom-out').onclick = () => { view.scale = Math.max(0.25, view.scale / 1.2); applyTransform(); };
  $('#zoom-reset').onclick = () => { view.scale = 1; view.pan = { x: 80, y: 80 }; applyTransform(); };

  /* ======================= Top bar ======================= */

  $('#add-root-btn').onclick = () => addRootTask(-view.pan.x / view.scale + 100, -view.pan.y / view.scale + 100);

  searchInput.oninput = (e) => {
    filters.search = e.target.value.trim();
    render();
    if (filters.search) {
      const match = tasks.find(t => t.title.toLowerCase().includes(filters.search.toLowerCase()));
      if (match) centerOnTask(match);
    }
  };

  function centerOnTask(t) {
    let p = t.parent_id;
    while (p !== null && p !== undefined) {
      const parent = byId.get(p);
      if (parent && !Number(parent.is_expanded)) parent.is_expanded = 1;
      p = parent ? parent.parent_id : null;
    }
    const rect = canvasWrap.getBoundingClientRect();
    view.pan.x = rect.width / 2 - (t.position_x + 110) * view.scale;
    view.pan.y = rect.height / 2 - (t.position_y + 34) * view.scale;
    render();
  }

  priorityFilter.onchange = (e) => { filters.priority = e.target.value; render(); };
  personFilter.onchange = (e) => { filters.person = e.target.value; render(); };
  hideDoneChk.onchange = (e) => { filters.hideDone = e.target.checked; render(); };

  $('#panel-cancel').onclick = closePanel;
  sidePanelOverlay.onclick = closePanel;

  document.querySelectorAll('.view-tabs button').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.view-tabs button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentView = btn.dataset.view;
      if (currentView === 'map') {
        canvasWrap.classList.remove('hidden');
        listView.classList.remove('active');
      } else {
        canvasWrap.classList.add('hidden');
        listView.classList.add('active');
      }
      render();
    };
  });

  /* ======================= Init ======================= */

  (async function init() {
    await API.init();
    await loadTasks();
    applyTransform();
  })();

})();

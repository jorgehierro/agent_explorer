let agents = {};
let selected = null;
let histories = {};
let isLoading = false;
let extraFieldsOpen = false;
let currentUser = null;

// --- TOAST MANAGER ---
function showToast(msg, type = 'success') {
  const container = document.getElementById('toast-container');
  if(!container) return;
  const t = document.createElement('div');
  t.className = `toast-msg ${type}`;
  const icon = type === 'success' ? 'ti-check' : 'ti-alert-triangle';
  t.innerHTML = `<i class="ti ${icon}"></i> <div>${escapeHtml(msg)}</div>`;
  container.appendChild(t);
  setTimeout(() => {
    t.classList.add('hiding');
    setTimeout(() => t.remove(), 300);
  }, 4000);
}

// --- AUTH & PERMISSIONS ---
async function checkAuth() {
  try {
    const r = await fetch('/api/auth/me');
    if (r.ok) {
      const data = await r.json();
      currentUser = data.user;
      document.getElementById('login-overlay').style.display = 'none';
      applyPermissions();
      return true;
    }
  } catch(e) { console.error(e); }
  document.getElementById('login-overlay').style.display = 'flex';
  return false;
}

async function doLogin() {
  const user = document.getElementById('login-username').value.trim();
  const pass = document.getElementById('login-password').value.trim();
  const err = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');
  if(!user || !pass) { err.textContent = 'Rellena ambos campos'; return; }
  
  btn.disabled = true;
  err.textContent = '';
  try {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({username: user, password: pass})
    });
    const data = await r.json();
    if(r.ok) {
      currentUser = data.user;
      document.getElementById('login-overlay').style.display = 'none';
      document.getElementById('login-password').value = '';
      applyPermissions();
      showToast(`Bienvenido ${currentUser.display_name}`);
    } else {
      err.textContent = data.error || 'Error al iniciar sesión';
    }
  } catch(e) {
    err.textContent = 'Error de conexión';
  }
  btn.disabled = false;
}

async function doLogout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch(e){}
  currentUser = null;
  toggleUserMenu(false);
  document.getElementById('login-overlay').style.display = 'flex';
  switchMainTab('explorer');
}

function applyPermissions() {
  if(!currentUser) return;
  document.getElementById('user-avatar').textContent = currentUser.display_name.charAt(0).toUpperCase();
  document.getElementById('ud-name').textContent = currentUser.display_name;
  document.getElementById('ud-role').textContent = currentUser.role;
  
  const perms = currentUser.permissions || { tabs: [], agents: '*' };
  
  const adminTab = document.getElementById('tab-admin');
  if(currentUser.role === 'admin') {
    adminTab.style.display = 'inline-flex';
  } else {
    adminTab.style.display = 'none';
    if(document.getElementById('admin-view').classList.contains('active')) {
      switchMainTab('explorer');
    }
  }

  const creatorTab = document.getElementById('tab-creator');
  if(currentUser.role === 'admin' || perms.tabs.includes('creator')) {
    creatorTab.style.display = 'inline-flex';
  } else {
    creatorTab.style.display = 'none';
    if(document.getElementById('agent-creator-view').classList.contains('active')) {
      switchMainTab('explorer');
    }
  }
  
  // Re-render sidebar to apply agent filters
  if(Object.keys(agents).length > 0) renderSidebar();
}

function toggleUserMenu(force) {
  const menu = document.getElementById('user-dropdown');
  if(force !== undefined) {
    menu.classList.toggle('open', force);
  } else {
    menu.classList.toggle('open');
  }
}

document.addEventListener('click', e => {
  const wrap = document.querySelector('.user-menu-wrap');
  if(wrap && !wrap.contains(e.target)) toggleUserMenu(false);
});

function openPasswordModal() {
  toggleUserMenu(false);
  document.getElementById('pm-old').value = '';
  document.getElementById('pm-new').value = '';
  document.getElementById('pm-error').textContent = '';
  document.getElementById('password-modal').classList.add('open');
}
function closePasswordModal() {
  document.getElementById('password-modal').classList.remove('open');
}
async function changePassword() {
  const old = document.getElementById('pm-old').value;
  const newp = document.getElementById('pm-new').value;
  const err = document.getElementById('pm-error');
  if(!old || !newp) { err.textContent = 'Rellena ambos campos'; return; }
  
  try {
    const r = await fetch('/api/auth/password', {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({old_password: old, new_password: newp})
    });
    const data = await r.json();
    if(r.ok) {
      showToast('Contraseña cambiada con éxito');
      closePasswordModal();
    } else {
      err.textContent = data.error || 'Error al cambiar contraseña';
    }
  } catch(e) { err.textContent = 'Error de conexión'; }
}

// --- APP CORE ---
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function toggleExtraFields() {
  extraFieldsOpen = !extraFieldsOpen;
  document.getElementById('extra-fields-body').style.display = extraFieldsOpen ? 'flex' : 'none';
  document.getElementById('extra-toggle-icon').className = extraFieldsOpen ? 'ti ti-chevron-down' : 'ti ti-chevron-right';
}

function renderExtraFields(schema) {
  const panel = document.getElementById('extra-fields');
  const body = document.getElementById('extra-fields-body');
  const label = document.getElementById('extra-toggle-label');

  if (!schema || !schema.properties) { panel.classList.remove('visible'); return; }
  const props = schema.properties;
  const required = schema.required || [];
  const extraKeys = Object.keys(props).filter(k => k !== 'messages' && k !== 'message');

  if (!extraKeys.length) { panel.classList.remove('visible'); return; }

  label.textContent = `Campos adicionales (${extraKeys.length})`;
  panel.classList.add('visible');

  body.innerHTML = extraKeys.map(key => {
    const prop = props[key];
    const isRequired = required.includes(key);
    const defaultVal = prop.default !== undefined ? prop.default : '';
    const typeLabel = prop.type || 'any';
    const isLong = typeLabel === 'object' || typeLabel === 'array' || (typeof defaultVal === 'string' && defaultVal.length > 40);

    const inputEl = isLong
      ? `<textarea id="field-${key}" rows="2" placeholder="${defaultVal !== '' ? escapeHtml(JSON.stringify(defaultVal)) : 'vacío'}">${defaultVal !== '' ? escapeHtml(JSON.stringify(defaultVal)) : ''}</textarea>`
      : `<input id="field-${key}" type="text" value="${defaultVal !== '' ? escapeHtml(defaultVal) : ''}" placeholder="${defaultVal !== '' ? escapeHtml(defaultVal) : 'vacío'}" />`;

    return `<div class="extra-field-row">
      <label>${key}${isRequired ? ' *' : ''}</label>
      ${inputEl}
      <span class="field-type">${typeLabel}</span>
    </div>`;
  }).join('');
}

function getExtraFieldsValues(schema) {
  if (!schema || !schema.properties) return {};
  const props = schema.properties;
  const extraKeys = Object.keys(props).filter(k => k !== 'messages' && k !== 'message');
  const result = {};
  extraKeys.forEach(key => {
    const el = document.getElementById(`field-${key}`);
    if (!el) return;
    const val = el.value.trim();
    const prop = props[key];
    const type = prop.type;
    if (val === '') { result[key] = prop.default !== undefined ? prop.default : null; } 
    else if (type === 'integer' || type === 'number') { result[key] = Number(val); } 
    else if (type === 'boolean') { result[key] = val === 'true'; } 
    else if (type === 'array' || type === 'object') { try { result[key] = JSON.parse(val); } catch { result[key] = val; } } 
    else { result[key] = val; }
  });
  return result;
}

// --- DISCOVER (PROXIED) ---
async function discoverAgents() {
  const base = document.getElementById('base-url').value.trim().replace(/\/$/, '');
  const from = parseInt(document.getElementById('port-from').value.trim());
  const to   = parseInt(document.getElementById('port-to').value.trim());

  if (isNaN(from) || isNaN(to) || from > to) { alert('Rango de puertos inválido'); return; }

  const btn = document.getElementById('discover-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader-2" style="animation:spin 1s linear infinite"></i> Escaneando...';

  if (!document.querySelector('style[data-spin]')) {
    const style = document.createElement('style');
    style.setAttribute('data-spin', '1');
    style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
    document.head.appendChild(style);
  }

  agents = {};
  try {
    const r = await fetch('/api/proxy/discover', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({base_url: base, port_from: from, port_to: to})
    });
    if(r.ok) {
      const data = await r.json();
      data.agents.forEach(a => { agents[a.name] = a; });
      
      const runnerKey = Object.keys(agents).find(k => agents[k].card?.name === 'workflow_runner' || k === 'workflow_runner');
      if (runnerKey) {
        const runner = agents[runnerKey];
        try {
          const wr = await fetch('/api/proxy/fetch', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ url: runner.url + '/workflows', method: 'GET' }) });
          if (wr.ok) {
            const wdata = await wr.json();
            const wkeys = Array.isArray(wdata) ? wdata : Object.keys(wdata || {});
            wkeys.forEach(k => {
              const meta = Array.isArray(wdata) ? {} : (wdata[k] || {});
              agents[`wf_${k}`] = {
                name: k,
                url: runner.url,
                port: runner.port,
                ok: true,
                isWorkflowInstance: true,
                workflowName: k,
                card: { name: 'workflow_instance', description: meta.description || meta.module || `Workflow: ${k}`, properties: {} }
              };
            });
          }
        } catch(e) { console.error("Workflow fetch error", e); }
        delete agents[runnerKey];
      }
    }
  } catch(e) { console.error("Discovery error", e); }

  btn.disabled = false;
  btn.innerHTML = '<i class="ti ti-radar"></i> Descubrir';
  renderSidebar();

  const found = Object.keys(agents).length;
  showToast(`Escaneados puertos: ${found} asistente(s) encontrado(s)`, found > 0 ? 'success' : 'error');
  if (selected) addSystemMsg(`Escaneados puertos — ${found} asistente${found !== 1 ? 's' : ''} encontrado${found !== 1 ? 's' : ''}`);
}

let currentSidebarTab = 'agents';

function switchSidebarTab(tab) {
  currentSidebarTab = tab;
  document.getElementById('st-agents').classList.toggle('active', tab === 'agents');
  document.getElementById('st-automations').classList.toggle('active', tab === 'automations');
  document.getElementById('agents-list').style.display = (tab === 'agents') ? 'block' : 'none';
  document.getElementById('automations-list').style.display = (tab === 'automations') ? 'block' : 'none';
}

function getAgentKind(name) {
  const a = agents[name];
  if (a?.isWorkflowInstance) return 'workflow';
  const cardName = a?.card?.name || name || '';
  if (cardName === 'workflow_runner') return 'workflow';
  return 'generic';
}

function renderSidebar() {
  const agentsListEl = document.getElementById('agents-list');
  const automationsListEl = document.getElementById('automations-list');
  let names = Object.keys(agents);
  
  const perms = currentUser?.permissions || { tabs: [], agents: '*' };
  if (currentUser?.role !== 'admin' && perms.agents !== '*') {
    const allowed = perms.agents.split(',').map(s => s.trim());
    names = names.filter(n => allowed.includes(n));
  }
  
  // Sort agents by port ascending (9001, 9002, etc)
  names.sort((a, b) => {
    const portA = parseInt(agents[a]?.port || 0);
    const portB = parseInt(agents[b]?.port || 0);
    return portA - portB;
  });
  
  const genericAgents = names.filter(n => getAgentKind(n) === 'generic');
  const automationAgents = names.filter(n => getAgentKind(n) !== 'generic');

  document.getElementById('agent-count').textContent = genericAgents.length ? `(${genericAgents.length})` : '';
  document.getElementById('auto-count').textContent = automationAgents.length ? `(${automationAgents.length})` : '';

  if (!genericAgents.length) {
    agentsListEl.innerHTML = `<div class="empty-state">
      <i class="ti ti-router"></i>
      <p>Introduce la URL base y los puertos, luego pulsa <strong>Descubrir</strong>.</p>
    </div>`;
  } else {
    agentsListEl.innerHTML = genericAgents.map(name => {
      const a = agents[name];
      const active = selected === name ? 'active' : '';
      const status = a.ok ? 'ok' : 'err';
      return `<div class="agent-item ${active} ${status}" onclick="selectAgent('${name}')">
        <span class="dot"></span>
        <span class="name">${name}</span>
        <span class="port-tag">:${a.port}</span>
      </div>`;
    }).join('');
  }

  if (!automationAgents.length) {
    automationsListEl.innerHTML = `<div class="empty-state">
      <i class="ti ti-list-check"></i>
      <p>No hay automatizaciones disponibles.</p>
    </div>`;
  } else {
    automationsListEl.innerHTML = automationAgents.map(name => {
      const a = agents[name];
      const active = selected === name ? 'active' : '';
      const status = a.ok ? 'ok' : 'err';
      return `<div class="agent-item ${active} ${status}" onclick="selectAgent('${name}')">
        <span class="dot"></span>
        <span class="name">${name}</span>
        <span class="port-tag">:${a.port}</span>
      </div>`;
    }).join('');
  }
}

function selectedAgentKind() {
  return getAgentKind(selected);
}


function selectAgent(name) {
  selected = name;
  if (!histories[name]) histories[name] = [];
  renderSidebar();

  const a = agents[name];
  const bar = document.getElementById('agent-bar');
  bar.classList.add('visible');
  document.getElementById('ab-name').textContent = name;
  document.getElementById('ab-desc').textContent = a.card?.description || a.url;

  const caps = (a.card?.capabilities || []);
  document.getElementById('ab-caps').innerHTML = caps.map(c => `<span class="cap-badge">${c}</span>`).join(' ');

  const statusEl = document.getElementById('ab-status');
  if (a.ok) {
    statusEl.className = 'status-badge ok';
    statusEl.innerHTML = '<i class="ti ti-circle-check" style="font-size:13px"></i> activo';
  } else {
    statusEl.className = 'status-badge err';
    statusEl.innerHTML = '<i class="ti ti-circle-x" style="font-size:13px"></i> inactivo';
  }

  renderExtraFields(a.card?.input_schema || null);

  const input = document.getElementById('msg-input');
  input.disabled = false;
  document.getElementById('send-btn').disabled = false;
  input.focus();
  renderMessages();
}

function renderMessages() {
  const box = document.getElementById('messages');
  const hist = histories[selected] || [];

  if (!hist.length) {
    const a = agents[selected];
    box.innerHTML = `<div class="empty-state" style="flex:1; margin-top: 10vh;">
      <i class="ti ti-message-dots" style="font-size: 64px; color: var(--blue-text);"></i>
      <h2 style="color:var(--text); font-weight:500; font-size:18px; margin-bottom:8px;">${selected}</h2>
      <p style="font-size:13px">${a?.url || ''}</p>
    </div>`;
    return;
  }

  box.innerHTML = hist.map(m => {
    if (m.role === 'typing') {
      return `<div class="msg-row agent"><div class="bubble agent"><div class="typing"><span></span><span></span><span></span></div></div></div>`;
    }
    if (m.role === 'system') {
      return `<div class="msg-row system"><div class="bubble system">${m.content}</div></div>`;
    }
    if (m.role === 'orchestrator') {
      const reasoning = m.reasoning ? `<div class="orch-reasoning">💭 ${escapeHtml(m.reasoning)}</div>` : '';
      const results = (m.results || []).map(r => `
        <div class="orch-agent-result">
          <div class="orch-agent-header">
            <span class="${r.ok ? 'ok' : 'err'}">${r.ok ? '✓' : '✗'}</span>
            <span>${escapeHtml(r.agent)}</span>
          </div>
          <div class="orch-agent-content">${marked.parse(String(r.result || ''))}</div>
        </div>`).join('');
      return `<div class="msg-row agent"><div class="msg-label">${selected}</div><div class="orch-bubble">${reasoning}${results}</div></div>`;
    }
    if (m.role === 'playbook') {
      const steps = (m.trace || []).map(t => {
        let out = t.result?.output;
        if (typeof out === 'object') out = JSON.stringify(out, null, 2);
        else out = String(out || '');
        const subAgents = Object.entries(t.result || {}).filter(([k]) => k !== 'output' && k !== 'ok').map(([agentName, agentResult]) => {
            let subOut = agentResult?.output;
            if (typeof subOut === 'object') subOut = JSON.stringify(subOut, null, 2);
            return `<div style="margin-top:6px;padding-top:6px;border-top:0.5px solid var(--border)"><span style="font-size:11px;font-weight:500;color:var(--text3)">${agentName}</span><div style="font-size:12px;margin-top:2px">${marked.parse(String(subOut || ''))}</div></div>`;
          }).join('');
        return `<div class="trace-step"><div class="trace-step-header"><span class="${t.ok ? 'ok' : 'err'}">${t.ok ? '✓' : '✗'}</span><span>${t.id}</span></div><div class="trace-step-content">${subAgents || marked.parse(out)}</div></div>`;
      }).join('');
      return `<div class="msg-row agent"><div class="msg-label">▶ ${m.playbook || 'playbook'}</div><div class="trace-bubble">${steps}</div></div>`;
    }
    const label = m.role === 'user' ? 'Tú' : selected;
    const content = m.role === 'agent' ? marked.parse(m.content || '') : escapeHtml(m.content);
    return `<div class="msg-row ${m.role}"><div class="msg-label">${label}</div><div class="bubble ${m.role}">${content}</div></div>`;
  }).join('');

  box.scrollTop = box.scrollHeight;
}

function escapeHtml(str) { return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escapeJsString(str) { return String(str ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r/g, '\\r').replace(/\n/g, '\\n'); }
function addSystemMsg(text) { if (selected) { histories[selected].push({ role: 'system', content: text }); renderMessages(); } }

// --- SEND (PROXIED) ---
async function sendMessage() {
  if (!selected || isLoading) return;
  const input = document.getElementById('msg-input');
  const msg = input.value.trim();
  if (!msg) return;



  isLoading = true;
  input.value = '';
  input.style.height = 'auto';
  input.disabled = true;
  document.getElementById('send-btn').disabled = true;

  histories[selected].push({ role: 'user', content: msg });
  histories[selected].push({ role: 'typing' });
  renderMessages();

  const a = agents[selected];
  const schema = a.card?.input_schema || null;
  const extraFields = getExtraFieldsValues(schema);
  const body = { url: a.url, messages: msg, ...extraFields };
  if (a.isWorkflowInstance) {
    body.workflow_name = a.workflowName;
  }

  try {
    const r = await fetch('/api/proxy/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    histories[selected] = histories[selected].filter(m => m.role !== 'typing');
    if (!r.ok) {
      const err = await r.json();
      histories[selected].push({ role: 'error', content: err.error || `HTTP ${r.status}` });
    } else {
      const data = await r.json();
      if (data.agent === 'orchestrator' && data.results) { histories[selected].push({ role: 'orchestrator', reasoning: data.reasoning || '', results: data.results }); } 
      else { histories[selected].push({ role: 'agent', content: data.result }); }
    }
  } catch (e) {
    histories[selected] = histories[selected].filter(m => m.role !== 'typing');
    histories[selected].push({ role: 'error', content: `Error de conexión: ${e.message}` });
  }

  isLoading = false;
  input.disabled = false;
  document.getElementById('send-btn').disabled = false;
  input.focus();
  renderMessages();
}

function clearChat() { if (selected) { histories[selected] = []; renderMessages(); } }

// --- MODALS BASICOS ---
function openModal() { document.getElementById('modal').classList.add('open'); setTimeout(() => document.getElementById('m-name').focus(), 50); }
function closeModal() { document.getElementById('modal').classList.remove('open'); document.getElementById('m-name').value = ''; document.getElementById('m-url').value = ''; }
async function addManual() {
  const name = document.getElementById('m-name').value.trim();
  const url = document.getElementById('m-url').value.trim().replace(/\/$/, '');
  if (!name || !url) return;
  const port = url.split(':').pop();
  let ok = false, card = null;
  try {
    const r = await fetch('/api/proxy/agent-card', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({url}) });
    ok = r.ok;
    if (ok) card = await r.json();
  } catch {}
  agents[name] = { url, port, ok, card };
  showToast(`Asistente ${name} añadido`);
  closeModal();
  renderSidebar();
  selectAgent(name);
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { 
    closeModal(); 
    closePasswordModal();
    if(typeof closeUserModal === 'function') closeUserModal();
    pbInputCancel();
    pbCloseDeleteModal();
    if(document.getElementById('playbook-modal')) document.getElementById('playbook-modal').classList.remove('open'); 
  }
});

// --- ADMIN PANEL ---
function switchMainTab(tab) {
  document.getElementById('explorer-view').style.display = tab === 'explorer' ? 'flex' : 'none';
  document.getElementById('agent-creator-view').classList.toggle('active', tab === 'creator');
  document.getElementById('admin-view').classList.toggle('active', tab === 'admin');
  document.getElementById('tab-explorer').classList.toggle('active', tab === 'explorer');
  document.getElementById('tab-creator').classList.toggle('active', tab === 'creator');
  document.getElementById('tab-admin').classList.toggle('active', tab === 'admin');
  if(tab === 'admin') switchAdminTab('users');
  if(tab === 'creator') {
    const ports = Object.values(agents).map(a => parseInt(a.port)).filter(p => !isNaN(p));
    const nextPort = ports.length > 0 ? Math.max(...ports) + 1 : 9001;
    document.getElementById('ac-port').value = nextPort;
    acSyncEnvHint();
  }
}

function switchAdminTab(tab) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  event.currentTarget.classList.add('active');
  document.getElementById('admin-' + tab).classList.add('active');
  if(tab === 'users') loadUsers();
  if(tab === 'audit') loadAuditLogs();
}

async function loadUsers() {
  const tbody = document.getElementById('users-tbody');
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text3)">Cargando...</td></tr>';
  try {
    const r = await fetch('/api/auth/users');
    const data = await r.json();
    if(r.ok) {
      tbody.innerHTML = data.users.map(u => `
        <tr>
          <td><strong>${escapeHtml(u.username)}</strong></td>
          <td>${escapeHtml(u.display_name)}</td>
          <td><span class="role-badge ${u.role === 'admin' ? 'admin' : ''}">${escapeHtml(u.role)}</span></td>
          <td>${u.is_active ? '<span style="color:var(--green)">Activo</span>' : '<span style="color:var(--red)">Inactivo</span>'}</td>
          <td>${new Date(u.created_at).toLocaleDateString()}</td>
          <td>
            <i class="ti ti-edit action-icon" onclick="editUser(${u.id})" title="Editar"></i>
            ${u.id !== currentUser.id ? `<i class="ti ti-trash action-icon danger" onclick="deleteUser(${u.id}, '${escapeJsString(u.username)}')" title="Desactivar"></i>` : ''}
          </td>
        </tr>
      `).join('');
    }
  } catch(e) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--red)">Error al cargar usuarios</td></tr>'; }
}

let editingUserId = null;
function openUserModal() {
  editingUserId = null;
  document.getElementById('user-modal-title').innerHTML = '<i class="ti ti-user-plus"></i> Nuevo Usuario';
  document.getElementById('um-id').value = '';
  document.getElementById('um-username').value = '';
  document.getElementById('um-username').disabled = false;
  document.getElementById('um-display').value = '';
  document.getElementById('um-password').value = '';
  document.getElementById('um-role').value = 'user';
  document.getElementById('um-perm-creator').checked = false;
  document.getElementById('um-perm-workflows').checked = false;
  populateAgentCheckboxes('*');
  document.getElementById('um-active').checked = true;
  document.getElementById('user-modal').classList.add('open');
}

function editUser(id) {
  fetch('/api/auth/users').then(r=>r.json()).then(data => {
    const u = data.users.find(x => x.id === id);
    if(u) {
      editingUserId = id;
      document.getElementById('user-modal-title').innerHTML = '<i class="ti ti-edit"></i> Editar Usuario';
      document.getElementById('um-id').value = id;
      document.getElementById('um-username').value = u.username;
      document.getElementById('um-username').disabled = true;
      document.getElementById('um-display').value = u.display_name;
      document.getElementById('um-password').value = '';
      document.getElementById('um-role').value = u.role;
      
      const p = u.permissions || { tabs: [], agents: '*' };
      document.getElementById('um-perm-creator').checked = p.tabs.includes('creator');
      document.getElementById('um-perm-workflows').checked = p.tabs.includes('workflows');
      populateAgentCheckboxes(p.agents || '*');
      
      document.getElementById('um-active').checked = u.is_active;
      document.getElementById('user-modal').classList.add('open');
    }
  });
}

function closeUserModal() { document.getElementById('user-modal').classList.remove('open'); }

async function saveUser() {
  const username = document.getElementById('um-username').value.trim();
  const display = document.getElementById('um-display').value.trim();
  const password = document.getElementById('um-password').value;
  const role = document.getElementById('um-role').value;
  
  const tabs = [];
  if (document.getElementById('um-perm-creator').checked) tabs.push('creator');
  if (document.getElementById('um-perm-workflows').checked) tabs.push('workflows');
  
  let agentsPerm = '*';
  const elAll = document.getElementById('um-perm-agent-all');
  if (!elAll || !elAll.checked) {
    const checked = Array.from(document.querySelectorAll('.um-perm-agent-cb:checked')).map(cb => cb.value);
    agentsPerm = checked.join(',');
  }
  const permissions = JSON.stringify({ tabs, agents: agentsPerm });
  
  const active = document.getElementById('um-active').checked;
  
  if(!username || (!editingUserId && !password)) { alert("Usuario y contraseña son obligatorios"); return; }
  const payload = { display_name: display, role: role, is_active: active, permissions: permissions };
  if(password) payload.password = password;
  
  let url = '/api/auth/users', method = 'POST';
  if(editingUserId) { url = `/api/auth/users/${editingUserId}`; method = 'PUT'; } 
  else { payload.username = username; }
  
  try {
    const r = await fetch(url, { method: method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
    if(r.ok) { showToast('Usuario guardado'); closeUserModal(); loadUsers(); } 
    else { const err = await r.json(); alert("Error: " + (err.error || "Desconocido")); }
  } catch(e) { alert("Error de conexión"); }
}

async function deleteUser(id, username) {
  if(!confirm(`¿Estás seguro de desactivar al usuario ${username}?`)) return;
  try {
    const r = await fetch(`/api/auth/users/${id}`, { method: 'DELETE' });
    if(r.ok) { showToast('Usuario desactivado'); loadUsers(); } else alert("Error al desactivar");
  } catch(e) { alert("Error de conexión"); }
}

function populateAgentCheckboxes(agentsStr) {
  const container = document.getElementById('um-perm-agents-list');
  const allAgents = Object.keys(agents);
  let html = `<label class="perm-agent-pill">
    <input type="checkbox" id="um-perm-agent-all" value="*" onchange="toggleAllAgents(this)" ${agentsStr === '*' ? 'checked' : ''} />
    <i class="ti ti-star icon-unselected"></i><i class="ti ti-check icon-selected"></i> Todos (*)
  </label>`;
  
  if (allAgents.length === 0) {
    html += `<div style="font-size:11px; color:var(--text3); margin-top:4px; grid-column:1/-1;">No hay asistentes descubiertos.</div>`;
  } else {
    const allowed = agentsStr === '*' ? allAgents : agentsStr.split(',').map(s => s.trim());
    allAgents.forEach(a => {
      const isChecked = agentsStr === '*' || allowed.includes(a);
      html += `<label class="perm-agent-pill">
        <input type="checkbox" class="um-perm-agent-cb" value="${escapeHtml(a)}" ${isChecked ? 'checked' : ''} onchange="updateAllAgentsCheckbox()" />
        <i class="ti ti-robot icon-unselected"></i><i class="ti ti-check icon-selected"></i> ${escapeHtml(a)}
      </label>`;
    });
  }
  container.innerHTML = html;
}

window.toggleAllAgents = function(el) {
  document.querySelectorAll('.um-perm-agent-cb').forEach(cb => cb.checked = el.checked);
}
window.updateAllAgentsCheckbox = function() {
  const allCb = document.querySelectorAll('.um-perm-agent-cb');
  const allChecked = Array.from(allCb).every(cb => cb.checked);
  const elAll = document.getElementById('um-perm-agent-all');
  if (elAll) elAll.checked = allChecked;
}

async function loadAuditLogs() {
  const tbody = document.getElementById('audit-tbody');
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text3)">Cargando...</td></tr>';
  try {
    const r = await fetch('/api/audit/logs?limit=50');
    const data = await r.json();
    if(r.ok) {
      tbody.innerHTML = data.logs.map(l => `
        <tr>
          <td style="white-space:nowrap">${new Date(l.created_at).toLocaleString()}</td>
          <td><strong>${escapeHtml(l.username)}</strong></td>
          <td><code>${escapeHtml(l.action)}</code></td>
          <td>${escapeHtml(l.detail || '-')}</td>
          <td>${escapeHtml(l.ip || '-')}</td>
        </tr>
      `).join('');
    }
  } catch(e) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--red)">Error al cargar logs</td></tr>'; }
}

// --- AGENT CREATOR ---
function acBase() { return `${document.getElementById('base-url').value.trim().replace(/\/$/, '')}:9097`; }
function acSnake(value) { return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_\-\s]/g, '').replace(/[\-\s]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, ''); }
function acSyncEnvHint() { const name = acSnake(document.getElementById('ac-agent-name').value); document.getElementById('ac-env-hint').value = name ? `AGENT_${name.toUpperCase()}_PORT` : ''; }
function acToggleTools() { const enabled = document.getElementById('ac-use-tools').checked; document.getElementById('ac-tool-profile-wrap').style.display = enabled ? 'flex' : 'none'; if (enabled) acLoadToolProfiles(); }
function acSetStatus(text) { document.getElementById('ac-status').textContent = text; }
function acToast(message, ok = true) { showToast(message, ok ? 'success' : 'error'); }

function acPayload() {
  const portValue = document.getElementById('ac-port')?.value;
  return {
    agent_name: document.getElementById('ac-agent-name').value,
    description: document.getElementById('ac-description').value,
    prompt: document.getElementById('ac-prompt').value,
    port: portValue ? Number(portValue) : null,
    use_tools: document.getElementById('ac-use-tools').checked,
    tool_profile: document.getElementById('ac-tool-profile').value || null,
    capabilities: document.getElementById('ac-capabilities').value.split(',').map(x => x.trim()).filter(Boolean),
    overwrite: document.getElementById('ac-overwrite').checked
  };
}

async function acLoadToolProfiles() {
  const select = document.getElementById('ac-tool-profile'); const current = select.value; select.innerHTML = '<option value="">Cargando perfiles...</option>';
  try { 
    const response = await fetch(`${acBase()}/tool-profiles`, { signal: AbortSignal.timeout(15000) }); 
    const data = await response.json(); 
    if (!response.ok) throw new Error(JSON.stringify(data)); 
    const profiles = data.profiles || []; 
    if (!profiles.length) { select.innerHTML = '<option value="">No hay perfiles en agent_config.yaml</option>'; return; }
    select.innerHTML = '<option value="">Selecciona perfil...</option>' + profiles.map(profile => { 
      const servers = (profile.servers || []).map(server => server.name).filter(Boolean).join(', '); 
      const label = servers ? `${profile.name} - ${servers}` : profile.name; 
      return `<option value="${escapeHtml(profile.name)}">${escapeHtml(label)}</option>`; 
    }).join('');
    if (current && [...select.options].some(option => option.value === current)) select.value = current;
  } catch (error) { 
    select.innerHTML = '<option value="">Error cargando perfiles</option>'; 
    acToast('No se pudieron cargar perfiles: ' + error.message, false); 
  }
}

async function acPost(path, body) { 
  const response = await fetch(`${acBase()}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) }); 
  const text = await response.text(); 
  let data; 
  try { data = JSON.parse(text); } catch { data = text; } 
  if (!response.ok) throw new Error(typeof data === 'string' ? data : JSON.stringify(data, null, 2)); 
  return data; 
}

let acCurrentPreview = null;
function acRenderPreview(data) {
  acCurrentPreview = data;
  const files = Object.entries(data.files || {});
  if (data.planned_updates) files.push(['planned_updates.json', JSON.stringify(data.planned_updates, null, 2)]);
  document.getElementById('ac-tabs').innerHTML = files.map(([path], idx) => `<button class="ac-tab ${idx === 0 ? 'active' : ''}" onclick="acShowFile(${idx})">${escapeHtml(path.split('/').slice(-2).join('/'))}</button>`).join('');
  acShowFile(0);
}

function acShowFile(index) { 
  const files = Object.entries(acCurrentPreview?.files || {}); 
  if (acCurrentPreview?.planned_updates) files.push(['planned_updates.json', JSON.stringify(acCurrentPreview.planned_updates, null, 2)]); 
  if (!files[index]) return; 
  document.querySelectorAll('.ac-tab').forEach((tab, idx) => tab.classList.toggle('active', idx === index)); 
  const ext = files[index][0].split('.').pop() || 'text';
  const md = `\`\`\`${ext}\n${files[index][1]}\n\`\`\``;
  document.getElementById('ac-preview').innerHTML = `<div class="bubble agent" style="box-shadow:none; border:none; padding:0; max-width:100%; background:transparent">${marked.parse(md)}</div>`; 
}

async function acPreviewAgent() { 
  try { 
    acSetStatus('Generando preview...'); 
    const data = await acPost('/preview', acPayload()); 
    acRenderPreview(data); 
    acSetStatus('Preview generado'); 
  } catch (error) { 
    acSetStatus('Error'); 
    acToast(error.message, false); 
  } 
}

async function acCreateAgent() { 
  try { 
    acSetStatus('Creando asistente...'); 
    const data = await acPost('/create', acPayload()); 
    acSetStatus('Asistente creado'); 
    acToast(`Asistente creado: ${data.agent_name}\n\n${(data.next_steps || []).join('\n')}`); 
    await acPreviewAgent(); 
  } catch (error) { 
    acSetStatus('Error'); 
    acToast(error.message, false); 
  } 
}

// --- MODAL OVERLAY CLICK-TO-CLOSE ---
document.getElementById('modal')?.addEventListener('click', e => {
  if (e.target === document.getElementById('modal')) closeModal();
});
document.getElementById('playbook-modal')?.addEventListener('click', e => {
  if (e.target === document.getElementById('playbook-modal')) document.getElementById('playbook-modal').classList.remove('open');
});
document.getElementById('pb-input-modal')?.addEventListener('click', e => {
  if (e.target === document.getElementById('pb-input-modal')) pbInputCancel();
});
document.getElementById('pb-delete-modal')?.addEventListener('click', e => {
  if (e.target === document.getElementById('pb-delete-modal')) pbCloseDeleteModal();
});

// Start app
window.onload = () => { checkAuth(); };



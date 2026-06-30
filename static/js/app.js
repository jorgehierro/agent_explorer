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
  const cardName = agents[name]?.card?.name || name || '';
  if (cardName === 'workflow_runner') return 'workflow';
  if (cardName === 'playbook_runner') return 'playbook';
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

function updateAutomationButtonForSelectedAgent() {
  const label = document.getElementById('automation-btn-label');
  const icon = document.getElementById('automation-btn-icon');
  const btn = document.getElementById('automation-btn');
  if (!label || !icon || !btn) return;
  const kind = selectedAgentKind();
  const perms = currentUser?.permissions || { tabs: [], agents: '*' };
  const isAdmin = currentUser?.role === 'admin';
  
  if (kind === 'workflow') {
    btn.style.display = (isAdmin || perms.tabs.includes('workflows')) ? 'inline-flex' : 'none';
    label.textContent = 'Workflows';
    icon.className = 'ti ti-route';
    btn.title = 'Workflows';
  } else if (kind === 'playbook') {
    btn.style.display = (isAdmin || perms.tabs.includes('playbooks')) ? 'inline-flex' : 'none';
    label.textContent = 'Playbooks';
    icon.className = 'ti ti-list-check';
    btn.title = 'Playbooks';
  } else {
    btn.style.display = 'none';
  }
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

  updateAutomationButtonForSelectedAgent();
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
  document.getElementById('um-perm-playbooks').checked = false;
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
      document.getElementById('um-perm-playbooks').checked = p.tabs.includes('playbooks');
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
  if (document.getElementById('um-perm-playbooks').checked) tabs.push('playbooks');
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

// === PLAYBOOK BUILDER ===
let pbSteps = [];
let pbZoomLevel = 1.0;
let pbPanX = 0; let pbPanY = 0;
let isPanning = false; let startPanX = 0; let startPanY = 0;
let draggedNode = null;
let pbSelectedId = null;

function pbAutoSave() {
  const pbData = {
    name: document.getElementById('pb-name').value,
    desc: document.getElementById('pb-desc').value,
    steps: pbSteps,
    panX: pbPanX, panY: pbPanY, zoom: pbZoomLevel
  };
  localStorage.setItem('agent_explorer_pb_draft', JSON.stringify(pbData));
}

function pbImportDraft() {
  const d = localStorage.getItem('agent_explorer_pb_draft');
  if(!d) { showToast('No hay borrador guardado', 'error'); return; }
  try {
    const pbData = JSON.parse(d);
    document.getElementById('pb-name').value = pbData.name || '';
    document.getElementById('pb-desc').value = pbData.desc || '';
    pbSteps = pbData.steps || [];
    pbZoomLevel = pbData.zoom || 1.0;
    pbPanX = pbData.panX || 0; pbPanY = pbData.panY || 0;
    switchPbTab('create');
    pbRenderCanvas();
    pbUpdateTransform();
    showToast('Borrador cargado');
  } catch(e) { showToast('Error cargando borrador', 'error'); }
}

function switchPbTab(t) {
  document.querySelectorAll('.pb-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.pb-section').forEach(s => s.classList.remove('active'));
  document.getElementById('pb-btn-'+t).classList.add('active');
  document.getElementById('pb-tab-'+t).classList.add('active');
  if (t === 'create') {
    pbPopulatePalette('');
    setTimeout(() => { pbRenderCanvas(); pbUpdateYaml(); }, 50);
  } else { pbRefreshList(); }
}

function openPlaybookModal() {
  const kind = selectedAgentKind();
  const tabs = document.getElementById('pb-tabs-container');
  const modalBox = document.querySelector('#playbook-modal .modal');
  
  document.getElementById('pb-modal-title').innerHTML = kind === 'workflow' ? '<i class="ti ti-route"></i> Workflows' : '<i class="ti ti-list-check"></i> Playbooks';
  
  if (kind === 'workflow') {
    if(tabs) tabs.style.display = 'none';
    modalBox.classList.remove('wide');
    modalBox.classList.add('medium');
    switchPbTab('run');
  } else {
    if(tabs) tabs.style.display = 'flex';
    modalBox.classList.add('wide');
    modalBox.classList.remove('medium');
    document.getElementById('pb-btn-run').innerHTML = '<i class="ti ti-player-play"></i> Ejecutar';
    document.getElementById('pb-btn-create').innerHTML = '<i class="ti ti-pencil"></i> Diseñador';
    document.getElementById('pb-btn-create').style.display = 'block';
    if (!document.getElementById('pb-tab-run').classList.contains('active') && !document.getElementById('pb-tab-create').classList.contains('active')) {
      switchPbTab('run');
    }
  }
  
  document.getElementById('playbook-modal').classList.add('open');
  pbRefreshList();
}

function pbZoom(delta) {
  pbZoomLevel = Math.max(0.4, Math.min(2.0, pbZoomLevel + delta));
  pbUpdateTransform();
}
function pbResetView() { pbZoomLevel = 1.0; pbPanX = 0; pbPanY = 0; pbUpdateTransform(); }
function pbUpdateTransform() {
  document.getElementById('pb-zoom-label').innerText = Math.round(pbZoomLevel * 100) + '%';
  document.getElementById('pb-flow-plane').style.transform = `translate(${pbPanX}px, ${pbPanY}px) scale(${pbZoomLevel})`;
  pbAutoSave();
}

function pbCanvasPanStart(e) {
  if(e.target.closest('.pb-node') || e.target.closest('.pb-mini-btn')) return;
  isPanning = true;
  startPanX = e.clientX - pbPanX;
  startPanY = e.clientY - pbPanY;
  document.getElementById('pb-flow-canvas').classList.add('panning');
}
window.addEventListener('mousemove', e => {
  if(!isPanning) return;
  pbPanX = e.clientX - startPanX;
  pbPanY = e.clientY - startPanY;
  pbUpdateTransform();
});
window.addEventListener('mouseup', () => {
  isPanning = false;
  const canvas = document.getElementById('pb-flow-canvas');
  if(canvas) canvas.classList.remove('panning');
});

function pbPopulatePalette(filter) {
  const p = document.getElementById('pb-agent-palette');
  const arr = Object.values(agents).filter(a => a.ok && a.name.toLowerCase().includes(filter.toLowerCase()));
  if(!arr.length) { p.innerHTML = '<div style="color:var(--text3);font-size:12px;text-align:center;padding:10px">No hay asistentes disponibles.</div>'; return; }
  p.innerHTML = arr.map(a => `<div class="pb-agent-chip" draggable="true" ondragstart="pbDragStart(event, '${a.name}')"><div class="agent-dot"></div><div>${a.name}</div><div class="agent-meta">:${a.port}</div></div>`).join('');
}
function pbFilterAgents(v) { pbPopulatePalette(v); }
function pbDragStart(e, agentName) { e.dataTransfer.setData('text/plain', agentName); }
function pbDropCanvas(e) {
  e.preventDefault();
  const agentName = e.dataTransfer.getData('text/plain');
  if (!agentName) return;
  
  const rect = document.getElementById('pb-flow-plane').getBoundingClientRect();
  // Adjust for pan and zoom to place exactly under cursor
  const x = (e.clientX - rect.left) / pbZoomLevel;
  const y = (e.clientY - rect.top) / pbZoomLevel;
  
  const stepId = `step_${pbSteps.length + 1}`;
  pbSteps.push({ id: stepId, type: 'sequential', agent: agentName, prompt: '', parallel: {}, pos: {x, y} });
  pbSelectedId = stepId;
  pbRenderCanvas();
  pbSelectNode(stepId);
  pbAutoSave();
}

function pbRenderCanvas() {
  const container = document.getElementById('pb-nodes-container');
  const svg = document.getElementById('pb-flow-svg');
  const empty = document.getElementById('pb-canvas-empty');
  
  if (pbSteps.length === 0) {
    empty.style.display = 'block'; container.innerHTML = ''; svg.innerHTML = '';
    pbInspector(); pbUpdateYaml(); return;
  }
  
  empty.style.display = 'none';
  container.innerHTML = pbSteps.map(s => {
    const isSel = s.id === pbSelectedId ? 'selected' : '';
    const isPar = s.type === 'parallel';
    const warning = (!s.agent && !isPar) ? `<div class="pb-node-warning" title="Asistente faltante"><i class="ti ti-alert-triangle"></i></div>` : '';
    const desc = isPar ? `${Object.keys(s.parallel || {}).length} tareas en paralelo` : (s.agent || 'Sin asistente asignado');
    const msgPrev = s.prompt ? `<div class="pb-node-message">${escapeHtml(s.prompt)}</div>` : '';
    return `<div class="pb-node ${isSel} ${isPar ? 'parallel' : ''}" id="node-${s.id}" style="left:${s.pos.x}px;top:${s.pos.y}px" onmousedown="pbNodeMouseDown(event, '${s.id}')">
      ${warning}
      <div class="pb-port in"></div><div class="pb-port out"></div>
      <div class="pb-node-head">
        <div class="pb-node-icon"><i class="ti ${isPar ? 'ti-route' : 'ti-robot'}"></i></div>
        <div style="min-width:0"><div class="pb-node-title">${s.id}</div><div class="pb-node-kind">${s.type}</div></div>
      </div>
      <div class="pb-node-body"><div>${desc}</div>${msgPrev}</div>
      <div class="pb-node-foot"><span>X: ${Math.round(s.pos.x)}</span><span>Y: ${Math.round(s.pos.y)}</span></div>
    </div>`;
  }).join('');
  
  pbDrawLines();
  if (pbSelectedId) pbInspector();
  pbUpdateYaml();
}

function pbDrawLines() {
  const svg = document.getElementById('pb-flow-svg');
  let lines = '';
  for (let i = 0; i < pbSteps.length - 1; i++) {
    const s1 = pbSteps[i], s2 = pbSteps[i+1];
    // Center point of out port
    const x1 = s1.pos.x + 260; // node width
    const y1 = s1.pos.y + 58;  // rough center height
    // Center point of in port
    const x2 = s2.pos.x;
    const y2 = s2.pos.y + 58;
    
    // Smooth bezier curve
    const cX = (x1 + x2) / 2;
    const path = `M ${x1} ${y1} C ${cX} ${y1}, ${cX} ${y2}, ${x2} ${y2}`;
    lines += `<path class="pb-flow-link-shadow" d="${path}"></path><path class="pb-flow-link" d="${path}"></path>`;
  }
  svg.innerHTML = lines;
}

function pbNodeMouseDown(e, id) {
  e.stopPropagation();
  pbSelectedId = id;
  pbRenderCanvas();
  pbSelectNode(id);
  
  const nodeEl = document.getElementById(`node-${id}`);
  nodeEl.classList.add('dragging');
  const startX = e.clientX, startY = e.clientY;
  const step = pbSteps.find(s => s.id === id);
  const startPosX = step.pos.x, startPosY = step.pos.y;
  
  const onMove = ev => {
    step.pos.x = startPosX + (ev.clientX - startX) / pbZoomLevel;
    step.pos.y = startPosY + (ev.clientY - startY) / pbZoomLevel;
    nodeEl.style.left = `${step.pos.x}px`;
    nodeEl.style.top = `${step.pos.y}px`;
    pbDrawLines();
  };
  const onUp = () => {
    nodeEl.classList.remove('dragging');
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    pbAutoSave();
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

function pbSelectNode(id) { pbSelectedId = id; pbInspector(); }
function pbClearCanvas() { if(!confirm("¿Borrar todo el lienzo?")) return; pbSteps = []; pbSelectedId = null; pbRenderCanvas(); pbAutoSave(); }

function pbAutoLayout() {
  if (!pbSteps.length) return;
  const startX = 50, startY = 100, xGap = 340;
  pbSteps.forEach((s, i) => {
    s.pos = { x: startX + (i * xGap), y: startY };
  });
  pbPanX = 0; pbPanY = 0; pbZoomLevel = 1.0;
  pbUpdateTransform();
  pbRenderCanvas();
  pbAutoSave();
  showToast("Layout reordenado");
}

function pbMoveStep(id, dir) {
  const idx = pbSteps.findIndex(s=>s.id === id);
  if (idx < 0) return;
  if (dir === -1 && idx > 0) { const temp = pbSteps[idx]; pbSteps[idx] = pbSteps[idx-1]; pbSteps[idx-1] = temp; }
  else if (dir === 1 && idx < pbSteps.length-1) { const temp = pbSteps[idx]; pbSteps[idx] = pbSteps[idx+1]; pbSteps[idx+1] = temp; }
  pbAutoLayout();
}
function pbDelStep(id) { pbSteps = pbSteps.filter(s=>s.id !== id); if(pbSelectedId===id) pbSelectedId=null; pbRenderCanvas(); pbAutoSave(); }

function pbInspector() {
  const panel = document.getElementById('pb-inspector');
  const sub = document.getElementById('pb-ins-id');
  if(!pbSelectedId) { sub.textContent=''; panel.innerHTML='<div class="pb-inspector-empty">Selecciona un nodo para editarlo.</div>'; return; }
  
  const step = pbSteps.find(s=>s.id===pbSelectedId);
  sub.textContent = step.id;
  
  const agentsOpts = Object.keys(agents).filter(k=>agents[k].ok).map(k=>`<option value="${k}" ${step.agent===k?'selected':''}>${k}</option>`).join('');
  let html = `
    <div class="pb-field"><label>ID del Nodo</label><input type="text" value="${step.id}" onchange="pbUpdateStep('${step.id}', 'id', this.value)" /></div>
    <div class="pb-field"><label>Tipo de ejecución</label><select onchange="pbUpdateStep('${step.id}', 'type', this.value)"><option value="sequential" ${step.type==='sequential'?'selected':''}>Sequential (Normal)</option><option value="parallel" ${step.type==='parallel'?'selected':''}>Parallel (Múltiples asistentes)</option></select></div>
  `;
  
  if (step.type === 'sequential') {
    html += `
      <div class="pb-field"><label>Asistente Destino</label><select onchange="pbUpdateStep('${step.id}', 'agent', this.value)"><option value="">-- Seleccionar --</option>${agentsOpts}</select></div>
      <div class="pb-field"><label>Mensaje (Prompt)</label><textarea class="code-font" onchange="pbUpdateStep('${step.id}', 'prompt', this.value)" placeholder="Escribe el prompt... Usa \${inputs} para ref.">${step.prompt || ''}</textarea></div>
      <div class="pb-ref-box">Variables disponibles:<br/><code>\${inputs.initial}</code> - Entrada inicial<br/><code>\${steps.ID.output}</code> - Salida de un nodo</div>
    `;
  } else {
    html += `<div class="pb-field"><label>Tareas en Paralelo</label><div class="pb-par-editor">`;
    const pKeys = Object.keys(step.parallel || {});
    pKeys.forEach(k => {
      html += `<div class="pb-par-editor-row"><div style="display:flex;justify-content:space-between;align-items:center"><select style="width:70%" onchange="pbUpdatePar('${step.id}', '${k}', 'agent', this.value)"><option value="">-- Asistente --</option>${agentsOpts.replace(`value="${k}"`, `value="${k}" selected`)}</select><i class="ti ti-trash action-icon danger" onclick="pbDelPar('${step.id}', '${k}')"></i></div><textarea class="code-font" placeholder="Prompt para este asistente" onchange="pbUpdatePar('${step.id}', '${k}', 'prompt', this.value)">${step.parallel[k]}</textarea></div>`;
    });
    html += `<button class="btn" style="width:100%;justify-content:center" onclick="pbAddPar('${step.id}')"><i class="ti ti-plus"></i> Añadir Asistente</button></div></div>
    <div class="pb-ref-box">En paralelos, las salidas se unen. Úsalas en nodos siguientes como <code>\${steps.ID.outputs.ASISTENTE}</code>.</div>`;
  }
  
  html += `<div class="pb-inspector-actions"><button class="btn" onclick="pbMoveStep('${step.id}', -1)"><i class="ti ti-arrow-left"></i> Mover</button><button class="btn" onclick="pbMoveStep('${step.id}', 1)">Mover <i class="ti ti-arrow-right"></i></button><button class="btn danger" style="grid-column:1/-1" onclick="pbDelStep('${step.id}')"><i class="ti ti-trash"></i> Eliminar Nodo</button></div>`;
  panel.innerHTML = html;
}

function pbUpdateStep(id, field, val) {
  const step = pbSteps.find(s=>s.id===id);
  if (field==='id') {
    if(!val || pbSteps.find(x=>x.id===val)) return;
    pbSelectedId = val;
  }
  step[field] = val;
  pbRenderCanvas(); pbAutoSave();
}
function pbAddPar(id) { const step = pbSteps.find(s=>s.id===id); if(!step.parallel) step.parallel={}; const temp = `asistente_${Object.keys(step.parallel).length+1}`; step.parallel[temp]=""; pbInspector(); pbRenderCanvas(); pbAutoSave(); }
function pbUpdatePar(id, oldKey, field, val) {
  const step = pbSteps.find(s=>s.id===id);
  if (field==='agent') {
    const prompt = step.parallel[oldKey]; delete step.parallel[oldKey];
    if(val) step.parallel[val] = prompt;
  } else { step.parallel[oldKey] = val; }
  pbRenderCanvas(); pbAutoSave();
}
function pbDelPar(id, key) { const step = pbSteps.find(s=>s.id===id); delete step.parallel[key]; pbInspector(); pbRenderCanvas(); pbAutoSave(); }

function pbBuildYamlStr() {
  let y = `name: ${document.getElementById('pb-name').value || 'sin_nombre'}\n`;
  const desc = document.getElementById('pb-desc').value;
  if(desc) y += `description: "${escapeJsString(desc)}"\n`;
  y += `steps:\n`;
  pbSteps.forEach(s => {
    y += `  - id: ${s.id}\n`;
    if (s.type === 'parallel') {
      y += `    type: parallel\n    parallel:\n`;
      Object.keys(s.parallel||{}).forEach(k => { y += `      ${k}: |\n        ${s.parallel[k].split('\n').join('\n        ')}\n`; });
    } else {
      y += `    agent: ${s.agent || 'null'}\n    prompt: |\n      ${(s.prompt||'').split('\n').join('\n      ')}\n`;
    }
  });
  return y;
}

function pbUpdateYaml() {
  const pre = document.getElementById('pb-yaml-preview');
  if(!pre) return;
  const yaml = pbBuildYamlStr();
  // Basic Regex Syntax Highlighting for YAML
  const html = yaml
    .replace(/^(.*?:)/gm, '<span class="yaml-key">$1</span>')
    .replace(/(:\s*)(["'].*?["'])/g, '$1<span class="yaml-string">$2</span>');
  pre.innerHTML = html;
}

async function pbCreatePlaybook() {
  if (!selected) return;
  const name = document.getElementById('pb-name').value.trim();
  if (!name || !pbSteps.length) { alert("Nombre y al menos 1 paso requerido"); return; }
  const yaml = pbBuildYamlStr();
  try {
    const a = agents[selected];
    const r = await fetch('/api/proxy/fetch', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ url: `${a.url}/playbooks/${name}`, method: 'PUT', body: yaml, headers: {'Content-Type': 'text/plain'} })
    });
    if(r.ok) { showToast(`Playbook ${name} desplegado con éxito`); switchPbTab('run'); }
    else { const err = await r.json(); alert('Error: ' + JSON.stringify(err)); }
  } catch(e) { alert("Error de conexión"); }
}

async function pbRefreshList() {
  if (!selected) return;
  const list = document.getElementById('pb-list');
  list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3)"><i class="ti ti-loader-2" style="animation:spin 1s linear infinite;font-size:24px"></i></div>';
  try {
    const a = agents[selected];
    const isWorkflow = selectedAgentKind() === 'workflow';
    const urlPath = isWorkflow ? '/workflows' : '/playbooks';
    const r = await fetch('/api/proxy/fetch', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ url: a.url + urlPath, method: 'GET' }) });
    
    if (r.ok) {
      const data = await r.json();
      const keys = Array.isArray(data) ? data : Object.keys(data || {});
      
      if (!keys.length) { 
        list.innerHTML = `<div class="empty-state"><i class="ti ti-list-search" style="font-size:24px; color:var(--text3); margin-bottom:8px; display:block;"></i><p>No hay ${urlPath.substring(1)} desplegados.</p></div>`; 
        return; 
      }
      
      list.innerHTML = keys.map(k => {
        const meta = Array.isArray(data) ? {} : (data[k] || {});
        const jsKey = escapeJsString(k);
        const displayName = escapeHtml(meta.name || k);
        const descText = meta.description || (isWorkflow && meta.module ? ('Módulo: ' + meta.module) : '');
        const desc = descText ? `<div class="pb-desc">${escapeHtml(descText)}</div>` : '';
        const stepsText = isWorkflow ? 'workflow' : `${Number(meta.steps || 0)} pasos`;
        const onclick = isWorkflow ? `runWorkflow('${jsKey}')` : `runPlaybook('${jsKey}')`;
        
        return `
        <div class="playbook-item">
          <div class="pb-run-area" onclick="${onclick}" title="Ejecutar">
            <div class="pb-run-main"><div class="pb-name">${displayName}</div>${desc}</div>
            <span class="pb-steps">${stepsText}</span>
            <i class="ti ti-player-play" style="font-size:13px;color:var(--text3)"></i>
          </div>
          ${!isWorkflow ? `<button class="pb-del-btn" onclick="pbAskDelete('${jsKey}')" title="Eliminar"><i class="ti ti-trash"></i></button>` : ''}
        </div>
        `;
      }).join('');
    } else {
      list.innerHTML = `<div style="color:var(--red);text-align:center;padding:20px">Error al cargar la lista</div>`;
    }
  } catch(e) { list.innerHTML = `<div style="color:var(--red);text-align:center;padding:20px">Error de conexión</div>`; }
}

// --- PLAYBOOK INPUT MODAL (Promise-based, matches original) ---
let pbInputResolver = null;
function pbOpenInputModal(playbookLabel, initialValue) {
  return new Promise(resolve => {
    pbInputResolver = resolve;
    const modal = document.getElementById('pb-input-modal');
    const title = document.getElementById('pb-input-title');
    const subtitle = document.getElementById('pb-input-subtitle');
    const text = document.getElementById('pb-input-text');
    const error = document.getElementById('pb-input-error');
    title.textContent = `Ejecutar: ${playbookLabel}`;
    subtitle.textContent = 'Introduce el dato de entrada que recibirá el playbook. Puedes revisar o editar el texto antes de ejecutarlo.';
    text.value = initialValue || '';
    error.textContent = '';
    modal.classList.add('open');
    setTimeout(() => { text.focus(); if (text.value) text.select(); }, 60);
  });
}
function pbResolveInputModal(value) {
  document.getElementById('pb-input-modal').classList.remove('open');
  const resolve = pbInputResolver;
  pbInputResolver = null;
  if (resolve) resolve(value);
}
function pbInputCancel() { if (pbInputResolver) pbResolveInputModal(null); }
function pbInputAccept() {
  const text = document.getElementById('pb-input-text');
  const error = document.getElementById('pb-input-error');
  const value = text.value.trim();
  if (!value) { error.textContent = 'Introduce un input para ejecutar el playbook.'; text.focus(); return; }
  pbResolveInputModal(value);
}
function pbInputKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); pbInputAccept(); }
}

async function runWorkflow(name) {
  document.getElementById('playbook-modal').classList.remove('open');
  const runner = agents[selected];
  if (!runner || runner.card?.name !== 'workflow_runner') { alert('Selecciona el asistente workflow_runner'); return; }
  const inputEl = document.getElementById('msg-input');
  const initialValue = inputEl.value.trim();
  const userMsg = await pbOpenInputModal(name, initialValue);
  if (!userMsg) return;
  inputEl.value = ''; inputEl.style.height = 'auto';
  await _executeWorkflow(runner, userMsg, name);
}

async function _executeWorkflow(runner, userMsg, workflowName) {
  isLoading = true;
  document.getElementById('msg-input').disabled = true;
  document.getElementById('send-btn').disabled = true;
  histories[selected].push({ role: 'user', content: `⚙ Workflow: ${workflowName}\n${userMsg}` });
  histories[selected].push({ role: 'typing' });
  renderMessages();
  try {
    const r = await fetch('/api/proxy/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: runner.url, messages: userMsg, workflow_name: workflowName }),
      signal: AbortSignal.timeout(3000000)
    });
    histories[selected] = histories[selected].filter(m => m.role !== 'typing');
    if (!r.ok) {
      const err = await r.text();
      histories[selected].push({ role: 'error', content: `HTTP ${r.status}: ${err}` });
    } else {
      const data = await r.json();
      histories[selected].push({ role: 'agent', content: data.result ?? JSON.stringify(data, null, 2) });
    }
  } catch(e) {
    histories[selected] = histories[selected].filter(m => m.role !== 'typing');
    histories[selected].push({ role: 'error', content: e.name === 'TimeoutError' ? 'Timeout' : `Error: ${e.message}` });
  }
  isLoading = false;
  document.getElementById('msg-input').disabled = false;
  document.getElementById('send-btn').disabled = false;
  document.getElementById('msg-input').focus();
  renderMessages();
}

async function runPlaybook(name) {
  document.getElementById('playbook-modal').classList.remove('open');
  const runner = Object.values(agents).find(a => a.card?.name === 'playbook_runner');
  if (!runner) { alert('No se encontró el asistente playbook_runner'); return; }
  const inputEl = document.getElementById('msg-input');
  const initialValue = inputEl.value.trim();
  const userMsg = await pbOpenInputModal(name, initialValue);
  if (!userMsg) return;
  inputEl.value = ''; inputEl.style.height = 'auto';
  await _executePlaybook(runner, userMsg, { playbook_name: name }, name);
}

async function _executePlaybook(runner, userMsg, extra, label) {
  isLoading = true;
  document.getElementById('msg-input').disabled = true;
  document.getElementById('send-btn').disabled = true;
  histories[selected].push({ role: 'user', content: `▶ Playbook: ${label}\n${userMsg}` });
  histories[selected].push({ role: 'typing' });
  renderMessages();
  try {
    const r = await fetch('/api/proxy/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: runner.url, messages: userMsg, ...extra }),
      signal: AbortSignal.timeout(3000000)
    });
    histories[selected] = histories[selected].filter(m => m.role !== 'typing');
    if (!r.ok) {
      const err = await r.text();
      histories[selected].push({ role: 'error', content: `HTTP ${r.status}: ${err}` });
    } else {
      const data = await r.json();
      histories[selected].push({ role: 'playbook', playbook: data.playbook || label, trace: data.trace || [], result: data.result });
    }
  } catch(e) {
    histories[selected] = histories[selected].filter(m => m.role !== 'typing');
    histories[selected].push({ role: 'error', content: e.name === 'TimeoutError' ? 'Timeout' : `Error: ${e.message}` });
  }
  isLoading = false;
  document.getElementById('msg-input').disabled = false;
  document.getElementById('send-btn').disabled = false;
  document.getElementById('msg-input').focus();
  renderMessages();
}

let pbTargetDel = '';
function pbAskDelete(name) {
  pbTargetDel = name;
  document.getElementById('pb-delete-name-display').textContent = name;
  document.getElementById('pb-delete-modal').classList.add('open');
}
function pbCloseDeleteModal() { document.getElementById('pb-delete-modal').classList.remove('open'); }
async function pbConfirmDelete() {
  try {
    const a = agents[selected];
    const path = selectedAgentKind() === 'workflow' ? `/workflows/${pbTargetDel}` : `/playbooks/${pbTargetDel}`;
    const r = await fetch('/api/proxy/fetch', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ url: a.url + path, method: 'DELETE' }) });
    pbCloseDeleteModal();
    if(r.ok) { showToast('Eliminado correctamente'); pbRefreshList(); } else alert('Error al eliminar');
  } catch(e) { pbCloseDeleteModal(); alert('Error de conexión'); }
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


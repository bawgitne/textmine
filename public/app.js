const socket = io();

// Canvas & Web App State
const canvas = document.getElementById('matrix-canvas');
const ctx = canvas.getContext('2d');

let globalData = null;
let botsState = {};
let afkBotsState = {};
let shulkerList = [];
let savedAccounts = [];
let globalTimeKeeper = null;
const LETTER_OPTIONS = ['T1', 'H1', 'A_HAT_SAC', 'T2', 'N', 'G', 'H2', 'I', 'E_HAT_NANG', 'P'];

// Initialize Canvas Buffer
const CANVAS_WIDTH = 1888;
const CANVAS_HEIGHT = 1240;
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

// Tab Navigation Switching
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    btn.classList.add('active');
    const targetId = btn.getAttribute('data-tab');
    const targetContent = document.getElementById(targetId);
    if (targetContent) targetContent.classList.add('active');

    // Nếu chuyển sang tab Canvas, vẽ lại canvas
    if (targetId === 'tab-canvas') {
      setTimeout(renderCanvas, 50);
    }
  });
});

// Fetch Saved Accounts API
function fetchAccounts() {
  fetch('/api/accounts')
    .then(res => res.json())
    .then(data => {
      savedAccounts = data;
      renderAccountsTable();
    })
    .catch(err => console.error('Lỗi khi tải tài khoản:', err));
}

function renderAccountsTable() {
  const tbody = document.getElementById('accounts-tbody');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (savedAccounts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 16px;">Chưa có tài khoản nào được lưu.</td></tr>`;
    return;
  }

  savedAccounts.forEach(acc => {
    const assignmentOptions = LETTER_OPTIONS.map(id =>
      `<option value="${id}" ${acc.assignedLetter === id ? 'selected' : ''}>${id}</option>`
    ).join('');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${acc.username}</strong></td>
      <td><span class="badge badge-primary">${acc.authType || 'offline'}</span></td>
      <td><select onchange="assignSavedAccount('${acc.id}', this.value)" title="Bạn quyết định bot xây chữ nào">${assignmentOptions}</select></td>
      <td>
        <button class="btn btn-sm btn-success" onclick="loginSavedAccount('${acc.id}')">⚡ Đăng Nhập</button>
        <button class="btn btn-sm btn-danger" onclick="deleteAccount('${acc.id}')">Xóa</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function assignSavedAccount(accId, assignedLetter) {
  const acc = savedAccounts.find(item => item.id === accId);
  if (!acc) return;
  fetch('/api/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...acc, assignedLetter, autoDetectNearest: false })
  }).then(() => fetchAccounts());
}

function loginSavedAccount(accId) {
  const acc = savedAccounts.find(a => a.id === accId);
  if (acc) {
    socket.emit('login_account_bot', acc);
    alert(`Đã gửi lệnh đăng nhập cho tài khoản: ${acc.username}`);
  }
}

function deleteAccount(accId) {
  fetch(`/api/accounts/${accId}`, { method: 'DELETE' })
    .then(() => fetchAccounts());
}

// Handler Lưu Tài Khoản Mới
document.getElementById('btn-save-account').addEventListener('click', () => {
  const username = document.getElementById('acc-username').value;
  const password = document.getElementById('acc-password').value;
  const authType = document.getElementById('acc-auth').value;
  const assignedLetter = document.getElementById('acc-letter').value;

  if (!username.trim()) {
    alert('Vui lòng nhập Username bot!');
    return;
  }

  const newAcc = { username, password, authType, assignedLetter };
  fetch('/api/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newAcc)
  }).then(() => {
    fetchAccounts();
    alert('Đã lưu tài khoản thành công!');
  });
});

// Handler Đăng Nhập Trực Tiếp Vào Server
document.getElementById('btn-login-account').addEventListener('click', () => {
  const username = document.getElementById('acc-username').value;
  const password = document.getElementById('acc-password').value;
  const authType = document.getElementById('acc-auth').value;
  const assignedLetter = document.getElementById('acc-letter').value;

  if (!username.trim()) {
    alert('Vui lòng nhập Username bot!');
    return;
  }

  const accData = { username, password, authType, assignedLetter };
  socket.emit('login_account_bot', accData);
  alert(`Đang đăng nhập bot: ${username} vào Server Minecraft...`);
});

function autoDetectNearestLetter(letterId) {
  socket.emit('auto_detect_nearest', letterId);
}

function setBedSpawnpoint(letterId) {
  socket.emit('set_bed_spawnpoint', letterId);
}

socket.on('auto_detect_result', (res) => {
  if (res.success) {
    alert(`🎯 TỰ ĐỘNG PHÁT HIỆN THÀNH CÔNG!\nBot đang đứng gần chữ: '${res.word} - ${res.detectedLetter}' nhất (Cách ${res.distance} blocks).\nĐã tự động gán phụ trách chữ này!`);
  } else {
    alert(`❌ Lỗi: ${res.error}`);
  }
});

socket.on('login_account_bot_result', (res) => {
  if (!res.success) alert(`❌ Không thể khởi động builder: ${res.error}`);
});

socket.on('set_bed_spawnpoint_result', (res) => {
  if (res.success) {
    alert(`🛏️ ĐÃ SET SPAWNPOINT THÀNH CÔNG!\nTọa độ giường mới: X=${res.bedPos.x}, Y=${res.bedPos.y}, Z=${res.bedPos.z}`);
  } else {
    alert(`❌ Lỗi: ${res.error}`);
  }
});

// Handler Gửi Command Tùy Chỉnh từ Dashboard
document.getElementById('btn-send-cmd').addEventListener('click', () => {
  const targetBot = document.getElementById('cmd-target-bot').value;
  const command = document.getElementById('cmd-input-text').value;

  if (!command.trim()) {
    alert('Vui lòng nhập lệnh Command!');
    return;
  }

  socket.emit('send_bot_command', { botId: targetBot, command: command.trim() });
  document.getElementById('cmd-input-text').value = '';
});

socket.on('send_bot_command_result', (res) => {
  if (res.success) {
    console.log('💬 Gửi lệnh thành công:', res.message);
  } else {
    alert(`❌ Lỗi gửi lệnh: ${res.error}`);
  }
});



// Terminal Logs System
const consoleBox = document.getElementById('terminal-console');

socket.on('initial_logs', (logs) => {
  if (!consoleBox) return;
  consoleBox.innerHTML = '';
  logs.forEach(appendLogLine);
});

socket.on('system_log', (logEntry) => {
  appendLogLine(logEntry);
});

function appendLogLine(entry) {
  if (!consoleBox) return;

  const div = document.createElement('div');
  div.className = `log-line log-${entry.type || 'info'}`;
  div.innerHTML = `
    <span class="log-time">[${entry.timestamp}]</span>
    <span class="log-type">[${(entry.type || 'INFO').toUpperCase()}]</span>
    <span class="log-msg">${entry.message}</span>
  `;
  consoleBox.appendChild(div);

  const autoscroll = document.getElementById('chk-autoscroll');
  if (autoscroll && autoscroll.checked) {
    consoleBox.scrollTop = consoleBox.scrollHeight;
  }
}

document.getElementById('btn-clear-logs').addEventListener('click', () => {
  if (consoleBox) consoleBox.innerHTML = '';
});

// Listen to Socket.io Server Events
socket.on('connect', () => {
  console.log('⚡ Kết nối WebSocket thành công!');
  document.getElementById('system-status').innerText = 'Đã kết nối';
  document.getElementById('system-status').className = 'badge badge-success';
  fetchAccounts();
});



socket.on('disconnect', () => {
  document.getElementById('system-status').innerText = 'Mất kết nối';
  document.getElementById('system-status').className = 'badge badge-danger';
});

// Nhận toàn bộ dữ liệu ma trận pixel khi mới mở trang
socket.on('init_data', (data) => {
  globalData = data;
  renderCanvas();
  updateOverallProgress();
});

// Nhận cập nhật trạng thái bot & shulkers & timeKeeper & afkBots
socket.on('state_update', (data) => {
  botsState = data.bots;
  afkBotsState = data.afkBots || {};
  shulkerList = data.shulkers;
  globalTimeKeeper = data.timeKeeper;

  // Cập nhật thông tin Bot_TimeKeeper & Thời gian
  if (data.timeKeeper) {
    const tk = data.timeKeeper;
    const tkInput = document.getElementById('tk-username-input');
    if (tkInput && document.activeElement !== tkInput && tk.username) {
      tkInput.value = tk.username;
    }

    document.getElementById('tk-status-badge').innerText = tk.status;
    document.getElementById('tk-status-badge').className = tk.status === 'MONITORING' ? 'badge badge-success' : (tk.status === 'SLEEPING' ? 'badge badge-warning' : 'badge badge-primary');

    document.getElementById('tk-sun-moon').innerText = tk.isDay ? '☀️' : '🌙';
    document.getElementById('tk-day-night-text').innerText = tk.isDay ? 'TRỜI SÁNG (Daytime)' : 'TRỜI TỐI (Nighttime)';
    document.getElementById('tk-ticks-text').innerText = `Ticks: ${tk.timeOfDay.toLocaleString()} / 24,000 (Bot đang dùng: ${tk.username})`;
    const dimensionText = document.getElementById('tk-dimension-text');
    if (dimensionText) dimensionText.innerText = `Dimension: ${tk.dimension || 'unknown'}`;
    document.getElementById('chk-auto-night').checked = tk.autoManageNight;

    const btnTk = document.getElementById('btn-toggle-tk');
    if (tk.status !== 'OFFLINE') {
      btnTk.innerText = '⏹ Dừng Bot TimeKeeper';
      btnTk.className = 'btn btn-danger btn-sm';
    } else {
      btnTk.innerText = '▶ Kích Hoạt Bot TimeKeeper';
      btnTk.className = 'btn btn-primary btn-sm';
    }
  }

  // Cập nhật form cấu hình nếu có
  if (data.config) {
    document.getElementById('cfg-host').value = data.config.host || 'cloudy.pikamc.vn';
    document.getElementById('cfg-port').value = data.config.port || 25311;
    document.getElementById('cfg-version').value = data.config.version || '1.20.2';
    document.getElementById('cfg-y').value = data.config.yLevel || 250;
    document.getElementById('cfg-build-block').value = data.config.buildBlock || 'black_concrete';
    document.getElementById('cfg-build-delay').value = data.config.buildDelayMs || 150;
    document.getElementById('cfg-auto-build').checked = data.config.autoBuild !== false;
  }

  renderBotCards();
  renderAfkBots();
  renderShulkerTable();
  updateOverallProgress();
});

// Event Handlers cho TimeKeeper & AFK Bots
document.getElementById('btn-toggle-tk').addEventListener('click', () => {
  const badgeText = document.getElementById('tk-status-badge').innerText;
  if (badgeText !== 'OFFLINE') {
    socket.emit('stop_time_keeper');
  } else {
    const inputVal = document.getElementById('tk-username-input').value;
    if (inputVal && inputVal.trim()) {
      socket.emit('update_tk_username', inputVal.trim());
    }
    socket.emit('start_time_keeper');
  }
});


document.getElementById('chk-auto-night').addEventListener('change', (e) => {
  socket.emit('toggle_auto_night', e.target.checked);
});

// Tạo Bot AFK Tùy Chỉnh
document.getElementById('btn-create-afk').addEventListener('click', () => {
  const unameInput = document.getElementById('afk-username-input');
  const uname = (unameInput.value || '').trim();
  if (uname) {
    socket.emit('add_afk_bot', uname);
    unameInput.value = '';
  } else {
    alert('Vui lòng nhập Username cho Bot AFK!');
  }
});

function renderAfkBots() {
  const container = document.getElementById('afk-bots-container');
  if (!container) return;

  container.innerHTML = '';
  const names = Object.keys(afkBotsState);

  if (names.length === 0) {
    container.innerHTML = '<div style="font-size: 12px; color: var(--text-muted); text-align: center;">Chưa có Bot AFK nào. Nhập tên và tạo mới ở trên!</div>';
    return;
  }

  names.forEach((uname) => {
    const afk = afkBotsState[uname];
    const badgeClass = afk.status === 'AFK_ONLINE' ? 'badge-success' : 'badge-warning';

    const div = document.createElement('div');
    div.className = 'afk-bot-item';
    div.innerHTML = `
      <div class="afk-bot-info">
        <span>🛌 <strong>${afk.username}</strong></span>
        <span class="badge ${badgeClass}">${afk.status}</span>
      </div>
      <button class="btn btn-sm btn-danger" onclick="removeAfkBot('${afk.username}')">Ngắt Kết Nối</button>
    `;
    container.appendChild(div);
  });
}

function removeAfkBot(username) {
  socket.emit('remove_afk_bot', username);
}

// Cập nhật Username cho Bot Builder ngay khi gõ
function updateBuilderName(letterId, inputElem) {
  const newName = (inputElem.value || '').trim();
  botsState[letterId].username = newName;
  socket.emit('update_builder_username', { letterId, username: newName });
  console.log(`[BUILDER] Đã cập nhật Username cho chữ ${letterId}: ${newName}`);
}

function setAsTimeManager(botIdOrName) {
  socket.emit('set_time_keeper', botIdOrName);
}

socket.on('set_time_keeper_result', (res) => {
  if (res.success) {
    alert(`⭐ Đã chọn Bot [${res.username}] làm Time Manager quản lý thời gian Overworld thành công!`);
  } else {
    alert(`❌ Lỗi: ${res.error}`);
  }
});

// Hiển thị 10 thẻ Bot Builder (Chuyên xây dựng, không làm TimeKeeper)
function renderBotCards() {
  const container = document.getElementById('bots-container');
  if (!container) return;

  Object.keys(botsState).forEach((letterId) => {
    const b = botsState[letterId];
    const percentage = b.totalCount > 0 ? ((b.placedCount / b.totalCount) * 100).toFixed(1) : 0;

    let statusBadgeClass = 'badge-primary';
    let statusText = b.status;

    if (b.simulating) {
      statusBadgeClass = 'badge-warning';
      statusText = 'Mô Phỏng';
    } else if (b.status === 'PLACING') {
      statusBadgeClass = 'badge-success';
      statusText = 'Đang Đặt Block';
    } else if (b.status === 'RESPAWNING') {
      statusBadgeClass = 'badge-danger';
      statusText = 'Hy Sinh / Respawn';
    } else if (b.status === 'FINISHED') {
      statusBadgeClass = 'badge-success';
      statusText = 'Hoàn Thành';
    }

    const inputId = `input-builder-${letterId}`;
    const existingInput = document.getElementById(inputId);
    const currentTypedVal = (existingInput && document.activeElement === existingInput) ? existingInput.value : b.username;

    let card = document.getElementById(`bot-card-${letterId}`);
    if (!card) {
      card = document.createElement('div');
      card.id = `bot-card-${letterId}`;
      card.className = 'bot-card';
      container.appendChild(card);
    }

    card.innerHTML = `
      <div class="bot-card-header">
        <span class="bot-title">🤖 Chữ: ${b.word} (${b.label})</span>
        <span class="badge ${statusBadgeClass}">${statusText}</span>
      </div>
      <div class="form-group mt-2">
        <label style="font-size: 11px;">Username Bot Builder (Chuyên Xếp Block)</label>
        <div style="display: flex; gap: 6px;">
          <input type="text" id="${inputId}" value="${currentTypedVal}" placeholder="Nhập Username Bot..." class="flex-1" style="padding: 6px 10px; font-size: 13px;" oninput="updateBuilderName('${b.letterId}', this)" onchange="updateBuilderName('${b.letterId}', this)">
          <span class="badge badge-primary" title="Chữ do bạn gán; bot nạp pixel của chữ này để build">Đã gán: ${b.assignedLetterId || b.letterId}</span>
        </div>
      </div>
      <div class="bot-meta">
        <div>Giường Respawn: <code>Y=${b.bedPos.y}, X=${b.bedPos.x}, Z=${b.bedPos.z}</code></div>
        ${b.detectedDistance ? `<div style="color: var(--accent-cyan); font-weight: 600;">🎯 Vừa quét: Cách giường chữ ${b.label} ${b.detectedDistance}m</div>` : ''}
      </div>
      <div class="bot-progress">
        <div class="progress-info">
          <span>Tiến độ đặt block</span>
          <span>${b.placedCount.toLocaleString()} / ${b.totalCount.toLocaleString()} (${percentage}%)</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width: ${percentage}%;"></div>
        </div>
      </div>
      <div class="bot-actions">
        <button class="btn btn-sm btn-primary" onclick="toggleBot('${b.letterId}')">
          ${b.status === 'OFFLINE' ? '▶ Vào Game' : '⏹ Dừng Bot'}
        </button>
        <button class="btn btn-sm btn-success" onclick="setBedSpawnpoint('${b.letterId}')" title="Bot tự quét khối Giường xung quanh 16m và bấm lưu Spawnpoint">
          🛏️ Set Spawnpoint
        </button>
        <button class="btn btn-sm btn-secondary" onclick="toggleSim('${b.letterId}')">
          ${b.simulating ? '⏹ Dừng Mô Phỏng' : '⚡ Test Mô Phỏng'}
        </button>
      </div>
    `;
  });
}

// Đổi tên Username cho Bot TimeKeeper độc lập ngay khi gõ
const tkInputElem = document.getElementById('tk-username-input');
if (tkInputElem) {
  tkInputElem.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    if (val) socket.emit('update_tk_username', val);
  });
}

document.getElementById('btn-save-tk-name').addEventListener('click', () => {
  const newName = (document.getElementById('tk-username-input').value || '').trim();
  if (!newName) {
    alert('Vui lòng nhập Username cho Bot TimeKeeper!');
    return;
  }
  socket.emit('update_tk_username', newName);
  alert(`🎉 Đã đổi tên Bot TimeKeeper thành: ${newName}`);
});






// Hiển thị bảng Shulker Box với bộ lọc & tìm kiếm
function renderShulkerTable() {
  const tbody = document.getElementById('shulker-tbody');
  if (!tbody) return;

  const searchQuery = (document.getElementById('shulker-search').value || '').toLowerCase();
  const letterFilter = document.getElementById('shulker-filter-letter').value;
  const statusFilter = document.getElementById('shulker-filter-status').value;

  // Lọc dữ liệu
  const filtered = shulkerList.filter((s) => {
    // Filter Letter
    if (letterFilter !== 'ALL' && s.letterId !== letterFilter) return false;
    // Filter Status
    if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
    // Search Query (Tên hoặc Tọa độ)
    if (searchQuery) {
      const matchName = s.name.toLowerCase().includes(searchQuery);
      const matchCoord = `x:${s.pos.x} y:${s.pos.y} z:${s.pos.z}`.toLowerCase().includes(searchQuery);
      if (!matchName && !matchCoord) return false;
    }
    return true;
  });

  // Cập nhật thẻ Summary
  document.getElementById('sum-total-shulkers').innerText = shulkerList.length;
  const totalBlocks = shulkerList.reduce((acc, curr) => acc + curr.remainingBlocks, 0);
  document.getElementById('sum-total-blocks').innerText = totalBlocks.toLocaleString();
  const depletedCount = shulkerList.filter(s => s.remainingBlocks <= 0).length;
  document.getElementById('sum-depleted-shulkers').innerText = depletedCount;

  tbody.innerHTML = '';

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 20px;">Không tìm thấy rương Shulker phù hợp điều kiện lọc.</td></tr>`;
    return;
  }

  filtered.forEach((s) => {
    let badge = 'badge-success';
    if (s.status === 'DEPLETED') badge = 'badge-danger';
    else if (s.status === 'IN_USE') badge = 'badge-warning';

    const percent = s.initialCapacity > 0 ? ((s.remainingBlocks / s.initialCapacity) * 100).toFixed(0) : 0;
    let fillClass = '';
    if (percent == 0) fillClass = 'empty';
    else if (percent <= 25) fillClass = 'low';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${s.name}</strong></td>
      <td><span class="badge badge-primary">${s.letterId}</span></td>
      <td><code>X:${s.pos.x}, Y:${s.pos.y}, Z:${s.pos.z}</code></td>
      <td><strong>${s.remainingBlocks.toLocaleString()}</strong> / ${s.initialCapacity.toLocaleString()}</td>
      <td>
        <div style="font-size: 11px;">${percent}%</div>
        <div class="capacity-mini-bar">
          <div class="capacity-mini-fill ${fillClass}" style="width: ${percent}%;"></div>
        </div>
      </td>
      <td><span class="badge ${badge}">${s.status}</span></td>
      <td>
        <button class="btn btn-sm btn-danger" onclick="deleteShulker('${s.id}')">Xóa</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Event Listeners cho các bộ lọc Shulker Box
document.getElementById('shulker-search').addEventListener('input', renderShulkerTable);
document.getElementById('shulker-filter-letter').addEventListener('change', renderShulkerTable);
document.getElementById('shulker-filter-status').addEventListener('change', renderShulkerTable);


// Control Functions
function toggleBot(letterId) {
  const b = botsState[letterId];
  if (b && b.status !== 'OFFLINE') {
    socket.emit('stop_bot', letterId);
  } else {
    socket.emit('start_bot', letterId);
  }
}

function toggleSim(letterId) {
  socket.emit('toggle_simulation', letterId);
}

function deleteShulker(id) {
  fetch(`/api/shulkers/${id}`, { method: 'DELETE' });
}

// Event Listeners for UI Buttons
document.getElementById('btn-save-cfg').addEventListener('click', () => {
  socket.emit('update_config', {
    host: document.getElementById('cfg-host').value,
    port: parseInt(document.getElementById('cfg-port').value),
    version: document.getElementById('cfg-version').value,
    yLevel: parseInt(document.getElementById('cfg-y').value),
    buildBlock: document.getElementById('cfg-build-block').value.trim(),
    buildDelayMs: Math.max(50, parseInt(document.getElementById('cfg-build-delay').value) || 150),
    autoBuild: document.getElementById('cfg-auto-build').checked
  });
  alert('Đã lưu cấu hình Minecraft Server!');
});

document.getElementById('btn-start-all').addEventListener('click', () => {
  socket.emit('start_all_bots');
});

document.getElementById('btn-stop-all').addEventListener('click', () => {
  socket.emit('stop_all_bots');
  socket.emit('stop_all_simulations');
});

document.getElementById('btn-reset-all').addEventListener('click', () => {
  if (confirm('Bạn có chắc chắn muốn reset toàn bộ tiến độ pixel về 0?')) {
    socket.emit('reset_progress');
  }
});

let isSimulatingAll = false;
document.getElementById('btn-toggle-sim').addEventListener('click', () => {
  if (isSimulatingAll) {
    socket.emit('stop_all_simulations');
    document.getElementById('btn-toggle-sim').innerText = '▶ Chạy Mô Phỏng (Test)';
  } else {
    socket.emit('start_all_simulations');
    document.getElementById('btn-toggle-sim').innerText = '⏹ Dừng Mô Phỏng';
  }
  isSimulatingAll = !isSimulatingAll;
});

// Shulker Modal Handlers
const modal = document.getElementById('shulker-modal');
document.getElementById('btn-add-shulker').addEventListener('click', () => {
  modal.style.display = 'flex';
});

document.getElementById('btn-close-modal').addEventListener('click', () => {
  modal.style.display = 'none';
});

document.getElementById('btn-save-shulker').addEventListener('click', () => {
  const newShulker = {
    name: document.getElementById('modal-shulker-name').value || 'Rương Mới',
    letterId: document.getElementById('modal-shulker-letter').value,
    pos: {
      x: parseInt(document.getElementById('modal-shulker-x').value),
      y: parseInt(document.getElementById('modal-shulker-y').value),
      z: parseInt(document.getElementById('modal-shulker-z').value)
    },
    capacity: parseInt(document.getElementById('modal-shulker-capacity').value)
  };

  fetch('/api/shulkers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newShulker)
  }).then(() => {
    modal.style.display = 'none';
  });
});

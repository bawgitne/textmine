/**
 * THẤT NGHIỆP - Minecraft Bot & Shulker Manager
 * Full React App with Chakra UI Dark Mode Aesthetics & Socket.io Integration
 */

const { useState, useEffect, useRef } = React;

// Helper to extract clean single character (T, H, Ấ, T, N, G, H, I, Ệ, P)
function getCleanSymbol(item) {
  if (!item) return '';
  if (item.symbol) return item.symbol;
  
  const symbolMap = {
    'L1_T': 'T',
    'L2_H': 'H',
    'L3_A': 'Ấ',
    'L4_T': 'T',
    'L5_N': 'N',
    'L6_G': 'G',
    'L7_H': 'H',
    'L8_I': 'I',
    'L9_E': 'Ệ',
    'L10_P': 'P'
  };

  const key = item.id || item.letterId;
  if (key && symbolMap[key]) return symbolMap[key];

  if (item.label && item.label.length <= 2) return item.label;
  if (item.word && item.word.length <= 2) return item.word;

  return item.label || item.word || item.letterId || '';
}

function App() {
  const [activeTab, setActiveTab] = useState('bots'); // 'bots' | 'shulkers' | 'map' | 'canvas' | 'logs'

  // Data States
  const [pixelData, setPixelData] = useState(null);
  const [botsData, setBotsData] = useState({});
  const [shulkersData, setShulkersData] = useState([]);
  const [accountsData, setAccountsData] = useState([]);
  const [timeKeeperState, setTimeKeeperState] = useState({
    username: 'XinChiDungDi',
    status: 'OFFLINE',
    timeOfDay: 0,
    isDay: true
  });
  const [logs, setLogs] = useState([]);
  const [activeMenuId, setActiveMenuId] = useState(null);

  // Modal State for Adding New Bot
  const [isAddBotModalOpen, setIsAddBotModalOpen] = useState(false);
  const [newAccName, setNewAccName] = useState('');
  const [newAccPassword, setNewAccPassword] = useState('1234');
  const [logFilter, setLogFilter] = useState('all');

  const sendAction = async (action, payload) => {
    try {
      const res = await fetch('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload })
      });
      return await res.json();
    } catch (e) {
      console.error('Lỗi thực thi API action:', e);
    }
  };

  // REST API Polling định kỳ mỗi 1.5s
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [stateRes, logsRes, pixelsRes] = await Promise.all([
          fetch('/api/state').then(r => r.ok ? r.json() : null),
          fetch('/api/logs').then(r => r.ok ? r.json() : null),
          fetch('/api/pixels').then(r => r.ok ? r.json() : null)
        ]);

        if (stateRes) {
          if (stateRes.bots) setBotsData(stateRes.bots);
          if (stateRes.shulkers) setShulkersData(stateRes.shulkers);
          if (stateRes.accounts) setAccountsData(stateRes.accounts);
          if (stateRes.timeKeeper) setTimeKeeperState(stateRes.timeKeeper);
        }
        if (logsRes) setLogs(logsRes);
        if (pixelsRes) setPixelData(pixelsRes);
      } catch (e) {
        console.error('Polling error:', e);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 1500);
    return () => clearInterval(interval);
  }, []);

  // Action Menu Handlers
  const handleToggleMenu = (botId) => {
    setActiveMenuId(activeMenuId === botId ? null : botId);
  };

  // Role & Execution Handlers via REST API
  const handleSetRole = (botId, role) => {
    sendAction('set_bot_role', { botId, role });
  };

  const handleStartBot = (botId) => {
    sendAction('start_bot_role', botId);
  };

  const handleStopBot = (botId) => {
    sendAction('stop_bot_role', botId);
  };

  const handleDeleteBot = (botId) => {
    sendAction('delete_bot_account', botId);
  };

  // Add Account via Modal
  const handleAddAccountSubmit = (e) => {
    e.preventDefault();
    if (!newAccName.trim()) return;
    fetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        username: newAccName.trim(),
        password: newAccPassword.trim() || '1234'
      })
    }).then(() => {
      setNewAccName('');
      setNewAccPassword('1234');
      setIsAddBotModalOpen(false);
    });
  };

  // Calculate Overall Progress
  let totalPixels = 0;
  let placedPixels = 0;
  if (pixelData && pixelData.letters) {
    Object.values(pixelData.letters).forEach(l => {
      totalPixels += l.totalPixels || 0;
      placedPixels += l.placedPixelsCount || 0;
    });
  }
  const overallPercentage = totalPixels > 0 ? ((placedPixels / totalPixels) * 100).toFixed(2) : '0.00';

  return (
    <div class="app-container">
      {/* Sidebar Navigation */}
      <aside class="chakra-sidebar">
        <div class="chakra-brand">
          <img src="/texture/wooden_hoe.png" style={{ width: '28px', height: '28px', imageRendering: 'pixelated' }} alt="Bot Manager Logo" />
          <h1>Bot Manager</h1>
        </div>

        <nav class="chakra-nav-list">
          <button 
            class={`chakra-nav-item ${activeTab === 'bots' ? 'active' : ''}`}
            onClick={() => setActiveTab('bots')}
          >
            <i class="fa-solid fa-robot"></i>
            <span>1. Quản Lý Bot</span>
          </button>

          <button 
            class={`chakra-nav-item ${activeTab === 'shulkers' ? 'active' : ''}`}
            onClick={() => setActiveTab('shulkers')}
          >
            <i class="fa-solid fa-boxes-stacked"></i>
            <span>2. Quản Lý Shulker</span>
          </button>

          <button 
            class={`chakra-nav-item ${activeTab === 'map' ? 'active' : ''}`}
            onClick={() => setActiveTab('map')}
          >
            <i class="fa-solid fa-map-location-dot"></i>
            <span>3. Map Shulker & Bed</span>
          </button>

          <button 
            class={`chakra-nav-item ${activeTab === 'canvas' ? 'active' : ''}`}
            onClick={() => setActiveTab('canvas')}
          >
            <i class="fa-solid fa-border-all"></i>
            <span>4. Bản Đồ Block Đã Đặt</span>
          </button>

          <button 
            class={`chakra-nav-item ${activeTab === 'inventory' ? 'active' : ''}`}
            onClick={() => setActiveTab('inventory')}
          >
            <i class="fa-solid fa-briefcase"></i>
            <span>5. Túi Đồ Bot (Inventory)</span>
          </button>

          <button 
            class={`chakra-nav-item ${activeTab === 'logs' ? 'active' : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            <i class="fa-solid fa-terminal"></i>
            <span>6. Live Console Log</span>
          </button>
        </nav>
      </aside>

      {/* Main Content View */}
      <main class="chakra-main">
        {/* Topbar Header */}
        <header class="chakra-topbar">
          <div class="chakra-status-badges">
            <div class="chakra-badge chakra-badge-teal">
              <i class="fa-solid fa-chart-line"></i>
              <span>Tiến độ: {overallPercentage}% ({placedPixels}/{totalPixels})</span>
            </div>

            <div class={`chakra-badge ${timeKeeperState.isDay ? 'chakra-badge-green' : 'chakra-badge-purple'}`}>
              <i class={`fa-solid ${timeKeeperState.isDay ? 'fa-sun' : 'fa-moon'}`}></i>
              <span>{timeKeeperState.isDay ? 'BAN NGÀY' : 'BAN ĐÊM'} ({timeKeeperState.status})</span>
            </div>
          </div>

          <div>
            <span style={{ fontSize: '0.9rem', color: '#A0AEC0' }}>
              <strong>Server MC:</strong> cloudy.pikamc.vn:25311 (1.21.11)
            </span>
          </div>
        </header>

        {/* Content Body based on Active Tab */}
        <div class="chakra-content-body">
          {activeTab === 'bots' && (
            <BotManagerTab 
              botsData={botsData} 
              accountsData={accountsData}
              activeMenuId={activeMenuId}
              onToggleMenu={handleToggleMenu}
              onSetRole={handleSetRole}
              onStartBot={handleStartBot}
              onStopBot={handleStopBot}
              onDeleteBot={handleDeleteBot}
              onOpenAddModal={() => setIsAddBotModalOpen(true)}
            />
          )}

          {activeTab === 'shulkers' && (
            <ShulkerManagerTab 
              shulkersData={shulkersData} 
            />
          )}

          {activeTab === 'map' && (
            <ShulkerBedMapTab 
              pixelData={pixelData} 
              shulkersData={shulkersData}
              botsData={botsData}
            />
          )}

          {activeTab === 'canvas' && (
            <CanvasMapTab 
              pixelData={pixelData} 
            />
          )}

          {activeTab === 'inventory' && (
            <InventoryTab 
              botsData={botsData}
              pixelData={pixelData}
            />
          )}

          {activeTab === 'logs' && (
            <ConsoleLogTab 
              logs={logs}
              logFilter={logFilter}
              setLogFilter={setLogFilter}
              onClearLogs={() => setLogs([])}
            />
          )}
        </div>
      </main>

      {/* Modal Add Bot Pop-up */}
      {isAddBotModalOpen && (
        <div class="chakra-modal-overlay" onClick={() => setIsAddBotModalOpen(false)}>
          <div class="chakra-modal-content" onClick={(e) => e.stopPropagation()}>
            <div class="chakra-modal-header">
              <h3>
                <i class="fa-solid fa-robot" style={{ color: '#4FD1C5' }}></i>
                Đăng Ký Bot Mới Vào Hệ Thống
              </h3>
              <button class="chakra-modal-close" onClick={() => setIsAddBotModalOpen(false)}>
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>

            <form onSubmit={handleAddAccountSubmit}>
              <div class="chakra-modal-body">
                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem', color: '#E2E8F0' }}>
                  Minecraft Username / Tên Nhân Vật:
                </label>
                <input 
                  type="text" 
                  placeholder="Ví dụ: TestBot_01..." 
                  value={newAccName}
                  onChange={(e) => setNewAccName(e.target.value)}
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    borderRadius: '6px',
                    border: '1px solid #4A5568',
                    backgroundColor: '#1A202C',
                    color: '#FFF',
                    fontSize: '0.95rem',
                    marginBottom: '1rem'
                  }}
                />

                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem', color: '#E2E8F0' }}>
                  Mật Khẩu Server (/login Password):
                </label>
                <input 
                  type="text" 
                  placeholder="Mật khẩu (mặc định: 1234)..." 
                  value={newAccPassword}
                  onChange={(e) => setNewAccPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    borderRadius: '6px',
                    border: '1px solid #4A5568',
                    backgroundColor: '#1A202C',
                    color: '#FFF',
                    fontSize: '0.95rem'
                  }}
                />
              </div>

              <div class="chakra-modal-footer">
                <button type="button" class="chakra-btn" onClick={() => setIsAddBotModalOpen(false)}>
                  Hủy Bỏ
                </button>
                <button type="submit" class="chakra-btn chakra-btn-teal">
                  <i class="fa-solid fa-plus"></i>
                  Xác Nhận Đăng Ký
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper to format Uptime Duration
function formatUptime(connectedAt) {
  if (!connectedAt) return 'OFFLINE';
  const diffSec = Math.floor((Date.now() - connectedAt) / 1000);
  if (diffSec < 0) return '0s';
  const hrs = Math.floor(diffSec / 3600);
  const mins = Math.floor((diffSec % 3600) / 60);
  const secs = diffSec % 60;
  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

// ==========================================================================
// TAB 1: BOT MANAGER COMPONENT (CÓ UPTIME, PLAY/STOP & ROLE)
// ==========================================================================
function BotManagerTab({ 
  botsData, 
  accountsData, 
  activeMenuId, 
  onToggleMenu, 
  onSetRole,
  onStartBot,
  onStopBot,
  onDeleteBot,
  onOpenAddModal
}) {
  const botKeys = Object.keys(botsData);
  const [now, setNow] = useState(Date.now());

  // Update timer every second for live uptime display
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div>
      {/* Header with + Plus Button for Modal */}
      <div class="chakra-card">
        <div class="chakra-card-header" style={{ marginBottom: 0 }}>
          <span class="chakra-card-title">
            <i class="fa-solid fa-list-check" style={{ color: '#4FD1C5' }}></i>
            Danh Sách Bot Đã Đăng Ký ({botKeys.length})
          </span>

          <button class="chakra-btn chakra-btn-teal" onClick={onOpenAddModal}>
            <i class="fa-solid fa-plus"></i>
            <span>Đăng Ký Bot Mới</span>
          </button>
        </div>
      </div>

      {/* Bot Table with Role Badges, Uptime Controls & 3-Dots Action Menu */}
      <div class="chakra-card">
        <div class="chakra-table-container">
          <table class="chakra-table">
            <thead>
              <tr>
                <th>Bot Username</th>
                <th>Vai Trò (Role)</th>
                <th>Thời Gian Uptime</th>
                <th>Trạng Thái</th>
                <th>Vị Trí Bed Spawn</th>
                <th style={{ textAlign: 'center' }}>Đăng Nhập / Dừng</th>
                <th style={{ textAlign: 'right' }}>Hành Động</th>
              </tr>
            </thead>
            <tbody>
              {botKeys.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: '#A0AEC0' }}>
                    Chưa có Bot nào được đăng ký. Bấm nút <strong>+ Đăng Ký Bot Mới</strong> ở trên để thêm!
                  </td>
                </tr>
              ) : (
                botKeys.map((bKey) => {
                  const b = botsData[bKey];
                  const symbol = getCleanSymbol(b);
                  const isMenuOpen = activeMenuId === bKey;
                  const isOnline = b.status && b.status !== 'OFFLINE' && b.status !== 'FINISHED' && b.status !== 'ERROR';
                  const uptimeText = isOnline ? formatUptime(b.connectedAt || Date.now()) : 'OFFLINE';

                  return (
                    <tr key={bKey}>
                      <td>
                        <strong style={{ fontSize: '1rem', color: '#FFF' }}>{b.username}</strong>
                      </td>
                      <td>
                        {b.role === 'TIME_MANAGER' ? (
                          <span class="chakra-badge" style={{ backgroundColor: 'rgba(236, 201, 75, 0.2)', color: '#ECC94B', border: '1px solid #ECC94B' }}>
                            <i class="fa-solid fa-clock"></i> Time Manager
                          </span>
                        ) : b.role === 'BUILDER' ? (
                          <span class="chakra-badge chakra-badge-teal">
                            <i class="fa-solid fa-hammer"></i> Bot Builder {symbol ? `(${symbol})` : ''}
                          </span>
                        ) : b.role === 'AFK_NON_OVERWORLD' ? (
                          <span class="chakra-badge" style={{ backgroundColor: 'rgba(66, 153, 225, 0.2)', color: '#4299E1', border: '1px solid #4299E1' }}>
                            <i class="fa-solid fa-cloud-moon"></i> AFK End/Nether
                          </span>
                        ) : (
                          <span class="chakra-badge chakra-badge-purple">
                            <i class="fa-solid fa-bed"></i> AFK Overworld
                          </span>
                        )}
                      </td>
                      <td>
                        <span style={{ 
                          fontFamily: 'JetBrains Mono, monospace', 
                          fontWeight: 700, 
                          color: isOnline ? '#48BB78' : '#A0AEC0' 
                        }}>
                          <i class="fa-solid fa-stopwatch" style={{ marginRight: '0.4rem', opacity: 0.7 }}></i>
                          {uptimeText}
                        </span>
                      </td>
                      <td>
                        <span class={`chakra-badge ${isOnline ? 'chakra-badge-green' : 'chakra-badge-red'}`}>
                          {b.status || 'OFFLINE'}
                        </span>
                      </td>
                      <td>
                        {b.bedPos ? `(${b.bedPos.x}, ${b.bedPos.y}, ${b.bedPos.z})` : 'Chưa set bed'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {/* Play & Stop Buttons */}
                        {isOnline ? (
                          <button 
                            class="chakra-btn" 
                            onClick={() => onStopBot(bKey)}
                            title="Dừng Bot & Out khỏi Server"
                            style={{ backgroundColor: '#E53E3E', color: '#FFF', padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                          >
                            <i class="fa-solid fa-square"></i> Stop
                          </button>
                        ) : (
                          <button 
                            class="chakra-btn chakra-btn-teal" 
                            onClick={() => onStartBot(bKey)}
                            title="Chạy Bot vào Server theo đúng Role"
                            style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                          >
                            <i class="fa-solid fa-play"></i> Play
                          </button>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div class="menu-container">
                          <button class="menu-btn" onClick={() => onToggleMenu(bKey)}>
                            <i class="fa-solid fa-ellipsis-vertical"></i>
                          </button>

                          {isMenuOpen && (
                            <div class="menu-dropdown">
                              <button 
                                class="menu-dropdown-item"
                                onClick={() => { onSetRole(bKey, 'AFK_OVERWORLD'); onToggleMenu(null); }}
                              >
                                <i class="fa-solid fa-bed" style={{ color: '#9F7AEA' }}></i>
                                <span>Set as AFK Overworld (Ngủ đêm)</span>
                              </button>

                              <button 
                                class="menu-dropdown-item"
                                onClick={() => { onSetRole(bKey, 'AFK_NON_OVERWORLD'); onToggleMenu(null); }}
                              >
                                <i class="fa-solid fa-cloud-moon" style={{ color: '#4299E1' }}></i>
                                <span>Set as AFK Non-Overworld (End/Nether)</span>
                              </button>

                              <button 
                                class="menu-dropdown-item"
                                onClick={() => { onSetRole(bKey, 'TIME_MANAGER'); onToggleMenu(null); }}
                              >
                                <i class="fa-solid fa-clock" style={{ color: '#ECC94B' }}></i>
                                <span>Set as Time Manager</span>
                              </button>

                              <button 
                                class="menu-dropdown-item"
                                onClick={() => { onSetRole(bKey, 'BUILDER'); onToggleMenu(null); }}
                              >
                                <i class="fa-solid fa-hammer" style={{ color: '#38B2AC' }}></i>
                                <span>Set as Bot Builder</span>
                              </button>

                              <div style={{ borderTop: '1px solid #4A5568', margin: '0.3rem 0' }}></div>

                              <button 
                                class="menu-dropdown-item"
                                onClick={() => { onDeleteBot(bKey); onToggleMenu(null); }}
                                style={{ color: '#F56565' }}
                              >
                                <i class="fa-solid fa-trash-can" style={{ color: '#F56565' }}></i>
                                <span>Xóa Bot Này</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ==========================================================================
// TAB 2: SHULKER MANAGER COMPONENT
// ==========================================================================
function ShulkerManagerTab({ shulkersData }) {
  return (
    <div class="chakra-card">
      <div class="chakra-card-header">
        <span class="chakra-card-title">
          <i class="fa-solid fa-boxes-stacked" style={{ color: '#4FD1C5' }}></i>
          Danh Sách Rương Shulker Box ({shulkersData.length})
        </span>
      </div>

      <div class="chakra-table-container">
        <table class="chakra-table">
          <thead>
            <tr>
              <th>ID Rương</th>
              <th>Ký Tự Gán</th>
              <th>Loại Block</th>
              <th>Tọa Độ (X, Y, Z)</th>
              <th>Số Lượng Còn Lại</th>
              <th>Trạng Thái</th>
            </tr>
          </thead>
          <tbody>
            {shulkersData.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: '#A0AEC0' }}>
                  Chưa có Shulker Box nào được quét. Bot khi set spawn point sẽ tự động quét Shulker box xung quanh!
                </td>
              </tr>
            ) : (
              shulkersData.map((s) => {
                const isAvailable = s.remainingBlocks > 0;
                const symbol = getCleanSymbol({ letterId: s.letterId });
                return (
                  <tr key={s.id}>
                    <td><strong>{s.name || s.id}</strong></td>
                    <td><span class="chakra-badge chakra-badge-blue" style={{ fontSize: '0.95rem', fontWeight: 800 }}>{symbol}</span></td>
                    <td>{s.blockType}</td>
                    <td>({s.pos?.x || 0}, {s.pos?.y || 172}, {s.pos?.z || 0})</td>
                    <td><strong>{s.remainingBlocks}</strong> / {s.initialCapacity}</td>
                    <td>
                      <span class={`chakra-badge ${isAvailable ? 'chakra-badge-green' : 'chakra-badge-red'}`}>
                        {isAvailable ? 'CÒN ITEM' : 'ĐÃ HẾT'}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ==========================================================================
// TAB 3: SHULKER MAP & BED UI (HIỂN THỊ TỪNG KÝ TỰ T, H, Ấ, T, N, G, H, I, Ệ, P)
// Global Cache nạp ảnh Minecraft texture
const textureCache = {};
function getLoadedTexture(src) {
  if (!textureCache[src]) {
    const img = new Image();
    img.src = src;
    textureCache[src] = img;
  }
  return textureCache[src];
}

// ==========================================================================
// COMPONENT VẼ ĐỒ HỌA TỌA ĐỘ KHÔNG GIAN GIƯỜNG (2 BLOCKS) & RƯƠNG SHULKER TEXTURE
// ==========================================================================
function SpatialShulkerMapCanvas({ letter, botState, shulkers }) {
  const canvasRef = useRef(null);

  const bedX = botState.bedPos?.x ?? letter.bed_pos?.x ?? 0;
  const bedZ = botState.bedPos?.z ?? letter.bed_pos?.z ?? 0;

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Pre-load các file texture thực tế từ thư mục /texture/
    const bedHeadImg = getLoadedTexture('/texture/orange_bed_head_up.png');
    const bedFootImg = getLoadedTexture('/texture/orange_bed_foot_up.png');
    const greenShulkerImg = getLoadedTexture('/texture/green_shulker_box.png');
    const redShulkerImg = getLoadedTexture('/texture/red_shulker_box.png');

    const renderCanvas = () => {
      const width = 280;
      const height = 210;
      canvas.width = width;
      canvas.height = height;

      const centerX = width / 2;
      const centerY = height / 2;

      let maxOffset = 5;
      shulkers.forEach(s => {
        if (!s.pos) return;
        const dx = Math.abs(Math.round(s.pos.x - bedX));
        const dz = Math.abs(Math.round(s.pos.z - bedZ));
        if (dx > maxOffset) maxOffset = dx;
        if (dz > maxOffset) maxOffset = dz;
      });

      const gridStep = Math.max(14, Math.min(18, Math.floor((Math.min(width, height) / 2 - 18) / Math.max(5, maxOffset))));

      // Background
      ctx.fillStyle = '#0B0F17';
      ctx.fillRect(0, 0, width, height);

      // Grid lines
      ctx.strokeStyle = '#1A202C';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += gridStep) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridStep) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Bán kính quét 5 blocks
      ctx.beginPath();
      ctx.arc(centerX, centerY, 5 * gridStep, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(79, 209, 197, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Tắt khử răng cưa để hiển thị ảnh texture chuẩn Minecraft pixel-art
      ctx.imageSmoothingEnabled = false;

      // 1. VẼ GIƯỜNG (BED) ĐỦ 2 BLOCKS (HEAD + FOOT)
      // Block 1: Head of Bed (Đầu Giường) tại (centerX - gridStep/2, centerY - gridStep)
      const headX = centerX - gridStep / 2;
      const headY = centerY - gridStep;
      if (bedHeadImg.complete && bedHeadImg.naturalWidth !== 0) {
        ctx.drawImage(bedHeadImg, headX, headY, gridStep, gridStep);
      } else {
        ctx.fillStyle = '#E53E3E';
        ctx.fillRect(headX, headY, gridStep, gridStep);
      }

      // Block 2: Foot of Bed (Chân Giường) tại (centerX - gridStep/2, centerY)
      const footX = centerX - gridStep / 2;
      const footY = centerY;
      if (bedFootImg.complete && bedFootImg.naturalWidth !== 0) {
        ctx.drawImage(bedFootImg, footX, footY, gridStep, gridStep);
      } else {
        ctx.fillStyle = '#C53030';
        ctx.fillRect(footX, footY, gridStep, gridStep);
      }

      // 2. VẼ RƯƠNG SHULKER BOX VỚI TEXTURE THỰC TẾ (/texture/green_shulker_box.png & red_shulker_box.png)
      shulkers.forEach((s, idx) => {
        if (!s.pos) return;
        const offsetX = Math.round(s.pos.x - bedX);
        const offsetZ = Math.round(s.pos.z - bedZ);

        const drawX = centerX + offsetX * gridStep - gridStep / 2;
        const drawY = centerY + offsetZ * gridStep - gridStep / 2;

        const hasItems = (s.remainingBlocks === undefined || s.remainingBlocks > 0);
        const textureImg = hasItems ? greenShulkerImg : redShulkerImg;

        // Aura phát sáng quanh rương
        ctx.fillStyle = hasItems ? 'rgba(72, 187, 120, 0.35)' : 'rgba(245, 101, 101, 0.35)';
        ctx.fillRect(drawX - 2, drawY - 2, gridStep + 4, gridStep + 4);

        // Vẽ ảnh Texture Rương Shulker
        if (textureImg.complete && textureImg.naturalWidth !== 0) {
          ctx.drawImage(textureImg, drawX, drawY, gridStep, gridStep);
        } else {
          ctx.fillStyle = hasItems ? '#38A169' : '#E53E3E';
          ctx.fillRect(drawX, drawY, gridStep, gridStep);
        }

        // Số thứ tự rương
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 4;
        ctx.fillText(`${idx + 1}`, drawX + gridStep / 2, drawY + gridStep / 2 + 3.5);
        ctx.shadowBlur = 0;
      });
    };

    renderCanvas();

    // Re-render khi ảnh texture nạp xong vào trình duyệt
    [bedHeadImg, bedFootImg, greenShulkerImg, redShulkerImg].forEach(img => {
      if (!img.complete) {
        img.onload = renderCanvas;
      }
    });
  }, [bedX, bedZ, shulkers]);

  return (
    <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
      <div style={{ fontSize: '0.75rem', color: '#4FD1C5', marginBottom: '0.25rem', fontWeight: 700 }}>
        🗺️ Bản Đồ Vị Trí Shulker Boxes (Bán kính 5m)
      </div>
      <canvas ref={canvasRef} style={{ width: '100%', maxWidth: '280px', height: 'auto', borderRadius: '8px', border: '1px solid #2D3748', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}></canvas>
    </div>
  );
}

// ==========================================================================
// TAB 3: SHULKER BED MAP TAB COMPONENT
// ==========================================================================
function ShulkerBedMapTab({ pixelData, shulkersData, botsData }) {
  const letters = pixelData?.letters || {};

  return (
    <div>
      <div class="chakra-card">
        <div class="chakra-card-header">
          <span class="chakra-card-title">
            <i class="fa-solid fa-map-location-dot" style={{ color: '#4FD1C5' }}></i>
            Bản Đồ Vị Trí Bed Spawn & Rương Shulker Box (Ký tự THẤT NGHIỆP)
          </span>
          <span style={{ fontSize: '0.85rem', color: '#A0AEC0', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span class="chakra-badge chakra-badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
              <img src="/texture/green_shulker_box.png" style={{ width: '18px', height: '18px', imageRendering: 'pixelated' }} />
              XANH = Còn Item
            </span>
            <span class="chakra-badge chakra-badge-red" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
              <img src="/texture/red_shulker_box.png" style={{ width: '18px', height: '18px', imageRendering: 'pixelated' }} />
              ĐỎ = Đã Hết Item
            </span>
          </span>
        </div>

        {/* 10 Position Cards for letters of "THẤT NGHIỆP" */}
        <div class="shulker-map-grid">
          {Object.keys(letters).map((letterId) => {
            const letter = letters[letterId];
            const symbol = getCleanSymbol({ ...letter, id: letterId });
            const botState = Object.values(botsData).find(b => b.assignedLetterId === letterId || b.id === letterId || b.letterId === letterId) || botsData[letterId] || {};
            
            // Tọa độ Bed làm mốc
            const bedX = botState.bedPos?.x ?? letter.bed_pos?.x;
            const bedZ = botState.bedPos?.z ?? letter.bed_pos?.z;

            // Lọc rương Shulker thuộc chữ này (Bán kính <= 5m tính từ Bed)
            const letterShulkers = shulkersData.filter(s => {
              if (!s.pos) return false;
              if (s.letterId === letterId) return true;
              if (bedX !== undefined && bedZ !== undefined) {
                const dist = Math.sqrt(Math.pow(s.pos.x - bedX, 2) + Math.pow(s.pos.z - bedZ, 2));
                return dist <= 5; // Bán kính chuẩn 5m
              }
              return false;
            });

            // Nếu bot quét được shulkerPos trực tiếp in-game
            const displayShulkers = [...letterShulkers];
            if (botState.shulkerPos && !displayShulkers.some(s => s.pos && s.pos.x === botState.shulkerPos.x && s.pos.z === botState.shulkerPos.z)) {
              displayShulkers.push({
                id: `in_game_${letterId}`,
                name: `Rương Quét In-Game (${botState.username})`,
                pos: botState.shulkerPos,
                remainingBlocks: 1728
              });
            }

            return (
              <div key={letterId} class="bed-map-card">
                {/* Bed Header with Real Bed Textures in Correct Orientation */}
                <div class="bed-header">
                  <div class="bed-title">
                    <div class="mc-bed-composite" title="Bed Spawnpoint">
                      <img src="/texture/orange_bed_head_up.png" class="bed-head-img" alt="Bed Head" />
                      <img src="/texture/orange_bed_foot_up.png" class="bed-foot-img" alt="Bed Foot" />
                    </div>
                    <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#4FD1C5', marginLeft: '0.25rem' }}>{symbol}</span>
                  </div>
                  <span class={`chakra-badge ${(botState.status && botState.status !== 'OFFLINE') ? 'chakra-badge-green' : 'chakra-badge-purple'}`}>
                    {botState.username || 'Bot Chưa Gán'}
                  </span>
                </div>

                <div style={{ fontSize: '0.85rem', color: '#CBD5E0' }}>
                  📍 Tọa độ Bed: <strong>({botState.bedPos?.x ?? letter.bed_pos?.x}, {botState.bedPos?.y ?? letter.bed_pos?.y}, {botState.bedPos?.z ?? letter.bed_pos?.z})</strong>
                  {botState.bedPos && <span class="chakra-badge chakra-badge-green" style={{ marginLeft: '0.5rem', fontSize: '0.75rem' }}>Đã Quét In-Game</span>}
                </div>

                {/* Bản đồ Đồ Họa Tọa Độ Không Gian Shulker & Bed (Tọa độ 1:1 chuẩn ô lưới) */}
                <SpatialShulkerMapCanvas letter={letter} botState={botState} shulkers={displayShulkers} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ==========================================================================
// TAB 4: CANVAS MAP COMPONENT
// ==========================================================================
function CanvasMapTab({ pixelData }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!pixelData || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    const width = 1200;
    const height = 480;

    canvas.width = width;
    canvas.height = height;

    // Background
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, width, height);

    // Tỷ lệ scale dựa trên kích thước gốc của ảnh (1800 x 800)
    const scaleX = width / 1800;
    const scaleY = height / 800;

    // Draw pixels
    if (pixelData.letters) {
      Object.values(pixelData.letters).forEach(l => {
        if (l.pixels) {
          l.pixels.forEach(p => {
            const x = (p.img_x !== undefined ? p.img_x : (p.x || 0)) * scaleX;
            const y = (p.img_y !== undefined ? p.img_y : (p.y || 0)) * scaleY;

            ctx.fillStyle = p.placed ? '#48BB78' : '#374151';
            ctx.fillRect(x, y, 2.5, 2.5);
          });
        }
      });
    }
  }, [pixelData]);

  let totalPixels = 0;
  let placedPixels = 0;
  if (pixelData && pixelData.letters) {
    Object.values(pixelData.letters).forEach(l => {
      totalPixels += l.totalPixels || 0;
      placedPixels += l.placedPixelsCount || 0;
    });
  }

  return (
    <div class="chakra-card">
      <div class="chakra-card-header">
        <span class="chakra-card-title">
          <i class="fa-solid fa-border-all" style={{ color: '#4FD1C5' }}></i>
          Bản Đồ Block Đã Đặt Real-Time (Text THẤT NGHIỆP - Tầng Y=172)
        </span>
        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem' }}>
          <span class="chakra-badge chakra-badge-green">
            🟢 Đã xây: {placedPixels.toLocaleString()} blocks
          </span>
          <span class="chakra-badge chakra-badge-purple">
            ⚪ Chưa xây: {(totalPixels - placedPixels).toLocaleString()} blocks
          </span>
        </div>
      </div>

      <div class="canvas-wrapper" style={{ display: 'flex', justifyContent: 'center', backgroundColor: '#0D1117', padding: '1rem', borderRadius: '8px' }}>
        <canvas ref={canvasRef} id="pixel-canvas" style={{ borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}></canvas>
      </div>
    </div>
  );
}

// ==========================================================================
// TAB 5: INVENTORY TAB COMPONENT (TÚI ĐỒ REALTIME CỦA BOT BUILDER)
// ==========================================================================
function InventoryTab({ botsData, pixelData }) {
  const letters = pixelData?.letters || {};

  return (
    <div>
      <div class="chakra-card">
        <div class="chakra-card-header">
          <span class="chakra-card-title">
            <i class="fa-solid fa-briefcase" style={{ color: '#4FD1C5' }}></i>
            Túi Đồ In-Game Realtime Của Các Bot Builder (Ký Tự THẤT NGHIỆP)
          </span>
        </div>

        <div class="shulker-map-grid">
          {Object.keys(letters).map((letterId) => {
            const letter = letters[letterId];
            const symbol = getCleanSymbol({ ...letter, id: letterId });
            const botState = Object.values(botsData).find(b => b.assignedLetterId === letterId || b.id === letterId || b.letterId === letterId) || botsData[letterId] || {};
            const items = botState.inventory || [];
            const isOnline = botState.status && botState.status !== 'OFFLINE';

            return (
              <div key={letterId} class="bed-map-card" style={{ background: '#111827', padding: '1rem', borderRadius: '12px', border: '1px solid #2D3748' }}>
                <div class="bed-header" style={{ marginBottom: '0.75rem', borderBottom: '1px solid #2D3748', paddingBottom: '0.5rem' }}>
                  <div class="bed-title">
                    <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#4FD1C5' }}>{symbol}</span>
                    <span style={{ fontSize: '0.9rem', color: '#A0AEC0', marginLeft: '0.5rem', fontWeight: 600 }}>
                      {botState.username || 'Bot Chưa Gán'}
                    </span>
                  </div>
                  <span class={`chakra-badge ${isOnline ? 'chakra-badge-green' : 'chakra-badge-purple'}`}>
                    {botState.status || 'OFFLINE'}
                  </span>
                </div>

                {/* Minecraft 36-Slot Inventory Grid (4 rows x 9 columns) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '4px', background: '#0D1117', padding: '8px', borderRadius: '8px', border: '1px solid #2D3748' }}>
                  {Array.from({ length: 36 }).map((_, slotIdx) => {
                    const item = items.find(i => i.slot === slotIdx || i.slot === (slotIdx < 9 ? slotIdx + 36 : slotIdx));
                    const isConcrete = item && item.name.includes('concrete');

                    return (
                      <div
                        key={slotIdx}
                        title={item ? `${item.displayName || item.name} (x${item.count})` : `Slot ${slotIdx + 1}`}
                        style={{
                          width: '100%',
                          aspectRatio: '1/1',
                          background: item ? (isConcrete ? 'rgba(72, 187, 120, 0.25)' : '#1F2937') : '#161E2E',
                          border: item ? (isConcrete ? '1px solid #38A169' : '1px solid #4A5568') : '1px solid #2D3748',
                          borderRadius: '4px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          position: 'relative',
                          overflow: 'hidden'
                        }}
                      >
                        {item ? (
                          <>
                            <span style={{ fontSize: '0.6rem', fontWeight: 700, color: isConcrete ? '#48BB78' : '#E2E8F0', textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '95%' }}>
                              {item.name.replace('_concrete', '').replace('pink', '🌸 Pink')}
                            </span>
                            <span style={{ position: 'absolute', bottom: '1px', right: '3px', fontWeight: 800, color: '#FFF', fontSize: '0.65rem', textShadow: '1px 1px 2px #000' }}>
                              {item.count}
                            </span>
                          </>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                <div style={{ fontSize: '0.75rem', color: '#A0AEC0', marginTop: '0.5rem', textAlign: 'right', fontWeight: 600 }}>
                  📦 Tổng item: <strong style={{ color: '#4FD1C5' }}>{items.reduce((acc, curr) => acc + (curr.count || 0), 0)}</strong> block
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ==========================================================================
// TAB 6: LIVE CONSOLE LOG TAB COMPONENT
// ==========================================================================
function ConsoleLogTab({ logs, logFilter, setLogFilter, onClearLogs }) {
  const filteredLogs = logs.filter(l => {
    if (logFilter === 'all') return true;
    return (l.type || 'info').toLowerCase() === logFilter;
  });

  return (
    <div class="chakra-card" style={{ minHeight: '600px', display: 'flex', flexDirection: 'column' }}>
      <div class="chakra-card-header">
        <span class="chakra-card-title">
          <i class="fa-solid fa-terminal" style={{ color: '#4FD1C5' }}></i>
          Full Live System Console Log Terminal
        </span>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {/* Log Filter Pills */}
          <button 
            class={`chakra-btn ${logFilter === 'all' ? 'chakra-btn-teal' : ''}`}
            onClick={() => setLogFilter('all')}
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
          >
            Tất Cả ({logs.length})
          </button>
          <button 
            class={`chakra-btn ${logFilter === 'info' ? 'chakra-btn-blue' : ''}`}
            onClick={() => setLogFilter('info')}
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
          >
            Info
          </button>
          <button 
            class={`chakra-btn ${logFilter === 'warning' ? 'chakra-btn-teal' : ''}`}
            onClick={() => setLogFilter('warning')}
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
          >
            Warning
          </button>
          <button 
            class={`chakra-btn ${logFilter === 'error' ? 'chakra-btn-teal' : ''}`}
            onClick={() => setLogFilter('error')}
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
          >
            Error
          </button>

          <button class="chakra-btn" onClick={onClearLogs} style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}>
            <i class="fa-solid fa-trash-can"></i>
            Xóa Log
          </button>
        </div>
      </div>

      <div class="chakra-console" style={{ flex: 1, maxHeight: '550px' }}>
        {filteredLogs.length === 0 ? (
          <div style={{ color: '#718096', padding: '1rem', textAlign: 'center' }}>
            Không có log nào phù hợp với bộ lọc hiện tại.
          </div>
        ) : (
          filteredLogs.map((l, idx) => (
            <div key={idx} class={`log-line-${l.type || 'info'}`}>
              [{l.timestamp}] [{ (l.type || 'INFO').toUpperCase() }] {l.message}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Render React App into DOM
ReactDOM.createRoot(document.getElementById('root')).render(<App />);

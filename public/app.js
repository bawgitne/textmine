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
  // Socket & State
  const [socket, setSocket] = useState(null);
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
  const [logFilter, setLogFilter] = useState('all');

  // Initialize Socket.io Connection
  useEffect(() => {
    const s = io();
    setSocket(s);

    s.on('connect', () => {
      console.log('[WEBSOCKET] Connected to Server!');
    });

    s.on('init_data', (data) => {
      setPixelData(data);
    });

    s.on('state_update', (state) => {
      if (state.bots) setBotsData(state.bots);
      if (state.shulkers) setShulkersData(state.shulkers);
      if (state.accounts) setAccountsData(state.accounts);
      if (state.timeKeeper) setTimeKeeperState(state.timeKeeper);
    });

    s.on('initial_logs', (initialLogs) => {
      setLogs(initialLogs || []);
    });

    s.on('system_log', (logEntry) => {
      setLogs(prev => [...prev.slice(-300), logEntry]);
    });

    s.on('pixel_update', ({ pixelIndex, placed }) => {
      setPixelData(prev => {
        if (!prev) return prev;
        const updated = { ...prev };
        Object.keys(updated.letters).forEach(lId => {
          const l = updated.letters[lId];
          const px = l.pixels.find(p => p.index === pixelIndex);
          if (px) {
            px.placed = placed;
            l.placedPixelsCount = l.pixels.filter(p => p.placed).length;
          }
        });
        return updated;
      });
    });

    return () => s.disconnect();
  }, []);

  // Action Menu Handlers
  const handleToggleMenu = (botId) => {
    setActiveMenuId(activeMenuId === botId ? null : botId);
  };

  // Role & Execution Handlers
  const handleSetRole = (botId, role) => {
    if (!socket) return;
    socket.emit('set_bot_role', { botId, role });
  };

  const handleStartBot = (botId) => {
    if (!socket) return;
    socket.emit('start_bot_role', botId);
  };

  const handleStopBot = (botId) => {
    if (!socket) return;
    socket.emit('stop_bot_role', botId);
  };

  const handleDeleteBot = (botId) => {
    if (!socket) return;
    socket.emit('delete_bot_account', botId);
  };

  // Add Account via Modal
  const handleAddAccountSubmit = (e) => {
    e.preventDefault();
    if (!newAccName.trim()) return;
    fetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: newAccName.trim() })
    }).then(() => {
      setNewAccName('');
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
          <i class="fa-solid fa-cube"></i>
          <h1>THẤT NGHIỆP</h1>
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
            class={`chakra-nav-item ${activeTab === 'logs' ? 'active' : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            <i class="fa-solid fa-terminal"></i>
            <span>5. Live Console Log</span>
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
                  const isOnline = b.status === 'ONLINE' || b.status === 'BUILDING' || b.status === 'MONITORING' || b.status === 'SLEEPING';
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
                    <td>({s.pos?.x || 0}, {s.pos?.y || 250}, {s.pos?.z || 0})</td>
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
            const botState = botsData[letterId] || {};
            
            // Filter shulkers associated with this letter
            const letterShulkers = shulkersData.filter(s => s.letterId === letterId);

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
                  <span class={`chakra-badge ${botState.status === 'BUILDING' ? 'chakra-badge-green' : 'chakra-badge-purple'}`}>
                    {botState.username || 'Bot Chưa Gán'}
                  </span>
                </div>

                <div style={{ fontSize: '0.85rem', color: '#CBD5E0' }}>
                  📍 Tọa độ Bed: <strong>({letter.bed_pos?.x}, {letter.bed_pos?.y}, {letter.bed_pos?.z})</strong>
                </div>

                {/* Nearby Shulkers List */}
                <div class="shulkers-list-container">
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#A0AEC0', textTransform: 'uppercase' }}>
                    Shulker Boxes Gần Bed:
                  </div>

                  {letterShulkers.length === 0 ? (
                    <div style={{ fontSize: '0.85rem', color: '#718096', fontStyle: 'italic' }}>
                      Chưa có Shulker Box nào được quét gần Bed này.
                    </div>
                  ) : (
                    letterShulkers.map(s => {
                      const hasItems = s.remainingBlocks > 0;
                      const textureSrc = hasItems ? '/texture/green_shulker_box.png' : '/texture/red_shulker_box.png';

                      return (
                        <div key={s.id} class={`shulker-box-ui ${hasItems ? 'status-green' : 'status-red'}`}>
                          <div class="shulker-info">
                            <span class="shulker-name" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                              <img src={textureSrc} style={{ width: '22px', height: '22px', imageRendering: 'pixelated' }} alt="Shulker Box" />
                              {s.name || s.id}
                            </span>
                            <span class="shulker-coords">📍 ({s.pos?.x}, {s.pos?.y}, {s.pos?.z})</span>
                          </div>
                          <div>
                            <strong>{s.remainingBlocks}</strong>/1728
                          </div>
                        </div>
                      );
                    })
                  )}
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
// TAB 4: CANVAS MAP COMPONENT
// ==========================================================================
function CanvasMapTab({ pixelData }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!pixelData || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    const width = pixelData.canvasWidth || 1200;
    const height = pixelData.canvasHeight || 400;

    canvas.width = width;
    canvas.height = height;

    // Background
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, width, height);

    // Draw pixels
    if (pixelData.letters) {
      Object.values(pixelData.letters).forEach(l => {
        if (l.pixels) {
          l.pixels.forEach(p => {
            ctx.fillStyle = p.placed ? '#48BB78' : '#2D3748';
            ctx.fillRect(p.x * 4, p.y * 4, 3, 3);
          });
        }
      });
    }
  }, [pixelData]);

  return (
    <div class="chakra-card">
      <div class="chakra-card-header">
        <span class="chakra-card-title">
          <i class="fa-solid fa-border-all" style={{ color: '#4FD1C5' }}></i>
          Bản Đồ Block Đã Đặt Real-Time (Text THẤT NGHIỆP)
        </span>
      </div>

      <div class="canvas-wrapper">
        <canvas ref={canvasRef} id="pixel-canvas"></canvas>
      </div>
    </div>
  );
}

// ==========================================================================
// TAB 5: LIVE CONSOLE LOG TAB COMPONENT
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

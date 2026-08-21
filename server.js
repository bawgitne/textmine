const express = require('express');
const http = require('http');
const path = require('path');

const { connectDB, getIsDBConnected } = require('./src/db');
const pixelEngine = require('./src/pixel_engine');
const shulkerManager = require('./src/shulker_manager');
const accountManager = require('./src/account_manager');
const progressManager = require('./src/progress_manager');
const configManager = require('./src/config_manager');
const botManager = require('./src/bot_manager');
const proxyManager = require('./src/proxy_manager');
const reverseTunnelServer = require('./src/reverse_tunnel_server');

const app = express();
const server = http.createServer(app);

// Railway cấp biến PORT tự động
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/texture', express.static(path.join(__dirname, 'texture')));

// Biến lưu trữ pixel data nạp từ ảnh
let globalPixelData = null;

// Route API kiểm tra sức khỏe server & trạng thái DB & trạng thái ESP32 Proxy
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    database: getIsDBConnected() ? 'ONLINE (MongoDB Atlas)' : 'OFFLINE (Local JSON Fallback)',
    esp32Proxy: reverseTunnelServer.getStatus(),
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Route lấy trạng thái ESP32 Proxy riêng biệt
app.get('/api/esp32-status', (req, res) => {
  res.json(reverseTunnelServer.getStatus());
});

// Route lấy toàn bộ trạng thái hệ thống
app.get('/api/state', (req, res) => {
  res.json(botManager.getState());
});

// Route lấy danh sách log hệ thống
app.get('/api/logs', (req, res) => {
  res.json(botManager.logs || []);
});

// Route lấy danh sách Proxy xoay từ proxy.md
app.get('/api/proxies', (req, res) => {
  res.json({
    count: proxyManager.proxies.length,
    currentIndex: proxyManager.currentIndex,
    proxies: proxyManager.loadProxies()
  });
});

// Route API Tài khoản (Accounts)
app.get('/api/accounts', (req, res) => {
  res.json(accountManager.getAllAccounts());
});

app.post('/api/accounts', async (req, res) => {
  const saved = await accountManager.saveAccount(req.body);
  botManager.registerBotAccount(saved);
  res.json(saved);
});

app.delete('/api/accounts/:id', async (req, res) => {
  await accountManager.deleteAccount(req.params.id);
  botManager.broadcastState();
  res.json({ success: true });
});

// Route lấy toàn bộ thông tin pixel và tiến độ
app.get('/api/pixels', (req, res) => {
  if (!globalPixelData) {
    return res.status(500).json({ error: 'Chưa tải được dữ liệu pixel.' });
  }
  res.json(globalPixelData);
});

// Route lấy danh sách Shulker Box
app.get('/api/shulkers', (req, res) => {
  res.json(shulkerManager.getAllShulkers());
});

// Route thêm Shulker Box mới
app.post('/api/shulkers', (req, res) => {
  const newShulker = shulkerManager.addShulker(req.body);
  botManager.broadcastState();
  res.json(newShulker);
});

// Route cập nhật thông tin Shulker Box
app.put('/api/shulkers/:id', (req, res) => {
  const updated = shulkerManager.updateShulker(req.params.id, req.body);
  botManager.broadcastState();
  res.json(updated);
});

// Route xóa Shulker Box
app.delete('/api/shulkers/:id', (req, res) => {
  shulkerManager.removeShulker(req.params.id);
  botManager.broadcastState();
  res.json({ success: true });
});

// Route xử lý toàn bộ các thao tác/hành động điều khiển REST API
app.post('/api/action', async (req, res) => {
  const { action, payload } = req.body || {};
  try {
    let result = { success: true };
    switch (action) {
      case 'login_account_bot':
        result = botManager.startAccountBot(payload);
        break;
      case 'auto_detect_nearest':
        result = botManager.autoDetectAndAssignNearestLetter(payload);
        break;
      case 'set_bed_spawnpoint':
        result = await botManager.findAndSetBedSpawnpoint(payload);
        break;
      case 'send_bot_command':
        result = botManager.sendCustomCommand(payload.botId, payload.command);
        break;
      case 'start_bot':
        botManager.startBot(payload);
        break;
      case 'stop_bot':
        botManager.stopBot(payload);
        break;
      case 'start_time_keeper':
        botManager.startTimeKeeper(payload);
        break;
      case 'stop_time_keeper':
        botManager.stopTimeKeeper();
        break;
      case 'update_tk_username':
        if (payload && typeof payload === 'string' && payload.trim()) {
          botManager.updateConfig({ timeKeeperUsername: payload.trim() });
        }
        break;
      case 'update_builder_username':
        botManager.updateBuilderUsername(payload.letterId || payload.id, payload.username);
        break;
      case 'set_bot_role':
        botManager.setBotRole(payload.botId, payload.role);
        break;
      case 'start_bot_role':
        botManager.startBotByRole(payload);
        break;
      case 'stop_bot_role':
        botManager.stopBotByRole(payload);
        break;
      case 'delete_bot_account':
        botManager.deleteBotAccount(payload);
        break;
      case 'set_time_keeper':
        result = botManager.setTimeKeeperBot(payload);
        break;
      case 'toggle_auto_night':
        botManager.updateConfig({ autoManageNight: !!payload });
        break;
      case 'add_afk_bot':
        botManager.addAfkBot(payload);
        break;
      case 'remove_afk_bot':
        botManager.removeAfkBot(payload);
        break;
      case 'start_all_bots':
        botManager.startAllBots();
        break;
      case 'stop_all_bots':
        botManager.stopAllBots();
        break;
      case 'toggle_simulation':
        botManager.toggleSimulation(payload);
        break;
      case 'start_all_simulations':
        botManager.startAllSimulations();
        break;
      case 'stop_all_simulations':
        botManager.stopAllSimulations();
        break;
      case 'update_config':
        botManager.updateConfig(payload);
        break;
      case 'reset_progress':
        await progressManager.resetAllProgress(globalPixelData);
        if (globalPixelData) {
          Object.keys(globalPixelData.letters).forEach((id) => {
            if (botManager.bots[id]) {
              botManager.bots[id].placedCount = 0;
              botManager.bots[id].status = 'OFFLINE';
            }
          });
        }
        botManager.broadcastState();
        break;
      default:
        return res.status(400).json({ error: `Lỗi: Hành động không hợp lệ (${action})` });
    }
    res.json(result || { success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Nạp dữ liệu pixel ảnh và khởi động HTTP Server
async function startServer() {
  try {
    await connectDB();
    if (getIsDBConnected()) {
      await accountManager.syncWithDB();
      await shulkerManager.syncWithDB();
      await configManager.syncWithDB();
      await progressManager.syncWithDB();
    }
    console.log('🔄 Đang phân tích file ảnh THẤT NGHIỆP.png...');
    globalPixelData = await pixelEngine.loadPixelData();
    progressManager.applyProgressToPixelData(globalPixelData);
    console.log(`✅ Phân tích thành công! Tổng cộng: ${globalPixelData.totalPixelsCount.toLocaleString()} pixels cho 10 chữ cái.`);

    botManager.init(null, globalPixelData);

    // Khởi động Reverse Tunnel Server chờ ESP32 SuperMini ở nhà kết nối
    reverseTunnelServer.start();

    server.listen(PORT, () => {
      console.log(`===================================================`);
      console.log(`🚀 Server đã khởi động thành công trên cổng ${PORT} (Chế độ REST API)`);
      console.log(`🌐 Dashboard: http://localhost:${PORT}`);
      console.log(`☁️ Đã sẵn sàng deploy trực tiếp lên Railway!`);
      console.log(`===================================================`);
    });
  } catch (err) {
    console.error('❌ Lỗi khi khởi động server:', err);
  }
}

startServer();

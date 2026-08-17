const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const { connectDB } = require('./src/db');
const pixelEngine = require('./src/pixel_engine');
const shulkerManager = require('./src/shulker_manager');
const accountManager = require('./src/account_manager');
const botManager = require('./src/bot_manager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Railway cấp biến PORT tự động
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/texture', express.static(path.join(__dirname, 'texture')));

// Biến lưu trữ pixel data nạp từ ảnh
let globalPixelData = null;

// Route API kiểm tra sức khỏe server
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
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

// Socket.io Realtime Events
io.on('connection', (socket) => {
  console.log(`[WEBSOCKET] Client kết nối: ${socket.id}`);

  // Gửi toàn bộ trạng thái hiện tại và lịch sử log khi client mở trang web
  if (globalPixelData) {
    socket.emit('init_data', globalPixelData);
  }
  socket.emit('initial_logs', botManager.logs || []);
  botManager.broadcastState();


  // Sự kiện từ Dashboard Web
  socket.on('login_account_bot', (accData) => {
    const result = botManager.startAccountBot(accData);
    socket.emit('login_account_bot_result', result);
  });

  socket.on('auto_detect_nearest', (letterId) => {
    const result = botManager.autoDetectAndAssignNearestLetter(letterId);
    socket.emit('auto_detect_result', result);
  });

  socket.on('set_bed_spawnpoint', async (letterId) => {
    const result = await botManager.findAndSetBedSpawnpoint(letterId);
    socket.emit('set_bed_spawnpoint_result', result);
  });

  socket.on('send_bot_command', ({ botId, command }) => {
    const result = botManager.sendCustomCommand(botId, command);
    socket.emit('send_bot_command_result', result);
  });

  socket.on('start_bot', (letterId) => {
    // Mỗi thẻ builder đã đại diện cho một chữ do người dùng chọn.
    botManager.startBot(letterId);
  });


  socket.on('stop_bot', (letterId) => {
    botManager.stopBot(letterId);
  });

  socket.on('start_time_keeper', (customUsername) => {
    botManager.startTimeKeeper(customUsername);
  });

  socket.on('stop_time_keeper', () => {
    botManager.stopTimeKeeper();
  });

  socket.on('update_tk_username', (newUsername) => {
    if (newUsername && typeof newUsername === 'string' && newUsername.trim()) {
      botManager.timeKeeper.username = newUsername.trim();
      botManager.broadcastState();
    }
  });

  socket.on('update_builder_username', ({ letterId, username }) => {
    botManager.updateBuilderUsername(letterId, username);
  });


  socket.on('set_bot_role', ({ botId, role }) => {
    botManager.setBotRole(botId, role);
  });

  socket.on('start_bot_role', (botId) => {
    botManager.startBotByRole(botId);
  });

  socket.on('stop_bot_role', (botId) => {
    botManager.stopBotByRole(botId);
  });

  socket.on('delete_bot_account', (botId) => {
    botManager.deleteBotAccount(botId);
  });

  socket.on('set_time_keeper', (botId) => {
    const result = botManager.setTimeKeeperBot(botId);
    socket.emit('set_time_keeper_result', result);
  });

  socket.on('toggle_auto_night', (enabled) => {
    botManager.timeKeeper.autoManageNight = enabled;
    botManager.broadcastState();
  });


  socket.on('add_afk_bot', (username) => {
    botManager.addAfkBot(username);
  });

  socket.on('remove_afk_bot', (username) => {
    botManager.removeAfkBot(username);
  });

  socket.on('update_builder_username', (data) => {
    if (data && data.letterId && data.username) {
      botManager.updateBuilderUsername(data.letterId, data.username);
    }
  });

  socket.on('start_all_bots', () => {
    botManager.startAllBots();
  });



  socket.on('stop_all_bots', () => {
    botManager.stopAllBots();
  });

  socket.on('toggle_simulation', (letterId) => {
    botManager.toggleSimulation(letterId);
  });

  socket.on('start_all_simulations', () => {
    botManager.startAllSimulations();
  });

  socket.on('stop_all_simulations', () => {
    botManager.stopAllSimulations();
  });

  socket.on('update_config', (newConfig) => {
    botManager.updateConfig(newConfig);
  });

  socket.on('reset_progress', async () => {
    if (globalPixelData) {
      Object.keys(globalPixelData.letters).forEach((id) => {
        const letter = globalPixelData.letters[id];
        letter.placedPixelsCount = 0;
        letter.pixels.forEach(p => p.placed = false);
        if (botManager.bots[id]) {
          botManager.bots[id].placedCount = 0;
          botManager.bots[id].status = 'OFFLINE';
        }
      });
      io.emit('init_data', globalPixelData);
      botManager.broadcastState();
    }
  });

  socket.on('disconnect', () => {
    console.log(`[WEBSOCKET] Client ngắt kết nối: ${socket.id}`);
  });
});

// Nạp dữ liệu pixel ảnh và khởi động HTTP Server
async function startServer() {
  try {
    await connectDB();
    console.log('🔄 Đang phân tích file ảnh THẤT NGHIỆP.png...');
    globalPixelData = await pixelEngine.loadPixelData();
    console.log(`✅ Phân tích thành công! Tổng cộng: ${globalPixelData.totalPixelsCount.toLocaleString()} pixels cho 10 chữ cái.`);

    botManager.init(io, globalPixelData);

    server.listen(PORT, () => {
      console.log(`===================================================`);
      console.log(`🚀 Web Dashboard server đã chạy trên cổng ${PORT}`);
      console.log(`🌐 Truy cập local: http://localhost:${PORT}`);
      console.log(`☁️ Đã sẵn sàng deploy trực tiếp lên Railway!`);
      console.log(`===================================================`);
    });
  } catch (err) {
    console.error('❌ Lỗi khi khởi động server:', err);
  }
}

startServer();

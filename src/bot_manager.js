const mineflayer = require('mineflayer');
const vec3 = require('vec3');
const { pathfinder, Movements } = require('mineflayer-pathfinder');
const shulkerManager = require('./shulker_manager');
const BuilderEngine = require('./builder_engine');
const configManager = require('./config_manager');
const { findNearestLetter } = require('./letter_assignment');
const { getBuilderAssignment } = require('./builder_assignments');
const { isDayTime, ticksToClock, normalizeTime } = require('./time_utils');

class BotManager {
  constructor() {
    this.bots = {}; // id -> bot instance & state
    this.afkBots = {};
    this.io = null;
    this.pixelData = null;
    this.shulkerManager = shulkerManager;
    this.builderEngine = new BuilderEngine(this);
    this.nightPausedBuilders = new Set();
    this.timeListenerBots = new WeakSet();
    this.logs = []; // Log buffer lưu 200 dòng log gần nhất
    this.config = configManager.getConfig();
  }

  // Hàm ghi log tập trung và phát tín hiệu realtime về Web Dashboard
  log(type, message) {
    const timeStr = new Date().toLocaleTimeString('vi-VN');
    const logEntry = {
      timestamp: timeStr,
      type: type, // 'info' | 'success' | 'warning' | 'error'
      message: message
    };

    this.logs.push(logEntry);
    if (this.logs.length > 300) {
      this.logs.shift(); // Giữ tối đa 300 log gần nhất
    }

    console.log(`[${timeStr}] [${type.toUpperCase()}] ${message}`);

    if (this.io) {
      this.io.emit('system_log', logEntry);
    }
  }


  init(io, pixelData) {
    this.io = io;
    this.pixelData = pixelData;

    // Danh sách bot đăng ký mặc định là rỗng. Chỉ hiển thị các bot người dùng tự đăng ký!
    this.bots = {};

    // Danh sách các Bot AFK tùy chỉnh username
    this.afkBots = {};

    const cfg = configManager.getConfig();
    this.config = cfg;

    // Thêm Bot chuyên trách theo dõi thời gian Day/Night
    this.timeKeeper = {
      username: cfg.timeKeeperUsername || 'XinChiDungDi',
      status: 'OFFLINE',
      timeOfDay: 0,
      isDay: true,
      autoManageNight: cfg.autoManageNight !== false,
      dimension: 'unknown',
      botInstance: null,
      antiAfkInterval: null
    };

    // Load saved accounts from accountManager into this.bots
    const savedAccounts = this.shulkerManager ? require('./account_manager').getAllAccounts() : [];
    savedAccounts.forEach(acc => {
      if (acc.username) {
        this.bots[acc.id || acc.username] = {
          id: acc.id || acc.username,
          username: acc.username,
          password: acc.password || '1234',
          role: acc.role || 'BUILDER',
          status: 'OFFLINE',
          assignedLetterId: acc.assignedLetterId || null,
          placedCount: 0,
          totalCount: 0,
          bedPos: acc.bedPos || null,
          shulkerId: null,
          botInstance: null
        };
      }
    });
  }

  // Cập nhật tùy chỉnh Username cho Bot Builder
  updateBuilderUsername(letterId, newUsername) {
    if (this.bots[letterId] && newUsername && newUsername.trim() !== '') {
      this.bots[letterId].username = newUsername.trim();
      this.broadcastState();
    }
  }

  // Đăng ký Bot mới từ Modal Pop-up (Password mặc định là 1234)
  registerBotAccount(accData) {
    const username = (accData.username || '').trim();
    if (!username) return;

    const botId = accData.id || username;
    this.bots[botId] = {
      id: botId,
      username: username,
      password: accData.password || '1234',
      role: accData.role || 'AFK_OVERWORLD', // 'AFK_OVERWORLD' | 'AFK_NON_OVERWORLD' | 'TIME_MANAGER' | 'BUILDER'
      status: 'OFFLINE',
      assignedLetterId: accData.assignedLetterId || null,
      placedCount: 0,
      totalCount: 0,
      bedPos: accData.bedPos || null,
      shulkerId: null,
      botInstance: null
    };

    // Đảm bảo lưu vào MongoDB Atlas và đĩa ngay lập tức
    const accountManager = require('./account_manager');
    accountManager.saveAccount(this.bots[botId]);

    this.log('success', `✅ Đã đăng ký thành công Bot [${username}] (Pass: ${accData.password || '1234'})!`);
    this.broadcastState();
  }

  // Xóa Bot khỏi hệ thống
  deleteBotAccount(botId) {
    const botState = this.bots[botId];
    if (botState) {
      if (botState.botInstance) {
        try { botState.botInstance.end(); } catch (e) {}
      }
      if (this.afkBots[botState.username]) {
        this.removeAfkBot(botState.username);
      }
      delete this.bots[botId];
      
      const accountManager = require('./account_manager');
      accountManager.deleteAccount(botId);

      this.log('warning', `🗑️ Đã xóa Bot [${botState.username}] khỏi hệ thống.`);
      this.broadcastState();
    }
  }

  // Gán Role cho Bot (AFK_OVERWORLD, AFK_NON_OVERWORLD, TIME_MANAGER hoặc BUILDER)
  setBotRole(botId, role) {
    const botState = this.bots[botId];
    if (!botState) return;

    botState.role = role;
    
    // Lưu lại thông tin role vào disk
    const accountManager = require('./account_manager');
    accountManager.saveAccount({
      id: botId,
      username: botState.username,
      password: botState.password || '1234',
      role: role,
      assignedLetterId: botState.assignedLetterId,
      bedPos: botState.bedPos
    });

    if (role === 'TIME_MANAGER') {
      this.timeKeeper.username = botState.username;
      this.timeKeeper.password = botState.password || '1234';
      this.log('warning', `⭐ Đã đặt Bot [${botState.username}] làm TIME MANAGER. Bấm nút Play ▶ để chạy!`);
    } else if (role === 'BUILDER') {
      this.log('info', `🏗️ Đã đặt Bot [${botState.username}] làm BOT BUILDER. Bấm nút Play ▶ để chạy!`);
    } else if (role === 'AFK_OVERWORLD') {
      this.log('info', `🛌 Đã đặt Bot [${botState.username}] làm BOT AFK OVERWORLD. Bấm nút Play ▶ để chạy!`);
    } else if (role === 'AFK_NON_OVERWORLD') {
      this.log('info', `🌌 Đã đặt Bot [${botState.username}] làm BOT AFK THE END/NETHER. Bấm nút Play ▶ để chạy!`);
    }
    this.broadcastState();
  }

  // Khởi chạy Bot theo đúng Role (Play button ▶)
  startBotByRole(botId) {
    const botState = this.bots[botId];
    if (!botState) return;

    if (botState.role === 'TIME_MANAGER') {
      this.log('info', `▶ [PLAY] Đang khởi động Bot TimeManager [${botState.username}] vào server...`);
      this.startTimeKeeper(botState.username);
      botState.status = 'ONLINE';
    } else if (botState.role === 'BUILDER') {
      this.log('info', `▶ [PLAY] Đang khởi động Bot Builder [${botState.username}] vào server...`);
      this.startBot(botId, { username: botState.username, password: botState.password || '1234' });
    } else {
      // Role AFK Overworld hoặc AFK Non-Overworld
      this.log('info', `▶ [PLAY] Đang khởi động Bot AFK [${botState.username}] (${botState.role})...`);
      this.addAfkBot(botState.username, botState.password || '1234');
      botState.status = 'ONLINE';
    }
    this.broadcastState();
  }

  // Dừng Bot & cho out khỏi server (Stop button ⏹)
  stopBotByRole(botId) {
    const botState = this.bots[botId];
    if (!botState) return;

    if (botState.role === 'TIME_MANAGER' || botState.username === this.timeKeeper.username) {
      this.stopTimeKeeper();
      botState.status = 'OFFLINE';
      this.log('warning', `⏹ [STOP] Đã dừng Bot TimeManager [${botState.username}] và out khỏi server.`);
    } else if (botState.role === 'BUILDER') {
      this.stopBot(botId);
      botState.status = 'OFFLINE';
      this.log('warning', `⏹ [STOP] Đã dừng Bot Builder [${botState.username}] và out khỏi server.`);
    } else {
      // Role AFK
      this.removeAfkBot(botState.username);
      botState.status = 'OFFLINE';
      this.log('warning', `⏹ [STOP] Đã dừng Bot AFK [${botState.username}] và out khỏi server.`);
    }
    this.broadcastState();
  }

  // Thêm Bot AFK với Username & Password tùy chỉnh
  addAfkBot(username, password = '1234') {
    const cleanName = (username || '').trim();
    if (!cleanName) return;

    if (this.afkBots[cleanName]) {
      console.log(`[AFK BOT] Bot AFK '${cleanName}' đã tồn tại!`);
      return;
    }

    const afkState = {
      username: cleanName,
      password: password || '1234',
      status: 'CONNECTING',
      botInstance: null,
      antiAfkInterval: null
    };

    this.afkBots[cleanName] = afkState;

    // Lưu bot AFK vào Account Model (MongoDB & Disk)
    const accountManager = require('./account_manager');
    accountManager.saveAccount({
      id: cleanName,
      username: cleanName,
      password: password || '1234',
      role: 'AFK_OVERWORLD'
    });

    this.broadcastState();

    try {
      const bot = mineflayer.createBot({
        host: this.config.host,
        port: this.config.port,
        username: cleanName,
        version: this.config.version || '1.21.11'
      });

      bot.loadPlugin(pathfinder);
      afkState.botInstance = bot;

      // Đăng ký listener theo dõi thời gian và quản lý đêm tự động
      this.attachTimeKeeperListeners(bot);

      // Auto-auth listener cho AFK Bot
      const tryAutoAuth = (rawText) => {
        if (!rawText) return;
        const lower = rawText.toString().toLowerCase();
        const pass = afkState.password || '1234';

        if (lower.includes('register') || lower.includes('đăng ký') || lower.includes('dang ky') || lower.includes('nhap lai mat khau')) {
          this.log('warning', `🔐 Server yêu cầu Đăng Ký cho [${cleanName}]. Tự động gửi: /register ${pass} ${pass}`);
          setTimeout(() => { try { bot.chat(`/register ${pass} ${pass}`); } catch (e) {} }, 800);
        } else if (lower.includes('login') || lower.includes('đăng nhập') || lower.includes('dang nhap') || lower.includes('nhap mat khau')) {
          this.log('info', `🔑 Server yêu cầu Đăng Nhập cho [${cleanName}]. Tự động gửi: /login ${pass}`);
          setTimeout(() => { try { bot.chat(`/login ${pass}`); } catch (e) {} }, 800);
        }
      };

      bot.on('spawn', () => {
        // Bỏ qua event trễ từ một connection đã bị người dùng bấm Stop/thay thế.
        if (afkState.botInstance !== bot) {
          try { bot.quit('Connection was stopped'); } catch (e) {}
          return;
        }
        this.log('success', `[AFK BOT ${cleanName}] Đã vào game treo AFK thành công!`);
        afkState.status = 'AFK_ONLINE';

        // 1. Tự động gửi lệnh /login 1234 sau 1.2s khi spawn
        const pass = afkState.password || '1234';
        setTimeout(() => {
          try {
            bot.chat(`/login ${pass}`);
            this.log('info', `🔑 [AFK BOT ${cleanName}] Gửi lệnh đăng nhập: /login ${pass}`);
          } catch (e) {}
        }, 1200);

        // 2. Quét Giường xung quanh & Thử đi ngủ qua đêm nếu hiện tại đang là ban đêm (sau 2.5s)
        setTimeout(() => {
          if (!afkState.botInstance) return;

          const bedBlock = bot.findBlock({
            matching: (b) => b && b.name && b.name.includes('bed') && !b.name.includes('bedrock'),
            maxDistance: 32
          });

          if (bedBlock) {
            const dist = bot.entity.position.distanceTo(bedBlock.position);
            this.log('success', `🛏️ [AFK BOT ${cleanName}] Phát hiện Giường '${bedBlock.name}' tại (${bedBlock.position.x}, ${bedBlock.position.y}, ${bedBlock.position.z}) (cách ${dist.toFixed(1)}m)!`);
            afkState.bedPos = { x: bedBlock.position.x, y: bedBlock.position.y, z: bedBlock.position.z };
          } else {
            const pos = bot.entity ? bot.entity.position : null;
            const posStr = pos ? `(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})` : 'chưa rõ';
            this.log('warning', `⚠️ [AFK BOT ${cleanName}] Tại ${posStr} KHÔNG tìm thấy chiếc Giường nào trong bán kính 32m!`);
          }

          if (bot.time) {
            const timeOfDay = normalizeTime(bot.time.timeOfDay || 0);
            const isDay = isDayTime(timeOfDay);
            if (!isDay) {
              this.log('info', `🌙 [AFK BOT ${cleanName}] Hiện tại đang là BAN ĐÊM (${timeOfDay} ticks). Đang tiến hành đi ngủ qua đêm...`);
              this.tryBotSleep(bot, cleanName, Date.now());
            } else {
              this.log('info', `☀️ [AFK BOT ${cleanName}] Hiện tại đang là BAN NGÀY (${timeOfDay} ticks). Sẵn sàng ngủ khi trời tối.`);
            }
          } else {
            this.tryBotSleep(bot, cleanName, Date.now());
          }
        }, 2500);

        // Anti-AFK: Quay mặt & vẫy tay nhẹ mỗi 20 giây để duy trì kết nối
        afkState.antiAfkInterval = setInterval(() => {
          if (bot && bot.entity) {
            try {
              bot.swingArm('right');
            } catch (e) {}
          }
        }, 20000);

        this.broadcastState();
      });

      bot.on('message', (jsonMsg) => tryAutoAuth(jsonMsg.toString()));
      bot.on('title', (titleText) => tryAutoAuth(titleText));
      bot.on('actionbar', (jsonMsg) => tryAutoAuth(jsonMsg.toString()));

      bot.on('end', () => {
        console.log(`[AFK BOT ${cleanName}] Đã ngắt kết nối.`);
        if (afkState.antiAfkInterval) clearInterval(afkState.antiAfkInterval);
        afkState.status = 'OFFLINE';
        afkState.botInstance = null;
        this.broadcastState();
      });

      bot.on('error', (err) => {
        console.error(`[AFK BOT ${cleanName}] Lỗi:`, err.message);
        afkState.status = 'ERROR';
        this.broadcastState();
      });

    } catch (e) {
      console.error(`[AFK BOT ${cleanName}] Không thể kết nối:`, e);
      afkState.status = 'OFFLINE';
      this.broadcastState();
    }
  }

  // Xóa / Ngắt kết nối Bot AFK
  removeAfkBot(username) {
    const afkState = this.afkBots[username];
    if (afkState) {
      if (afkState.antiAfkInterval) clearInterval(afkState.antiAfkInterval);
      if (afkState.botInstance) {
        try { afkState.botInstance.end(); } catch (e) {}
      }
      delete this.afkBots[username];
      this.broadcastState();
    }
  }

  // Gán bất kỳ Bot nào làm Bot quản lý thời gian (Time Manager)
  setTimeKeeperBot(botIdOrUsername) {
    let targetBot = null;
    let botKey = null;

    if (this.bots[botIdOrUsername]) {
      targetBot = this.bots[botIdOrUsername];
      botKey = botIdOrUsername;
    } else {
      const foundKey = Object.keys(this.bots).find(k => this.bots[k].username === botIdOrUsername);
      if (foundKey) {
        targetBot = this.bots[foundKey];
        botKey = foundKey;
      }
    }

    if (!targetBot) {
      // Kiểm tra trong AFK bots
      if (this.afkBots[botIdOrUsername]) {
        targetBot = this.afkBots[botIdOrUsername];
        botKey = botIdOrUsername;
      }
    }

    if (!targetBot) {
      this.log('error', `Không tìm thấy bot '${botIdOrUsername}' để gán làm Time Manager!`);
      return { success: false, error: 'Không tìm thấy Bot' };
    }

    this.timeKeeper.activeBotKey = botKey;
    this.timeKeeper.username = targetBot.username;
    this.log('success', `⭐ Đã chọn Bot [${targetBot.username}] làm Time Manager quản lý thời gian In-Game!`);

    // Gán listener theo dõi thời gian nếu bot này đang kết nối trong game
    if (targetBot.botInstance) {
      this.attachTimeKeeperListeners(targetBot.botInstance);
    }

    this.broadcastState();
    return { success: true, username: targetBot.username };
  }

  attachTimeKeeperListeners(bot) {
    if (!bot || this.timeListenerBots.has(bot)) return;
    this.timeListenerBots.add(bot);

    bot.on('time', () => {
      if (!bot.time) return;
      const timeOfDay = normalizeTime(bot.time.timeOfDay || 0);
      const isDay = isDayTime(timeOfDay);
      
      const prevIsDay = this.timeKeeper.isDay;
      this.timeKeeper.timeOfDay = timeOfDay;
      this.timeKeeper.isDay = isDay;

      // Xử lý khi tự động quản lý ban đêm
      if (this.timeKeeper.autoManageNight) {
        if (!isDay) {
          // Nếu trời tối: Liên tục kiểm tra & cho Bot tìm giường đi ngủ ngay lập tức
          if (prevIsDay) {
            this.log('warning', `🌙 Trời đã TỐI (time=${timeOfDay}). Tiến hành cho Bot đi ngủ ngay lập tức (1 người ngủ qua đêm, Builder không out)...`);
          }
          this.handleNightTime(bot);
        } else if (!prevIsDay && isDay) {
          this.log('success', `☀️ Trời đã SÁNG (time=${timeOfDay}).`);
          this.handleDayTime();
        }
      }

      this.broadcastState();
    });
  }


  // Khởi chạy Bot theo dõi thời gian riêng biệt
  startTimeKeeper(customUsername = null) {
    if (customUsername && typeof customUsername === 'string' && customUsername.trim()) {
      this.timeKeeper.username = customUsername.trim();
    }

    if (this.timeKeeper.botInstance) {
      try { this.timeKeeper.botInstance.end(); } catch (e) {}
    }

    this.timeKeeper.status = 'CONNECTING';
    this.broadcastState();

    try {
      let mcVersion = this.config.version;
      if (!mcVersion || mcVersion.includes('26.') || mcVersion === 'auto') {
        mcVersion = false;
      }

      const bot = mineflayer.createBot({
        host: this.config.host,
        port: this.config.port,
        username: this.timeKeeper.username,
        version: mcVersion
      });


      this.timeKeeper.botInstance = bot;

      // Bộ tự động đăng ký (/register) & đăng nhập (/login) thông minh cho TimeKeeper
      const tryAutoAuth = (rawText) => {
        if (!rawText) return;
        const lower = rawText.toString().toLowerCase();
        const pass = this.timeKeeper.password || '1234';

        if (lower.includes('/register') || lower.includes('vui long dang ky') || lower.includes('nhap lai mat khau')) {
          this.log('warning', `🔐 Server yêu cầu Đăng Ký cho Bot TimeKeeper [${this.timeKeeper.username}]. Gửi: /register ${pass} ${pass}`);
          setTimeout(() => {
            try { bot.chat(`/register ${pass} ${pass}`); } catch (e) {}
          }, 800);
        } else if (lower.includes('/login') || lower.includes('vui long dang nhap') || lower.includes('nhap mat khau') || lower.includes('login')) {
          this.log('info', `🔑 Server yêu cầu Đăng Nhập cho Bot TimeKeeper [${this.timeKeeper.username}]. Gửi: /login ${pass}`);
          setTimeout(() => {
            try { bot.chat(`/login ${pass}`); } catch (e) {}
          }, 800);
        }
      };

      bot.on('spawn', () => {
        this.log('success', `Bot TimeKeeper [${this.timeKeeper.username}] đã vào game! Host: ${this.config.host}:${this.config.port}`);
        this.timeKeeper.status = 'MONITORING';
        this.timeKeeper.dimension = bot.game && bot.game.dimension ? String(bot.game.dimension) : 'unknown';
        this.attachTimeKeeperListeners(bot);
        this.broadcastState();

        const pass = this.timeKeeper.password || '1234';
        // Với tài khoản đã đăng ký sẵn: Gửi duy nhất lệnh /login 1234 sau 1.2 giây
        setTimeout(() => {
          try {
            bot.chat(`/login ${pass}`);
            this.log('info', `🔑 [TimeKeeper ${this.timeKeeper.username}] Gửi lệnh đăng nhập: /login ${pass}`);
          } catch (e) {}
        }, 1200);

        // TimeKeeper đã được đặt sẵn ở The End. Nó chỉ treo máy, chống AFK và đọc tick; không tự chạy lệnh dịch chuyển.
        this.log('info', `🌌 [TimeKeeper ${this.timeKeeper.username}] Treo tại vị trí hiện tại để đọc thời gian game; không gửi lệnh vào End.`);

        if (this.timeKeeper.antiAfkInterval) clearInterval(this.timeKeeper.antiAfkInterval);
        this.timeKeeper.antiAfkInterval = setInterval(() => {
          if (!this.timeKeeper.botInstance || !bot.entity) return;
          try {
            bot.swingArm('right');
            bot.look(bot.entity.yaw + 0.15, bot.entity.pitch, true);
          } catch (e) {}
        }, this.config.timeKeeperAntiAfkMs);

        // Chat thông báo thời gian hiện tại sau 3.5 giây
        setTimeout(() => {
          if (bot.time) {
            const ticks = bot.time.timeOfDay || 0;
            const isDay = isDayTime(ticks);
            const clockStr = ticksToClock(ticks);
            
            const chatMsg = `[TimeKeeper] Đã kết nối! Thời gian In-Game hiện tại: ${clockStr} (${ticks} ticks) - ${isDay ? '☀️ TRỜI SÁNG' : '🌙 TRỜI TỐI'}`;
            try {
              bot.chat(chatMsg);
              this.log('info', `💬 Bot TimeKeeper [${this.timeKeeper.username}] đã chat: "${chatMsg}"`);
            } catch (e) {}
          }
        }, 3500);
      });

      bot.on('game', () => {
        this.timeKeeper.dimension = bot.game && bot.game.dimension ? String(bot.game.dimension) : 'unknown';
        this.broadcastState();
      });


      // Lắng nghe tín hiệu yêu cầu Auth từ cả Chat, Title và Actionbar cho TimeKeeper
      bot.on('message', (jsonMsg) => tryAutoAuth(jsonMsg.toString()));
      bot.on('title', (titleText) => tryAutoAuth(titleText));
      bot.on('actionbar', (jsonMsg) => tryAutoAuth(jsonMsg.toString()));

      bot.on('kicked', (reason) => {
        this.log('error', `Bot TimeKeeper [${this.timeKeeper.username}] bị kick khỏi server: ${reason}`);
      });

      bot.on('end', () => {
        if (this.timeKeeper.antiAfkInterval) clearInterval(this.timeKeeper.antiAfkInterval);
        this.timeKeeper.antiAfkInterval = null;
        this.log('warning', `Bot TimeKeeper [${this.timeKeeper.username}] đã ngắt kết nối.`);
        this.timeKeeper.status = 'OFFLINE';
        this.timeKeeper.botInstance = null;
        this.broadcastState();
      });

      bot.on('error', (err) => {
        this.log('error', `Bot TimeKeeper [${this.timeKeeper.username}] gặp lỗi: ${err.message}`);
        this.timeKeeper.status = 'ERROR';
        this.broadcastState();
      });


    } catch (e) {
      this.log('error', `Không thể khởi tạo Bot TimeKeeper: ${e.message}`);
      this.timeKeeper.status = 'OFFLINE';
      this.broadcastState();
    }
  }

  stopTimeKeeper() {
    if (this.timeKeeper.antiAfkInterval) clearInterval(this.timeKeeper.antiAfkInterval);
    this.timeKeeper.antiAfkInterval = null;
    if (this.timeKeeper.botInstance) {
      this.timeKeeper.botInstance.end();
      this.timeKeeper.botInstance = null;
    }
    this.timeKeeper.status = 'OFFLINE';
    this.broadcastState();
  }

  // Thử cho một bot đi ngủ nếu phát hiện giường gần đó (bán kính 32m)
  async tryBotSleep(bot, username, now) {
    if (!bot || !bot.entity || bot.isSleeping) {
      if (bot && bot.isSleeping) {
        this.log('info', `😴 [NIGHT] Bot [${username}] đã ở trạng thái ĐANG NGỦ.`);
      }
      return;
    }

    // Cooldown: Giới hạn thử ngủ tối đa 1 lần mỗi 3 giây cho từng bot để tránh spam exception
    if (bot._lastSleepAttempt && (now - bot._lastSleepAttempt < 3000)) {
      return;
    }
    bot._lastSleepAttempt = now;

    try {
      // Tìm khối Giường thật (loại trừ bedrock) trong bán kính 32m
      const bedBlock = bot.findBlock({
        matching: (b) => b && b.name && b.name.includes('bed') && !b.name.includes('bedrock'),
        maxDistance: 32
      });

      if (!bedBlock) {
        if (!bot._warnedNoBed) {
          const pos = bot.entity ? bot.entity.position : null;
          const posStr = pos ? `(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})` : 'chưa xác định';
          this.log('warning', `⚠️ [NIGHT SCAN] Bot [${username}] tại ${posStr} KHÔNG tìm thấy chiếc Giường nào trong bán kính 32m để đi ngủ!`);
          bot._warnedNoBed = true;
        }
        return;
      }

      const dist = bot.entity.position.distanceTo(bedBlock.position);
      this.log('info', `🛌 [NIGHT] Bot [${username}] phát hiện Giường '${bedBlock.name}' tại (${bedBlock.position.x}, ${bedBlock.position.y}, ${bedBlock.position.z}) (cách ${dist.toFixed(1)}m). Đang tiến hành đi ngủ...`);

      // Nếu ở xa hơn 3.5m, di chuyển lại gần giường trước khi ngủ
      if (dist > 3.5 && bot.pathfinder) {
        const { GoalNear } = require('mineflayer-pathfinder').goals;
        try {
          await bot.pathfinder.goto(new GoalNear(bedBlock.position.x, bedBlock.position.y, bedBlock.position.z, 2));
        } catch (e) {
          this.log('warning', `⚠️ [NIGHT] Bot [${username}] không thể lại gần Giường: ${e.message}`);
        }
      }

      await bot.sleep(bedBlock);
      this.log('success', `😴 [NIGHT SUCCESS] Bot [${username}] đã ngủ THÀNH CÔNG trên Giường (${bedBlock.position.x}, ${bedBlock.position.y}, ${bedBlock.position.z})! Skip Night thành công.`);
    } catch (err) {
      if (!bot.isSleeping && !err.message.includes('already sleeping')) {
        this.log('warning', `⚠️ [NIGHT ERROR] Bot [${username}] thử đi ngủ gặp lỗi: ${err.message}`);
      }
    }
  }

  // Khi TimeKeeper phát hiện TRỜI TỐI: Cho Bot TimeKeeper, Bot Registered & tất cả Bot AFK đi ngủ liền
  async handleNightTime(triggerBot = null) {
    const now = Date.now();
    const timeOfDay = this.timeKeeper ? this.timeKeeper.timeOfDay : 'unknown';
    this.log('info', `🌙 [NIGHT EVENT] Trời tối (Tick: ${timeOfDay}). Chỉ Time Manager ngủ; Builder tiếp tục build 24/7.`);

    // 1. Thử cho Bot TimeKeeper đi ngủ nếu đang kết nối
    if (this.timeKeeper.botInstance && !this.timeKeeper.botInstance.isSleeping) {
      this.tryBotSleep(this.timeKeeper.botInstance, this.timeKeeper.username, now);
    }

    // Builder và AFK tiếp tục hoạt động; tuyệt đối không đưa họ vào giường.
    this.timeKeeper.status = 'MONITORING';
    this.broadcastState();
  }

  // Khi TimeKeeper phát hiện TRỜI SÁNG: Đánh thức các Bot đang ngủ
  async handleDayTime() {
    this.log('success', `☀️ [TIME KEEPER] Trời đã SÁNG! Đánh thức các Bot đang ngủ...`);

    // 1. Đánh thức Bot TimeKeeper nếu đang ngủ
    if (this.timeKeeper.botInstance) {
      this.timeKeeper.botInstance._warnedNoBed = false;
      this.timeKeeper.botInstance._lastSleepAttempt = 0;
      try {
        if (this.timeKeeper.botInstance.isSleeping) {
          await this.timeKeeper.botInstance.wake();
          this.log('info', `☀️ [DAY] Bot TimeKeeper [${this.timeKeeper.username}] đã thức dậy.`);
        }
      } catch (err) {}
    }

    // 2. Đánh thức các Bot khác đang ngủ
    for (const botKey of Object.keys(this.bots)) {
      const state = this.bots[botKey];
      if (state && state.botInstance) {
        state.botInstance._warnedNoBed = false;
        state.botInstance._lastSleepAttempt = 0;
        try {
          if (state.botInstance.isSleeping) {
            await state.botInstance.wake();
            state.status = 'ONLINE';
            this.log('info', `☀️ [DAY] Bot [${state.username}] đã thức dậy.`);
          }
        } catch (err) {}
      }
    }

    this.timeKeeper.status = 'MONITORING';
    this.broadcastState();
  }


  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.broadcastState();
  }

  // Tự động phát hiện vị trí chữ cái gần nhất với vị trí thực tế của Bot trong Minecraft
  autoDetectAndAssignNearestLetter(letterIdOrUsername) {
    let botState = this.bots[letterIdOrUsername];
    if (!botState) {
      // Tìm theo username
      const foundKey = Object.keys(this.bots).find(k => this.bots[k].username === letterIdOrUsername);
      if (foundKey) botState = this.bots[foundKey];
    }

    const fixedAssignment = getBuilderAssignment(botState.username);
    if (fixedAssignment) botState.assignedLetterId = fixedAssignment;

    // 1. Ưu tiên giữ nguyên chữ cái đã gán sẵn cho Bot (Ví dụ: T1), không đè chữ ở xa
    if (botState.assignedLetterId && this.pixelData.letters[botState.assignedLetterId]) {
      const assignedLetter = this.pixelData.letters[botState.assignedLetterId];
      botState.word = assignedLetter.word;
      botState.label = assignedLetter.label;
      botState.totalCount = assignedLetter.totalPixels;
      botState.placedCount = assignedLetter.placedPixelsCount;
      if (!botState.bedPos) botState.bedPos = assignedLetter.bed_pos;

      const accountManager = require('./account_manager');
      accountManager.saveAccount(botState);

      return { success: true, detectedLetter: assignedLetter.label, letterId: assignedLetter.id };
    }

    const botPos = botState.botInstance.entity.position;
    const claimedIds = new Set(
      Object.values(this.bots)
        .filter(state => state !== botState && state.assignedLetterId && state.botInstance)
        .map(state => state.assignedLetterId)
    );
    let nearest = findNearestLetter(botPos, this.pixelData.letters, claimedIds);
    // Nếu cả 10 chữ đều đã có người nhận thì vẫn trả về chữ gần nhất để chẩn đoán.
    if (!nearest) nearest = findNearestLetter(botPos, this.pixelData.letters);

    if (nearest) {
      const closestLetter = nearest.letter;
      const minDistance = nearest.distance;
      const msg = `Bot ${botState.username} tại (${botPos.x.toFixed(1)}, ${botPos.z.toFixed(1)}) tự nhận chữ '${closestLetter.word} - ${closestLetter.label}' theo pixel gần nhất (cách ${minDistance.toFixed(1)}m).`;
      this.log('info', msg);
      
      // Đây là cấu hình thật được engine build sử dụng, không chỉ là dữ liệu hiển thị.
      botState.assignedLetterId = closestLetter.id;
      botState.detectedDistance = minDistance.toFixed(1);
      botState.word = closestLetter.word;
      botState.label = closestLetter.label;
      botState.totalCount = closestLetter.totalPixels;
      botState.placedCount = closestLetter.placedPixelsCount;
      botState.bedPos = closestLetter.bed_pos;
      botState.buildCursor = 0;

      this.broadcastState();

      return {
        success: true,
        detectedLetter: closestLetter.label,
        word: closestLetter.word,
        distance: minDistance.toFixed(1),
        letterId: closestLetter.id
      };
    }

    this.log('error', `Bot ${botState.username} không thể xác định vị trí chữ gần nhất!`);
    return { success: false, error: 'Không xác định được chữ cái gần nhất' };
  }

  // Khởi chạy 1 bot Mineflayer cụ thể với tùy chọn thông tin đăng nhập
  startAccountBot(accountCredentials) {
    const requested = accountCredentials && accountCredentials.assignedLetter;
    if (!requested || requested === 'AUTO') {
      return { success: false, error: 'Hãy chọn chữ cụ thể cho builder trước khi kết nối' };
    }
    const botKey = this.bots[requested] ? requested : null;
    if (botKey && (this.bots[botKey].botInstance || this.bots[botKey].status !== 'OFFLINE')) {
      return { success: false, error: `Chữ ${requested} đã có builder đang sử dụng` };
    }
    if (!botKey) return { success: false, error: 'Không còn slot builder trống' };
    this.startBot(botKey, accountCredentials);
    return { success: true, botKey };
  }

  startBot(letterId, accountCredentials = null) {
    let botState = this.bots[letterId];
    if (!botState) {
      const foundKey = Object.keys(this.bots).find(k => 
        k === letterId || 
        this.bots[k].username === letterId || 
        this.bots[k].id === letterId ||
        this.bots[k].assignedLetterId === letterId
      );
      if (foundKey) botState = this.bots[foundKey];
    }

    if (!botState) {
      this.bots[letterId] = {
        id: letterId,
        username: (accountCredentials && accountCredentials.username) || letterId,
        password: (accountCredentials && accountCredentials.password) || '1234',
        role: 'BUILDER',
        status: 'OFFLINE',
        assignedLetterId: (accountCredentials && accountCredentials.assignedLetter !== 'AUTO') ? accountCredentials.assignedLetter : null,
        placedCount: 0,
        totalCount: 0,
        bedPos: null,
        shulkerId: null,
        botInstance: null
      };
      botState = this.bots[letterId];
    }

    if (botState.botInstance) {
      try { botState.botInstance.end(); } catch (e) {}
    }

    if (accountCredentials) {
      if (accountCredentials.username) botState.username = accountCredentials.username;
      botState.password = accountCredentials.password || null;
      botState.authType = accountCredentials.authType || 'offline';
      if (accountCredentials.assignedLetter && accountCredentials.assignedLetter !== 'AUTO' && this.pixelData.letters[accountCredentials.assignedLetter]) {
        botState.assignedLetterId = accountCredentials.assignedLetter;
      }
    }

    botState.status = 'CONNECTING';
    this.log('info', `Đang kết nối bot ${botState.username} vào ${this.config.host}:${this.config.port} (Phiên bản: ${this.config.version})...`);
    this.broadcastState();

    try {
      let mcVersion = this.config.version || '1.21.11';
      if (!mcVersion || mcVersion.includes('26.') || mcVersion === 'auto') {
        mcVersion = '1.21.11';
      }

      const botOptions = {
        host: this.config.host,
        port: this.config.port,
        username: botState.username,
        version: mcVersion,
        auth: botState.authType || 'offline'
      };

      if (botState.password && botState.authType === 'microsoft') {
        botOptions.password = botState.password;
      }

      const bot = mineflayer.createBot(botOptions);
      bot.loadPlugin(pathfinder);
      botState.botInstance = bot;


      // Bộ tự động đăng ký (/register 1234 1234) & đăng nhập (/login 1234)
      const tryAutoAuth = (rawText) => {
        if (!rawText) return;
        const lower = rawText.toString().toLowerCase();
        const pass = botState.password || '1234';

        if (lower.includes('register') || lower.includes('đăng ký') || lower.includes('dang ky') || lower.includes('nhap lai mat khau')) {
          this.log('warning', `🔐 Server yêu cầu Đăng Ký cho [${botState.username}]. Tự động gửi: /register ${pass} ${pass}`);
          setTimeout(() => {
            try { bot.chat(`/register ${pass} ${pass}`); } catch (e) {}
          }, 1000);
        } else if (lower.includes('login') || lower.includes('đăng nhập') || lower.includes('dang nhap') || lower.includes('nhap mat khau')) {
          this.log('info', `🔑 Server yêu cầu Đăng Nhập cho [${botState.username}]. Tự động gửi: /login ${pass}`);
          setTimeout(() => {
            try { bot.chat(`/login ${pass}`); } catch (e) {}
          }, 1000);
        }
      };

      bot.on('spawn', () => {
        // Bỏ qua event trễ từ một connection đã bị người dùng bấm Stop/thay thế.
        if (botState.botInstance !== bot) {
          try { bot.quit('Connection was stopped'); } catch (e) {}
          return;
        }
        this.log('success', `🎉 Bot [${botState.username}] đã vào server ${this.config.host}:${this.config.port} thành công!`);
        botState.status = 'IDLE';

        const movements = new Movements(bot);
        movements.canDig = false;
        movements.allow1by1towers = false;
        bot.pathfinder.setMovements(movements);

        const pass = botState.password || '1234';

        // 1. Tự động gửi lệnh đăng nhập /login 1234 sau 1.2 giây
        setTimeout(() => {
          try {
            bot.chat(`/login ${pass}`);
            this.log('info', `🔑 [${botState.username}] Gửi lệnh đăng nhập: /login ${pass}`);
          } catch (e) {}
        }, 1200);

        // 2. Quét thế giới: Nhận chữ, in ra Giường, Shulker xung quanh và vẽ các block đã xây sẵn lên map
        setTimeout(() => {
          if (botState.botInstance !== bot) return;
          this.scanWorldSurroundings(letterId);
        }, 2200);

        // 3. Cho bot đứng yên quét xong toàn bộ Shulker & Bed, check túi đồ rút Shulker rồi mới bắt đầu build (4.5 giây)
        setTimeout(() => {
          if (botState.botInstance !== bot) return;
          if (this.config.autoBuild) this.builderEngine.start(letterId);
        }, 4500);

        this.broadcastState();
      });

      // Lắng hệ thống tín hiệu Auth khi server gửi chat
      bot.on('message', (jsonMsg) => tryAutoAuth(jsonMsg.toString()));
      bot.on('title', (titleText) => tryAutoAuth(titleText));
      bot.on('actionbar', (jsonMsg) => tryAutoAuth(jsonMsg.toString()));



      bot.on('kicked', (reason) => {
        this.log('error', `Bot [${botState.username}] bị kick khỏi server: ${reason}`);
      });


      bot.on('death', () => {
        this.builderEngine.stop(letterId);
        this.log('warning', `Bot [${botState.username}] đã tự sát/hi sinh! Tiến hành respawn tại giường Y=${this.config.yLevel}...`);
        botState.status = 'RESPAWNING';
        this.broadcastState();
        setTimeout(() => {
          bot.respawn();
        }, 1000);
      });

      bot.on('error', (err) => {
        this.log('error', `Bot [${botState.username}] gặp lỗi kết nối: ${err.message}`);
        botState.status = 'ERROR';
        this.broadcastState();
      });

      bot.on('end', () => {
        this.builderEngine.stop(letterId);
        this.log('info', `Bot [${botState.username}] đã ngắt kết nối.`);
        if (botState.botInstance === bot) {
          botState.status = 'OFFLINE';
          botState.botInstance = null;
        }
        this.broadcastState();
      });

    } catch (e) {
      this.log('error', `Không thể khởi tạo bot [${botState.username}]: ${e.message}`);
      botState.status = 'OFFLINE';
      this.broadcastState();
    }
  }

  // Dừng bot
  stopBot(botIdOrUsernameOrLetter, options = {}) {
    const botKey = Object.keys(this.bots).find(key => {
      const state = this.bots[key];
      return key === botIdOrUsernameOrLetter ||
        state.id === botIdOrUsernameOrLetter ||
        state.username === botIdOrUsernameOrLetter ||
        state.assignedLetterId === botIdOrUsernameOrLetter;
    });
    if (!botKey) return false;

    const botState = this.bots[botKey];
    this.builderEngine.stop(botKey);
    if (botState.assignedLetterId && botState.assignedLetterId !== botKey) {
      this.builderEngine.stop(botState.assignedLetterId);
    }

    const bot = botState.botInstance;
    botState.botInstance = null;
    if (bot) {
      try {
        if (typeof bot.quit === 'function') bot.quit('Stopped from dashboard');
        else bot.end('Stopped from dashboard');
      } catch (e) {
        try { bot.end(); } catch (ignored) {}
      }
    }
    botState.status = 'OFFLINE';
    if (!options.keepNightResume) {
      this.nightPausedBuilders.delete(botKey);
      if (botState.assignedLetterId) this.nightPausedBuilders.delete(botState.assignedLetterId);
    }
    this.broadcastState();
    return true;
  }

  // Gửi lệnh Command / Chat tùy chỉnh trực tiếp từ Web Dashboard
  sendCustomCommand(letterIdOrUsername, command) {
    let botState = this.bots[letterIdOrUsername];
    if (!botState) {
      const foundKey = Object.keys(this.bots).find(k => this.bots[k].username === letterIdOrUsername);
      if (foundKey) botState = this.bots[foundKey];
    }

    if (!botState) {
      // Gửi cho tất cả bot nếu chọn ALL
      if (letterIdOrUsername === 'ALL') {
        Object.keys(this.bots).forEach((id) => {
          if (this.bots[id].botInstance) {
            try {
              this.bots[id].botInstance.chat(command);
              this.log('info', `💬 [${this.bots[id].username}] Thực thi lệnh: ${command}`);
            } catch (e) {}
          }
        });
        return { success: true, message: `Đã gửi lệnh '${command}' tới tất cả bot đang online` };
      }
      return { success: false, error: 'Không tìm thấy bot để gửi lệnh' };
    }

    if (!botState.botInstance) {
      return { success: false, error: `Bot [${botState.username}] chưa kết nối vào game!` };
    }

    try {
      botState.botInstance.chat(command);
      this.log('info', `💬 [${botState.username}] Thực thi lệnh: ${command}`);
      return { success: true, message: `Đã gửi lệnh '${command}' cho bot ${botState.username}` };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // Khởi chạy toàn bộ bot
  startAllBots() {
    Object.keys(this.bots).forEach((letterId) => {
      this.startBot(letterId);
    });
  }

  // Dừng toàn bộ bot
  stopAllBots() {
    this.nightPausedBuilders.clear();
    Object.keys(this.bots).forEach((letterId) => {
      this.stopBot(letterId);
    });
  }

  // Tự quét khối Giường trong bán kính 16m và bấm tương tác để Set Spawnpoint
  async findAndSetBedSpawnpoint(letterIdOrUsername) {
    let botState = this.bots[letterIdOrUsername];
    if (!botState) {
      const foundKey = Object.keys(this.bots).find(k => this.bots[k].username === letterIdOrUsername);
      if (foundKey) botState = this.bots[foundKey];
    }

    if (!botState || !botState.botInstance) {
      return { success: false, error: 'Bot chưa kết nối vào Server Minecraft!' };
    }

    const bot = botState.botInstance;

    // Tìm khối Giường (bed) xung quanh trong bán kính 16 blocks
    const bedBlock = bot.findBlock({
      matching: (block) => block && block.name && block.name.includes('bed') && !block.name.includes('bedrock'),
      maxDistance: 16
    });

    if (!bedBlock) {
      this.log('warning', `⚠️ Không tìm thấy chiếc Giường nào trong bán kính 16m xung quanh Bot [${botState.username}]!`);
      return { success: false, error: 'Không tìm thấy Giường trong bán kính 16m' };
    }

    try {
      // Cập nhật vị trí giường mới cho Bot
      botState.bedPos = {
        x: bedBlock.position.x,
        y: bedBlock.position.y,
        z: bedBlock.position.z
      };

      // Lưu bedPos vào MongoDB Atlas & đĩa JSON
      const accountManager = require('./account_manager');
      accountManager.saveAccount(botState);

      this.log('info', `🛏️ Bot [${botState.username}] đã phát hiện Giường tại (${bedBlock.position.x}, ${bedBlock.position.y}, ${bedBlock.position.z}). Đang tiến hành Set Spawnpoint...`);

      // Tương tác hoặc đi ngủ để lưu Spawnpoint
      try {
        await bot.sleep(bedBlock);
        this.log('success', `🎉 Bot [${botState.username}] đã đặt Spawnpoint thành công tại Giường Y=${bedBlock.position.y}!`);
        setTimeout(() => { try { bot.wake(); } catch (e) {} }, 1000);
      } catch (e) {
        // Nếu ban ngày không ngủ được, thực hiện activateBlock để tương tác với giường
        await bot.activateBlock(bedBlock);
        this.log('success', `🎉 Bot [${botState.username}] đã bấm vào Giường tại (${bedBlock.position.x}, ${bedBlock.position.y}, ${bedBlock.position.z}) để lưu Spawnpoint!`);
      }

      this.broadcastState();
      return {
        success: true,
        bedPos: botState.bedPos,
        message: `Đã set spawnpoint tại Giường (${bedBlock.position.x}, ${bedBlock.position.y}, ${bedBlock.position.z})`
      };

    } catch (err) {
      this.log('error', `Lỗi khi gán Spawnpoint cho Bot [${botState.username}]: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  // Quét môi trường xung quanh: Tự động nhận chữ cái theo tọa độ, tự Set Spawnpoint, in vị trí Bed/Shulker và vẽ các block đã xây sẵn lên Map
  scanWorldSurroundings(letterId) {
    const botState = this.bots[letterId];
    if (!botState || !botState.botInstance) return;
    const bot = botState.botInstance;

    // 1. Tự động xác định chữ cái nhiệm vụ gần nhất dựa vào tọa độ thực tế (X, Z) của Bot trong Minecraft
    this.autoDetectAndAssignNearestLetter(letterId);

    const assignedLetterId = botState.assignedLetterId || letterId;
    const letter = this.pixelData.letters[assignedLetterId];
    if (!letter) {
      this.log('warning', `⚠️ Bot [${botState.username}] chưa được gán ma trận chữ cái hợp lệ.`);
      return;
    }

    this.log('info', `🤖 [BUILDER] Bot [${botState.username}] tự xác định & nhận nhiệm vụ xây chữ '${letter.word} - ${letter.label}' (ID: ${assignedLetterId}) tại tầng Y=${this.config.yLevel}`);

    // 2. Quét & Tự động Set Spawnpoint tại Giường gần nhất (bán kính 32m)
    try {
      const bedBlock = bot.findBlock({
        matching: (b) => b && b.name && b.name.includes('bed') && !b.name.includes('bedrock'),
        maxDistance: 32
      });

      if (bedBlock) {
        botState.bedPos = {
          x: bedBlock.position.x,
          y: bedBlock.position.y,
          z: bedBlock.position.z
        };
        this.log('success', `🛏️ [SCANNER & SPAWN] Bot [${botState.username}] phát hiện Giường tại (${bedBlock.position.x}, ${bedBlock.position.y}, ${bedBlock.position.z}). Đang tiến hành tự động Set Spawnpoint...`);
        
        // Gọi hàm tự động bấm/ngủ Giường để lưu Spawnpoint
        this.findAndSetBedSpawnpoint(letterId);
        
        // Lưu vị trí giường vào DB & Disk
        const accountManager = require('./account_manager');
        accountManager.saveAccount(botState);
      } else {
        this.log('info', `🛏️ Bot [${botState.username}] không tìm thấy Giường trong bán kính 32m để Set Spawn.`);
      }
    } catch (e) {}

    // 3. Quét các vị trí Shulker Box xung quanh trong bán kính 5m (tối đa 30 rương) và đăng ký tự động vào Shulker Manager
    try {
      const shulkerPositions = bot.findBlocks({
        matching: (b) => b && b.name && b.name.includes('shulker_box'),
        maxDistance: 5,
        count: 30
      });

      if (shulkerPositions && shulkerPositions.length > 0) {
        this.log('success', `📦 [SCANNER] Bot [${botState.username}] phát hiện ${shulkerPositions.length} Shulker Box xung quanh!`);

        shulkerPositions.forEach((pos, idx) => {
          const sBlock = bot.blockAt(pos);
          const blockName = sBlock ? sBlock.name : 'shulker_box';

          const shulkerId = `shulker_${assignedLetterId}_${pos.x}_${pos.y}_${pos.z}`;
          const shulkerData = {
            id: shulkerId,
            letterId: assignedLetterId,
            name: `Rương Shulker ${assignedLetterId} (${pos.x}, ${pos.y}, ${pos.z})`,
            blockType: this.config.buildBlock || 'black_concrete',
            pos: { x: pos.x, y: pos.y, z: pos.z },
            capacity: 1728,
            remainingBlocks: 1728,
            status: 'AVAILABLE'
          };

          shulkerManager.addShulker(shulkerData);
        });

        // Gán vị trí shulker đầu tiên cho botState
        const firstPos = shulkerPositions[0];
        botState.shulkerId = `shulker_${assignedLetterId}_${firstPos.x}_${firstPos.y}_${firstPos.z}`;
        botState.shulkerPos = { x: firstPos.x, y: firstPos.y, z: firstPos.z };

        this.log('success', `📦 [SCANNER MAP] Đã nạp thành công ${shulkerPositions.length} Shulker Boxes của chữ '${letter.label}' lên Map Dashboard!`);
      } else {
        this.log('info', `📦 Bot [${botState.username}] không thấy Shulker Box trong bán kính 32m.`);
      }
    } catch (e) {
      this.log('error', `Lỗi khi quét Shulker Box: ${e.message}`);
    }

    // 4. Quét các block đã được xây sẵn trong thế giới Minecraft tại tầng Y=172 và vẽ lên Map Dashboard
    try {
      let scannedPlacedCount = 0;

      // Quét bằng bot.findBlocks giống như tìm Shulker Box để đọc toàn bộ chunk đã nạp trong bộ nhớ mineflayer
      const solidBlocks = bot.findBlocks({
        matching: (b) => b && b.name && b.name !== 'air' && b.name !== 'cave_air' && b.name !== 'void_air' && b.type !== 0,
        maxDistance: 45,
        count: 5000
      });

      const solidSet = new Set(solidBlocks.map(p => `${p.x},${p.y},${p.z}`));

      letter.pixels.forEach(pixel => {
        const key = `${pixel.mc_x},${pixel.mc_y},${pixel.mc_z}`;
        const targetPos = new vec3(pixel.mc_x, pixel.mc_y, pixel.mc_z);
        const block = bot.blockAt(targetPos);
        const isPlacedBlock = solidSet.has(key) || (block && block.name !== 'air' && block.name !== 'cave_air' && block.name !== 'void_air' && block.type !== 0);

        if (isPlacedBlock) {
          if (!pixel.placed) {
            pixel.placed = true;
            letter.placedPixelsCount++;
          }
          scannedPlacedCount++;
        }
      });

      botState.placedCount = letter.placedPixelsCount;
      botState.totalCount = letter.totalPixels;

      this.log('success', `🎨 [SCANNER MAP] Đã vẽ xong bản đồ chữ '${letter.label}'! Quét phát hiện ${scannedPlacedCount}/${letter.totalPixels} block đã được đặt sẵn (kể cả pink_concrete hoặc khối khác) tại tầng Y=${this.config.yLevel}.`);
      this.broadcastState();
    } catch (e) {
      this.log('error', `Lỗi khi quét block đã xây sẵn: ${e.message}`);
    }
  }

  // Thiết lập giường làm điểm Spawnpoint mặc định khi spawn
  async setupBedSpawnpoint(letterId) {
    const botState = this.bots[letterId];
    if (!botState || !botState.botInstance || !botState.bedPos) return;

    const bot = botState.botInstance;
    try {
      const bedPos = new vec3(botState.bedPos.x, botState.bedPos.y, botState.bedPos.z);
      const bedBlock = bot.blockAt(bedPos);
      if (bedBlock && bedBlock.name.includes('bed') && !bedBlock.name.includes('bedrock')) {
        await bot.sleep(bedBlock);
        console.log(`[BOT ${botState.username}] Đã đặt Spawnpoint thành công tại Giường!`);
        try { bot.wake(); } catch (w) {}
      }
    } catch (e) {
      console.log(`[BOT ${botState.username}] Lưu ý: Không thể ngủ giường (có thể do thời gian ngày/đêm):`, e.message);
    }
  }

  // Hàm tự sát (nhảy khỏi Y=250) để respawn khi hết block
  suicideToRespawn(letterId) {
    const botState = this.bots[letterId];
    const bot = botState.botInstance;
    if (!bot) return;

    console.log(`[BOT ${botState.username}] Hết block! Tiến hành nhảy tự sát để hồi sinh tại Giường trung tâm...`);
    botState.status = 'RESPAWNING';
    this.broadcastState();

    // Nhảy xuống vực độ cao Y=0 để tự sát
    const pos = bot.entity.position;
    bot.lookAt(new vec3(pos.x + 10, pos.y, pos.z));
    bot.setControlState('forward', true);
    bot.setControlState('jump', true);
  }

  // Đặt block thực tế tại tọa độ pixel
  async placeNextPixelBlock(letterId) {
    const botState = this.bots[letterId];
    const assignedLetterId = botState.assignedLetterId || letterId;
    const letter = this.pixelData.letters[assignedLetterId];
    if (!letter) return;

    // Tìm pixel chưa đặt
    const targetPixel = letter.pixels.find(p => !p.placed);
    if (!targetPixel) {
      botState.status = 'FINISHED';
      this.broadcastState();
      return;
    }

    botState.status = 'PLACING';
    this.broadcastState();

    // Đánh dấu pixel đã đặt
    targetPixel.placed = true;
    letter.placedPixelsCount++;
    botState.placedCount++;

    // Trừ 1 block từ Shulker Box hiện tại
    if (botState.shulkerId) {
      shulkerManager.consumeBlocks(botState.shulkerId, 1);
    }

    // Phát tín hiệu cập nhật Canvas Realtime lên Web Dashboard
    this.io.emit('pixel_placed', {
      letterId: assignedLetterId,
      pixelId: targetPixel.id,
      img_x: targetPixel.img_x,
      img_y: targetPixel.img_y,
      mc_x: targetPixel.mc_x,
      mc_y: targetPixel.mc_y,
      mc_z: targetPixel.mc_z,
      placedCount: letter.placedPixelsCount,
      totalCount: letter.totalPixels
    });

    this.broadcastState();
  }

  emitPixelPlaced(letterId, pixel, letter) {
    if (!this.io) return;
    this.io.emit('pixel_placed', {
      letterId,
      pixelId: pixel.id,
      img_x: pixel.img_x,
      img_y: pixel.img_y,
      mc_x: pixel.mc_x,
      mc_y: pixel.mc_y,
      mc_z: pixel.mc_z,
      placedCount: letter.placedPixelsCount,
      totalCount: letter.totalPixels
    });
  }

  // Chế độ Mô Phỏng (Simulation Mode) cho Web Dashboard nếu chưa kết nối game server
  toggleSimulation(letterId) {
    const botState = this.bots[letterId];
    if (!botState) return;

    if (botState.simulating) {
      botState.simulating = false;
      botState.status = 'OFFLINE';
    } else {
      botState.simulating = true;
      botState.status = 'PLACING';
      this.runSimulationLoop(letterId);
    }
    this.broadcastState();
  }

  runSimulationLoop(letterId) {
    const botState = this.bots[letterId];
    if (!botState || !botState.simulating) return;

    const letter = this.pixelData.letters[letterId];
    const unplaced = letter.pixels.filter(p => !p.placed);

    if (unplaced.length === 0) {
      botState.status = 'FINISHED';
      botState.simulating = false;
      this.broadcastState();
      return;
    }

    // Đặt ngẫu nhiên tốc độ 10-30ms mỗi block
    this.placeNextPixelBlock(letterId);

    setTimeout(() => {
      this.runSimulationLoop(letterId);
    }, Math.floor(Math.random() * 20) + 10);
  }

  startAllSimulations() {
    Object.keys(this.bots).forEach(id => {
      if (!this.bots[id].simulating) {
        this.toggleSimulation(id);
      }
    });
  }

  stopAllSimulations() {
    Object.keys(this.bots).forEach(id => {
      this.bots[id].simulating = false;
      this.bots[id].status = 'OFFLINE';
    });
    this.broadcastState();
  }

  getState() {
    const summary = {};
    Object.keys(this.bots).forEach(id => {
      const botInst = this.bots[id].botInstance;
      let inventoryItems = [];
      if (botInst && botInst.inventory) {
        try {
          inventoryItems = botInst.inventory.items().map(item => ({
            name: item.name,
            displayName: item.displayName || item.name,
            count: item.count,
            slot: item.slot
          }));
        } catch (e) {}
      }

      summary[id] = {
        id: id,
        letterId: id,
        word: this.bots[id].word,
        label: this.bots[id].label,
        username: this.bots[id].username,
        password: this.bots[id].password || '1234',
        role: this.bots[id].role || 'AFK_OVERWORLD',
        status: this.bots[id].status || 'OFFLINE',
        placedCount: this.bots[id].placedCount || 0,
        totalCount: this.bots[id].totalCount || 0,
        bedPos: this.bots[id].bedPos,
        shulkerId: this.bots[id].shulkerId,
        simulating: this.bots[id].simulating,
        assignedLetterId: this.bots[id].assignedLetterId,
        detectedDistance: this.bots[id].detectedDistance,
        connectedAt: this.bots[id].connectedAt || null,
        inventory: inventoryItems
      };
    });

    const afkSummary = {};
    Object.keys(this.afkBots).forEach(uname => {
      afkSummary[uname] = {
        username: this.afkBots[uname].username,
        status: this.afkBots[uname].status
      };
    });

    const accountManager = require('./account_manager');

    return {
      config: this.config,
      bots: summary,
      afkBots: afkSummary,
      timeKeeper: {
        username: this.timeKeeper ? this.timeKeeper.username : 'XinChiDungDi',
        status: this.timeKeeper ? this.timeKeeper.status : 'OFFLINE',
        timeOfDay: this.timeKeeper ? this.timeKeeper.timeOfDay : 0,
        isDay: this.timeKeeper ? this.timeKeeper.isDay : true,
        autoManageNight: this.timeKeeper ? this.timeKeeper.autoManageNight : true,
        dimension: this.timeKeeper ? this.timeKeeper.dimension : 'unknown'
      },
      shulkers: shulkerManager.getAllShulkers(),
      accounts: accountManager.getAllAccounts()
    };
  }

  broadcastState() {
    if (!this.io) return;
    this.io.emit('state_update', this.getState());
  }

  updateConfig(newFields) {
    this.config = configManager.updateConfig(newFields);
    if (newFields && newFields.timeKeeperUsername) {
      this.timeKeeper.username = newFields.timeKeeperUsername;
    }
    if (newFields && newFields.autoManageNight !== undefined) {
      this.timeKeeper.autoManageNight = !!newFields.autoManageNight;
    }
    this.broadcastState();
    return this.config;
  }
}

module.exports = new BotManager();

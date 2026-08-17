const mineflayer = require('mineflayer');
const vec3 = require('vec3');
const { pathfinder, Movements } = require('mineflayer-pathfinder');
const shulkerManager = require('./shulker_manager');
const BuilderEngine = require('./builder_engine');
const { findNearestLetter } = require('./letter_assignment');
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
    this.config = {
      host: process.env.MC_HOST || 'cloudy.pikamc.vn',
      port: parseInt(process.env.MC_PORT || '25311'),
      version: process.env.MC_VERSION || '1.20.2',
      yLevel: 250,
      autoBuild: process.env.AUTO_BUILD !== 'false',
      buildBlock: process.env.BUILD_BLOCK || 'black_concrete',
      buildDelayMs: Math.max(50, parseInt(process.env.BUILD_DELAY_MS || '150', 10)),
      timeKeeperAntiAfkMs: Math.max(10000, parseInt(process.env.TK_ANTI_AFK_MS || '20000', 10))
    };
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

    // Khởi tạo 10 bot builder phụ trách 10 chữ
    Object.keys(pixelData.letters).forEach((letterId) => {
      const letter = pixelData.letters[letterId];
      this.bots[letterId] = {
        letterId: letterId,
        word: letter.word,
        label: letter.label,
        username: letter.botName,
        status: 'OFFLINE',
        placedCount: 0,
        totalCount: letter.totalPixels,
        currentBlockCount: 0,
        bedPos: letter.bed_pos,
        shulkerId: null,
        botInstance: null,
        simulating: false,
        // Người dùng gán chữ; engine chỉ dùng ảnh pixel của đúng chữ này để build.
        assignedLetterId: letterId,
        buildCursor: 0
      };
    });

    // Danh sách các Bot AFK tùy chỉnh username
    this.afkBots = {};

    // Thêm Bot chuyên trách theo dõi thời gian Day/Night
    this.timeKeeper = {
      username: 'XinChiDungDi',
      status: 'OFFLINE', // OFFLINE | CONNECTING | MONITORING | SLEEPING
      timeOfDay: 0,
      isDay: true,
      autoManageNight: true, // Tự động quản lý trời tối
      dimension: 'unknown',
      botInstance: null,
      antiAfkInterval: null
    };

  }

  // Cập nhật tùy chỉnh Username cho Bot Builder
  updateBuilderUsername(letterId, newUsername) {
    if (this.bots[letterId] && newUsername && newUsername.trim() !== '') {
      this.bots[letterId].username = newUsername.trim();
      this.broadcastState();
    }
  }

  // Thêm Bot AFK với Username tùy chỉnh
  addAfkBot(username) {
    const cleanName = (username || '').trim();
    if (!cleanName) return;

    if (this.afkBots[cleanName]) {
      console.log(`[AFK BOT] Bot AFK '${cleanName}' đã tồn tại!`);
      return;
    }

    const afkState = {
      username: cleanName,
      status: 'CONNECTING',
      botInstance: null,
      antiAfkInterval: null
    };

    this.afkBots[cleanName] = afkState;
    this.broadcastState();

    try {
      const bot = mineflayer.createBot({
        host: this.config.host,
        port: this.config.port,
        username: cleanName,
        version: this.config.version
      });

      afkState.botInstance = bot;

      bot.on('spawn', () => {
        console.log(`[AFK BOT ${cleanName}] Đã vào game treo AFK thành công!`);
        afkState.status = 'AFK_ONLINE';

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
      const timeOfDay = normalizeTime(bot.time ? bot.time.timeOfDay : 0);
      const isDay = isDayTime(timeOfDay);
      
      const prevIsDay = this.timeKeeper.isDay;
      this.timeKeeper.timeOfDay = timeOfDay;
      this.timeKeeper.isDay = isDay;

      // Xử lý khi bắt đầu Tối hoặc Sáng
      if (this.timeKeeper.autoManageNight) {
        if (prevIsDay && !isDay) {
          this.log('warning', `🌙 Trời đã TỐI (time=${timeOfDay}). TimeKeeper [${bot.username}] vẫn treo ở The End; đang cho các builder thoát.`);
          this.handleNightTime(bot);
        } else if (!prevIsDay && isDay) {
          this.log('success', `☀️ Trời đã SÁNG (time=${timeOfDay}). Kết nối lại các builder đã tạm nghỉ ban đêm.`);
          this.handleDayTime(bot);
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

  // TimeKeeper vẫn online ở The End. Chỉ các builder đang chạy mới bị tạm ngắt.
  async handleNightTime() {
    for (const botKey of Object.keys(this.bots)) {
      const state = this.bots[botKey];
      if (!state.botInstance && state.status !== 'CONNECTING') continue;
      this.nightPausedBuilders.add(botKey);
      this.log('info', `[TIME KEEPER] Tạm ngắt builder [${state.username}] trong ban đêm.`);
      this.stopBot(botKey, { keepNightResume: true });
    }
    this.timeKeeper.status = 'MONITORING';
    this.broadcastState();
  }

  // Khi sáng chỉ bật lại đúng những builder đã online trước lúc trời tối.
  async handleDayTime() {
    this.timeKeeper.status = 'MONITORING';
    const toResume = Array.from(this.nightPausedBuilders);
    this.nightPausedBuilders.clear();
    for (const botKey of toResume) this.startBot(botKey);
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

    if (!botState || !botState.botInstance || !botState.botInstance.entity) {
      return { success: false, error: 'Bot chưa kết nối vào game hoặc chưa được spawn!' };
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
    const botState = this.bots[letterId];
    if (!botState) return;

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
      let mcVersion = this.config.version;
      // Nếu nhập 26.2 hoặc 1.20.2 hoặc không rõ, hỗ trợ auto-detect version
      if (!mcVersion || mcVersion.includes('26.') || mcVersion === 'auto') {
        mcVersion = false; // mineflayer auto-detect
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

        // 2. Nạp đúng ma trận pixel của chữ do người dùng đã gán rồi bắt đầu build.
        setTimeout(() => {
          if (!botState.botInstance) return;
          if (this.config.autoBuild && this.timeKeeper.isDay) this.builderEngine.start(letterId);
        }, 2500);


        this.broadcastState();
        this.setupBedSpawnpoint(letterId);
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
        botState.status = 'OFFLINE';
        botState.botInstance = null;
        this.broadcastState();
      });

    } catch (e) {
      this.log('error', `Không thể khởi tạo bot [${botState.username}]: ${e.message}`);
      botState.status = 'OFFLINE';
      this.broadcastState();
    }
  }

  // Dừng bot
  stopBot(letterId, options = {}) {
    const botState = this.bots[letterId];
    if (!botState) return;
    this.builderEngine.stop(letterId);
    if (botState && botState.botInstance) {
      botState.botInstance.end();
      botState.botInstance = null;
    }
    botState.status = 'OFFLINE';
    if (!options.keepNightResume) this.nightPausedBuilders.delete(letterId);
    this.broadcastState();
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

  // Khởi chạy toàn bộ 10 bot
  startAllBots() {
    if (!this.timeKeeper.isDay) {
      this.log('warning', 'Không khởi động builder vì TimeKeeper đang báo trời tối.');
      return;
    }
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
      matching: (block) => block && block.name && block.name.includes('bed'),
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

  // Thiết lập giường làm điểm Spawnpoint mặc định khi spawn
  async setupBedSpawnpoint(letterId) {

    const botState = this.bots[letterId];
    const bot = botState.botInstance;
    if (!bot) return;

    const bedPos = new vec3(botState.bedPos.x, botState.bedPos.y, botState.bedPos.z);
    try {
      const bedBlock = bot.blockAt(bedPos);
      if (bedBlock && bedBlock.name.includes('bed')) {
        await bot.sleep(bedBlock);
        console.log(`[BOT ${botState.username}] Đã đặt Spawnpoint thành công tại Giường!`);
        bot.wake();
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

  broadcastState() {
    if (!this.io) return;

    const summary = {};
    Object.keys(this.bots).forEach(id => {
      summary[id] = {
        letterId: id,
        word: this.bots[id].word,
        label: this.bots[id].label,
        username: this.bots[id].username,
        status: this.bots[id].status,
        placedCount: this.bots[id].placedCount,
        totalCount: this.bots[id].totalCount,
        bedPos: this.bots[id].bedPos,
        shulkerId: this.bots[id].shulkerId,
        simulating: this.bots[id].simulating
        ,assignedLetterId: this.bots[id].assignedLetterId
        ,detectedDistance: this.bots[id].detectedDistance
      };
    });

    const afkSummary = {};
    Object.keys(this.afkBots).forEach(uname => {
      afkSummary[uname] = {
        username: this.afkBots[uname].username,
        status: this.afkBots[uname].status
      };
    });

    this.io.emit('state_update', {
      config: this.config,
      bots: summary,
      afkBots: afkSummary,
      timeKeeper: {
        username: this.timeKeeper.username,
        status: this.timeKeeper.status,
        timeOfDay: this.timeKeeper.timeOfDay,
        isDay: this.timeKeeper.isDay,
        autoManageNight: this.timeKeeper.autoManageNight,
        dimension: this.timeKeeper.dimension
      },
      shulkers: shulkerManager.getAllShulkers()
    });
  }


}

module.exports = new BotManager();

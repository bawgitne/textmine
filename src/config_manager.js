const fs = require('fs');
const path = require('path');
const { ConfigModel, getIsDBConnected } = require('./db');

const CONFIG_FILE = path.join(__dirname, '../data/config.json');

class ConfigManager {
  constructor() {
    this.config = {
      host: process.env.MC_HOST || 'cloudy.pikamc.vn',
      port: parseInt(process.env.MC_PORT || '25311'),
      version: process.env.MC_VERSION || '1.21.11',
      yLevel: parseInt(process.env.BUILD_Y_LEVEL || '172', 10),
      autoBuild: process.env.AUTO_BUILD !== 'false',
      buildBlock: process.env.BUILD_BLOCK || 'pink_concrete',
      buildDelayMs: Math.max(50, parseInt(process.env.BUILD_DELAY_MS || '150', 10)),
      timeKeeperAntiAfkMs: Math.max(10000, parseInt(process.env.TK_ANTI_AFK_MS || '20000', 10)),
      timeKeeperUsername: 'XinChiDungDi',
      autoManageNight: true
    };
    this.initData();
  }

  initData() {
    try {
      const dataDir = path.dirname(CONFIG_FILE);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      if (fs.existsSync(CONFIG_FILE)) {
        const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
        const saved = JSON.parse(raw);
        if (saved && typeof saved === 'object') {
          this.config = { ...this.config, ...saved };
        }
      } else {
        this.saveDiskData();
      }
    } catch (e) {
      console.error('Lỗi khi đọc file cấu hình cục bộ:', e.message);
    }
  }

  async syncWithDB() {
    if (getIsDBConnected() && ConfigModel) {
      try {
        const dbConfig = await ConfigModel.findOne({ key: 'main_config' }).lean();
        if (dbConfig) {
          const { _id, __v, key, createdAt, updatedAt, ...cleanConfig } = dbConfig;
          this.config = { ...this.config, ...cleanConfig };
          this.saveDiskData();
          console.log('☁️ [MONGODB ATLAS] Đã đồng bộ Cấu hình Hệ thống từ Cloud Database!');
        }
      } catch (e) {
        console.error('⚠️ [MONGODB ATLAS ERROR] Lỗi khi sync config:', e.message);
      }
    }
  }

  saveDiskData() {
    try {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2), 'utf8');
    } catch (e) {
      console.error('Lỗi khi lưu cấu hình vào đĩa:', e.message);
    }
  }

  getConfig() {
    return this.config;
  }

  async updateConfig(newFields) {
    this.config = { ...this.config, ...newFields };
    this.saveDiskData();

    if (getIsDBConnected() && ConfigModel) {
      try {
        await ConfigModel.findOneAndUpdate(
          { key: 'main_config' },
          { $set: this.config },
          { upsert: true, returnDocument: 'after' }
        );
      } catch (err) {
        console.error('⚠️ [MONGODB ATLAS] Lỗi khi lưu cấu hình:', err.message);
      }
    }
    return this.config;
  }
}

module.exports = new ConfigManager();

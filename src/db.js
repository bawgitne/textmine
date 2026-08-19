const mongoose = require('mongoose');
const dns = require('dns');

// Đọc file .env nếu có ở local
try {
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile();
  }
} catch (e) {}

// Cấu hình DNS IPv4 & Public DNS (8.8.8.8, 1.1.1.1) để khắc phục lỗi DNS SRV (querySrv ECONNREFUSED/ETIMEDOUT) trên mạng local Việt Nam
try {
  if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
  }
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://bawgitne_db_user:0scuMvwv2U5vwkgr@test.yaiifzu.mongodb.net/textmine?retryWrites=true&w=majority';

let isDBConnected = false;

// Mongoose Account Schema
const AccountSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  password: { type: String, default: '1234' },
  role: { type: String, default: 'AFK_OVERWORLD' },
  authType: { type: String, default: 'offline' },
  assignedLetterId: { type: String, default: null },
  bedPos: { type: Object, default: null }
}, { timestamps: true });

// Mongoose Shulker Box Schema
const ShulkerSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  letterId: { type: String, default: 'GLOBAL' },
  name: { type: String, required: true },
  blockType: { type: String, default: 'black_concrete' },
  pos: { type: Object, default: { x: 0, y: 172, z: 0 } },
  initialCapacity: { type: Number, default: 1728 },
  remainingBlocks: { type: Number, default: 1728 },
  status: { type: String, default: 'AVAILABLE' }
}, { timestamps: true });

// Mongoose Progress Schema (Lưu tiến độ pixel theo từng letterId)
const ProgressSchema = new mongoose.Schema({
  letterId: { type: String, required: true, unique: true },
  placedPixels: { type: [String], default: [] },
  placedPixelsCount: { type: Number, default: 0 }
}, { timestamps: true });

// Mongoose Config Schema (Lưu cấu hình hệ thống & TimeKeeper)
const ConfigSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: 'main_config' },
  host: { type: String },
  port: { type: Number },
  version: { type: String },
  yLevel: { type: Number },
  autoBuild: { type: Boolean },
  buildBlock: { type: String },
  buildDelayMs: { type: Number },
  timeKeeperAntiAfkMs: { type: Number },
  timeKeeperUsername: { type: String },
  autoManageNight: { type: Boolean }
}, { timestamps: true });

// Tắt buffering để tránh treo khi không có kết nối MongoDB
mongoose.set('bufferCommands', false);

const AccountModel = mongoose.model('Account', AccountSchema);
const ShulkerModel = mongoose.model('Shulker', ShulkerSchema);
const ProgressModel = mongoose.model('Progress', ProgressSchema);
const ConfigModel = mongoose.model('Config', ConfigSchema);

async function connectDB() {
  try {
    console.log('🔄 Đang kết nối tới MongoDB Atlas Database...');
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000
    });
    isDBConnected = true;
    console.log('✅ Đã kết nối thành công tới MongoDB Atlas!');
  } catch (err) {
    isDBConnected = false;
    console.error('⚠️ Không thể kết nối tới MongoDB Atlas (sử dụng file JSON đĩa cục bộ):', err.message);
  }
}

function getIsDBConnected() {
  return isDBConnected;
}

module.exports = {
  connectDB,
  getIsDBConnected,
  AccountModel,
  ShulkerModel,
  ProgressModel,
  ConfigModel
};

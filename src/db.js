const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://bawgitne_db_user:0scuMvwv2U5vwkgr@test.yaiifzu.mongodb.net/textmine?retryWrites=true&w=majority';

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
  pos: { type: Object, default: { x: 0, y: 250, z: 0 } },
  initialCapacity: { type: Number, default: 1728 },
  remainingBlocks: { type: Number, default: 1728 },
  status: { type: String, default: 'AVAILABLE' }
}, { timestamps: true });

const AccountModel = mongoose.model('Account', AccountSchema);
const ShulkerModel = mongoose.model('Shulker', ShulkerSchema);

async function connectDB() {
  try {
    console.log('🔄 Đang kết nối tới MongoDB Atlas Database...');
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000
    });
    console.log('✅ Đã kết nối thành công tới MongoDB Atlas!');
  } catch (err) {
    console.error('⚠️ Không thể kết nối tới MongoDB Atlas (sẽ dùng file JSON dự phòng):', err.message);
  }
}

module.exports = {
  connectDB,
  AccountModel,
  ShulkerModel
};

const fs = require('fs');
const path = require('path');
const { ShulkerModel } = require('./db');

const DATA_FILE = path.join(__dirname, '../data/shulkers.json');
const SHULKER_SLOT_CAPACITY = 1728;

class ShulkerManager {
  constructor() {
    this.shulkerBoxes = [];
    this.initData();
  }

  async initData() {
    try {
      const dataDir = path.dirname(DATA_FILE);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        this.shulkerBoxes = JSON.parse(raw) || [];
      } else {
        this.shulkerBoxes = [];
        this.saveDiskData();
      }

      // Sync from MongoDB Atlas
      if (ShulkerModel) {
        const dbShulkers = await ShulkerModel.find({}).lean();
        if (dbShulkers && dbShulkers.length > 0) {
          this.shulkerBoxes = dbShulkers.map(s => ({
            id: s.id,
            letterId: s.letterId || 'GLOBAL',
            name: s.name,
            blockType: s.blockType || 'black_concrete',
            pos: s.pos || { x: 0, y: 250, z: 0 },
            initialCapacity: s.initialCapacity || SHULKER_SLOT_CAPACITY,
            remainingBlocks: s.remainingBlocks || 0,
            status: s.status || 'AVAILABLE'
          }));
          this.saveDiskData();
          console.log(`☁️ [MONGODB ATLAS] Đã tải ${this.shulkerBoxes.length} Shulker Boxes từ Cloud Database!`);
        }
      }
    } catch (e) {
      console.error('Lỗi khi đọc data shulker box:', e.message);
      this.shulkerBoxes = [];
    }
  }

  saveDiskData() {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(this.shulkerBoxes, null, 2), 'utf8');
    } catch (e) {
      console.error('Lỗi khi lưu shulker box vào đĩa:', e.message);
    }
  }

  getAllShulkers() {
    return this.shulkerBoxes;
  }

  getShulkersForLetter(letterId) {
    return this.shulkerBoxes.filter(s => s.letterId === letterId);
  }

  getAvailableShulker(letterId) {
    return this.shulkerBoxes.find(
      s => s.letterId === letterId && s.status !== "DEPLETED" && s.remainingBlocks > 0
    );
  }

  async addShulker(shulkerData) {
    const newShulker = {
      id: shulkerData.id || `shulker_${Date.now()}`,
      letterId: shulkerData.letterId || "GLOBAL",
      name: shulkerData.name || `Rương Shulker ${Date.now()}`,
      blockType: shulkerData.blockType || "black_concrete",
      pos: shulkerData.pos || { x: 0, y: 250, z: 0 },
      initialCapacity: shulkerData.capacity || SHULKER_SLOT_CAPACITY,
      remainingBlocks: shulkerData.capacity || SHULKER_SLOT_CAPACITY,
      status: "AVAILABLE"
    };

    this.shulkerBoxes.push(newShulker);
    this.saveDiskData();

    try {
      await ShulkerModel.findOneAndUpdate({ id: newShulker.id }, newShulker, { upsert: true, new: true });
    } catch (err) {
      console.error('⚠️ [MONGODB ATLAS] Lỗi lưu shulker:', err.message);
    }

    return newShulker;
  }

  async updateShulker(id, updateFields) {
    const idx = this.shulkerBoxes.findIndex(s => s.id === id);
    if (idx !== -1) {
      this.shulkerBoxes[idx] = { ...this.shulkerBoxes[idx], ...updateFields };
      if (this.shulkerBoxes[idx].remainingBlocks <= 0) {
        this.shulkerBoxes[idx].remainingBlocks = 0;
        this.shulkerBoxes[idx].status = "DEPLETED";
      }
      this.saveDiskData();

      try {
        await ShulkerModel.findOneAndUpdate({ id: id }, this.shulkerBoxes[idx], { upsert: true });
      } catch (err) {}

      return this.shulkerBoxes[idx];
    }
    return null;
  }

  async removeShulker(id) {
    this.shulkerBoxes = this.shulkerBoxes.filter(s => s.id !== id);
    this.saveDiskData();

    try {
      await ShulkerModel.deleteOne({ id: id });
    } catch (err) {}
  }
}

module.exports = new ShulkerManager();

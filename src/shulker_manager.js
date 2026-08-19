const fs = require('fs');
const path = require('path');
const { ShulkerModel, getIsDBConnected } = require('./db');

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

      await this.syncWithDB();
    } catch (e) {
      console.error('Lỗi khi đọc data shulker box:', e.message);
      this.shulkerBoxes = [];
    }
  }

  async syncWithDB() {
    if (getIsDBConnected() && ShulkerModel) {
      try {
        const dbShulkers = await ShulkerModel.find({}).lean();
        if (dbShulkers && dbShulkers.length > 0) {
          this.shulkerBoxes = dbShulkers.map(s => ({
            id: s.id,
            letterId: s.letterId || 'GLOBAL',
            name: s.name,
            blockType: s.blockType || 'pink_concrete',
            pos: s.pos || { x: 0, y: 172, z: 0 },
            initialCapacity: s.initialCapacity || SHULKER_SLOT_CAPACITY,
            remainingBlocks: s.remainingBlocks || 0,
            status: s.status || 'AVAILABLE'
          }));
          this.saveDiskData();
          console.log(`☁️ [MONGODB ATLAS] Đã đồng bộ ${this.shulkerBoxes.length} Shulker Boxes từ Cloud Database!`);
        }
      } catch (e) {
        console.error('⚠️ [MONGODB ATLAS ERROR] Lỗi khi sync shulker boxes:', e.message);
      }
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
    const existingIdx = this.shulkerBoxes.findIndex(s => 
      s.id === shulkerData.id || 
      (s.pos && shulkerData.pos && s.pos.x === shulkerData.pos.x && s.pos.y === shulkerData.pos.y && s.pos.z === shulkerData.pos.z)
    );

    const newShulker = {
      id: shulkerData.id || `shulker_${Date.now()}`,
      letterId: shulkerData.letterId || "GLOBAL",
      name: shulkerData.name || `Rương Shulker ${Date.now()}`,
      blockType: shulkerData.blockType || 'pink_concrete',
      pos: shulkerData.pos || { x: 0, y: 172, z: 0 },
      initialCapacity: shulkerData.capacity || shulkerData.initialCapacity || SHULKER_SLOT_CAPACITY,
      remainingBlocks: shulkerData.remainingBlocks !== undefined ? shulkerData.remainingBlocks : (shulkerData.capacity || SHULKER_SLOT_CAPACITY),
      status: shulkerData.status || "AVAILABLE"
    };

    if (existingIdx !== -1) {
      this.shulkerBoxes[existingIdx] = { ...this.shulkerBoxes[existingIdx], ...newShulker };
    } else {
      this.shulkerBoxes.push(newShulker);
    }

    this.saveDiskData();

    if (getIsDBConnected() && ShulkerModel) {
      try {
        await ShulkerModel.findOneAndUpdate({ id: newShulker.id }, newShulker, { upsert: true, new: true });
      } catch (err) {
        console.error('⚠️ [MONGODB ATLAS] Lỗi lưu shulker:', err.message);
      }
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

      if (getIsDBConnected() && ShulkerModel) {
        try {
          await ShulkerModel.findOneAndUpdate({ id: id }, this.shulkerBoxes[idx], { upsert: true });
        } catch (err) {}
      }

      return this.shulkerBoxes[idx];
    }
    return null;
  }

  consumeBlocks(id, amount = 1) {
    const shulker = this.shulkerBoxes.find(s => s.id === id);
    if (!shulker) return null;

    const consumed = Math.max(0, Math.floor(Number(amount) || 0));
    shulker.remainingBlocks = Math.max(0, (Number(shulker.remainingBlocks) || 0) - consumed);
    shulker.status = shulker.remainingBlocks === 0 ? 'DEPLETED' : 'AVAILABLE';
    this.saveDiskData();

    // Builder không phải chờ network sau mỗi block; đồng bộ MongoDB chạy nền.
    if (getIsDBConnected() && ShulkerModel) {
      ShulkerModel.findOneAndUpdate(
        { id: shulker.id },
        { $set: { remainingBlocks: shulker.remainingBlocks, status: shulker.status } },
        { upsert: false }
      ).catch(err => console.error('Lỗi cập nhật số block Shulker:', err.message));
    }

    return shulker;
  }

  async removeShulker(id) {
    this.shulkerBoxes = this.shulkerBoxes.filter(s => s.id !== id);
    this.saveDiskData();

    if (getIsDBConnected() && ShulkerModel) {
      try {
        await ShulkerModel.deleteOne({ id: id });
      } catch (err) {}
    }
  }
}

module.exports = new ShulkerManager();

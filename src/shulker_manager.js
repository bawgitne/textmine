const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/shulkers.json');

// Mặc định 1 Shulker Box đầy 27 stack x 64 = 1728 block
const SHULKER_SLOT_CAPACITY = 1728;

class ShulkerManager {
  constructor() {
    this.shulkerBoxes = [];
    this.initData();
  }

  initData() {
    try {
      const dataDir = path.dirname(DATA_FILE);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        this.shulkerBoxes = JSON.parse(raw) || [];
      } else {
        // Mặc định mảng rỗng, không tự tạo mock data
        this.shulkerBoxes = [];
        this.saveData();
      }
    } catch (e) {
      console.error('Lỗi khi đọc data shulker box:', e);
      this.shulkerBoxes = [];
    }
  }

  saveData() {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(this.shulkerBoxes, null, 2), 'utf8');
    } catch (e) {
      console.error('Lỗi khi lưu shulker box:', e);
    }
  }

  generateDefaultShulkers() {
    return [];
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

  addShulker(shulkerData) {
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
    this.saveData();
    return newShulker;
  }

  updateShulker(id, updateFields) {
    const idx = this.shulkerBoxes.findIndex(s => s.id === id);
    if (idx !== -1) {
      this.shulkerBoxes[idx] = { ...this.shulkerBoxes[idx], ...updateFields };
      if (this.shulkerBoxes[idx].remainingBlocks <= 0) {
        this.shulkerBoxes[idx].remainingBlocks = 0;
        this.shulkerBoxes[idx].status = "DEPLETED";
      }
      this.saveData();
      return this.shulkerBoxes[idx];
    }
    return null;
  }

  consumeBlocks(id, amount) {
    const shulker = this.shulkerBoxes.find(s => s.id === id);
    if (!shulker) return null;

    shulker.remainingBlocks = Math.max(0, shulker.remainingBlocks - amount);
    if (shulker.remainingBlocks === 0) {
      shulker.status = "DEPLETED";
    } else {
      shulker.status = "IN_USE";
    }

    this.saveData();
    return shulker;
  }

  removeShulker(id) {
    this.shulkerBoxes = this.shulkerBoxes.filter(s => s.id !== id);
    this.saveData();
  }
}

module.exports = new ShulkerManager();

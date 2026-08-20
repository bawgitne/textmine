const fs = require('fs');
const path = require('path');
const { ProgressModel, getIsDBConnected } = require('./db');

const PROGRESS_FILE = path.join(__dirname, '../data/progress.json');

class ProgressManager {
  constructor() {
    this.progressMap = {}; // letterId -> { placedPixels: Set(id), placedPixelsCount: number }
    this.initData();
  }

  initData() {
    try {
      const dataDir = path.dirname(PROGRESS_FILE);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      if (fs.existsSync(PROGRESS_FILE)) {
        const raw = fs.readFileSync(PROGRESS_FILE, 'utf8');
        const parsed = JSON.parse(raw) || {};
        Object.keys(parsed).forEach(letterId => {
          this.progressMap[letterId] = {
            placedPixels: new Set(parsed[letterId].placedPixels || []),
            placedPixelsCount: parsed[letterId].placedPixelsCount || (parsed[letterId].placedPixels ? parsed[letterId].placedPixels.length : 0)
          };
        });
      }
    } catch (e) {
      console.error('Lỗi khi đọc file tiến độ cục bộ:', e.message);
    }
  }

  async syncWithDB() {
    if (getIsDBConnected() && ProgressModel) {
      try {
        const dbRecords = await ProgressModel.find({}).lean();
        if (dbRecords && dbRecords.length > 0) {
          dbRecords.forEach(rec => {
            const placedList = rec.placedPixels || [];
            this.progressMap[rec.letterId] = {
              placedPixels: new Set(placedList),
              placedPixelsCount: rec.placedPixelsCount || placedList.length
            };
          });
          this.saveDiskData();
          console.log(`☁️ [MONGODB ATLAS] Đã đồng bộ tiến độ pixel cho ${dbRecords.length} chữ cái từ Cloud Database!`);
        }
      } catch (e) {
        console.error('⚠️ [MONGODB ATLAS ERROR] Lỗi khi sync progress:', e.message);
      }
    }
  }

  saveDiskData() {
    try {
      const exportObj = {};
      Object.keys(this.progressMap).forEach(letterId => {
        exportObj[letterId] = {
          placedPixels: Array.from(this.progressMap[letterId].placedPixels),
          placedPixelsCount: this.progressMap[letterId].placedPixelsCount
        };
      });
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify(exportObj, null, 2), 'utf8');
    } catch (e) {
      console.error('Lỗi khi lưu tiến độ vào đĩa:', e.message);
    }
  }

  /**
   * Áp dụng tiến độ đã lưu vào đối tượng globalPixelData (Hỗ trợ ghép nối theo ID lẫn Tọa độ X, Z khi đảo ma trận)
   */
  applyProgressToPixelData(globalPixelData) {
    if (!globalPixelData || !globalPixelData.letters) return;

    Object.keys(globalPixelData.letters).forEach(letterId => {
      const letter = globalPixelData.letters[letterId];
      const prog = this.progressMap[letterId];

      if (prog && prog.placedPixels) {
        let count = 0;

        // Xây dựng Set các vị trí mc_x,mc_z đã đặt
        const placedCoordSet = new Set();
        letter.pixels.forEach(p => {
          if (prog.placedPixels.has(p.id) || prog.placedPixels.has(`${p.mc_x}_${p.mc_z}`)) {
            placedCoordSet.add(`${p.mc_x}_${p.mc_z}`);
          }
        });
        prog.placedPixels.forEach(idOrCoord => {
          if (typeof idOrCoord === 'string' && idOrCoord.includes('_') && !idOrCoord.startsWith(letterId)) {
            placedCoordSet.add(idOrCoord);
          }
        });

        const newPlacedPixels = new Set();

        letter.pixels.forEach(p => {
          const coordKey = `${p.mc_x}_${p.mc_z}`;
          if (prog.placedPixels.has(p.id) || placedCoordSet.has(coordKey)) {
            p.placed = true;
            count++;
            newPlacedPixels.add(p.id);
          }
        });

        letter.placedPixelsCount = count;
        prog.placedPixels = newPlacedPixels;
        prog.placedPixelsCount = count;
      }
    });
  }

  /**
   * Đánh dấu 1 pixel đã được xây dựng thành công
   */
  recordPixelPlaced(letterId, pixelId) {
    if (!this.progressMap[letterId]) {
      this.progressMap[letterId] = {
        placedPixels: new Set(),
        placedPixelsCount: 0
      };
    }

    const item = this.progressMap[letterId];
    if (!item.placedPixels.has(pixelId)) {
      item.placedPixels.add(pixelId);
      item.placedPixelsCount = item.placedPixels.size;

      this.saveDiskData();

      if (getIsDBConnected() && ProgressModel) {
        ProgressModel.findOneAndUpdate(
          { letterId: letterId },
          {
            $addToSet: { placedPixels: pixelId },
            $set: { placedPixelsCount: item.placedPixelsCount }
          },
          { upsert: true }
        ).catch(err => console.error(`⚠️ [MONGODB ATLAS] Lỗi lưu tiến độ pixel ${pixelId}:`, err.message));
      }
    }
  }

  /**
   * Xóa toàn bộ tiến độ (khi gọi API reset_progress)
   */
  async resetAllProgress(globalPixelData) {
    this.progressMap = {};
    this.saveDiskData();

    if (globalPixelData && globalPixelData.letters) {
      Object.keys(globalPixelData.letters).forEach(letterId => {
        const letter = globalPixelData.letters[letterId];
        letter.placedPixelsCount = 0;
        letter.pixels.forEach(p => p.placed = false);
      });
    }

    if (getIsDBConnected() && ProgressModel) {
      try {
        await ProgressModel.deleteMany({});
        console.log('🧹 Đã xóa toàn bộ tiến độ pixel trong MongoDB Atlas!');
      } catch (err) {
        console.error('⚠️ [MONGODB ATLAS] Lỗi khi reset tiến độ pixel:', err.message);
      }
    }
  }
}

module.exports = new ProgressManager();

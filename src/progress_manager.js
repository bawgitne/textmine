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
            const dbList = rec.placedPixels || [];
            const existingItem = this.progressMap[rec.letterId];
            const existingList = existingItem ? Array.from(existingItem.placedPixels) : [];

            // GỘP (UNION) TIẾN ĐỘ TỪ CẢ MONGODB VÀ FILE CỤC BỘ DƯỚI ĐĨA, KHÔNG BAO GIỜ GHI ĐÈ LÀM MẤT PIXEL!
            const mergedSet = new Set([...existingList, ...dbList]);

            let count = 0;
            mergedSet.forEach(val => {
              if (typeof val === 'string' && (val.startsWith(rec.letterId + '_') || !val.includes('_'))) {
                count++;
              }
            });

            this.progressMap[rec.letterId] = {
              placedPixels: mergedSet,
              placedPixelsCount: Math.max(rec.placedPixelsCount || 0, count)
            };

            // Nếu dữ liệu đĩa cục bộ có pixel mới hơn MongoDB, sync ngược lại MongoDB luôn
            if (mergedSet.size > dbList.length) {
              ProgressModel.findOneAndUpdate(
                { letterId: rec.letterId },
                {
                  $set: {
                    placedPixels: Array.from(mergedSet),
                    placedPixelsCount: this.progressMap[rec.letterId].placedPixelsCount
                  }
                },
                { upsert: true }
              ).catch(e => console.error(`⚠️ [MONGODB ATLAS ERROR] Lỗi sync ngược DB:`, e.message));
            }
          });
          this.saveDiskData();
          console.log(`☁️ [MONGODB ATLAS] Đã đồng bộ & gộp tiến độ pixel cho ${dbRecords.length} chữ cái từ Cloud Database!`);
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
      if (!this.progressMap[letterId]) {
        this.progressMap[letterId] = {
          placedPixels: new Set(),
          placedPixelsCount: 0
        };
      }
      const prog = this.progressMap[letterId];

      let count = 0;
      const newPlacedPixels = new Set(prog.placedPixels || []);

      const placedCoordSet = new Set();
      newPlacedPixels.forEach(idOrCoord => {
        if (typeof idOrCoord === 'string' && idOrCoord.includes('_')) {
          placedCoordSet.add(idOrCoord);
        }
      });

      letter.pixels.forEach(p => {
        const coordKey = `${p.mc_x}_${p.mc_z}`;
        if (p.placed || newPlacedPixels.has(p.id) || placedCoordSet.has(coordKey)) {
          p.placed = true;
          count++;
          newPlacedPixels.add(p.id);
          newPlacedPixels.add(coordKey);
        }
      });

      letter.placedPixelsCount = count;
      prog.placedPixels = newPlacedPixels;
      prog.placedPixelsCount = count;
    });
  }

  /**
   * Đánh dấu 1 pixel đã được xây dựng thành công
   */
  recordPixelPlaced(letterId, pixelId, coordKey) {
    if (!this.progressMap[letterId]) {
      this.progressMap[letterId] = {
        placedPixels: new Set(),
        placedPixelsCount: 0
      };
    }

    const item = this.progressMap[letterId];
    let changed = false;

    if (pixelId && !item.placedPixels.has(pixelId)) {
      item.placedPixels.add(pixelId);
      changed = true;
    }
    if (coordKey && !item.placedPixels.has(coordKey)) {
      item.placedPixels.add(coordKey);
      changed = true;
    }

    if (changed) {
      let uniquePixelCount = 0;
      item.placedPixels.forEach(val => {
        if (typeof val === 'string' && (val.startsWith(letterId + '_') || !val.includes('_'))) {
          uniquePixelCount++;
        }
      });
      item.placedPixelsCount = Math.max(item.placedPixelsCount, uniquePixelCount);

      this.saveDiskData();

      if (getIsDBConnected() && ProgressModel) {
        ProgressModel.findOneAndUpdate(
          { letterId: letterId },
          {
            $addToSet: { placedPixels: { $each: Array.from(item.placedPixels) } },
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

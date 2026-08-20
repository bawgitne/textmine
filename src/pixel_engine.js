const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

// Thông số gốc không gian ảnh
const OVERALL_CENTER_X = 943.5;
const OVERALL_CENTER_Y = 619.0;
const DEFAULT_Y_LEVEL = parseInt(process.env.BUILD_Y_LEVEL || '172', 10);

/**
 * Đọc file THẤT NGHIỆP.png và phân tích tọa độ pixel đen của 10 chữ cái
 */
function loadPixelData(imagePath = path.join(__dirname, '../THẤT NGHIỆP.png'), yLevel = DEFAULT_Y_LEVEL) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(imagePath)) {
      return reject(new Error(`Không tìm thấy file ảnh: ${imagePath}`));
    }

    fs.createReadStream(imagePath)
      .pipe(new PNG({ filterType: 4 }))
      .on('parsed', function () {
        const width = this.width;
        const height = this.height;
        const pixels = [];

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const idx = (width * y + x) << 2;
            const r = this.data[idx];
            const g = this.data[idx + 1];
            const b = this.data[idx + 2];
            const a = this.data[idx + 3];

            // R <= 10, G <= 10, B <= 10, Alpha > 0
            if (r <= 10 && g <= 10 && b <= 10 && a > 0) {
              const mc_x = Math.round(x - OVERALL_CENTER_X);
              // Đảo chiều Z để đọc chữ từ trên xuống dưới (y=0 tương ứng với Hướng Bắc -Z)
              const mc_z = Math.round(y - OVERALL_CENTER_Y);

              pixels.push({
                img_x: x,
                img_y: y,
                mc_x: mc_x,
                mc_y: yLevel,
                mc_z: mc_z
              });
            }
          }
        }

        // Định nghĩa 10 nhóm chữ cái chuẩn theo sơ đồ tọa độ người dùng cung cấp
        const letterConfigs = [
          // Dòng 1: THẤT (Tọa độ Z Dương: +278 đến +355)
          {
            id: "T1",
            word: "THẤT",
            label: "T (chữ đầu)",
            botName: "",
            bed_pos: { x: -461, y: 173, z: 278 },
            match: (p) => p.img_y <= 550 && p.img_x >= 300 && p.img_x < 600
          },
          {
            id: "H1",
            word: "THẤT",
            label: "H (từ THẤT)",
            botName: "",
            bed_pos: { x: -111, y: 173, z: 278 },
            match: (p) => p.img_y <= 550 && p.img_x >= 600 && p.img_x < 900
          },
          {
            id: "A_HAT_SAC",
            word: "THẤT",
            label: "A (không build dấu)",
            botName: "",
            bed_pos: { x: 258, y: 173, z: 355 },
            // Thân A bắt đầu tại y=154; hai component phía trên là dấu mũ và dấu sắc.
            match: (p) => p.img_y >= 154 && p.img_y <= 550 && p.img_x >= 900 && p.img_x < 1350
          },
          {
            id: "T2",
            word: "THẤT",
            label: "T (chữ cuối)",
            botName: "",
            bed_pos: { x: 591, y: 173, z: 278 },
            match: (p) => p.img_y <= 550 && p.img_x >= 1350
          },

          // Dòng 2: NGHIỆP (Tọa độ Z Âm: -338 đến -334)
          {
            id: "N",
            word: "NGHIỆP",
            label: "N",
            botName: "",
            bed_pos: { x: -802, y: 173, z: -338 },
            match: (p) => p.img_y > 550 && p.img_x < 300
          },
          {
            id: "G",
            word: "NGHIỆP",
            label: "G",
            botName: "",
            bed_pos: { x: -418, y: 173, z: -338 },
            match: (p) => p.img_y > 550 && p.img_x >= 300 && p.img_x < 690
          },
          {
            id: "H2",
            word: "NGHIỆP",
            label: "H (từ NGHIỆP)",
            botName: "",
            bed_pos: { x: -19, y: 173, z: -338 },
            match: (p) => p.img_y > 550 && p.img_x >= 690 && p.img_x < 1000
          },
          {
            id: "I",
            word: "NGHIỆP",
            label: "I",
            botName: "",
            bed_pos: { x: 250, y: 173, z: -338 },
            match: (p) => p.img_y > 550 && p.img_x >= 1000 && p.img_x < 1250
          },
          {
            id: "E_HAT_NANG",
            word: "NGHIỆP",
            label: "Ệ",
            botName: "",
            bed_pos: { x: 497, y: 173, z: -334 },
            match: (p) => p.img_y > 550 && p.img_x >= 1250 && p.img_x < 1600
          },
          {
            id: "P",
            word: "NGHIỆP",
            label: "P",
            botName: "",
            bed_pos: { x: 822, y: 173, z: -338 },
            match: (p) => p.img_y > 550 && p.img_x >= 1600
          }
        ];


        const lettersMap = {};

        letterConfigs.forEach((cfg) => {
          let letterPixels = pixels.filter(cfg.match).map((p, idx) => ({
            id: `${cfg.id}_${idx}`,
            img_x: p.img_x,
            img_y: p.img_y,
            mc_x: p.mc_x,
            mc_y: p.mc_y,
            mc_z: p.mc_z,
            placed: false
          }));

          let center_mc = { x: 0, y: yLevel, z: 0 };
          if (letterPixels.length > 0) {
            const minX = Math.min(...letterPixels.map((p) => p.mc_x));
            const maxX = Math.max(...letterPixels.map((p) => p.mc_x));
            const minZ = Math.min(...letterPixels.map((p) => p.mc_z));
            const maxZ = Math.max(...letterPixels.map((p) => p.mc_z));

            const rawCenterX = Math.round((minX + maxX) / 2);
            const rawCenterZ = Math.round((minZ + maxZ) / 2);

            // Dịch chuyển ma trận pixel sao cho TÂM CỦA CHỮ CÁI TRÙNG KHỚP HOÀN TOÀN VỚI TỌA ĐỘ GIƯỜNG (bed_pos)!
            const targetBed = cfg.bed_pos || { x: rawCenterX, y: yLevel, z: rawCenterZ };
            const shiftX = targetBed.x - rawCenterX;
            const shiftZ = targetBed.z - rawCenterZ;

            letterPixels = letterPixels.map(p => ({
              ...p,
              mc_x: p.mc_x + shiftX,
              mc_z: p.mc_z + shiftZ
            }));

            const finalMinX = Math.min(...letterPixels.map((p) => p.mc_x));
            const finalMaxX = Math.max(...letterPixels.map((p) => p.mc_x));
            const finalMinZ = Math.min(...letterPixels.map((p) => p.mc_z));
            const finalMaxZ = Math.max(...letterPixels.map((p) => p.mc_z));

            center_mc = {
              x: Math.round((finalMinX + finalMaxX) / 2),
              y: yLevel,
              z: Math.round((finalMinZ + finalMaxZ) / 2)
            };

            lettersMap[cfg.id] = {
              id: cfg.id,
              word: cfg.word,
              label: cfg.label,
              botName: cfg.botName,
              center_mc: center_mc,
              bed_pos: targetBed,
              totalPixels: letterPixels.length,
              placedPixelsCount: 0,
              pixels: letterPixels
            };
          }
        });

        resolve({
          imageDimensions: { width, height },
          overallCenterMC: { x: 0, y: yLevel, z: 0 },
          totalPixelsCount: pixels.length,
          letters: lettersMap
        });
      })
      .on('error', (err) => reject(err));
  });
}

module.exports = {
  loadPixelData,
  OVERALL_CENTER_X,
  OVERALL_CENTER_Y,
  DEFAULT_Y_LEVEL
};

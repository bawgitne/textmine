'use strict';

const vec3 = require('vec3');
const { GoalNear } = require('mineflayer-pathfinder').goals;
const progressManager = require('./progress_manager');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class BuilderEngine {
  constructor(manager) {
    this.manager = manager;
    this.generations = new Map();
  }

  start(botKey) {
    const generation = (this.generations.get(botKey) || 0) + 1;
    this.generations.set(botKey, generation);
    void this.run(botKey, generation);
  }

  stop(botKey) {
    this.generations.set(botKey, (this.generations.get(botKey) || 0) + 1);
  }

  isCurrent(botKey, generation, state) {
    return this.generations.get(botKey) === generation &&
      state.botInstance &&
      this.manager.config.autoBuild;
  }

  getLetter(state) {
    const id = state.assignedLetterId || state.letterId;
    return this.manager.pixelData.letters[id];
  }

  /**
   * Kiểm tra xem pixel mục tiêu có nằm trực tiếp bên dưới hoặc trùng vị trí Rương Shulker Box / Giường hay không
   */
  isBlockedByShulkerOrBed(bot, target) {
    if (!bot) return false;

    // 1. Kiểm tra chính tại vị trí pixel
    const blockSelf = bot.blockAt(target);
    if (blockSelf && blockSelf.name && (blockSelf.name.includes('shulker_box') || (blockSelf.name.includes('bed') && !blockSelf.name.includes('bedrock')))) {
      return true;
    }

    // 2. Kiểm tra ô ngay phía trên (Y+1) xem có Rương Shulker hay Giường không
    const blockAbove = bot.blockAt(target.plus(new vec3(0, 1, 0)));
    if (blockAbove && blockAbove.name && (blockAbove.name.includes('shulker_box') || (blockAbove.name.includes('bed') && !blockAbove.name.includes('bedrock')))) {
      return true;
    }

    return false;
  }

  /**
   * Lấy vị trí Giường an toàn (Chắc chắn trả về vec3 chuẩn, không bao giờ bị null/NaN)
   */
  getBedPosition(state, letter) {
    if (state && state.bedPos && typeof state.bedPos.x === 'number' && typeof state.bedPos.z === 'number') {
      return new vec3(state.bedPos.x, state.bedPos.y || 173, state.bedPos.z);
    }
    if (letter && letter.bed_pos && typeof letter.bed_pos.x === 'number' && typeof letter.bed_pos.z === 'number') {
      return new vec3(letter.bed_pos.x, letter.bed_pos.y || 173, letter.bed_pos.z);
    }
    const bot = state ? state.botInstance : null;
    if (bot && bot.entity && bot.entity.position) {
      return bot.entity.position;
    }
    return new vec3(-452, 173, 277);
  }

  /**
   * Tính bình phương khoảng cách 2D (X, Z) an toàn tuyệt đối chống NaN
   */
  getDistanceSq(pixel, targetVec) {
    const dx = Number(pixel.mc_x) - Number(targetVec.x);
    const dz = Number(pixel.mc_z) - Number(targetVec.z);
    if (isNaN(dx) || isNaN(dz)) return Infinity;
    return dx * dx + dz * dz;
  }

  /**
   * THUẬT TOÁN XÂY LAN TỎA LIÊN TỤC (Connected Spreading Algorithm):
   * ƯU TIÊN TUYỆT ĐỐI chọn pixel nằm KẾ BÊN CÁC BLOCK ĐÃ ĐẶT RỒI!
   */
  getPlacedCoordSet(letter) {
    const set = new Set();
    if (letter && letter.pixels) {
      for (const p of letter.pixels) {
        if (p.placed) {
          set.add(`${p.mc_x}_${p.mc_y}_${p.mc_z}`);
        }
      }
    }
    if (this.manager && this.manager.pixelData && this.manager.pixelData.letters) {
      for (const lId of Object.keys(this.manager.pixelData.letters)) {
        const l = this.manager.pixelData.letters[lId];
        if (l && l.pixels) {
          for (const p of l.pixels) {
            if (p.placed) {
              set.add(`${p.mc_x}_${p.mc_y}_${p.mc_z}`);
            }
          }
        }
      }
    }
    return set;
  }

  countPlacedNeighbors(bot, state, letter, pixel, placedCoordSet) {
    const neighbors = [
      { x: pixel.mc_x - 1, y: pixel.mc_y,     z: pixel.mc_z },
      { x: pixel.mc_x + 1, y: pixel.mc_y,     z: pixel.mc_z },
      { x: pixel.mc_x,     y: pixel.mc_y - 1, z: pixel.mc_z },
      { x: pixel.mc_x,     y: pixel.mc_y + 1, z: pixel.mc_z },
      { x: pixel.mc_x,     y: pixel.mc_y,     z: pixel.mc_z - 1 },
      { x: pixel.mc_x,     y: pixel.mc_y,     z: pixel.mc_z + 1 }
    ];

    let count = 0;
    const bedVec = this.getBedPosition(state, letter);

    for (const n of neighbors) {
      const key = `${n.x}_${n.y}_${n.z}`;
      if (placedCoordSet.has(key)) {
        count++;
        continue;
      }
      const nVec = new vec3(n.x, n.y, n.z);
      if (this.isSolidBlock(bot, nVec)) {
        count++;
        placedCoordSet.add(key);
        continue;
      }
      // Gần khu vực Giường / Rương Shulker
      if (Math.abs(n.x - bedVec.x) <= 2 && Math.abs(n.z - bedVec.z) <= 2 && Math.abs(n.y - bedVec.y) <= 1) {
        count++;
      }
    }
    return count;
  }

  nextPixel(state, letter) {
    const bot = state.botInstance;
    const unplaced = letter.pixels.filter(p => {
      if (p.placed) return false;
      if (bot) {
        const target = new vec3(p.mc_x, p.mc_y, p.mc_z);
        if (this.isBlockedByShulkerOrBed(bot, target)) {
          this.markPlaced(state.id || letter.id, state, letter, p, false);
          return false;
        }
      }
      return true;
    });

    if (unplaced.length === 0) return null;

    const bedVec = this.getBedPosition(state, letter);
    const lastPos = state.lastPlacedPixel
      ? new vec3(state.lastPlacedPixel.mc_x, state.lastPlacedPixel.mc_y, state.lastPlacedPixel.mc_z)
      : bedVec;
    const botVec = (bot && bot.entity && bot.entity.position) ? bot.entity.position : bedVec;

    const placedCoordSet = this.getPlacedCoordSet(letter);

    const connectedCandidates = [];

    for (const p of unplaced) {
      const neighborCount = this.countPlacedNeighbors(bot, state, letter, p, placedCoordSet);
      const distToLastSq = (p.mc_x - lastPos.x) ** 2 + (p.mc_y - lastPos.y) ** 2 + (p.mc_z - lastPos.z) ** 2;
      const distToBedSq = this.getDistanceSq(p, bedVec);
      const distToBotSq = (botVec ? (p.mc_x - botVec.x) ** 2 + (p.mc_z - botVec.z) ** 2 : distToBedSq);

      const target = new vec3(p.mc_x, p.mc_y, p.mc_z);
      const reference = bot ? this.findReference(bot, target, state, letter) : null;
      if (neighborCount > 0 && (!bot || reference)) {
        // Ưu tiên pixel có nhiều block kề cạnh (lấp lỗ rỗng) + gần vị trí hiện tại của Bot trước
        const score = (10 - Math.min(neighborCount, 6)) * 1000 + distToBotSq * 1.0 + distToLastSq * 0.2;
        connectedCandidates.push({ pixel: p, score, neighborCount, distToLastSq });
      } else if (bot && reference) {
        const score = distToBedSq + distToBotSq * 0.5;
        connectedCandidates.push({ pixel: p, score: score + 100000, neighborCount: 0, distToLastSq });
      }
    }

    // 1. ƯU TIÊN TUYỆT ĐỐI chọn pixel KẾ BÊN BLOCK ĐÃ ĐẶT RỒI
    if (connectedCandidates.length > 0) {
      connectedCandidates.sort((a, b) => a.score - b.score);
      return connectedCandidates[0].pixel;
    }

    // Nếu không có pixel nào đang đặt được an toàn, dừng chọn thay vì dựng cầu ngoài nét chữ.
    return null;
  }

  findBuildItem(bot) {
    const preferred = this.manager.config.buildBlock;
    const items = bot.inventory.items();
    return items.find(item => item.name === preferred) || items.find(item => {
      const block = bot.registry.blocksByName[item.name];
      return block && block.boundingBox === 'block';
    });
  }

  isSolidBlock(bot, pos) {
    if (!bot) return false;
    const block = bot.blockAt(pos);
    return block && block.name !== 'air' && block.name !== 'cave_air' && block.name !== 'void_air' && block.name !== 'water' && block.name !== 'flowing_water' && block.name !== 'lava' && block.type !== 0;
  }

  findReference(bot, target, state, letter) {
    const candidates = [
      { offset: new vec3(0, -1, 0), face: new vec3(0, 1, 0) },  // Below -> top face
      { offset: new vec3(0, 1, 0),  face: new vec3(0, -1, 0) }, // Above -> bottom face
      { offset: new vec3(-1, 0, 0), face: new vec3(1, 0, 0) },  // West -> east face
      { offset: new vec3(1, 0, 0),  face: new vec3(-1, 0, 0) }, // East -> west face
      { offset: new vec3(0, 0, -1), face: new vec3(0, 0, 1) },  // North -> south face
      { offset: new vec3(0, 0, 1),  face: new vec3(0, 0, -1) }   // South -> north face
    ];

    const placedCoordSet = this.getPlacedCoordSet(letter);
    const bedVec = state || letter ? this.getBedPosition(state, letter) : new vec3(-452, 173, 277);

    for (const candidate of candidates) {
      const neighborPos = target.plus(candidate.offset);
      const key = `${neighborPos.x}_${neighborPos.y}_${neighborPos.z}`;

      const isSolidWorld = this.isSolidBlock(bot, neighborPos);
      const isSolidMemory = placedCoordSet.has(key);
      const isBedPlatform = Math.abs(neighborPos.x - bedVec.x) <= 2 &&
                            Math.abs(neighborPos.z - bedVec.z) <= 2 &&
                            Math.abs(neighborPos.y - bedVec.y) <= 1;

      if (isSolidWorld || isSolidMemory || isBedPlatform) {
        const block = (bot && bot.blockAt && bot.blockAt(neighborPos)) || { position: neighborPos, name: 'black_concrete' };
        if (!block.position) block.position = neighborPos;
        return { block, face: candidate.face };
      }
    }
    return null;
  }

  /**
   * Di chuyển Bot bước từng bước đứng lên trên mặt block đã được đặt
   */
  async stepToBlock(bot, solidPos) {
    if (!bot || !bot.entity || !bot.pathfinder) return;
    const targetFeet = solidPos.offset(0.5, 1.0, 0.5);
    if (bot.entity.position.distanceTo(targetFeet) <= 1.2) return;

    try {
      const goal = new GoalNear(targetFeet.x, targetFeet.y, targetFeet.z, 0.5);
      await bot.pathfinder.goto(goal);
    } catch (err) {
      try {
        await bot.lookAt(targetFeet.offset(0, 1.6, 0), true);
        bot.setControlState('forward', true);
        const startTime = Date.now();
        while (bot.entity.position.distanceTo(targetFeet) > 0.8 && Date.now() - startTime < 1000) {
          await bot.lookAt(targetFeet.offset(0, 1.6, 0), true);
          await sleep(50);
        }
        bot.setControlState('forward', false);
      } catch (e) {
        try { bot.setControlState('forward', false); } catch (_) {}
      }
    }
  }

  /**
   * Đảm bảo Bot di chuyển lại gần block mục tiêu trong tầm với (<= 3.5m) trước khi đặt
   */
  async ensureWithinReach(bot, targetPos) {
    if (!bot || !bot.entity) return false;
    let dist = bot.entity.position.distanceTo(targetPos);
    if (dist <= 3.8) return true;

    if (bot.pathfinder) {
      const targetFloor = new vec3(targetPos.x, targetPos.y + 1, targetPos.z);
      try {
        const goal = new GoalNear(targetFloor.x, targetFloor.y, targetFloor.z, 2);
        const navigation = bot.pathfinder.goto(goal);
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('PATH_TIMEOUT')), 8000));
        await Promise.race([navigation, timeout]);
      } catch (err) {
        try { bot.pathfinder.stop(); } catch (e) {}
      }
    }

    dist = bot.entity.position.distanceTo(targetPos);
    if (dist <= 4.25) return true;

    try {
      await bot.lookAt(targetPos.offset(0, 1.6, 0), true);
      bot.setControlState('forward', true);
      const startTime = Date.now();
      while (bot.entity.position.distanceTo(targetPos) > 3.5 && Date.now() - startTime < 1200) {
        await bot.lookAt(targetPos.offset(0, 1.6, 0), true);
        await sleep(50);
      }
      bot.setControlState('forward', false);
    } catch (e) {
      try { bot.setControlState('forward', false); } catch (_) {}
    }

    dist = bot.entity.position.distanceTo(targetPos);
    return dist <= 4.5;
  }

  markPlaced(botKey, state, letter, pixel, consumeBlock = true) {
    if (pixel.placed) return;
    pixel.placed = true;
    letter.placedPixelsCount++;
    state.placedCount = letter.placedPixelsCount;
    state.buildCursor = (Number(state.buildCursor) || 0) + 1;
    state.lastPlacedPixel = pixel;

    progressManager.recordPixelPlaced(letter.id, pixel.id);

    if (consumeBlock && state.shulkerId) this.manager.shulkerManager.consumeBlocks(state.shulkerId, 1);
    this.manager.emitPixelPlaced(letter.id, pixel, letter);
  }

  async waitForSolid(bot, target, timeoutMs = 750) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (this.isSolidBlock(bot, target)) return true;
      await sleep(50);
    }
    return this.isSolidBlock(bot, target);
  }

  /**
   * Tải / Lấy block từ rương Shulker Box nếu inventory hết block (như logic test_bot.js)
   */
  async withdrawBlocksFromShulker(bot, state) {
    const shulkerPositions = bot.findBlocks({
      matching: (block) => block && block.name && block.name.includes('shulker_box'),
      maxDistance: 16,
      count: 30
    });

    if (!shulkerPositions || shulkerPositions.length === 0) {
      return false;
    }

    // Sắp xếp các rương theo khoảng cách từ gần đến xa
    if (bot.entity && bot.entity.position) {
      shulkerPositions.sort((a, b) => bot.entity.position.distanceTo(a) - bot.entity.position.distanceTo(b));
    }

    this.manager.log('info', `🧰 Bot [${state.username}] đang tiến lại gần các Rương Shulker Box (${shulkerPositions.length} rương) để rút block xây dựng...`);

    for (let i = 0; i < shulkerPositions.length; i++) {
      const pos = shulkerPositions[i];
      const shulkerBlock = bot.blockAt(pos);
      if (!shulkerBlock || !shulkerBlock.name.includes('shulker_box')) continue;

      // Di chuyển lại gần rương nếu ở xa > 3.5m
      if (bot.entity.position.distanceTo(pos) > 3.5) {
        try {
          const goal = new GoalNear(pos.x, pos.y, pos.z, 2);
          await bot.pathfinder.goto(goal);
        } catch (e) {
          continue;
        }
      }

      try {
        const container = await bot.openContainer(shulkerBlock);
        const items = container.containerItems() || [];

        let itemsWithdrawn = 0;
        for (const item of items) {
          if (!item || !item.name) continue;
          const isBuildBlock = item.name === this.manager.config.buildBlock ||
            (bot.registry.blocksByName[item.name] && bot.registry.blocksByName[item.name].boundingBox === 'block');

          if (isBuildBlock) {
            try {
              await container.withdraw(item.type, null, item.count);
              itemsWithdrawn++;
            } catch (e) {}
          }
        }

        try { container.close(); } catch (e) {}

        if (this.findBuildItem(bot)) {
          this.manager.log('success', `📦 Bot [${state.username}] đã rút block thành công từ Shulker Box (${pos.x}, ${pos.y}, ${pos.z})!`);
          return true;
        } else {
          // Rương trống / không có block cần thiết -> Đánh dấu rương rỗng và tiếp tục thử rương tiếp theo
          this.manager.log('warning', `⚠️ Rương Shulker tại (${pos.x}, ${pos.y}, ${pos.z}) trống/hết block xây! Đang tự động thử rương tiếp theo (${i + 1}/${shulkerPositions.length})...`);
          this.manager.shulkerManager.markDepletedByPos(pos);
        }
      } catch (err) {
        this.manager.log('warning', `⚠️ Bot [${state.username}] không mở được Shulker Box tại (${pos.x}, ${pos.y}, ${pos.z}): ${err.message}`);
      }
    }

    this.manager.log('warning', `⚠️ Toàn bộ ${shulkerPositions.length} Rương Shulker Box xung quanh Bot [${state.username}] đều đã HẾT block!`);
    return false;
  }

  /**
   * Thực thi quy trình nhảy khỏi tầng Y=172 tự sát (hoặc tự chìm dưới biển) khi vừa đặt hết block túi đồ để respawn về Giường (Không dùng lệnh cheat /kill)
   */
  async executeSuicideAndRespawn(bot, state) {
    this.manager.log('warning', `☠️ [DEATH REFILL] Bot [${state.username}] vừa đặt hết block trong túi đồ! Đang nhảy khỏi tầng Y=172 tự sát để respawn về Giường...`);

    // 1. Nhảy khỏi rìa tầng 172 (Dùng cơ chế rơi vật lý tự nhiên)
    try {
      bot.setControlState('jump', true);
      bot.setControlState('forward', true);
    } catch (e) {}

    // 2. Nếu rơi xuống biển/nước, ép bot nhìn thẳng xuống và chìm (sneak) để đuối nước tự sát
    const startTime = Date.now();
    while (Date.now() - startTime < 8000) {
      if (!bot.entity) break;
      const pos = bot.entity.position;
      const currentBlock = bot.blockAt(pos);

      if (currentBlock && (currentBlock.name === 'water' || currentBlock.name === 'flowing_water')) {
        this.manager.log('warning', `🌊 Bot [${state.username}] rơi xuống biển, đang chìm dưới nước để đuối nước tự sát respawn về Bed...`);
        try {
          await bot.look(bot.entity.yaw, -Math.PI / 2, true); // Nhìn thẳng xuống biển
          bot.setControlState('sneak', true); // Chìm xuống đáy biển
          bot.setControlState('jump', false);
        } catch (e) {}
      }

      await sleep(500);
    }

    // Tắt các nút điều khiển sau khi nhảy/chìm
    try {
      bot.setControlState('forward', false);
      bot.setControlState('jump', false);
      bot.setControlState('sneak', false);
    } catch (e) {}

    state.status = 'RESPAWNING';
    this.manager.broadcastState();
  }

  /**
   * Đảm bảo bot cầm block trên tay. Nếu hết block túi đồ: Rút rương Shulker xung quanh -> Nếu hết rương: Tự sát về Bed để rút Shulker tại Giường
   */
  async ensureHoldingBlock(bot, state) {
    let blockItem = this.findBuildItem(bot);
    if (blockItem && blockItem.count > 0) {
      try {
        await bot.equip(blockItem, 'hand');
        return true;
      } catch (e) {}
    }

    // 1. Thử rút block từ Shulker Box gần kề trước
    const withdrew = await this.withdrawBlocksFromShulker(bot, state);
    if (withdrew) {
      blockItem = this.findBuildItem(bot);
      if (blockItem) {
        try {
          await bot.equip(blockItem, 'hand');
          return true;
        } catch (e) {}
      }
    }

    // Nếu bot đã ở ngay gần Giường (bán kính 10m) mà vẫn không rút được block -> Rương tại Bed đã hết block, dừng lại ở NEED_BLOCKS chứ không tự sát lặp đi lặp lại!
    const bedVec = this.getBedPosition(state, null);
    if (bot && bot.entity && bot.entity.position && bot.entity.position.distanceTo(bedVec) <= 10) {
      return false;
    }

    // 2. Nếu túi đồ & rương lân cận đều hết -> Tự nhảy lầu Y=172 / chìm biển tự sát để về lại Giường
    await this.executeSuicideAndRespawn(bot, state);

    // 3. Sau khi tự sát respawn tại Giường -> Mở rương Shulker Box ngay sát Bed
    const withdrewAfterRespawn = await this.withdrawBlocksFromShulker(bot, state);
    if (!withdrewAfterRespawn) return false;

    blockItem = this.findBuildItem(bot);
    if (!blockItem) return false;

    try {
      await bot.equip(blockItem, 'hand');
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Đặt pixel bằng mặt tựa thật; không tạo scaffold ngoài ma trận chữ.
   */
  async placeBlockWithBridge(bot, state, letter, target) {
    if (this.isSolidBlock(bot, target)) {
      return true;
    }

    // Tích hợp kiểm tra mặt tựa từ MongoDB + Memory + World State
    const reference = this.findReference(bot, target, state, letter);

    if (!reference) return false;

    const ready = await this.ensureHoldingBlock(bot, state);
    if (!ready) return false;

    const inReach = await this.ensureWithinReach(bot, reference.block.position || target);
    if (!inReach) return false;

    try {
      await bot.placeBlock(reference.block, reference.face);
      return this.waitForSolid(bot, target);
    } catch (e) {
      const placedCoordSet = this.getPlacedCoordSet(letter);
      return this.isSolidBlock(bot, target) || placedCoordSet.has(`${target.x}_${target.y}_${target.z}`);
    }
  }

  /**
   * Quét nhanh và đặt dồn tất cả các pixel còn thiếu trong tầm với (<= 3.6m) nơi bot đang đứng (In-Reach Fast Batching từ test_bot.js)
   */
  async batchPlaceInReach(bot, state, letter) {
    if (!bot || !bot.entity) return;
    const currentFeet = bot.entity.position;
    const unplaced = letter.pixels.filter(p => !p.placed);

    for (const pixel of unplaced) {
      const target = new vec3(pixel.mc_x, pixel.mc_y, pixel.mc_z);
      if (currentFeet.distanceTo(target) <= 3.6) {
        if (this.isBlockedByShulkerOrBed(bot, target)) {
          this.markPlaced(state.id || letter.id, state, letter, pixel, false);
          continue;
        }

        if (this.isSolidBlock(bot, target)) {
          this.markPlaced(state.id || letter.id, state, letter, pixel, false);
          continue;
        }

        const ref = this.findReference(bot, target);
        if (ref) {
          const ready = await this.ensureHoldingBlock(bot, state);
          if (!ready) break;

          try {
            await bot.placeBlock(ref.block, ref.face);
            if (await this.waitForSolid(bot, target)) {
              this.markPlaced(state.id || letter.id, state, letter, pixel);
            }
          } catch (e) {}
        }
      }
    }
  }

  async place(botKey, state, letter, pixel) {
    const bot = state.botInstance;
    const target = new vec3(pixel.mc_x, pixel.mc_y, pixel.mc_z);

    // 0. TỰ ĐỘNG SKIP NẾU PIXEL NẰM TRỰC TIẾP DƯỚI HẶC TRÙNG VỊ TRÍ RƯƠNG SHULKER BOX / GIƯỜNG
    if (this.isBlockedByShulkerOrBed(bot, target)) {
      this.manager.log('info', `⏭️ [AUTO SKIP] Bỏ qua pixel (${target.x}, ${target.y}, ${target.z}) vì nằm dưới/trùng Rương Shulker Box hoặc Giường.`);
      this.markPlaced(botKey, state, letter, pixel, false);
      return;
    }

    // 1. ĐỨNG KIỂM TRA TÚI ĐỒ TRƯỚC HẾT: Nếu hết block thì tự động đi lại rương Shulker gần đó rút nạp vào túi đồ
    const ready = await this.ensureHoldingBlock(bot, state);
    if (!ready) {
      const error = new Error(`Hết block xây dựng & không rút được từ Shulker Box tại Bed.`);
      error.code = 'NO_BLOCKS';
      throw error;
    }

    // 2. Kiểm tra xem pixel mục tiêu đã được xây sẵn chưa
    if (this.isSolidBlock(bot, target)) {
      this.markPlaced(botKey, state, letter, pixel, false);
      return;
    }

    // Không pathfind tới tọa độ không khí; chỉ tiến tới block mặt tựa trong placeBlockWithBridge.
    state.status = 'PLACING';
    const success = await this.placeBlockWithBridge(bot, state, letter, target);
    if (success) {
      this.markPlaced(botKey, state, letter, pixel);
      // Đặt dồn các pixel xung quanh trong tầm với 3.6m
      await this.batchPlaceInReach(bot, state, letter);
    } else {
      throw new Error(`Không thể đặt pixel (${target.x}, ${target.y}, ${target.z}): thiếu mặt tựa hoặc không thể tới trong tầm`);
    }
  }

  async run(botKey, generation) {
    const state = this.manager.bots[botKey];
    if (!state) return;

    while (this.isCurrent(botKey, generation, state)) {
      const letter = this.getLetter(state);
      const pixel = letter && this.nextPixel(state, letter);
      if (!pixel) {
        const remaining = letter && letter.pixels.some(p => !p.placed);
        state.status = remaining ? 'BLOCKED' : 'FINISHED';
        if (remaining) {
          this.manager.log('warning', `[${state.username}] Còn pixel chưa xây nhưng chưa có mặt tựa hợp lệ. Dừng an toàn để không tạo bridge thừa.`);
        }
        this.manager.broadcastState();
        return;
      }

      try {
        await this.place(botKey, state, letter, pixel);
        state.consecutiveBuildErrors = 0;
        this.manager.broadcastState();
        await sleep(this.manager.config.buildDelayMs);
      } catch (error) {
        state.consecutiveBuildErrors = (state.consecutiveBuildErrors || 0) + 1;
        if (error.code === 'NO_BLOCKS') {
          state.status = 'NEED_BLOCKS';
          this.manager.log('warning', `[${state.username}] ${error.message}. Đã tạm dừng build.`);
          this.manager.broadcastState();
          return;
        }
        this.manager.log('error', `[${state.username}] Không đặt được pixel ${pixel.id}: ${error.message}`);
        if (state.consecutiveBuildErrors >= 3) {
          state.status = 'BLOCKED';
          this.manager.broadcastState();
          return;
        }
        await sleep(1000);
      }
    }
  }
}

module.exports = BuilderEngine;

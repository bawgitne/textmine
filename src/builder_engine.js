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
   * THUẬT TOÁN XÂY LAN TỎA TỪ TÂM GIƯỜNG (Connected Center-Out Spreading Algorithm):
   * Luôn luôn ưu tiên chọn pixel SÁT GIƯỜNG NHẤT (cách 0m - 1m) trước tiên!
   */
  nextPixel(state, letter) {
    const bot = state.botInstance;
    const unplaced = letter.pixels.filter(p => {
      if (p.placed) return false;
      if (bot) {
        const target = new vec3(p.mc_x, p.mc_y, p.mc_z);
        if (this.isBlockedByShulkerOrBed(bot, target)) {
          this.markPlaced(state.id || letter.id, state, letter, p);
          return false;
        }
      }
      return true;
    });

    if (unplaced.length === 0) return null;

    const bedVec = this.getBedPosition(state, letter);
    const botVec = (bot && bot.entity && bot.entity.position) ? bot.entity.position : bedVec;

    // 1. Lọc các pixel chưa xây mà ĐÃ CÓ BLOCK ĐỠ KỀ CẠNH (Reference block available)
    const buildable = [];
    for (const p of unplaced) {
      const target = new vec3(p.mc_x, p.mc_y, p.mc_z);
      const ref = this.findReference(bot, target);
      if (ref) {
        const distBotSq = this.getDistanceSq(p, botVec);
        const distBedSq = this.getDistanceSq(p, bedVec);
        buildable.push({ pixel: p, score: distBotSq + distBedSq * 0.5 });
      }
    }

    // Ưu tiên 1: Chọn pixel CÓ BLOCK ĐỠ KỀ CẠNH gần Bot/Giường nhất
    if (buildable.length > 0) {
      buildable.sort((a, b) => a.score - b.score);
      return buildable[0].pixel;
    }

    // Ưu tiên 2: BẮT BUỘC sắp xếp toàn bộ danh sách pixel theo khoảng cách CHÍNH XÁC tới mốc Giường (bedVec)
    unplaced.sort((a, b) => {
      const dA = this.getDistanceSq(a, bedVec);
      const dB = this.getDistanceSq(b, bedVec);
      return dA - dB;
    });

    return unplaced[0];
  }

  findBuildItem(bot) {
    const preferred = this.manager.config.buildBlock;
    const items = bot.inventory.items();
    return items.find(item => item.name === preferred) || items.find(item => {
      const block = bot.registry.blocksByName[item.name];
      return block && block.boundingBox === 'block';
    });
  }

  findReference(bot, target) {
    const candidates = [
      { offset: new vec3(0, -1, 0), face: new vec3(0, 1, 0) },
      { offset: new vec3(-1, 0, 0), face: new vec3(1, 0, 0) },
      { offset: new vec3(1, 0, 0), face: new vec3(-1, 0, 0) },
      { offset: new vec3(0, 0, -1), face: new vec3(0, 0, 1) },
      { offset: new vec3(0, 0, 1), face: new vec3(0, 0, -1) }
    ];
    for (const candidate of candidates) {
      const block = bot.blockAt(target.plus(candidate.offset));
      if (block && block.boundingBox === 'block') return { block, face: candidate.face };
    }
    return null;
  }

  markPlaced(botKey, state, letter, pixel) {
    if (pixel.placed) return;
    pixel.placed = true;
    letter.placedPixelsCount++;
    state.placedCount = letter.placedPixelsCount;
    state.buildCursor++;

    progressManager.recordPixelPlaced(letter.id, pixel.id);

    if (state.shulkerId) this.manager.shulkerManager.consumeBlocks(state.shulkerId, 1);
    this.manager.emitPixelPlaced(letter.id, pixel, letter);
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

    this.manager.log('info', `🧰 Bot [${state.username}] đang tiến lại gần Rương Shulker Box để rút block xây dựng...`);

    for (const pos of shulkerPositions) {
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
        }
      } catch (err) {
        this.manager.log('warning', `⚠️ Bot [${state.username}] không mở được Shulker Box tại (${pos.x}, ${pos.y}, ${pos.z}): ${err.message}`);
      }
    }

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
   * Tự động bắc cầu (Scaffold/Bridge) từ vị trí đứng của Bot đến pixel lơ lửng (logic chuẩn từ test_bot.js)
   */
  async placeBlockWithBridge(bot, state, letter, target) {
    let reference = this.findReference(bot, target);

    if (!reference) {
      const botFloorPos = bot.entity.position.floored().offset(0, -1, 0);
      const bridgePath = [];

      const steps = Math.max(Math.abs(target.x - botFloorPos.x), Math.abs(target.z - botFloorPos.z));
      for (let s = 0; s <= steps; s++) {
        const bx = Math.round(botFloorPos.x + (target.x - botFloorPos.x) * (s / steps));
        const bz = Math.round(botFloorPos.z + (target.z - botFloorPos.z) * (s / steps));
        bridgePath.push(new vec3(bx, target.y, bz));
      }

      for (const bPos of bridgePath) {
        const existing = bot.blockAt(bPos);
        if (existing && existing.name !== 'air' && existing.name !== 'cave_air' && existing.name !== 'void_air' && existing.type !== 0) {
          continue;
        }

        const bRef = this.findReference(bot, bPos);
        if (bRef) {
          const ready = await this.ensureHoldingBlock(bot, state);
          if (!ready) return false;

          try {
            await bot.placeBlock(bRef.block, bRef.face);
          } catch (e) {}
        }
      }

      reference = this.findReference(bot, target);
    }

    if (!reference) return false;

    const ready = await this.ensureHoldingBlock(bot, state);
    if (!ready) return false;

    try {
      await bot.placeBlock(reference.block, reference.face);
      return true;
    } catch (e) {
      return false;
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
          this.markPlaced(state.id || letter.id, state, letter, pixel);
          continue;
        }

        const existing = bot.blockAt(target);
        if (existing && existing.name !== 'air' && existing.name !== 'cave_air' && existing.name !== 'void_air' && existing.type !== 0) {
          this.markPlaced(state.id || letter.id, state, letter, pixel);
          continue;
        }

        const ref = this.findReference(bot, target);
        if (ref) {
          const ready = await this.ensureHoldingBlock(bot, state);
          if (!ready) break;

          try {
            await bot.placeBlock(ref.block, ref.face);
            this.markPlaced(state.id || letter.id, state, letter, pixel);
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
      this.markPlaced(botKey, state, letter, pixel);
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
    let existing = bot.blockAt(target);
    if (existing && existing.name !== 'air' && existing.name !== 'cave_air' && existing.name !== 'void_air' && existing.type !== 0) {
      this.markPlaced(botKey, state, letter, pixel);
      return;
    }

    // 3. Cho bot di chuyển lại gần pixel mục tiêu để xây
    if (bot.entity.position.distanceTo(target) > 4.25) {
      state.status = 'MOVING';
      this.manager.broadcastState();
      try {
        await bot.pathfinder.goto(new GoalNear(target.x, target.y, target.z, 3));
      } catch (e) {}
    }

    // 4. Kiểm tra lại block tại mục tiêu sau khi đã di chuyển lại gần
    existing = bot.blockAt(target);
    if (existing && existing.name !== 'air' && existing.name !== 'cave_air' && existing.name !== 'void_air' && existing.type !== 0) {
      this.markPlaced(botKey, state, letter, pixel);
      return;
    }

    // 5. Sử dụng thuật toán bắc cầu (Scaffolding / Bridging) tự tạo móng nếu pixel lơ lửng
    state.status = 'PLACING';
    const success = await this.placeBlockWithBridge(bot, state, letter, target);
    if (success) {
      this.markPlaced(botKey, state, letter, pixel);
      // Đặt dồn các pixel xung quanh trong tầm với 3.6m
      await this.batchPlaceInReach(bot, state, letter);
    } else {
      throw new Error(`Không thể đặt/bắc cầu đến pixel (${target.x}, ${target.y}, ${target.z})`);
    }
  }

  async run(botKey, generation) {
    const state = this.manager.bots[botKey];
    if (!state) return;

    while (this.isCurrent(botKey, generation, state)) {
      const letter = this.getLetter(state);
      const pixel = letter && this.nextPixel(state, letter);
      if (!pixel) {
        state.status = 'FINISHED';
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

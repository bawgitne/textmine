'use strict';

const vec3 = require('vec3');
const { GoalNear } = require('mineflayer-pathfinder').goals;

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
      this.manager.config.autoBuild &&
      this.manager.timeKeeper.isDay;
  }

  getLetter(state) {
    const id = state.assignedLetterId || state.letterId;
    return this.manager.pixelData.letters[id];
  }

  nextPixel(state, letter) {
    if (!Number.isInteger(state.buildCursor)) state.buildCursor = 0;
    while (state.buildCursor < letter.pixels.length && letter.pixels[state.buildCursor].placed) {
      state.buildCursor++;
    }
    return letter.pixels[state.buildCursor] || null;
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

    if (state.shulkerId) this.manager.shulkerManager.consumeBlocks(state.shulkerId, 1);
    this.manager.emitPixelPlaced(letter.id, pixel, letter);
  }

  async place(botKey, state, letter, pixel) {
    const bot = state.botInstance;
    const target = new vec3(pixel.mc_x, pixel.mc_y, pixel.mc_z);
    const existing = bot.blockAt(target);
    if (existing && existing.boundingBox === 'block') {
      this.markPlaced(botKey, state, letter, pixel);
      return;
    }

    if (bot.entity.position.distanceTo(target) > 4.25) {
      state.status = 'MOVING';
      this.manager.broadcastState();
      await bot.pathfinder.goto(new GoalNear(target.x, target.y, target.z, 3));
    }

    const item = this.findBuildItem(bot);
    if (!item) {
      const error = new Error(`Hết block '${this.manager.config.buildBlock}' trong inventory`);
      error.code = 'NO_BLOCKS';
      throw error;
    }

    const reference = this.findReference(bot, target);
    if (!reference) throw new Error(`Không có block đỡ cạnh pixel (${target.x}, ${target.y}, ${target.z})`);

    state.status = 'PLACING';
    await bot.equip(item, 'hand');
    await bot.placeBlock(reference.block, reference.face);
    this.markPlaced(botKey, state, letter, pixel);
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

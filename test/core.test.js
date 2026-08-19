'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isDayTime, ticksToClock } = require('../src/time_utils');
const { findNearestLetter } = require('../src/letter_assignment');
const { getBuilderAssignment } = require('../src/builder_assignments');
const pixelEngine = require('../src/pixel_engine');
const botManager = require('../src/bot_manager');
const shulkerManager = require('../src/shulker_manager');
const BuilderEngine = require('../src/builder_engine');

test('phân loại đúng các mốc ngày và đêm', () => {
  assert.equal(isDayTime(0), true);
  assert.equal(isDayTime(12540), true);
  assert.equal(isDayTime(12541), false);
  assert.equal(isDayTime(23457), false);
  assert.equal(isDayTime(23458), true);
  assert.equal(ticksToClock(0), '06:00');
  assert.equal(ticksToClock(6000), '12:00');
});

test('fixed builders are assigned to the requested THẤT letters', () => {
  assert.equal(getBuilderAssignment('XinCoDungDi'), 'T1');
  assert.equal(getBuilderAssignment('XinOngDungDi'), 'H1');
  assert.equal(getBuilderAssignment('XinTuiDungDi'), 'A_HAT_SAC');
  assert.equal(getBuilderAssignment('XinNgaDungDi'), 'T2');
});

test('A builder receives the body of A but none of its accent pixels', async () => {
  const data = await pixelEngine.loadPixelData();
  const aPixels = data.letters.A_HAT_SAC.pixels;

  assert.ok(aPixels.length > 0);
  assert.ok(aPixels.every(pixel => pixel.img_y >= 154));
});

test('stop builder resolves its account key and disconnects the Mineflayer client', () => {
  let quitReason = null;
  const originalBots = botManager.bots;
  const originalStop = botManager.builderEngine.stop;
  const originalBroadcast = botManager.broadcastState;

  botManager.bots = {
    XinCoDungDi: {
      id: 'XinCoDungDi',
      username: 'XinCoDungDi',
      assignedLetterId: 'T1',
      status: 'IDLE',
      botInstance: { quit: reason => { quitReason = reason; } }
    }
  };
  botManager.builderEngine.stop = () => {};
  botManager.broadcastState = () => {};

  try {
    assert.equal(botManager.stopBot('T1'), true);
    assert.equal(quitReason, 'Stopped from dashboard');
    assert.equal(botManager.bots.XinCoDungDi.botInstance, null);
    assert.equal(botManager.bots.XinCoDungDi.status, 'OFFLINE');
  } finally {
    botManager.bots = originalBots;
    botManager.builderEngine.stop = originalStop;
    botManager.broadcastState = originalBroadcast;
  }
});

test('consuming blocks updates a shulker and marks it depleted at zero', () => {
  const originalBoxes = shulkerManager.shulkerBoxes;
  const originalSave = shulkerManager.saveDiskData;
  shulkerManager.shulkerBoxes = [{ id: 'test_box', remainingBlocks: 2, status: 'AVAILABLE' }];
  shulkerManager.saveDiskData = () => {};

  try {
    assert.equal(shulkerManager.consumeBlocks('test_box', 1).remainingBlocks, 1);
    const depleted = shulkerManager.consumeBlocks('test_box', 5);
    assert.equal(depleted.remainingBlocks, 0);
    assert.equal(depleted.status, 'DEPLETED');
    assert.equal(shulkerManager.consumeBlocks('missing', 1), null);
  } finally {
    shulkerManager.shulkerBoxes = originalBoxes;
    shulkerManager.saveDiskData = originalSave;
  }
});

test('builder engine remains active at night', () => {
  const manager = { config: { autoBuild: true }, timeKeeper: { isDay: false } };
  const engine = new BuilderEngine(manager);
  const state = { botInstance: {} };
  engine.generations.set('builder', 1);

  assert.equal(engine.isCurrent('builder', 1, state), true);
});

test('night flow asks only Time Manager to sleep', async () => {
  const originalTimeKeeper = botManager.timeKeeper;
  const originalBots = botManager.bots;
  const originalAfkBots = botManager.afkBots;
  const originalTrySleep = botManager.tryBotSleep;
  const originalBroadcast = botManager.broadcastState;
  const slept = [];

  botManager.timeKeeper = { botInstance: { isSleeping: false }, username: 'TimeManager', timeOfDay: 13000 };
  botManager.bots = { builder: { role: 'BUILDER', botInstance: {}, username: 'Builder' } };
  botManager.afkBots = { afk: { botInstance: {}, username: 'AFK' } };
  botManager.tryBotSleep = (bot, username) => slept.push(username);
  botManager.broadcastState = () => {};

  try {
    await botManager.handleNightTime();
    assert.deepEqual(slept, ['TimeManager']);
  } finally {
    botManager.timeKeeper = originalTimeKeeper;
    botManager.bots = originalBots;
    botManager.afkBots = originalAfkBots;
    botManager.tryBotSleep = originalTrySleep;
    botManager.broadcastState = originalBroadcast;
  }
});

test('gán chữ theo pixel gần bot nhất và tôn trọng chữ đã có người nhận', () => {
  const letters = {
    A: { pixels: [{ mc_x: 0, mc_z: 0 }, { mc_x: 1, mc_z: 0 }] },
    B: { pixels: [{ mc_x: 100, mc_z: 100 }] }
  };
  assert.equal(findNearestLetter({ x: 2, z: 0 }, letters).id, 'A');
  assert.equal(findNearestLetter({ x: 2, z: 0 }, letters, new Set(['A'])).id, 'B');
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isDayTime, ticksToClock } = require('../src/time_utils');
const { findNearestLetter } = require('../src/letter_assignment');

test('phân loại đúng các mốc ngày và đêm', () => {
  assert.equal(isDayTime(0), true);
  assert.equal(isDayTime(12540), true);
  assert.equal(isDayTime(12541), false);
  assert.equal(isDayTime(23457), false);
  assert.equal(isDayTime(23458), true);
  assert.equal(ticksToClock(0), '06:00');
  assert.equal(ticksToClock(6000), '12:00');
});

test('gán chữ theo pixel gần bot nhất và tôn trọng chữ đã có người nhận', () => {
  const letters = {
    A: { pixels: [{ mc_x: 0, mc_z: 0 }, { mc_x: 1, mc_z: 0 }] },
    B: { pixels: [{ mc_x: 100, mc_z: 100 }] }
  };
  assert.equal(findNearestLetter({ x: 2, z: 0 }, letters).id, 'A');
  assert.equal(findNearestLetter({ x: 2, z: 0 }, letters, new Set(['A'])).id, 'B');
});

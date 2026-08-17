'use strict';

const NIGHT_START = 12541;
const DAY_START = 23458;
const DAY_TICKS = 24000;

function normalizeTime(timeOfDay) {
  const value = Number.isFinite(Number(timeOfDay)) ? Number(timeOfDay) : 0;
  return ((Math.floor(value) % DAY_TICKS) + DAY_TICKS) % DAY_TICKS;
}

function isDayTime(timeOfDay) {
  const ticks = normalizeTime(timeOfDay);
  return ticks < NIGHT_START || ticks >= DAY_START;
}

function ticksToClock(timeOfDay) {
  const ticks = normalizeTime(timeOfDay);
  const hours = Math.floor((ticks / 1000 + 6) % 24);
  const minutes = Math.floor(((ticks % 1000) * 60) / 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

module.exports = { NIGHT_START, DAY_START, DAY_TICKS, normalizeTime, isDayTime, ticksToClock };

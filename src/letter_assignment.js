'use strict';

function squaredDistance2D(a, b) {
  const dx = Number(a.x) - Number(b.x);
  const dz = Number(a.z) - Number(b.z);
  return dx * dx + dz * dz;
}

function distanceToLetter(position, letter) {
  if (!letter || !Array.isArray(letter.pixels) || letter.pixels.length === 0) {
    return Infinity;
  }

  let best = Infinity;
  for (const pixel of letter.pixels) {
    const distance = squaredDistance2D(position, { x: pixel.mc_x, z: pixel.mc_z });
    if (distance < best) best = distance;
    if (best === 0) break;
  }
  return Math.sqrt(best);
}

function findNearestLetter(position, letters, excludedIds = new Set()) {
  if (!position || !letters) return null;

  let nearest = null;
  for (const [id, letter] of Object.entries(letters)) {
    if (excludedIds.has(id)) continue;
    const distance = distanceToLetter(position, letter);
    if (!nearest || distance < nearest.distance) {
      nearest = { id, letter, distance };
    }
  }
  return nearest;
}

module.exports = { squaredDistance2D, distanceToLetter, findNearestLetter };

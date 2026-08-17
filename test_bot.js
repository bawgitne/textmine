const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const Vec3 = require('vec3');

// Config parameters
const BOT_CONFIG = {
    host: 'localhost',
    port: 25000,
    username: 'TestBo1t',
    version: '1.21.11', // Standard Mineflayer version string for 1.21.x
};

console.log('🤖 Creating Mineflayer bot with config:', BOT_CONFIG);

const bot = mineflayer.createBot(BOT_CONFIG);

// Track placed block coordinates in local memory set for instant reference checking
const placedBlocksSet = new Set();

// Load pathfinder plugin for navigation
bot.loadPlugin(pathfinder);

bot.once('spawn', async () => {
    console.log(`✅ Bot successfully joined server as ${bot.username}`);
    
    // Send teleport command upon joining
    console.log('⚡ Sending command: /tp XinEmDungDi ...');
    bot.chat('/tp XinEmDungDi');
    await bot.waitForTicks(20); // Wait 1 second for teleport processing

    // Setup pathfinder movements
    const defaultMove = new Movements(bot);
    bot.pathfinder.setMovements(defaultMove);

    try {
        // Step 1: Find bed and set spawn
        const bedBlock = await handleBedSpawn();

        // Step 2: Scan nearby Shulker Boxes
        const shulkerList = scanShulkerBoxes();
        console.log('\n📦 Found Shulker Boxes:', JSON.stringify(shulkerList, null, 2));

        // Step 3: Check inventory. If out of blocks, take from Shulker Box first!
        if (!findBuildingBlock()) {
            console.log('🎒 No building blocks in inventory initially. Attempting to fetch from Shulker Boxes...');
            await withdrawBlocksFromShulkers(shulkerList);
        }

        // Target center & Y level: 1 block below the detected bed (or bot position if no bed)
        const centerVec1 = bedBlock ? bedBlock.position : bot.entity.position.floored();
        const targetY = centerVec1.y - 1;

        console.log(`\n📍 [Circle #1] Center: (${centerVec1.x}, ${centerVec1.y}, ${centerVec1.z}) | Disk Y Level: ${targetY}`);

        // Step 4: Build 1st FULL SOLID CIRCLE DISK (bán kính 10 ô)
        await buildDiskWithGreedyClustering(centerVec1, 10, targetY, shulkerList);
        console.log('\n🎉 Circle #1 floor completed!');

        // Step 5: Move 20 blocks away in +X direction to build Circle #2
        const centerVec2 = centerVec1.offset(20, 0, 0);
        console.log(`\n➡️ [Moving] Walking 20 blocks to new center for Circle #2: (${centerVec2.x}, ${centerVec2.y}, ${centerVec2.z})...`);

        const botCurrentFloor = bot.entity.position.floored().offset(0, -1, 0);
        await buildInitialBridgeToStart(botCurrentFloor, centerVec2, shulkerList);

        // Step 6: Build 2nd FULL SOLID CIRCLE DISK (bán kính 10 ô)
        console.log(`\n🔴 [Circle #2] Building circle disk at center (${centerVec2.x}, ${centerVec2.z})...`);
        await buildDiskWithGreedyClustering(centerVec2, 10, targetY, shulkerList);

        console.log('\n🎉 ALL CIRCLE FLOORS COMPLETED SUCCESSFULLY!');
    } catch (err) {
        console.error('❌ Error during test routine:', err);
    }
});

/**
 * 1. Find nearby bed and interact/set spawn
 */
async function handleBedSpawn() {
    console.log('\n🛌 [Step 1] Looking for nearby bed...');
    
    const bedBlock = bot.findBlock({
        matching: (block) => block.name.includes('bed'),
        maxDistance: 32
    });

    if (!bedBlock) {
        console.log('⚠️ No bed found within 32 blocks.');
        return null;
    }

    console.log(`📍 Found bed (${bedBlock.name}) at: ${bedBlock.position}`);

    // Walk to bed if needed
    if (bot.entity.position.distanceTo(bedBlock.position) > 3) {
        console.log('🚶 Moving closer to the bed...');
        const goal = new goals.GoalNear(bedBlock.position.x, bedBlock.position.y, bedBlock.position.z, 2);
        await bot.pathfinder.goto(goal);
    }

    // Interact with bed
    try {
        console.log('👆 Right-clicking bed to set spawn point...');
        await bot.activateBlock(bedBlock);
        console.log('✅ Interacted with bed (Spawn point updated).');
    } catch (err) {
        console.log('⚠️ Interaction attempt with bed notice:', err.message);
    }

    await bot.waitForTicks(10);
    return bedBlock;
}

/**
 * 2. Scan nearby Shulker Boxes and add to list
 */
function scanShulkerBoxes() {
    console.log('\n📦 [Step 2] Scanning for nearby Shulker Boxes...');
    
    const shulkerPositions = bot.findBlocks({
        matching: (block) => block.name.includes('shulker_box'),
        maxDistance: 32,
        count: 100
    });

    const shulkerList = shulkerPositions.map(pos => {
        const block = bot.blockAt(pos);
        return {
            name: block.name,
            x: pos.x,
            y: pos.y,
            z: pos.z
        };
    });

    console.log(`✅ Scanned ${shulkerList.length} Shulker Box(es).`);
    return shulkerList;
}

/**
 * Helper to check if an item is a placeable building block
 */
function isBuildingBlockItem(item) {
    if (!item) return false;
    const name = item.name.toLowerCase();
    
    const nonBlocks = [
        'pickaxe', 'axe', 'shovel', 'sword', 'hoe', 'shears', 'flint_and_steel',
        'bed', 'shulker', 'helmet', 'chestplate', 'leggings', 'boots',
        'bucket', 'totem', 'potion', 'arrow', 'bow', 'crossbow', 'trident',
        'apple', 'bread', 'porkchop', 'beef', 'chicken', 'golden_apple', 'carrot', 'potato',
        'stick', 'string', 'feather', 'gunpowder', 'wheat', 'seed', 'iron_ingot', 'gold_ingot',
        'diamond', 'emerald', 'coal', 'redstone', 'lapis_lazuli', 'book', 'paper'
    ];

    return !nonBlocks.some(nb => name.includes(nb));
}

/**
 * Helper to find solid placeable block in bot's inventory
 */
function findBuildingBlock() {
    const items = bot.inventory.items();
    return items.find(item => isBuildingBlockItem(item));
}

/**
 * Open Shulker Boxes in shulkerList and withdraw building blocks
 */
async function withdrawBlocksFromShulkers(shulkerList) {
    if (!shulkerList || shulkerList.length === 0) {
        console.log('⚠️ No Shulker Boxes available in the list to withdraw from.');
        return false;
    }

    console.log(`\n🧰 Checking ${shulkerList.length} Shulker Box(es) for building blocks...`);

    for (const shulkerInfo of shulkerList) {
        const shulkerVec = new Vec3(shulkerInfo.x, shulkerInfo.y, shulkerInfo.z);
        const shulkerBlock = bot.blockAt(shulkerVec);

        if (!shulkerBlock || !shulkerBlock.name.includes('shulker_box')) {
            continue;
        }

        // Walk to shulker box if needed
        if (bot.entity.position.distanceTo(shulkerVec) > 3.5) {
            console.log(`🚶 Walking to Shulker Box at ${shulkerVec}...`);
            try {
                const goal = new goals.GoalNear(shulkerVec.x, shulkerVec.y, shulkerVec.z, 2);
                await bot.pathfinder.goto(goal);
            } catch (err) {
                continue;
            }
        }

        try {
            console.log(`🔓 Opening Shulker Box at ${shulkerVec}...`);
            const container = await bot.openContainer(shulkerBlock);
            const containerItems = container.containerItems();

            let itemsWithdrawn = 0;
            for (const item of containerItems) {
                if (isBuildingBlockItem(item)) {
                    await container.withdraw(item.type, null, item.count);
                    itemsWithdrawn++;
                }
            }

            container.close();
            console.log(`🔒 Closed Shulker Box.`);

            if (findBuildingBlock()) {
                console.log(`✅ Successfully refilled building blocks from Shulker Box!`);
                return true;
            }
        } catch (err) {
            console.log(`❌ Error accessing Shulker Box at ${shulkerVec}:`, err.message);
        }
    }

    return false;
}

/**
 * Check if block is solid either in bot's world cache or in placedBlocksSet
 */
function isSolidAt(pos) {
    const key = `${pos.x},${pos.y},${pos.z}`;
    if (placedBlocksSet.has(key)) return true;

    const block = bot.blockAt(pos);
    return block && block.name !== 'air' && block.name !== 'water' && block.name !== 'lava';
}

/**
 * Find an adjacent solid block (reference block) and the face vector to place against
 */
function findPlacementReference(targetPos) {
    const faces = [
        { offset: new Vec3(0, -1, 0), face: new Vec3(0, 1, 0) },  // Below -> top face
        { offset: new Vec3(0, 1, 0),  face: new Vec3(0, -1, 0) }, // Above -> bottom face
        { offset: new Vec3(0, 0, -1), face: new Vec3(0, 0, 1) },  // North -> south face
        { offset: new Vec3(0, 0, 1),  face: new Vec3(0, 0, -1) }, // South -> north face
        { offset: new Vec3(-1, 0, 0), face: new Vec3(1, 0, 0) },  // West -> east face
        { offset: new Vec3(1, 0, 0),  face: new Vec3(-1, 0, 0) }   // East -> west face
    ];

    for (const f of faces) {
        const neighborPos = targetPos.plus(f.offset);
        if (isSolidAt(neighborPos)) {
            const neighborBlock = bot.blockAt(neighborPos) || { position: neighborPos, name: 'stone' };
            return { referenceBlock: neighborBlock, faceVector: f.face };
        }
    }

    return null;
}

/**
 * Fast check & equip block only if not holding building block
 */
async function ensureHoldingBlock(shulkerList) {
    const held = bot.heldItem;
    if (held && isBuildingBlockItem(held) && held.count > 0) return true;

    let blockItem = findBuildingBlock();
    if (!blockItem) {
        await withdrawBlocksFromShulkers(shulkerList);
        blockItem = findBuildingBlock();
        if (!blockItem) return false;
    }

    await bot.equip(blockItem, 'hand');
    return true;
}

/**
 * Walk bot step-by-step to stand on top of a placed block position
 */
async function stepToBlock(solidPos) {
    const targetFeet = solidPos.offset(0.5, 1.0, 0.5);
    if (bot.entity.position.distanceTo(targetFeet) <= 1.2) return;

    try {
        const goal = new goals.GoalNear(targetFeet.x, targetFeet.y, targetFeet.z, 0.5);
        await bot.pathfinder.goto(goal);
    } catch (err) {
        await bot.lookAt(targetFeet.offset(0, 1.6, 0), true);
        bot.setControlState('forward', true);
        const startTime = Date.now();
        while (bot.entity.position.distanceTo(targetFeet) > 0.8 && Date.now() - startTime < 1000) {
            await bot.lookAt(targetFeet.offset(0, 1.6, 0), true);
            await bot.waitForTicks(1);
        }
        bot.setControlState('forward', false);
    }
}

/**
 * Move bot within reachable range (under 3.5 blocks)
 */
async function ensureWithinReach(targetPos) {
    const dist = bot.entity.position.distanceTo(targetPos);
    if (dist <= 3.5) return true;

    const targetFloor = new Vec3(targetPos.x, targetPos.y + 1, targetPos.z);
    try {
        const goal = new goals.GoalNear(targetFloor.x, targetFloor.y, targetFloor.z, 2);
        await bot.pathfinder.goto(goal);
        return true;
    } catch (err) {
        return false;
    }
}

/**
 * Fast Instant Block Placement
 */
async function fastPlaceSingleBlock(refBlock, faceVector, shulkerList) {
    const targetBlockPos = refBlock.position.plus(faceVector);

    if (isSolidAt(targetBlockPos)) {
        placedBlocksSet.add(`${targetBlockPos.x},${targetBlockPos.y},${targetBlockPos.z}`);
        return true;
    }

    const ready = await ensureHoldingBlock(shulkerList);
    if (!ready) return false;

    const reachOk = await ensureWithinReach(refBlock.position);
    if (!reachOk) return false;

    try {
        await bot.placeBlock(refBlock, faceVector);
        placedBlocksSet.add(`${targetBlockPos.x},${targetBlockPos.y},${targetBlockPos.z}`);
        return true;
    } catch (err) {
        if (isSolidAt(targetBlockPos)) {
            placedBlocksSet.add(`${targetBlockPos.x},${targetBlockPos.y},${targetBlockPos.z}`);
            return true;
        }
        return false;
    }
}

/**
 * Bridge/scaffold blocks from starting solid block to targetPos if targetPos is floating
 */
async function placeBlockWithBridge(targetPos, shulkerList) {
    if (isSolidAt(targetPos)) {
        return true;
    }

    let refPlacement = findPlacementReference(targetPos);

    if (!refPlacement) {
        const botFloorPos = bot.entity.position.floored().offset(0, -1, 0);
        const bridgePath = [];
        
        const steps = Math.max(Math.abs(targetPos.x - botFloorPos.x), Math.abs(targetPos.z - botFloorPos.z));
        for (let s = 0; s <= steps; s++) {
            const bx = Math.round(botFloorPos.x + (targetPos.x - botFloorPos.x) * (s / steps));
            const bz = Math.round(botFloorPos.z + (targetPos.z - botFloorPos.z) * (s / steps));
            bridgePath.push(new Vec3(bx, targetPos.y, bz));
        }

        for (const bPos of bridgePath) {
            if (isSolidAt(bPos)) {
                await stepToBlock(bPos);
                continue;
            }

            const bRef = findPlacementReference(bPos);
            if (bRef) {
                const bridgeRes = await fastPlaceSingleBlock(bRef.referenceBlock, bRef.faceVector, shulkerList);
                if (bridgeRes) {
                    await stepToBlock(bPos);
                }
            }
        }

        if (isSolidAt(targetPos)) return true;

        refPlacement = findPlacementReference(targetPos);
    }

    if (!refPlacement) return false;

    const res = await fastPlaceSingleBlock(refPlacement.referenceBlock, refPlacement.faceVector, shulkerList);
    if (res) {
        await stepToBlock(targetPos);
        return true;
    }

    return isSolidAt(targetPos);
}

/**
 * Build initial bridge floor from current position to a target position
 */
async function buildInitialBridgeToStart(startPos, targetPos, shulkerList) {
    const steps = Math.max(Math.abs(targetPos.x - startPos.x), Math.abs(targetPos.z - startPos.z));
    for (let s = 0; s <= steps; s++) {
        const bx = Math.round(startPos.x + (targetPos.x - startPos.x) * (s / steps));
        const bz = Math.round(startPos.z + (targetPos.z - startPos.z) * (s / steps));
        const bPos = new Vec3(bx, targetPos.y, bz);

        if (isSolidAt(bPos)) {
            await stepToBlock(bPos);
            continue;
        }

        const bRef = findPlacementReference(bPos);
        if (bRef) {
            const res = await fastPlaceSingleBlock(bRef.referenceBlock, bRef.faceVector, shulkerList);
            if (res) {
                await stepToBlock(bPos);
            }
        }
    }
}

/**
 * Generate all unbuilt grid points within radius 10
 */
function getAllDiskPoints(centerVec, radius, targetY) {
    const points = [];
    for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
            if (dx * dx + dz * dz <= radius * radius) {
                const p = new Vec3(centerVec.x + dx, targetY, centerVec.z + dz);
                if (!isSolidAt(p)) {
                    points.push(p);
                }
            }
        }
    }
    return points;
}

/**
 * Build FULL SOLID CIRCLE DISK using ULTRA-FAST In-Reach Batching
 */
async function buildDiskWithGreedyClustering(centerVec, radius = 10, targetY, shulkerList = []) {
    console.log(`\n⚡⚡ [LIGHTNING FAST CLUSTER] Building DISK (Center: ${centerVec.x}, ${centerVec.z} | Radius: ${radius} | Y: ${targetY})...`);

    const botFloorPos = bot.entity.position.floored().offset(0, -1, 0);
    placedBlocksSet.add(`${botFloorPos.x},${botFloorPos.y},${botFloorPos.z}`);

    let remainingPoints = getAllDiskPoints(centerVec, radius, targetY);
    const totalCount = remainingPoints.length;

    console.log(`🎯 Found ${totalCount} unbuilt floor blocks to place.`);

    let totalPlaced = 0;

    while (remainingPoints.length > 0) {
        remainingPoints = remainingPoints.filter(p => !isSolidAt(p));
        if (remainingPoints.length === 0) break;

        const botPos = bot.entity.position.floored();

        remainingPoints.sort((a, b) => botPos.distanceTo(a) - botPos.distanceTo(b));
        const currentTarget = remainingPoints.shift();

        const ready = await ensureHoldingBlock(shulkerList);
        if (!ready) {
            console.log('⚠️ Out of building blocks! Stopping floor construction.');
            break;
        }

        const res = await placeBlockWithBridge(currentTarget, shulkerList);
        if (res) {
            totalPlaced++;
            console.log(`🧱 [${totalPlaced}/${totalCount}] Placed block at ${currentTarget}`);
        }

        let inReachPlaced = 0;
        let clusterLoop = true;

        while (clusterLoop) {
            clusterLoop = false;
            const currentFeet = bot.entity.position;

            for (let i = remainingPoints.length - 1; i >= 0; i--) {
                const p = remainingPoints[i];

                if (isSolidAt(p)) {
                    remainingPoints.splice(i, 1);
                    continue;
                }

                if (currentFeet.distanceTo(p) <= 3.6) {
                    if (!bot.heldItem || bot.heldItem.count <= 0 || !isBuildingBlockItem(bot.heldItem)) {
                        const isReady = await ensureHoldingBlock(shulkerList);
                        if (!isReady) break;
                    }

                    const refPlacement = findPlacementReference(p);
                    if (refPlacement) {
                        try {
                            const pKey = `${p.x},${p.y},${p.z}`;
                            await bot.placeBlock(refPlacement.referenceBlock, refPlacement.faceVector);
                            placedBlocksSet.add(pKey);
                            totalPlaced++;
                            inReachPlaced++;
                            console.log(`⚡ [${totalPlaced}/${totalCount}] (Batch FastPlace) Block at ${p}`);
                            remainingPoints.splice(i, 1);
                            clusterLoop = true;
                        } catch (e) {
                            if (isSolidAt(p)) {
                                remainingPoints.splice(i, 1);
                            }
                        }
                    }
                }
            }

            if (inReachPlaced > 0) {
                await bot.waitForTicks(1);
            }
        }
    }

    console.log('✨ Solid circle floor construction finished!');
}

// Error & disconnect logging
bot.on('error', err => console.error('💥 Mineflayer Error:', err));
bot.on('kicked', reason => console.log('🚪 Bot was kicked:', reason));
bot.on('end', () => console.log('🔌 Bot disconnected.'));

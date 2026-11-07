import { Scene } from 'phaser';
import npcText from '../../data/npcs.json';

// Size of one tile in pixels. Tiled maps will use the same size later.
const TILE = 16;

// The room as a grid of tiles: 32 tiles wide, 18 tiles high (= one screen).
// Later this grid will come from a map you draw in Tiled.
const ROOM_WIDTH = 32;
const ROOM_HEIGHT = 18;
const FLOOR_ROWS = 5; // ground height in tiles (5 of 18 = a bit more than a quarter of the screen)

// What each number in the grid means:
const EMPTY = -1;
const FLOOR = 0;
const WATER = 1;

function buildRoomGrid ()
{
    const grid = [];
    for (let row = 0; row < ROOM_HEIGHT; row++)
    {
        const isFloor = row >= ROOM_HEIGHT - FLOOR_ROWS;
        grid.push(new Array(ROOM_WIDTH).fill(isFloor ? FLOOR : EMPTY));
    }
    return grid;
}

// Same as a normal room, but the right half of the floor is water.
function buildWaterRoomGrid ()
{
    const grid = buildRoomGrid();
    for (let row = ROOM_HEIGHT - FLOOR_ROWS; row < ROOM_HEIGHT; row++)
    {
        for (let col = ROOM_WIDTH / 2; col < ROOM_WIDTH; col++)
        {
            grid[row][col] = WATER;
        }
    }
    return grid;
}

// --- Marketplace ---
// Twice as wide as the screen (64 tiles).
// Right half: flat ground, like the other rooms.
// Left half: a smooth slope going up towards the left, to a flat plateau at the far left.
// The plateau's top is 12 tiles above the bottom of the screen (2/3 of the 18-tile screen),
// that is 7 tiles higher than the normal ground.
const MARKET_WIDTH = ROOM_WIDTH * 2;
const PLATEAU_WIDTH = 10;   // the plateau: the first 10 tiles from the left
const PLATEAU_HEIGHT = 7;   // how many tiles higher than the normal ground
const SLOPE_WIDTH = 18;     // the slope: the 18 tiles right after the plateau

// The slope is not made of tiles (tiles can only make blocky steps).
// What you SEE is a smooth brown triangle.
// What you WALK ON: there is nothing solid there. Instead, the game checks after every
// physics step whether the player is on (or a little into) the slanted line, and if so,
// puts the player's feet exactly onto it (see stickToSlope).
// SLOPE_SNAP = how far above the line (in pixels) the feet may be and still get pulled
// onto it. This keeps the player on the slope when walking down instead of hopping.
const SLOPE_SNAP = 4;

// How many tiles higher than the normal ground the Marketplace's TILES are in this column:
// the plateau is 7, everywhere else 0 (the slope is added on top, see makeSlope).
function marketGroundHeight (col)
{
    return col < PLATEAU_WIDTH ? PLATEAU_HEIGHT : 0;
}

function buildMarketplaceGrid ()
{
    const grid = [];
    for (let row = 0; row < ROOM_HEIGHT; row++)
    {
        const line = [];
        for (let col = 0; col < MARKET_WIDTH; col++)
        {
            // Ground goes from the bottom of the screen up to the ground height of this column.
            const groundTopRow = ROOM_HEIGHT - FLOOR_ROWS - marketGroundHeight(col);
            line.push(row >= groundTopRow ? FLOOR : EMPTY);
        }
        grid.push(line);
    }
    return grid;
}

// NPCs (people to talk to later) in the Marketplace: placeholder boxes,
// the same size as the player (12 x 24) but purple.
// col  = the tile column they stand on, counted from the Marketplace's left edge.
// type = who they are; what they say is in src/data/npcs.json under that name.
// 5 merchants standing around in the right half, the marketplace judge on the plateau.
const MARKET_NPCS = [
    { col: 5,  type: 'judge' },
    { col: 36, type: 'merchant' },
    { col: 41, type: 'merchant' },
    { col: 47, type: 'merchant' },
    { col: 52, type: 'merchant' },
    { col: 58, type: 'merchant' }
];
const COLOR_NPC = 0x9b5de5;

// --- Talking (Ihtoa) ---
// How long the speech animation lasts, in milliseconds.
const TALK_TIME = 1200;
// How close an NPC must be to talk to it: the space between the player's front
// and the NPC, in pixels (16 = one tile). The NPC must also stand at about the same height.
const TALK_REACH = 16;
// Placeholder speech animation: a small white box above the speaker's head that blinks.
const SPEECH_WIDTH = 6;
const SPEECH_HEIGHT = 4;
const SPEECH_BLINK = 150; // milliseconds per blink (on or off)

// All rooms, from left to right. The number in front is the room's place in this list.
const ROOMS = [
    buildMarketplaceGrid(), // 0 = Marketplace
    buildRoomGrid(),     // 1 = Empty Room (where the game starts)
    buildWaterRoomGrid() // 2 = Lake of Colors: right half is water
];

// Where the player appears when arriving in each room (start, save file, Map):
// the tile column, counted from the room's left edge. Same order as ROOMS.
// The player always stands on the ground in that column.
const ROOM_ARRIVAL = [
    MARKET_WIDTH - 4, // Marketplace: bottom right, 4 tiles from its right edge
    4,                // Empty Room: 4 tiles from the left edge
    4                 // Lake of Colors: 4 tiles from the left edge
];

// The room where a new game starts, and where you wake up after blacking out:
// the Empty Room.
const START_ROOM = 1;

// Fish: small colored rectangles (10 x 5 pixels) in these colors.
// The name must match a "meaning" in src/data/fishing-words.json (upper/lower case doesn't matter).
const FISH_COLORS = [
    { name: 'red',    hex: 0xd62828 },
    { name: 'yellow', hex: 0xf2c418 },
    { name: 'white',  hex: 0xffffff },
    { name: 'black',  hex: 0x111111 }
];

// --- Fishing settings ---
// How far from the water's edge you can still fish, in tiles.
const FISHING_REACH = 2;
// How far the float is thrown, in pixels (5 tiles).
const THROW_DISTANCE = 5 * TILE;
// How fast the float drifts away while you wait, in pixels per second.
const DRIFT_SPEED = 3;
// How close (in pixels, left/right) a fish must swim to the float to bite.
const BITE_DISTANCE = 6;
// No bites at all until the float has been on the water this long (milliseconds).
const BITE_WAIT = 2000;
// How fast a biting fish swims to the float, in pixels per second.
const BITE_SWIM_SPEED = 40;
// When a fish swims under the float, the chance that it bites (0.25 = 1 in 4).
// If it doesn't, it ignores the float until it has swum away and comes back.
const BITE_CHANCE = 0.25;
// The bite chance is multiplied by these, depending on how the last catch went:
// After catching a fish: fish of the SAME color bite less often.
const AFTER_CATCH_SAME_COLOR = 0.3;
// After losing a fish: fish of the SAME color bite more often, other colors less often.
const AFTER_FAIL_SAME_COLOR = 2;
const AFTER_FAIL_OTHER_COLOR = 0.5;

// --- Life points (Yollotl) ---
// How many life points the player has when full.
// (The overlay uses this too, to know how many squares to draw.)
export const MAX_LIFE = 3;
// How many life points falling into the water costs.
const WATER_DAMAGE = 1;
// After blacking out: how long the screen takes to fade back in from black (milliseconds).
const BLACKOUT_FADE = 1000;

// --- Sleeping (Cochi) ---
// How long the player sleeps and can't move, in milliseconds.
const SLEEP_TIME = 3000;
// How often a new "z" floats up while sleeping, in milliseconds.
const SLEEP_Z_EVERY = 600;

// A random whole number from min to max (both included).
function randomBetween (min, max)
{
    return Math.floor(min + Math.random() * (max - min + 1));
}

// Rooms can have different widths now (the Marketplace is two screens wide).
// These two helpers work out where each room is.

// The left edge of a room, in pixels from the left edge of the whole map.
function roomLeft (room)
{
    let left = 0;
    for (let i = 0; i < room; i++)
    {
        left += ROOMS[i][0].length * TILE;
    }
    return left;
}

// The width of a room, in pixels.
function roomWidth (room)
{
    return ROOMS[room][0].length * TILE;
}

// Which room a spot on the map (x, in pixels) is in.
function roomAt (x)
{
    for (let room = 0; room < ROOMS.length; room++)
    {
        if (x < roomLeft(room) + roomWidth(room))
        {
            return room;
        }
    }
    return ROOMS.length - 1;
}

// Puts the rooms side by side into one big grid,
// so the player can walk from one room into the next.
function joinRoomsSideBySide (rooms)
{
    const grid = [];
    for (let row = 0; row < ROOM_HEIGHT; row++)
    {
        // Take this row from every room and glue them together.
        grid.push(rooms.flatMap((room) => room[row]));
    }
    return grid;
}

export class TestRoom extends Scene
{
    constructor ()
    {
        super('TestRoom');
    }

    // data.save is the save file that was just uploaded, or nothing when the game starts fresh.
    // For now only the room is taken from it (see "Start room" further down).
    create (data)
    {
        // Placeholder tiles, drawn in code, side by side in one picture:
        // tile 0 = floor (brown square), tile 1 = water (blue square).
        // Only drawn once: when the room restarts after loading, the picture already exists.
        if (!this.textures.exists('placeholder-tiles'))
        {
            const g = this.add.graphics();
            g.fillStyle(0x8b5a2b);
            g.fillRect(0, 0, TILE, TILE);
            g.fillStyle(0x2f6fb5);
            g.fillRect(TILE, 0, TILE, TILE);
            g.generateTexture('placeholder-tiles', TILE * 2, TILE);
            g.destroy();
        }

        // Build the tile map from all rooms next to each other.
        const grid = joinRoomsSideBySide(ROOMS);
        const map = this.make.tilemap({
            data: grid,
            tileWidth: TILE,
            tileHeight: TILE
        });
        const tileset = map.addTilesetImage('placeholder-tiles', 'placeholder-tiles', TILE, TILE, 0, 0);
        const floor = map.createLayer(0, tileset, 0, 0);

        // Only floor tiles are solid. Water is not something you can stand on.
        floor.setCollision([ FLOOR ]);

        // Remembered, to look up where the ground is (see groundTopAt).
        this.grid = grid;

        // --- NPCs in the Marketplace: purple boxes standing on the ground ---
        // Remembered with their type, so Ihtoa can find them and know what they say.
        this.npcs = MARKET_NPCS.map((npc) => {
            const x = roomLeft(0) + npc.col * TILE + TILE / 2;
            const box = this.add.rectangle(x, this.groundTopAt(x) - 12, 12, 24, COLOR_NPC);
            return { box, type: npc.type };
        });

        // While the player's own speech animation runs (Ihtoa with nobody in front):
        // { bubble, timer }. null otherwise.
        this.talking = null;

        // The player: a small green rectangle (12 x 24 pixels).
        // It starts 4 tiles from the left edge of the start room (the Empty Room).
        const floorTop = (ROOM_HEIGHT - FLOOR_ROWS) * TILE;
        const start = this.roomSpawn(START_ROOM);
        this.player = this.add.rectangle(start.x, start.y, 12, 24, 0x2ecc71);
        this.physics.add.existing(this.player);
        this.player.body.setCollideWorldBounds(true);

        // The player stands on the floor instead of falling through it.
        this.physics.add.collider(this.player, floor);

        // ...and on the Marketplace slope.
        this.makeSlope(floorTop);

        // Which way the player is looking: 1 = right, -1 = left.
        // Changes whenever you walk left or right.
        this.facing = 1;

        // The "face": a small dark eye near the top of the player,
        // on the side the player is looking at.
        this.eye = this.add.rectangle(0, 0, 2, 3, 0x111111);
        this.updateFace();

        // Move the eye after the player has moved in each frame,
        // so it never lags behind.
        this.events.on('postupdate', this.updateFace, this);

        // When the room restarts (after loading a save file), stop the old eye-moving,
        // otherwise it would run twice.
        this.events.once('shutdown', () => this.events.off('postupdate', this.updateFace, this));

        // No "that didn't work" wobble running yet.
        this.failWobble = null;

        // While sleeping: the lying-down player and the z-timer. null when awake.
        this.sleep = null;

        // Remembered for fishing: the ground layer (to look up tiles) and where the ground starts.
        this.floor = floor;
        this.floorTop = floorTop;

        // The fishing line while it's out, or null when the player isn't fishing.
        this.fishing = null;

        // How the last catch went: { colorName, success }, or null before the first one.
        this.lastCatch = null;

        // Where the player comes back after falling into the water:
        // standing on the floor, right next to the water's edge.
        const waterStartColumn = grid[ROOM_HEIGHT - 1].indexOf(WATER);
        this.respawnX = waterStartColumn * TILE - 8;
        this.respawnY = floorTop - 12;

        // --- Fish in the water ---
        // The area the fish can swim in. They stay a little away from the edges.
        const waterLeft = waterStartColumn * TILE;
        const waterTiles = grid[ROOM_HEIGHT - 1].filter((tile) => tile === WATER).length;
        this.fishArea = {
            left: waterLeft + 6,
            right: waterLeft + waterTiles * TILE - 6,
            top: floorTop + 5,
            bottom: floorTop + FLOOR_ROWS * TILE - 5
        };

        // Which room the water is in (its number in the ROOMS list, so 2 = Lake of Colors).
        this.waterRoom = roomAt(waterLeft);

        // No fish at the start: they are made every time you walk into the water room.
        this.fishes = [];

        // The left, right and top edges of the whole map (all rooms together) are walls.
        // The bottom edge is open, so the player can fall off the screen.
        this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
        this.physics.world.setBoundsCollision(true, true, true, false);
        this.mapHeight = map.heightInPixels;

        // --- Start room ---
        // A new game starts in the Empty Room.
        // After loading a save file, the player starts in the saved room instead,
        // at that room's arrival spot (see ROOM_ARRIVAL), standing on the ground.
        // A save file without a room, or with a room that doesn't exist, starts in the Empty Room.
        let startRoom = START_ROOM;
        if (data && data.save)
        {
            let savedRoom = data.save.room;

            // Save files from before the Marketplace was added (version 1 and 2)
            // counted the Empty Room as 0 and the Lake as 1. Now the Marketplace is 0,
            // so everything moved one place to the right: add 1 to old room numbers.
            if (data.save.version < 3 && Number.isInteger(savedRoom))
            {
                savedRoom += 1;
            }

            if (Number.isInteger(savedRoom) && savedRoom >= 0 && savedRoom < ROOMS.length)
            {
                startRoom = savedRoom;
                const spot = this.roomSpawn(startRoom);
                this.player.body.reset(spot.x, spot.y);
            }
        }

        // --- Camera ---
        // The camera follows the player, but never shows anything outside the room
        // the player is in. In rooms that are one screen wide it stands still, like before;
        // in wider rooms (the Marketplace) it scrolls along as the player walks.
        // true = round to whole pixels, so the pixel art stays sharp.
        this.cameras.main.startFollow(this.player, true);

        // The room the player is in right now (its number in the ROOMS list).
        // The camera is kept inside that room, and if it's the Lake, the fish are made.
        this.currentRoom = startRoom;
        this.keepCameraInRoom(startRoom);
        if (startRoom === this.waterRoom)
        {
            this.spawnFishes();
        }

        // Where the player wakes up after blacking out: the Empty Room,
        // at the same spot where the game starts.
        this.blackoutX = start.x;
        this.blackoutY = start.y;

        // --- Life points (Yollotl) ---
        // A new game starts with full life.
        // After loading a save file, the saved life points are used.
        // A save file without life points (older version), or with a strange number, starts with full life.
        const savedLife = data && data.save ? data.save.life : MAX_LIFE;
        this.life = Number.isInteger(savedLife) && savedLife >= 1 && savedLife <= MAX_LIFE
            ? savedLife
            : MAX_LIFE;

        // --- Cacao beans (the money) ---
        // A new game starts with 0. There's no way to get beans yet.
        // After loading a save file, the saved beans are used.
        // A save file without beans (older version), or with a strange number, gives 0.
        const savedBeans = data && data.save ? data.save.beans : 0;
        this.beans = Number.isInteger(savedBeans) && savedBeans >= 0 ? savedBeans : 0;

        // --- Bag ---
        // How many of each item the player has, e.g. { michin: 3 }.
        // The names (like "michin") are the ids in src/data/items.json.
        // A new game starts with an empty bag. After loading a save file, the saved bag is used.
        // A save file without a bag (older version) gives an empty bag.
        // Any entry with a strange number (not a whole number, or below 0) is left out.
        this.bag = {};
        const savedBag = data && data.save ? data.save.bag : null;
        if (savedBag !== null && typeof savedBag === 'object')
        {
            Object.entries(savedBag).forEach(([ id, amount ]) => {
                if (Number.isInteger(amount) && amount >= 0)
                {
                    this.bag[id] = amount;
                }
            });
        }

        // Keyboard: arrow keys for walking.
        // (Q, W, E and Enter are handled in the overlay.)
        this.cursors = this.input.keyboard.createCursorKeys();

        // Start the overlay (q/w/e circles) on top of the room.
        this.scene.launch('Overlay');
    }

    // Called by the overlay when a used q/w/e slot is pressed.
    // The action name comes from the word list (src/data/wordlist.json).
    doAction (action)
    {
        // While sleeping or during the speech animation, no power works.
        if (this.sleep || this.talking)
        {
            return;
        }

        if (action === 'talk')
        {
            this.talk();
        }
        else if (action === 'sleep')
        {
            // Only on the ground, not in mid-air.
            if (this.player.body.blocked.down)
            {
                this.fallAsleep();
            }
            else
            {
                this.failAction();
            }
        }
        else if (action === 'jump')
        {
            // Only jump when standing on the floor, not in mid-air.
            if (this.player.body.blocked.down)
            {
                this.stopFishing();
                this.player.body.setVelocityY(-250);
            }
        }
        else if (action === 'fish')
        {
            if (this.fishing)
            {
                // The line is already out: nothing happens.
                return;
            }

            if (this.isFacingWater())
            {
                this.throwLine();
            }
            else
            {
                this.failAction();
            }
        }
    }

    // For testing (from the Map in the menu): puts the player into another room,
    // at its arrival spot (see ROOM_ARRIVAL), standing on the ground.
    // The camera and the fish follow by themselves in the next frame (see update).
    goToRoom (room)
    {
        if (!Number.isInteger(room) || room < 0 || room >= ROOMS.length)
        {
            return; // no such room
        }

        const spot = this.roomSpawn(room);
        this.player.body.reset(spot.x, spot.y);
    }

    // Makes the Marketplace slope, from the plateau's edge down to the normal ground.
    // floorTop = where the normal ground starts (in pixels from the top).
    makeSlope (floorTop)
    {
        const left = roomLeft(0) + PLATEAU_WIDTH * TILE;  // where the slope starts (top)
        const width = SLOPE_WIDTH * TILE;
        const height = PLATEAU_HEIGHT * TILE;             // from the ground up to the plateau

        // Remembered for stickToSlope.
        this.slope = { left, right: left + width, top: floorTop - height, bottom: floorTop };

        // What you see: a brown triangle, same color as the floor tiles.
        // Its corners: top left (at the plateau's edge), bottom right, bottom left.
        // (Depth -1 = drawn behind everything else, so it never covers the player's feet.)
        const look = this.add.graphics().setDepth(-1);
        look.fillStyle(0x8b5a2b);
        look.fillTriangle(
            left, floorTop - height,
            left + width, floorTop,
            left, floorTop
        );

        // After every physics step, keep the player on the slope.
        // (Stop doing that when the room restarts after loading a save file.)
        this.physics.world.on('worldstep', this.stickToSlope, this);
        this.events.once('shutdown', () => this.physics.world.off('worldstep', this.stickToSlope, this));
    }

    // Height of the slanted line (in pixels from the top of the screen) at a spot x.
    // Spots left or right of the slope count as its top or bottom end.
    slopeSurfaceAt (x)
    {
        const s = this.slope;
        const clamped = Math.min(Math.max(x, s.left), s.right);
        const share = (clamped - s.left) / (s.right - s.left); // 0 at the top end, 1 at the bottom end
        return s.top + share * (s.bottom - s.top);
    }

    // Runs after every physics step: if the player is over the slope, isn't jumping up,
    // and the feet are on, under, or just above the slanted line,
    // the feet are put exactly onto the line, and the player counts as standing.
    stickToSlope ()
    {
        const body = this.player.body;
        const s = this.slope;

        // Not over the slope at all.
        if (body.right <= s.left || body.left >= s.right)
        {
            return;
        }

        // Moving up (jumping with Choloa): leave the player alone.
        if (body.velocity.y < 0)
        {
            return;
        }

        // The line is highest at the player's left side (the slope goes up towards the left),
        // so that's the spot the player stands on, like standing on a corner.
        const surface = this.slopeSurfaceAt(body.left);

        if (body.bottom >= surface - SLOPE_SNAP)
        {
            body.position.y = surface - body.height;
            body.velocity.y = 0;
            body.blocked.down = true; // counts as standing (for Choloa and Cochi)
            body.blocked.none = false;
            body.updateCenter();
        }
    }

    // Where the player appears when arriving in a room (start, save file, Map):
    // the column from ROOM_ARRIVAL, standing on the ground there.
    roomSpawn (room)
    {
        const x = roomLeft(room) + ROOM_ARRIVAL[room] * TILE;
        return { x, y: this.groundTopAt(x) - 12 }; // 12 = half the player's height
    }

    // The top of the ground at a spot on the map (x, in pixels): the first floor tile
    // from the top in that column. If there's no floor there, the normal ground height.
    groundTopAt (x)
    {
        const col = Math.floor(x / TILE);
        for (let row = 0; row < ROOM_HEIGHT; row++)
        {
            if (this.grid[row][col] === FLOOR)
            {
                return row * TILE;
            }
        }
        return (ROOM_HEIGHT - FLOOR_ROWS) * TILE;
    }

    // Keeps the camera inside one room: it may follow the player only up to that room's edges.
    keepCameraInRoom (room)
    {
        this.cameras.main.setBounds(roomLeft(room), 0, roomWidth(room), this.mapHeight);
    }

    // Puts the eye on the front side of the player, near the top.
    // (The speech box, while the player is talking, moves along too.)
    updateFace ()
    {
        this.eye.setPosition(this.player.x + this.facing * 3, this.player.y - 7);

        if (this.talking)
        {
            this.placeSpeech(this.talking.bubble, this.player, this.facing);
        }
    }

    // ---------- Talking (Ihtoa) ----------

    // Ihtoa: if an NPC stands right in front of the player, the NPC talks
    // (speech animation + dialogue box). Otherwise the player does the speech animation,
    // which does nothing else; menu and powers can't be used until it's over.
    talk ()
    {
        const npc = this.npcInFront();

        if (npc)
        {
            // The NPC's speech animation, and the dialogue box with its line.
            this.speechAnimation(npc.box, 0);
            this.scene.get('Overlay').openDialogue(npcText[npc.type].line);
            return;
        }

        const bubble = this.speechAnimation(this.player, this.facing);
        const timer = this.time.delayedCall(TALK_TIME, () => {
            this.talking = null;
        });
        this.talking = { bubble, timer };
    }

    // The NPC standing right in front of the player (see TALK_REACH), or null.
    npcInFront ()
    {
        const body = this.player.body;

        return this.npcs.find((npc) => {
            const box = npc.box;

            // Space between the player's front and the NPC's near side.
            const gap = this.facing === 1
                ? (box.x - box.width / 2) - body.right
                : body.left - (box.x + box.width / 2);

            // The NPC must be in front (not behind), close enough, and at about the same height.
            const sameHeight = Math.abs(box.y - this.player.y) < 12;
            return gap >= -box.width && gap <= TALK_REACH && sameHeight;
        }) ?? null;
    }

    // Placeholder speech animation: a small white box above the speaker's head
    // blinks for TALK_TIME and then disappears.
    // speaker = the player or an NPC box. side = 1/-1 to put the box a little to the
    // front (right/left), 0 for the middle. Returns the box.
    speechAnimation (speaker, side)
    {
        const bubble = this.add.rectangle(0, 0, SPEECH_WIDTH, SPEECH_HEIGHT, 0xffffff);
        this.placeSpeech(bubble, speaker, side);

        this.tweens.add({
            targets: bubble,
            alpha: { from: 1, to: 0 },
            duration: SPEECH_BLINK,
            yoyo: true,
            repeat: -1
        });
        this.time.delayedCall(TALK_TIME, () => bubble.destroy());

        return bubble;
    }

    // Puts the speech box just above the speaker's head.
    placeSpeech (bubble, speaker, side)
    {
        bubble.setPosition(speaker.x + side * 4, speaker.y - speaker.height / 2 - 5);
    }

    // Is there water in front of the player, at most FISHING_REACH tiles away?
    isFacingWater ()
    {
        const body = this.player.body;
        const front = this.facing === 1 ? body.right : body.left;

        // Check the ground one tile after another, starting right in front of the player.
        for (let i = 0; i < FISHING_REACH; i++)
        {
            const x = front + this.facing * (i * TILE + TILE / 2);
            const tile = this.floor.getTileAtWorldXY(x, this.floorTop + 1);

            if (tile !== null && tile.index === WATER)
            {
                return true;
            }
        }
        return false;
    }

    // Throws out the fishing line: a small float flies from the player onto the water,
    // and a thin line connects the two.
    throwLine ()
    {
        const start = this.rodTip();

        // The float lands THROW_DISTANCE in front of the player, on the water's surface.
        const float = this.add.rectangle(start.x, start.y, 4, 4, 0xffffff);

        this.fishing = {
            float: float,
            line: this.add.graphics(),
            landed: false,     // true once the float is on the water
            waited: 0,         // milliseconds the float has been on the water
            hookedFish: null   // the fish that bit, or null
        };

        this.tweens.add({
            targets: float,
            x: this.clampToWater(start.x + this.facing * THROW_DISTANCE),
            y: this.floorTop - 2,
            duration: 400,
            ease: 'Quad.easeOut',
            onComplete: () => {
                if (this.fishing)
                {
                    this.fishing.landed = true;
                }
            }
        });

        // While the line is out, the q/w/e circles disappear and the powers can't be used.
        this.scene.get('Overlay').startFishing();
    }

    // Looks for a fish under the float. If there is one, it bites
    // and the q/w/e minigame starts.
    // Keeps a position inside the water (where the fish can swim).
    clampToWater (x)
    {
        return Math.min(Math.max(x, this.fishArea.left), this.fishArea.right);
    }

    // Called every frame while the float is on the water and nothing has bitten yet:
    // the float drifts away slowly, and fish may bite.
    updateFishing (delta)
    {
        if (!this.fishing || !this.fishing.landed || this.fishing.hookedFish)
        {
            return;
        }

        const float = this.fishing.float;
        this.fishing.waited += delta;

        // Drift away from the player, but never past the end of the water.
        float.x = this.clampToWater(float.x + this.facing * DRIFT_SPEED * delta / 1000);

        this.checkForBite();
    }

    checkForBite ()
    {
        const floatX = this.fishing.float.x;
        const waitedLongEnough = this.fishing.waited >= BITE_WAIT;
        let biter = null;

        this.fishes.forEach((fish) => {
            const underFloat = Math.abs(fish.body.x - floatX) <= BITE_DISTANCE;

            if (!underFloat)
            {
                // Swam away from the float: next time it comes by, it can decide again.
                fish.ignoringFloat = false;
                return;
            }

            if (biter || fish.ignoringFloat || !waitedLongEnough)
            {
                return;
            }

            // The fish decides once, as it arrives under the float, whether to bite.
            if (Math.random() < this.biteChanceFor(fish))
            {
                biter = fish;
            }
            else
            {
                fish.ignoringFloat = true;
            }
        });

        if (!biter)
        {
            return;
        }

        this.hookFish(biter);
    }

    // How likely this fish is to bite, depending on how the last catch went.
    biteChanceFor (fish)
    {
        const last = this.lastCatch;
        if (!last)
        {
            return BITE_CHANCE; // nothing caught or lost yet
        }

        const sameColor = fish.colorName === last.colorName;

        if (last.success)
        {
            // Just caught this color: other colors get their turn.
            return sameColor ? BITE_CHANCE * AFTER_CATCH_SAME_COLOR : BITE_CHANCE;
        }

        // Just lost this color: a chance to try it again.
        return sameColor
            ? BITE_CHANCE * AFTER_FAIL_SAME_COLOR
            : BITE_CHANCE * AFTER_FAIL_OTHER_COLOR;
    }

    // A fish has decided to bite: it swims to the float first.
    hookFish (fish)
    {
        // The fish stops its normal swimming, and the float stops drifting.
        fish.hooked = true;
        this.fishing.hookedFish = fish;

        const float = this.fishing.float;
        const targetX = float.x;
        const targetY = this.floorTop + 4; // just below the float

        // The fish swims to the float. The further away it is, the longer it takes.
        const distance = Math.hypot(targetX - fish.body.x, targetY - fish.body.y);
        const duration = Math.max(200, distance / BITE_SWIM_SPEED * 1000);

        this.tweens.add({
            targets: fish.body,
            x: targetX,
            y: targetY,
            duration: duration,
            ease: 'Sine.easeInOut',
            // Only once it has arrived does it bite.
            onComplete: () => this.startBite(fish)
        });
    }

    // The fish has reached the float and bites: it shakes, the float bobs,
    // and the q/w/e minigame starts.
    startBite (fish)
    {
        const float = this.fishing.float;

        // The fish shakes left and right.
        this.tweens.add({
            targets: fish.body,
            x: { from: float.x - 2, to: float.x + 2 },
            duration: 60,
            yoyo: true,
            repeat: -1 // forever, until the minigame is over
        });

        // The float bobs up and down.
        this.tweens.add({
            targets: float,
            y: { from: this.floorTop - 2, to: this.floorTop },
            duration: 120,
            yoyo: true,
            repeat: -1
        });

        const started = this.scene.get('Overlay').startMinigame(fish.colorName);
        if (!started)
        {
            // No word for this color in the fishing word list: the fish just gets away.
            this.stopFishing();
        }
    }

    // Called by the overlay when the minigame is over.
    // success = true: the fish is caught. false: wrong button or time ran out.
    fishingResult (success)
    {
        if (!this.fishing || !this.fishing.hookedFish)
        {
            return;
        }

        // Remember how this catch went; it changes which color is likely to bite next.
        this.lastCatch = {
            colorName: this.fishing.hookedFish.colorName,
            success: success
        };

        if (success)
        {
            // Caught: the fish is taken out of the water.
            const fish = this.fishing.hookedFish;
            this.fishes = this.fishes.filter((f) => f !== fish);
            this.fishing.hookedFish = null;
            this.showCatch(fish);

            // Every caught fish, whatever its color, puts 1 Michin into the bag.
            this.addToBag('michin', 1);
        }

        // Either way, the line is pulled in.
        // (If the fish wasn't caught, stopFishing lets it swim away.)
        this.stopFishing();
    }

    // Puts some of an item into the bag. id = the item's id in src/data/items.json.
    addToBag (id, amount)
    {
        this.bag[id] = (this.bag[id] ?? 0) + amount;
    }

    // Placeholder "caught it!" animation: the fish flies out of the water
    // to just above the player's head, stays there for a moment, then disappears.
    showCatch (fish)
    {
        // Stop the shaking first.
        this.tweens.killTweensOf(fish.body);

        this.tweens.add({
            targets: fish.body,
            x: this.player.x,
            y: this.player.body.top - 8,
            duration: 500,
            ease: 'Quad.easeOut',
            onComplete: () => {
                this.time.delayedCall(700, () => fish.body.destroy());
            }
        });
    }

    // Takes the fishing line away again.
    stopFishing ()
    {
        if (!this.fishing)
        {
            return;
        }

        // A fish that is still on the line gets away and swims on.
        if (this.fishing.hookedFish)
        {
            this.tweens.killTweensOf(this.fishing.hookedFish.body); // stop shaking
            this.fishing.hookedFish.hooked = false;
        }

        this.tweens.killTweensOf(this.fishing.float);
        this.fishing.float.destroy();
        this.fishing.line.destroy();
        this.fishing = null;

        // The q/w/e circles and powers come back.
        this.scene.get('Overlay').endFishing();
    }

    // Where the line starts: the top front corner of the player.
    rodTip ()
    {
        const body = this.player.body;
        return {
            x: this.facing === 1 ? body.right : body.left,
            y: body.top
        };
    }

    // The player fell into the water: one life point is lost.
    // With life left, the player comes back at the water's edge, like before.
    // Without life left, the player blacks out (see blackOut).
    fellIntoWater ()
    {
        this.life = Math.max(this.life - WATER_DAMAGE, 0);

        if (this.life > 0)
        {
            this.player.body.reset(this.respawnX, this.respawnY);
            this.scene.get('Overlay').showLife(this.life);
        }
        else
        {
            this.blackOut();
        }
    }

    // Out of life: the screen goes black, and the player wakes up in the Empty Room
    // with full life again. The screen slowly fades back in.
    // (The camera moves to the Empty Room by itself in the next frame, see update.)
    blackOut ()
    {
        this.player.body.reset(this.blackoutX, this.blackoutY);
        this.life = MAX_LIFE;
        this.scene.get('Overlay').showLife(this.life);
        this.cameras.main.fadeIn(BLACKOUT_FADE, 0, 0, 0);
    }

    // Cochi: the player lies down and sleeps for SLEEP_TIME, and can't move.
    // Placeholder look: the standing rectangle is hidden and a lying one (wide instead of tall)
    // is shown on the floor in its place. Little "z" letters float up from it.
    fallAsleep ()
    {
        const body = this.player.body;

        // Stop walking right away.
        body.setVelocityX(0);

        // Hide the standing player and its eye.
        this.player.setVisible(false);
        this.eye.setVisible(false);

        // The lying player: same size and color, just turned on its side (24 wide, 12 high),
        // lying on the floor where the player stood.
        const lying = this.add.rectangle(this.player.x, body.bottom - 6, 24, 12, 0x2ecc71);

        // A new "z" every SLEEP_Z_EVERY milliseconds, starting with one right away.
        const zTimer = this.time.addEvent({
            delay: SLEEP_Z_EVERY,
            loop: true,
            callback: () => this.floatZ(lying)
        });
        this.floatZ(lying);

        // Wake up after SLEEP_TIME.
        const wakeTimer = this.time.delayedCall(SLEEP_TIME, () => this.wakeUp());

        this.sleep = { lying, zTimer, wakeTimer };
    }

    // One "z" appears above the sleeping player, floats up and fades away.
    floatZ (lying)
    {
        const z = this.add.text(lying.x + 6, lying.y - 10, 'z', {
            fontFamily: 'Arial',
            fontSize: 10,
            color: '#ffffff'
        }).setOrigin(0.5);

        this.tweens.add({
            targets: z,
            x: z.x + 6,
            y: z.y - 16,
            alpha: 0,
            duration: 1200,
            onComplete: () => z.destroy()
        });
    }

    // Sleep is over: the player stands up again with full life points.
    wakeUp ()
    {
        if (!this.sleep)
        {
            return;
        }

        this.sleep.zTimer.remove();
        this.sleep.lying.destroy();
        this.sleep = null;

        this.player.setVisible(true);
        this.eye.setVisible(true);

        this.life = MAX_LIFE;
        this.scene.get('Overlay').showLife(this.life);
    }

    // Placeholder "that didn't work" animation: the player wobbles a few times.
    failAction ()
    {
        if (this.failWobble && this.failWobble.isPlaying())
        {
            return; // already wobbling
        }

        this.failWobble = this.tweens.add({
            targets: this.player,
            angle: { from: -12, to: 12 },
            duration: 70,
            yoyo: true,
            repeat: 2,
            onComplete: () => this.player.setAngle(0)
        });
    }

    // Makes a new set of fish: a random number (between 4 and 10), each with a random color,
    // a random place, a random direction and a random speed.
    spawnFishes ()
    {
        const fishCount = randomBetween(4, 10);

        for (let i = 0; i < fishCount; i++)
        {
            const color = FISH_COLORS[Math.floor(Math.random() * FISH_COLORS.length)];
            const x = randomBetween(this.fishArea.left, this.fishArea.right);
            const y = randomBetween(this.fishArea.top, this.fishArea.bottom);

            this.fishes.push({
                body: this.add.rectangle(x, y, 10, 5, color.hex),
                colorName: color.name,
                hooked: false,                           // true while it's on the line
                direction: Math.random() < 0.5 ? -1 : 1, // -1 = left, 1 = right
                speed: randomBetween(8, 20),             // pixels per second
                upDown: randomBetween(-5, 5),            // up/down speed: minus = up, plus = down
                turnTimer: randomBetween(1000, 4000)     // milliseconds until it turns around by itself
            });
        }
    }

    // Takes all fish away.
    removeFishes ()
    {
        this.fishes.forEach((fish) => fish.body.destroy());
        this.fishes = [];
    }

    // Moves every fish a little bit. Called once per frame.
    // delta = milliseconds since the last frame.
    moveFishes (delta)
    {
        this.fishes.forEach((fish) => {
            // A fish on the line doesn't swim.
            if (fish.hooked)
            {
                return;
            }

            // Swim left or right.
            fish.body.x += fish.direction * fish.speed * delta / 1000;

            // Turn around at the ends of the water.
            if (fish.body.x <= this.fishArea.left)
            {
                fish.body.x = this.fishArea.left;
                fish.direction = 1;
            }
            else if (fish.body.x >= this.fishArea.right)
            {
                fish.body.x = this.fishArea.right;
                fish.direction = -1;
            }

            // Drift slowly up or down, and stay between the surface and the bottom.
            fish.body.y += fish.upDown * delta / 1000;

            if (fish.body.y <= this.fishArea.top)
            {
                fish.body.y = this.fishArea.top;
                fish.upDown = Math.abs(fish.upDown);  // now drift down
            }
            else if (fish.body.y >= this.fishArea.bottom)
            {
                fish.body.y = this.fishArea.bottom;
                fish.upDown = -Math.abs(fish.upDown); // now drift up
            }

            // Sometimes turn around for no reason, and pick new speeds.
            fish.turnTimer -= delta;
            if (fish.turnTimer <= 0)
            {
                fish.direction *= -1;
                fish.speed = randomBetween(8, 20);
                fish.upDown = randomBetween(-5, 5);
                fish.turnTimer = randomBetween(1000, 4000);
            }
        });
    }

    update (time, delta)
    {
        const speed = 80; // pixels per second

        this.moveFishes(delta);
        this.updateFishing(delta);

        // Fell completely off the bottom of the screen (= into the water): lose life points.
        if (this.player.body.top > this.mapHeight)
        {
            this.fellIntoWater();
        }

        if (this.sleep)
        {
            // While sleeping you can't walk.
            this.player.body.setVelocityX(0);
        }
        else if (this.fishing)
        {
            // While the line is out you can't walk away.
            // (Enter pulls the line in early; see the overlay.)
            this.player.body.setVelocityX(0);
        }
        else if (this.scene.get('Overlay').mode === 'dialogue')
        {
            // While an NPC is talking (dialogue box open) you can't walk away.
            this.player.body.setVelocityX(0);
        }
        else if (this.cursors.left.isDown)
        {
            this.player.body.setVelocityX(-speed);
            this.facing = -1;
        }
        else if (this.cursors.right.isDown)
        {
            this.player.body.setVelocityX(speed);
            this.facing = 1;
        }
        else
        {
            this.player.body.setVelocityX(0);
        }

        // While fishing: redraw the line from the player to the float.
        if (this.fishing)
        {
            const tip = this.rodTip();
            const float = this.fishing.float;

            this.fishing.line.clear();
            this.fishing.line.lineStyle(1, 0xffffff);
            this.fishing.line.lineBetween(tip.x, tip.y, float.x, float.y);
        }

        // Which room is the player in? (0 = Marketplace, 1 = Empty Room, 2 = Lake of Colors)
        const room = roomAt(this.player.x);

        // When the player walks into another room, the camera jumps there
        // and from now on stays inside that room.
        if (room !== this.currentRoom)
        {
            this.currentRoom = room;
            this.keepCameraInRoom(room);

            // Fresh fish every time you walk into the water room.
            // Leaving it takes the old fish away.
            this.removeFishes();
            if (room === this.waterRoom)
            {
                this.spawnFishes();
            }
        }
    }
}

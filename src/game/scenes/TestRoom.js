import { Scene } from 'phaser';
import npcText from '../../data/npcs.json';
import menuText from '../../data/menu.json';
import plantText from '../../data/plants.json';
import marketObjectText from '../../data/market-objects.json';
import { createProgress, recordAnswer } from '../progress.js';

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
const SLOPE_WIDTH = 10;     // the slope: the 10 tiles right after the plateau

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

// NPCs (people to talk to later) in the Marketplace: placeholder boxes, 12 pixels wide.
// Everyone SITS on a mat, so they are shorter than the standing player (24).
// col      = the tile column they sit on, counted from the Marketplace's left edge.
// type     = who they are; what they say is in src/data/npcs.json under that name.
// height   = how tall the sitting box is, in pixels (slightly different for each person).
// color    = the color of their cloak (the box).
// headband = the color of a thin band near the top of the box, or null for none.
// wares    = (merchants only) little piles of goods lying on the mat next to them:
//            x = left/right of the merchant's middle, width/height in pixels, and color.
// 5 merchants on the flat ground, 8 tiles apart (so their piles of counting objects
// have room), the marketplace leader on the plateau under the roof.
const MARKET_NPCS = [
    { col: 5, type: 'judge', height: 17, color: 0xf0ead6, headband: 0xb22222, wares: [] },
    {
        col: 24, type: 'merchant', height: 16, color: 0x9b5de5, headband: null,
        wares: [ { x: -12, width: 6, height: 4, color: 0x6b8e23 }, { x: -6, width: 4, height: 3, color: 0x6b8e23 } ]
    },
    {
        col: 32, type: 'merchant', height: 15, color: 0x7b4fc4, headband: 0xf2c418,
        wares: [ { x: -11, width: 8, height: 6, color: 0xb5651d } ]
    },
    {
        col: 40, type: 'merchant', height: 17, color: 0xa86fd8, headband: null,
        wares: [ { x: -13, width: 4, height: 4, color: 0xd62828 }, { x: -8, width: 4, height: 4, color: 0xf2c418 } ]
    },
    {
        col: 48, type: 'merchant', height: 14, color: 0x8a5cc9, headband: 0x2a9d8f,
        wares: [ { x: -11, width: 7, height: 3, color: 0x5a3a1a }, { x: -10, width: 5, height: 2, color: 0x5a3a1a } ]
    },
    {
        col: 56, type: 'merchant', height: 16, color: 0x9467d0, headband: 0xffffff,
        wares: [ { x: -12, width: 5, height: 5, color: 0xe9c46a }, { x: -7, width: 3, height: 3, color: 0xe9c46a } ]
    }
];

// Mats (petates) the NPCs sit on: a flat woven rectangle with darker stripes.
const MAT_WIDTH = 32;
const MAT_HEIGHT = 3;
const COLOR_MAT = 0xc8a96e;
const COLOR_MAT_STRIPE = 0xa8884e;

// The leader's shelter on the plateau: a wall at the far left and a flat roof over the leader,
// held up on the right by a wooden post. Only to look at; you walk through all of it.
const SHELTER_WALL_WIDTH = 2;       // in tiles, from the Marketplace's left edge
const SHELTER_WALL_HEIGHT = 5;      // in tiles, above the plateau
const SHELTER_ROOF_HEIGHT = 4;      // how high the roof's lower edge is above the plateau, in tiles
const SHELTER_ROOF_THICKNESS = 6;   // in pixels
const SHELTER_ROOF_RIGHT = 9;       // the tile column where the roof (and its post) ends
const SHELTER_POST_WIDTH = 4;       // in pixels
const COLOR_SHELTER_WALL = 0xe8dcc0;
const COLOR_SHELTER_STRIPE = 0xa83232; // a painted band along the wall
const COLOR_SHELTER_ROOF = 0x9c7a4a;
const COLOR_SHELTER_POST = 0x6b4423;
// The leader's seat has a backrest: a reed board right behind (left of) the leader.
const BACKREST_WIDTH = 3;
const BACKREST_HEIGHT = 22;
const COLOR_BACKREST = 0xb89b5e;

// --- Marketplace counting game: objects lying around the merchants ---
// Every time you walk into the Marketplace, each merchant gets 0 to MAX_OBJECTS_EACH
// of every object type (picked at random), lying on the ground next to their mat.
// They don't move. Leaving the Marketplace takes them away.
// For now these are demo objects (A, B, C) in different colors, each marked with its letter.
// Their names are in src/data/market-objects.json under the same id.
const MARKET_OBJECTS = [
    { id: 'objectA', color: 0xe76f51, letter: 'a' },
    { id: 'objectB', color: 0x4cc9f0, letter: 'b' },
    { id: 'objectC', color: 0xf8f9fa, letter: 'c' }
];
const MAX_OBJECTS_EACH = 4;
const OBJECT_SIZE = 10;  // each object is a square, in pixels
const OBJECT_GAP = 1;    // space between two objects lying next to / on top of each other
// Where the objects lie: in two little piles, one on each side of the mat.
// Each pile is OBJECT_PILE_COLUMNS wide and up to OBJECT_PILE_ROWS high,
// starting OBJECT_PILE_DISTANCE pixels from the merchant's middle.
// (3 x 2 on each side = 12 places = room for 4 of each of the 3 types.)
const OBJECT_PILE_COLUMNS = 3;
const OBJECT_PILE_ROWS = 2;
const OBJECT_PILE_DISTANCE = MAT_WIDTH / 2 + 3;

// --- Lake of Colors: flowering bushes and trees (to look at and inspect with Itta; you walk through them) ---
// col   = the tile column of the plant's middle, counted from the Lake's left edge
//         (the water starts at column 16).
// type  = which plant it is; its Itta text is in src/data/plants.json under that name.
// trunk = width and height of the brown trunk, in pixels, or null for a bush (no trunk).
//         Keep trunks at most 18 pixels high, so the crown reaches down to the player's eyes.
// crown = width and height of the green leafy part, in pixels. It sits on top of the trunk
//         (or right on the ground, for a bush).
// flowers = where each flower sits on the crown: x = left/right of the crown's middle,
//         y = up/down from the crown's middle (minus = up), in pixels.
const LAKE_PLANTS = [
    {
        // A flowering tree with a round-ish crown
        col: 2, type: 'redFlower', color: 0xd62828,
        trunk: { width: 6, height: 16 },
        crown: { width: 42, height: 44 },
        flowers: [ { x: -14, y: -15 }, { x: 2, y: -17 }, { x: 13, y: -9 }, { x: -6, y: -4 },
                   { x: 10, y: 3 }, { x: -15, y: 6 }, { x: 3, y: 10 }, { x: 16, y: 15 },
                   { x: -5, y: 16 } ]
    },
    {
        // A wide, low bush standing right on the ground
        col: 7, type: 'whiteFlower', color: 0xffffff,
        trunk: null,
        crown: { width: 48, height: 24 },
        flowers: [ { x: -18, y: -6 }, { x: -7, y: -8 }, { x: 5, y: -5 }, { x: 17, y: -7 },
                   { x: -12, y: 4 }, { x: 0, y: 3 }, { x: 13, y: 5 } ]
    },
    {
        // A tall, narrow tree
        col: 12, type: 'yellowFlower', color: 0xf2c418,
        trunk: { width: 4, height: 16 },
        crown: { width: 26, height: 68 },
        flowers: [ { x: -6, y: -27 }, { x: 6, y: -19 }, { x: -7, y: -9 }, { x: 5, y: 0 },
                   { x: -5, y: 10 }, { x: 6, y: 19 }, { x: -3, y: 28 } ]
    }
];
const COLOR_LEAVES = 0x2d6a4f;
const FLOWER_SIZE = 6;

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
    buildRoomGrid(),     // 1 = Home (where the game starts)
    buildWaterRoomGrid() // 2 = Lake of Colors: right half is water
];

// Where the player appears when arriving in each room (start, save file, Map):
// the tile column, counted from the room's left edge. Same order as ROOMS.
// The player always stands on the ground in that column.
const ROOM_ARRIVAL = [
    MARKET_WIDTH - 4, // Marketplace: bottom right, 4 tiles from its right edge
    4,                // Home: 4 tiles from the left edge
    4                 // Lake of Colors: 4 tiles from the left edge
];

// The room where a new game starts, and where you wake up after blacking out:
// Home.
const START_ROOM = 1;

// --- Home: placeholder house and trees (only to look at; you walk past them) ---
// Columns are counted from Home's left edge.
const HOUSE_COL = 12;        // where the house's left wall starts
const HOUSE_WIDTH = 8;       // in tiles
const HOUSE_HEIGHT = 5;      // walls, in tiles
const ROOF_OVERHANG = 1;     // how many tiles the roof sticks out on each side
const ROOF_HEIGHT = 2;       // in tiles
const COLOR_WALL = 0xd9b38c;
const COLOR_ROOF = 0xc9a227;
const COLOR_DOOR = 0x4a2f1b;

// Trees: the column of each trunk.
const HOME_TREES = [ 2, 8, 23, 28 ];
const TRUNK_WIDTH = 6;       // in pixels
const TRUNK_HEIGHT = 24;
const CROWN_SIZE = 28;       // the green square on top
const COLOR_TRUNK = 0x6b4423;
const COLOR_CROWN = 0x2d6a4f;

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
// No fish gets interested until the float has been on the water this long (milliseconds).
const BITE_WAIT = 2000;
// After BITE_WAIT, one fish gets interested at a random moment within this time (milliseconds).
// So with 2000 and 1000, a fish starts swimming to the float somewhere between 2 and 3 seconds.
const INTEREST_WINDOW = 1000;
// At the latest this long after the float lands, the interested fish bites (milliseconds).
const BITE_DEADLINE = 5000;
// How slowly the interested fish swims to the float, in pixels per second.
// (If it's far away, it swims a bit faster so it still makes it by BITE_DEADLINE.)
const APPROACH_SPEED = 15;
// The interested fish takes at least this long to reach the float (milliseconds),
// so you can always see it coming.
const MIN_APPROACH_TIME = 1200;
// When a fish bites, you have this long to pull (Quixtia) before it gets away (milliseconds).
const PULL_TIME = 1000;
// When a fish bites, the float is pulled this many pixels under the water and back up, again and again.
const BITE_DIP = 4;
// The interested fish is picked from this many fish closest to the float.
const NEAREST_FISH = 3;
// How likely each of those fish is to be the one. Only matters compared to the
// numbers below (a fish with 0.5 is picked twice as often as one with 0.25).
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

// What a new game starts with (for now a lot, to make testing faster).
// A loaded save file uses what's saved in it instead.
const START_BEANS = 100;
const START_BAG = { michin: 10 };
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

// Mixes up the order of a list (changes the list itself).
function shuffle (list)
{
    for (let i = list.length - 1; i > 0; i--)
    {
        const j = randomBetween(0, i);
        [ list[i], list[j] ] = [ list[j], list[i] ];
    }
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

        // --- Home: house and trees ---
        this.decorateHome();

        // --- Marketplace: the leader's shelter, and the NPCs sitting on their mats ---
        this.decorateMarket();

        // While the player's own speech animation runs (Ihtoa with nobody in front):
        // { bubble, timer }. null otherwise.
        this.talking = null;

        // The player: a small green rectangle (12 x 24 pixels).
        // It starts 4 tiles from the left edge of the start room (Home).
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

        // --- Lake of Colors: flower plants ---
        this.decorateLake();

        // No fish at the start: they are made every time you walk into the water room.
        this.fishes = [];

        // Same for the counting objects: made every time you walk into the Marketplace.
        this.marketObjects = [];

        // The leader's counting task while it's running: { id, total }
        // (which object to count, and how many there are). null when there is none.
        this.marketQuest = null;

        // The left, right and top edges of the whole map (all rooms together) are walls.
        // The bottom edge is open, so the player can fall off the screen.
        this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
        this.physics.world.setBoundsCollision(true, true, true, false);
        this.mapHeight = map.heightInPixels;

        // --- Start room ---
        // A new game starts in Home.
        // After loading a save file, the player starts in the saved room instead,
        // at that room's arrival spot (see ROOM_ARRIVAL), standing on the ground.
        // A save file without a room, or with a room that doesn't exist, starts in Home.
        let startRoom = START_ROOM;
        if (data && data.save)
        {
            let savedRoom = data.save.room;

            // Save files from before the Marketplace was added (version 1 and 2)
            // counted Home as 0 and the Lake as 1. Now the Marketplace is 0,
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
        // The camera is kept inside that room. If it's the Lake, the fish are made;
        // if it's the Marketplace, the counting objects.
        this.currentRoom = startRoom;
        this.keepCameraInRoom(startRoom);
        if (startRoom === this.waterRoom)
        {
            this.spawnFishes();
        }
        if (startRoom === 0)
        {
            this.spawnMarketObjects();
        }

        // Where the player wakes up after blacking out: Home,
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
        // A new game starts with START_BEANS (see the top of this file).
        // After loading a save file, the saved beans are used.
        // A save file without beans (older version), or with a strange number, gives 0.
        const savedBeans = data && data.save ? data.save.beans : START_BEANS;
        this.beans = Number.isInteger(savedBeans) && savedBeans >= 0 ? savedBeans : 0;

        // --- Bag ---
        // How many of each item the player has, e.g. { michin: 3 }.
        // The names (like "michin") are the ids in src/data/items.json.
        // A new game starts with START_BAG (see the top of this file).
        // After loading a save file, the saved bag is used.
        // A save file without a bag (older version) gives an empty bag.
        // Any entry with a strange number (not a whole number, or below 0) is left out.
        this.bag = {};
        const savedBag = data && data.save ? data.save.bag : START_BAG;
        if (savedBag !== null && typeof savedBag === 'object')
        {
            Object.entries(savedBag).forEach(([ id, amount ]) => {
                if (Number.isInteger(amount) && amount >= 0)
                {
                    this.bag[id] = amount;
                }
            });
        }

        // --- Word progress ---
        // How often each word was answered right and wrong (see src/game/progress.js).
        // After loading a save file, the saved counts are used; a new game (or an older
        // save file without them) starts with none. The session counts always start at zero.
        this.progress = createProgress(data && data.save ? data.save.wordStats : null);

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
        else if (action === 'inspect')
        {
            this.inspect();
        }
        else if (action === 'buy' || action === 'sell')
        {
            this.trade(action);
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

    // Draws the placeholder house and trees in Home, all made of rectangles.
    // They are drawn behind everything else (depth -1), so the player walks in front of them.
    decorateHome ()
    {
        const left = roomLeft(START_ROOM);
        const ground = (ROOM_HEIGHT - FLOOR_ROWS) * TILE; // top of the ground, in pixels

        // House: walls, a roof that is a bit wider, and a door in the middle.
        const houseLeft = left + HOUSE_COL * TILE;
        const houseWidth = HOUSE_WIDTH * TILE;
        const wallsTop = ground - HOUSE_HEIGHT * TILE;

        this.add.rectangle(houseLeft, wallsTop, houseWidth, HOUSE_HEIGHT * TILE, COLOR_WALL)
            .setOrigin(0, 0).setDepth(-1);

        this.add.rectangle(houseLeft - ROOF_OVERHANG * TILE, wallsTop - ROOF_HEIGHT * TILE,
            houseWidth + 2 * ROOF_OVERHANG * TILE, ROOF_HEIGHT * TILE, COLOR_ROOF)
            .setOrigin(0, 0).setDepth(-1);

        const doorWidth = 20;
        const doorHeight = 36;
        this.add.rectangle(houseLeft + (houseWidth - doorWidth) / 2, ground - doorHeight,
            doorWidth, doorHeight, COLOR_DOOR)
            .setOrigin(0, 0).setDepth(-1);

        // Trees: a brown trunk with a green square on top.
        HOME_TREES.forEach((col) => {
            const x = left + col * TILE + TILE / 2; // middle of the tree

            this.add.rectangle(x, ground - TRUNK_HEIGHT / 2, TRUNK_WIDTH, TRUNK_HEIGHT, COLOR_TRUNK)
                .setDepth(-1);
            this.add.rectangle(x, ground - TRUNK_HEIGHT - CROWN_SIZE / 2 + 4, CROWN_SIZE, CROWN_SIZE, COLOR_CROWN)
                .setDepth(-1);
        });
    }

    // Puts the flowering bushes and trees (LAKE_PLANTS) on the ground of the Lake of Colors.
    // Each one is a few rectangles: a brown trunk (trees only), a big green crown,
    // and colored flowers on the crown.
    // They're drawn behind the player and aren't solid. Remembered in this.plants for Itta.
    decorateLake ()
    {
        const left = roomLeft(this.waterRoom);
        const ground = this.floorTop;

        this.plants = LAKE_PLANTS.map((plant) => {
            const x = left + plant.col * TILE + TILE / 2; // middle of the plant

            // Trunk (trees only), standing on the ground
            const trunkHeight = plant.trunk ? plant.trunk.height : 0;
            if (plant.trunk)
            {
                this.add.rectangle(x, ground - trunkHeight / 2, plant.trunk.width, trunkHeight, COLOR_TRUNK)
                    .setDepth(-1);
            }

            // Crown, on top of the trunk (or on the ground)
            const crownMiddleY = ground - trunkHeight - plant.crown.height / 2;
            this.add.rectangle(x, crownMiddleY, plant.crown.width, plant.crown.height, COLOR_LEAVES)
                .setDepth(-1);

            // Flowers on the crown
            plant.flowers.forEach((flower) => {
                this.add.rectangle(x + flower.x, crownMiddleY + flower.y, FLOWER_SIZE, FLOWER_SIZE, plant.color)
                    .setDepth(-1);
            });

            // For Itta: where the plant stands, and how wide it is (the crown's width).
            return { x, width: plant.crown.width, bottom: ground, type: plant.type };
        });
    }

    // Draws the Marketplace: the leader's shelter (wall, roof, post) on the plateau,
    // and every NPC (MARKET_NPCS) sitting on a mat, with their wares next to them.
    // The shelter, mats and wares are drawn behind everything (depth -1) and aren't solid.
    // The NPC boxes are remembered in this.npcs with their type, so Ihtoa and Itta can find them.
    decorateMarket ()
    {
        const left = roomLeft(0);
        const plateauTop = (ROOM_HEIGHT - FLOOR_ROWS - PLATEAU_HEIGHT) * TILE;

        // Wall at the far left, with a painted band a little below its top.
        const wallWidth = SHELTER_WALL_WIDTH * TILE;
        const wallTop = plateauTop - SHELTER_WALL_HEIGHT * TILE;
        this.add.rectangle(left, wallTop, wallWidth, SHELTER_WALL_HEIGHT * TILE, COLOR_SHELTER_WALL)
            .setOrigin(0, 0).setDepth(-1);
        this.add.rectangle(left, wallTop + 6, wallWidth, 4, COLOR_SHELTER_STRIPE)
            .setOrigin(0, 0).setDepth(-1);

        // Flat roof, from the wall to the post, sticking out a little past the post.
        const roofRight = left + SHELTER_ROOF_RIGHT * TILE;
        const roofBottom = plateauTop - SHELTER_ROOF_HEIGHT * TILE;
        this.add.rectangle(left + wallWidth, roofBottom - SHELTER_ROOF_THICKNESS,
            roofRight + 4 - (left + wallWidth), SHELTER_ROOF_THICKNESS, COLOR_SHELTER_ROOF)
            .setOrigin(0, 0).setDepth(-1);

        // Wooden post holding up the roof's right end.
        this.add.rectangle(roofRight - SHELTER_POST_WIDTH, roofBottom,
            SHELTER_POST_WIDTH, plateauTop - roofBottom, COLOR_SHELTER_POST)
            .setOrigin(0, 0).setDepth(-1);

        // NPCs, each on a mat.
        this.npcs = MARKET_NPCS.map((npc) => {
            const x = left + npc.col * TILE + TILE / 2;
            const ground = this.groundTopAt(x);
            const matTop = ground - MAT_HEIGHT;

            // Mat, with three darker woven stripes.
            this.add.rectangle(x, ground - MAT_HEIGHT / 2, MAT_WIDTH, MAT_HEIGHT, COLOR_MAT).setDepth(-1);
            [ -10, 0, 10 ].forEach((offset) => {
                this.add.rectangle(x + offset, ground - MAT_HEIGHT / 2, 2, MAT_HEIGHT, COLOR_MAT_STRIPE).setDepth(-1);
            });

            // The leader's seat has a backrest.
            if (npc.type === 'judge')
            {
                this.add.rectangle(x - 6 - BACKREST_WIDTH / 2, matTop - BACKREST_HEIGHT / 2,
                    BACKREST_WIDTH, BACKREST_HEIGHT, COLOR_BACKREST).setDepth(-1);
            }

            // Wares lying on the mat.
            npc.wares.forEach((ware) => {
                this.add.rectangle(x + ware.x, matTop - ware.height / 2, ware.width, ware.height, ware.color)
                    .setDepth(-1);
            });

            // The person: a box sitting on the mat, with an optional headband.
            const box = this.add.rectangle(x, matTop - npc.height / 2, 12, npc.height, npc.color);
            if (npc.headband !== null)
            {
                this.add.rectangle(x, matTop - npc.height + 4, 12, 2, npc.headband);
            }

            return { box, type: npc.type };
        });
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
        // (Stop doing that when the room restarts after loading a save file.
        // By the time the room shuts down, Phaser may already have removed the physics
        // world, and with it this check; then there's nothing left to stop.)
        this.physics.world.on('worldstep', this.stickToSlope, this);
        this.events.once('shutdown', () => {
            if (this.physics.world)
            {
                this.physics.world.off('worldstep', this.stickToSlope, this);
            }
        });
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
            const overlay = this.scene.get('Overlay');

            if (npc.type === 'judge')
            {
                this.talkToLeader(overlay);
                return;
            }

            overlay.openDialogue(npcText[npc.type].line);
            return;
        }

        const bubble = this.speechAnimation(this.player, this.facing);
        const timer = this.time.delayedCall(TALK_TIME, () => {
            this.talking = null;
        });
        this.talking = { bubble, timer };
    }

    // Talking to the marketplace leader (the counting task).
    // - No task yet: he says who he is, then asks for help surveying the merchandise
    //   (paid in cacao). Yes: he picks one object type and tells you to count all of them
    //   in the market and come back; the task starts. No: the box just closes.
    // - Task running: he first asks whether you counted them all. Yes or no:
    //   for now, both just close the box (the task keeps running).
    talkToLeader (overlay)
    {
        if (this.marketQuest)
        {
            overlay.openQuestion(npcText.judge.countedAll, () => {}, () => {});
            return;
        }

        overlay.openDialogue(npcText.judge.line, () => {
            overlay.openQuestion(npcText.judge.request, () => this.startMarketQuest(overlay), () => {});
        });
    }

    // Starts the counting task: picks one of the object types that are lying around
    // right now, remembers how many there are in the whole market,
    // and the leader says which one to count (its name goes into the gap in his sentence).
    startMarketQuest (overlay)
    {
        const counts = MARKET_OBJECTS.map((type) => ({
            id: type.id,
            total: this.marketObjects.filter((object) => object.id === type.id).length
        }));

        // Only types there is at least one of (if there's none of anything, any type).
        const present = counts.filter((count) => count.total > 0);
        const pool = present.length > 0 ? present : counts;
        const chosen = pool[randomBetween(0, pool.length - 1)];

        // The task: which object, and the right answer (how many there are).
        this.marketQuest = { id: chosen.id, total: chosen.total };

        // 2 = use the plural form of the name ("all the ...").
        overlay.openDialogue(overlay.fillTemplate(npcText.judge.order, 2, marketObjectText[chosen.id]));
    }

    // Itta: look at what's in front of the player. No animation; a dialogue box opens.
    // Things that can be inspected: the Marketplace NPCs (their "inspect" text in
    // src/data/npcs.json) and the Lake's flower plants (src/data/plants.json).
    // Anywhere else, a placeholder text from src/data/menu.json.
    // (Uses the same reach as Ihtoa.)
    inspect ()
    {
        const npc = this.npcInFront();
        // (You walk through plants, so a plant you're standing in counts too.)
        const plant = this.plants.find((p) => this.isInFront(p.x, p.width, p.bottom, true));

        let text = menuText.messages.nothingToInspect;
        if (npc)
        {
            text = npcText[npc.type].inspect;
        }
        else if (plant)
        {
            text = plantText[plant.type].inspect;
        }

        this.scene.get('Overlay').openDialogue(text);
    }

    // The NPC standing right in front of the player (see TALK_REACH), or null.
    npcInFront ()
    {
        return this.npcs.find((npc) => {
            const box = npc.box;
            return this.isInFront(box.x, box.width, box.y + box.height / 2);
        }) ?? null;
    }

    // Is something right in front of the player?
    // x = its middle, width = how wide it is, bottom = where its lower edge is (in pixels).
    // It must be in front (not behind), at most TALK_REACH away, and stand at about the
    // same height as the player (their lower edges less than 12 pixels apart).
    // overlapOk = true: it also counts if the player is standing in it (for things you walk through).
    isInFront (x, width, bottom, overlapOk = false)
    {
        const body = this.player.body;

        // Space between the player's front and the thing's near side.
        const gap = this.facing === 1
            ? (x - width / 2) - body.right
            : body.left - (x + width / 2);

        // How far "into" it the player may be: NPCs only a little, walk-through things all the way.
        const minGap = overlapOk ? -(width + body.width) : -width;

        const sameHeight = Math.abs(bottom - body.bottom) < 12;
        return gap >= minGap && gap <= TALK_REACH && sameHeight;
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

    // Ends a speech animation early: stops the blinking and removes the box.
    stopSpeech (bubble)
    {
        this.tweens.killTweensOf(bubble);
        bubble.destroy();
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
            // when (in milliseconds on the water) a fish gets interested
            interestAt: randomBetween(BITE_WAIT, BITE_WAIT + INTEREST_WINDOW),
            hookedFish: null,  // the fish swimming to the float or biting, or null
            biting: false,     // true while a fish bites and you can pull (Quixtia)
            pullTimer: null    // makes the fish get away if you don't pull in time
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

    // Once the float has been on the water long enough (interestAt),
    // one fish near the float gets interested and starts swimming to it.
    checkForBite ()
    {
        if (this.fishing.waited < this.fishing.interestAt)
        {
            return;
        }

        const fish = this.pickInterestedFish();
        if (fish)
        {
            this.hookFish(fish);
        }
    }

    // Picks one of the NEAREST_FISH fish closest to the float.
    // Which one is a bit random: fish with a higher bite chance are picked more often.
    pickInterestedFish ()
    {
        const floatX = this.fishing.float.x;
        const floatY = this.floorTop;
        const distanceTo = (fish) => Math.hypot(fish.body.x - floatX, fish.body.y - floatY);

        // The closest fish first, then keep only the first few.
        const nearest = [...this.fishes]
            .sort((a, b) => distanceTo(a) - distanceTo(b))
            .slice(0, NEAREST_FISH);

        if (nearest.length === 0)
        {
            return null; // no fish left in the water
        }

        // A "weighted" random pick: imagine each fish gets a slice of a wheel,
        // as big as its bite chance, and the wheel is spun once.
        const chances = nearest.map((fish) => this.biteChanceFor(fish));
        const total = chances.reduce((sum, c) => sum + c, 0);
        let spin = Math.random() * total;

        for (let i = 0; i < nearest.length; i++)
        {
            spin -= chances[i];
            if (spin < 0)
            {
                return nearest[i];
            }
        }
        return nearest[nearest.length - 1];
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

    // A fish is interested: it slowly swims to the float first, then bites.
    hookFish (fish)
    {
        // The fish stops its normal swimming, and the float stops drifting.
        fish.hooked = true;
        this.fishing.hookedFish = fish;

        const float = this.fishing.float;
        const targetX = float.x;
        const targetY = this.floorTop + 4; // just below the float

        // How long the swim takes: slow (APPROACH_SPEED), but it must arrive by BITE_DEADLINE,
        // and it never takes less than MIN_APPROACH_TIME.
        const distance = Math.hypot(targetX - fish.body.x, targetY - fish.body.y);
        const slowTime = distance / APPROACH_SPEED * 1000;
        const timeLeft = BITE_DEADLINE - this.fishing.waited;
        const duration = Math.max(MIN_APPROACH_TIME, Math.min(slowTime, timeLeft));

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

    // The fish has reached the float and bites: it shakes and the float dips under the water.
    // Now the player has PULL_TIME to pull (Quixtia). If they don't, the fish swims away, but you keep fishing.
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

        // The float dips under the water and comes back up, again and again.
        this.tweens.add({
            targets: float,
            y: { from: this.floorTop - 2, to: this.floorTop - 2 + BITE_DIP },
            duration: 120,
            yoyo: true,
            repeat: -1
        });

        // The fish is biting now. If nobody pulls in time, it lets go (see missBite).
        this.fishing.biting = true;
        this.fishing.pullTimer = this.time.delayedCall(PULL_TIME, () => this.missBite());

        // "Quixtia" changes color, so you know now is the time to pull.
        this.scene.get('Overlay').showBite();
    }

    // Nobody pulled in time: the fish lets go and swims away, but the line stays in the water.
    // Everything starts over as if the float had just landed, so another fish
    // gets interested after BITE_WAIT and bites by BITE_DEADLINE.
    missBite ()
    {
        const fish = this.fishing.hookedFish;

        // The fish stops shaking and swims on normally.
        this.tweens.killTweensOf(fish.body);
        fish.hooked = false;

        // The float stops dipping and goes back onto the water's surface.
        const float = this.fishing.float;
        this.tweens.killTweensOf(float);
        float.y = this.floorTop - 2;

        // Start waiting again from zero.
        this.fishing.hookedFish = null;
        this.fishing.biting = false;
        this.fishing.pullTimer = null;
        this.fishing.waited = 0;
        this.fishing.interestAt = randomBetween(BITE_WAIT, BITE_WAIT + INTEREST_WINDOW);

        // "Quixtia" goes back to white.
        this.scene.get('Overlay').endBite();
    }

    // The player pressed "pull" (Quixtia) while the line is out.
    // - A fish is biting: caught on the hook, the q/w/e minigame starts.
    // - No fish biting yet (or one only swimming closer): the line just comes back in.
    pullLine ()
    {
        if (!this.fishing)
        {
            return;
        }

        if (!this.fishing.biting)
        {
            this.stopFishing();
            return;
        }

        // Pulled in time: stop the "too late" timer and start the minigame.
        this.fishing.pullTimer.remove();
        this.fishing.biting = false;

        const started = this.scene.get('Overlay').startMinigame(this.fishing.hookedFish.colorName);
        if (!started)
        {
            // No word for this color in the fishing word list: the fish just gets away.
            this.stopFishing();
        }
    }

    // Called by the overlay when the minigame is over.
    // success = true: the fish is caught. false: wrong button or time ran out.
    // word = the fishing word that was asked (e.g. "Chichiltic").
    fishingResult (success, word)
    {
        if (!this.fishing || !this.fishing.hookedFish)
        {
            return;
        }

        // Count the answer for this word (for this session and for the save file).
        recordAnswer(this.progress, word, success);

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

    // ---------- Buying and selling (Cohua / Namaca) ----------

    // kind = 'buy' (Cohua) or 'sell' (Namaca).
    // Only merchants trade: an NPC is a merchant if it has a "sells" list in src/data/npcs.json.
    // - Nobody in front: the "that didn't work" wobble, like fishing away from water.
    // - Another NPC in front: a placeholder message that they're not interested.
    // - A merchant in front: the merchant does the speech animation and asks
    //   what you want to buy/sell (dialogue box). When you close the box,
    //   buy opens the shop window, sell opens your bag to sell from.
    trade (kind)
    {
        const npc = this.npcInFront();
        const overlay = this.scene.get('Overlay');

        if (!npc)
        {
            this.failAction();
        }
        else if (!npcText[npc.type].sells)
        {
            overlay.openDialogue(menuText.messages.notInterested);
        }
        else
        {
            const bubble = this.speechAnimation(npc.box, 0);
            const question = kind === 'buy' ? menuText.messages.whatToBuy : menuText.messages.whatToSell;

            overlay.openDialogue(question, () => {
                // The room stops while the shop window is open, so end the speech
                // animation first; otherwise the blinking box would freeze in place.
                this.stopSpeech(bubble);
                overlay.openTrade(kind, npcText[npc.type].sells);
            });
        }
    }

    // Buys count pieces of an item, price = beans for one piece.
    // Returns false (and changes nothing) if there aren't enough beans.
    buyItem (id, price, count)
    {
        const cost = price * count;
        if (this.beans < cost)
        {
            return false;
        }
        this.beans -= cost;
        this.addToBag(id, count);
        this.scene.get('Overlay').showBeans(this.beans);
        return true;
    }

    // Sells count pieces of an item from the bag, price = beans for one piece.
    // Returns false (and changes nothing) if there aren't that many in the bag.
    sellItem (id, price, count)
    {
        if ((this.bag[id] ?? 0) < count)
        {
            return false;
        }
        this.bag[id] -= count;
        this.beans += price * count;
        this.scene.get('Overlay').showBeans(this.beans);
        return true;
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

        // If a fish was biting and waiting to be pulled, that "too late" timer isn't needed anymore.
        if (this.fishing.pullTimer)
        {
            this.fishing.pullTimer.remove();
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

    // Out of life: the screen goes black, and the player wakes up in Home
    // with full life again. The screen slowly fades back in.
    // (The camera moves to Home by itself in the next frame, see update.)
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

    // Makes a new set of counting objects around every merchant in the Marketplace:
    // 0 to MAX_OBJECTS_EACH of each type (MARKET_OBJECTS), picked at random.
    // They lie in two little piles, one on each side of the merchant's mat, all mixed up.
    // The lowest row is filled first, so nothing floats in the air.
    spawnMarketObjects ()
    {
        this.npcs.filter((npc) => npc.type === 'merchant').forEach((npc) => {
            // Which objects this merchant gets, e.g. [ A, A, B, C, C, C ], then shuffled.
            const objects = [];
            MARKET_OBJECTS.forEach((type) => {
                const amount = randomBetween(0, MAX_OBJECTS_EACH);
                for (let i = 0; i < amount; i++)
                {
                    objects.push(type);
                }
            });
            shuffle(objects);

            // All the places in the two piles, in the order they get filled:
            // bottom row first, and within a row the places closest to the mat first,
            // taking turns between the left and the right pile.
            const places = [];
            const pitch = OBJECT_SIZE + OBJECT_GAP;
            for (let row = 0; row < OBJECT_PILE_ROWS; row++)
            {
                for (let col = 0; col < OBJECT_PILE_COLUMNS; col++)
                {
                    const away = OBJECT_PILE_DISTANCE + col * pitch + OBJECT_SIZE / 2;
                    places.push({ x: -away, row });
                    places.push({ x: away, row });
                }
            }

            const x = npc.box.x;
            const ground = this.groundTopAt(x);
            objects.forEach((type, i) => {
                const place = places[i];
                const y = ground - OBJECT_SIZE / 2 - place.row * pitch;
                const box = this.add.rectangle(x + place.x, y, OBJECT_SIZE, OBJECT_SIZE, type.color)
                    .setDepth(-1);
                const letter = this.add.text(x + place.x, y, type.letter,
                    { fontFamily: 'Arial', fontSize: 8, color: '#000000' })
                    .setOrigin(0.5).setDepth(-1);
                this.marketObjects.push({ box, letter, id: type.id });
            });
        });
    }

    // Takes all counting objects away.
    removeMarketObjects ()
    {
        this.marketObjects.forEach((object) => {
            object.box.destroy();
            object.letter.destroy();
        });
        this.marketObjects = [];
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
        const speed = 100; // pixels per second (was 80)

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

        // Which room is the player in? (0 = Marketplace, 1 = Home, 2 = Lake of Colors)
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

            // The same for the counting objects in the Marketplace (room 0).
            // Leaving the Marketplace also cancels the leader's counting task.
            this.removeMarketObjects();
            this.marketQuest = null;
            if (room === 0)
            {
                this.spawnMarketObjects();
            }
        }
    }
}

import { Scene } from 'phaser';

// Size of one tile in pixels. Tiled maps will use the same size later.
const TILE = 16;

// The room as a grid of tiles: 32 tiles wide, 18 tiles high (= one screen).
// Later this grid will come from a map you draw in Tiled.
const ROOM_WIDTH = 32;
const ROOM_HEIGHT = 18;
const FLOOR_ROWS = 2;

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

// All rooms, from left to right. Room 2 lies to the right of room 1.
const ROOMS = [
    buildRoomGrid(),     // room 1
    buildWaterRoomGrid() // room 2: right half is water
];

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

    create ()
    {
        // Placeholder tiles, drawn in code, side by side in one picture:
        // tile 0 = floor (brown square), tile 1 = water (blue square).
        const g = this.add.graphics();
        g.fillStyle(0x8b5a2b);
        g.fillRect(0, 0, TILE, TILE);
        g.fillStyle(0x2f6fb5);
        g.fillRect(TILE, 0, TILE, TILE);
        g.generateTexture('placeholder-tiles', TILE * 2, TILE);
        g.destroy();

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

        // The player: a small green rectangle (12 x 24 pixels).
        const floorTop = (ROOM_HEIGHT - FLOOR_ROWS) * TILE;
        this.player = this.add.rectangle(4 * TILE, floorTop - 12, 12, 24, 0x2ecc71);
        this.physics.add.existing(this.player);
        this.player.body.setCollideWorldBounds(true);

        // The player stands on the floor instead of falling through it.
        this.physics.add.collider(this.player, floor);

        // Where the player comes back after falling into the water:
        // standing on the floor, right next to the water's edge.
        const waterStartColumn = grid[ROOM_HEIGHT - 1].indexOf(WATER);
        this.respawnX = waterStartColumn * TILE - 8;
        this.respawnY = floorTop - 12;

        // The left, right and top edges of the whole map (all rooms together) are walls.
        // The bottom edge is open, so the player can fall off the screen.
        this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
        this.physics.world.setBoundsCollision(true, true, true, false);
        this.mapHeight = map.heightInPixels;

        // The room the player is in right now (0 = room 1, 1 = room 2).
        this.currentRoom = 0;

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
        if (action === 'jump')
        {
            // Only jump when standing on the floor, not in mid-air.
            if (this.player.body.blocked.down)
            {
                this.player.body.setVelocityY(-250);
            }
        }
    }

    update ()
    {
        const speed = 80; // pixels per second

        // Fell completely off the bottom of the screen: start again at the water's edge.
        if (this.player.body.top > this.mapHeight)
        {
            this.player.body.reset(this.respawnX, this.respawnY);
        }

        if (this.cursors.left.isDown)
        {
            this.player.body.setVelocityX(-speed);
        }
        else if (this.cursors.right.isDown)
        {
            this.player.body.setVelocityX(speed);
        }
        else
        {
            this.player.body.setVelocityX(0);
        }

        // Which room is the player in? Each room is one screen wide.
        const roomPixelWidth = ROOM_WIDTH * TILE;
        const room = Math.floor(this.player.x / roomPixelWidth);

        // When the player walks into another room, the camera jumps there.
        if (room !== this.currentRoom)
        {
            this.currentRoom = room;
            this.cameras.main.setScroll(room * roomPixelWidth, 0);
        }
    }
}

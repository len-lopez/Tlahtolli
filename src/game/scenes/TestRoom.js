import { Scene } from 'phaser';

// Size of one tile in pixels. Tiled maps will use the same size later.
const TILE = 16;

// The room as a grid of tiles: 32 tiles wide, 18 tiles high (= one screen).
// -1 means "empty", 0 means "floor tile".
// Later this grid will come from a map you draw in Tiled.
const ROOM_WIDTH = 32;
const ROOM_HEIGHT = 18;
const FLOOR_ROWS = 2;

function buildRoomGrid ()
{
    const grid = [];
    for (let row = 0; row < ROOM_HEIGHT; row++)
    {
        const isFloor = row >= ROOM_HEIGHT - FLOOR_ROWS;
        grid.push(new Array(ROOM_WIDTH).fill(isFloor ? 0 : -1));
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
        // Placeholder floor tile: a brown 16x16 square, drawn in code.
        const g = this.add.graphics();
        g.fillStyle(0x8b5a2b);
        g.fillRect(0, 0, TILE, TILE);
        g.generateTexture('placeholder-tiles', TILE, TILE);
        g.destroy();

        // Build the tile map from the grid above.
        const map = this.make.tilemap({
            data: buildRoomGrid(),
            tileWidth: TILE,
            tileHeight: TILE
        });
        const tileset = map.addTilesetImage('placeholder-tiles', 'placeholder-tiles', TILE, TILE, 0, 0);
        const floor = map.createLayer(0, tileset, 0, 0);
        floor.setCollisionByExclusion([ -1 ]);

        // The player: a small green rectangle (12 x 24 pixels).
        const floorTop = (ROOM_HEIGHT - FLOOR_ROWS) * TILE;
        this.player = this.add.rectangle(4 * TILE, floorTop - 12, 12, 24, 0x2ecc71);
        this.physics.add.existing(this.player);
        this.player.body.setCollideWorldBounds(true);

        // The player stands on the floor instead of falling through it.
        this.physics.add.collider(this.player, floor);

        // The room's edges are the edges of the map.
        this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

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
    }
}

import { Scene } from 'phaser';

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

// All rooms, from left to right. Room 2 lies to the right of room 1.
const ROOMS = [
    buildRoomGrid(),     // room 1
    buildWaterRoomGrid() // room 2: right half is water
];

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

// A random whole number from min to max (both included).
function randomBetween (min, max)
{
    return Math.floor(min + Math.random() * (max - min + 1));
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

        // The player: a small green rectangle (12 x 24 pixels).
        const floorTop = (ROOM_HEIGHT - FLOOR_ROWS) * TILE;
        this.player = this.add.rectangle(4 * TILE, floorTop - 12, 12, 24, 0x2ecc71);
        this.physics.add.existing(this.player);
        this.player.body.setCollideWorldBounds(true);

        // The player stands on the floor instead of falling through it.
        this.physics.add.collider(this.player, floor);

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

        // Which room the water is in (0 = room 1, 1 = room 2).
        this.waterRoom = Math.floor(waterLeft / (ROOM_WIDTH * TILE));

        // No fish at the start: they are made every time you walk into the water room.
        this.fishes = [];

        // The left, right and top edges of the whole map (all rooms together) are walls.
        // The bottom edge is open, so the player can fall off the screen.
        this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
        this.physics.world.setBoundsCollision(true, true, true, false);
        this.mapHeight = map.heightInPixels;

        // The room the player is in right now (0 = room 1, 1 = room 2).
        this.currentRoom = 0;
        this.cameras.main.setScroll(0, 0);

        // --- Start room ---
        // After loading a save file, the player starts in the saved room,
        // at the same spot as in room 1 (4 tiles from the room's left edge).
        // The camera and the fish follow by themselves in the next frame (see update).
        // A save file without a room, or with a room that doesn't exist, starts in room 1.
        const savedRoom = data && data.save ? data.save.room : 0;
        if (Number.isInteger(savedRoom) && savedRoom > 0 && savedRoom < ROOMS.length)
        {
            this.player.body.reset(savedRoom * ROOM_WIDTH * TILE + 4 * TILE, floorTop - 12);
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
        if (action === 'jump')
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

    // Puts the eye on the front side of the player, near the top.
    updateFace ()
    {
        this.eye.setPosition(this.player.x + this.facing * 3, this.player.y - 7);
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
        }

        // Either way, the line is pulled in.
        // (If the fish wasn't caught, stopFishing lets it swim away.)
        this.stopFishing();
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

        // Fell completely off the bottom of the screen: start again at the water's edge.
        if (this.player.body.top > this.mapHeight)
        {
            this.player.body.reset(this.respawnX, this.respawnY);
        }

        if (this.cursors.left.isDown)
        {
            this.player.body.setVelocityX(-speed);
            this.facing = -1;
            this.stopFishing(); // walking away takes the line back in
        }
        else if (this.cursors.right.isDown)
        {
            this.player.body.setVelocityX(speed);
            this.facing = 1;
            this.stopFishing();
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

        // Which room is the player in? Each room is one screen wide.
        const roomPixelWidth = ROOM_WIDTH * TILE;
        const room = Math.floor(this.player.x / roomPixelWidth);

        // When the player walks into another room, the camera jumps there.
        if (room !== this.currentRoom)
        {
            this.currentRoom = room;
            this.cameras.main.setScroll(room * roomPixelWidth, 0);

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

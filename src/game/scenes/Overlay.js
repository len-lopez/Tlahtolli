import { Scene } from 'phaser';

// The overlay is its own scene that is drawn on top of the room.
// It never moves with the map, so it always stays in the same place on screen.
export class Overlay extends Scene
{
    constructor ()
    {
        super('Overlay');
    }

    create ()
    {
        const letters = [ 'q', 'w', 'e' ];

        const x = 18;         // distance from the left edge of the screen
        const radius = 10;
        const spacing = 26;   // distance between the circle centers
        const centerY = this.scale.height / 2;

        letters.forEach((letter, i) => {
            // i = 0, 1, 2  ->  top, middle, bottom
            const y = centerY + (i - 1) * spacing;

            this.add.circle(x, y, radius, 0x333333).setStrokeStyle(1, 0xffffff);

            this.add.text(x, y, letter, {
                fontFamily: 'Arial',
                fontSize: 12,
                color: '#ffffff'
            }).setOrigin(0.5);
        });
    }
}

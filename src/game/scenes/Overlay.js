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

        // Enter key symbol: small rectangle in the bottom right corner.
        const w = this.scale.width;
        const h = this.scale.height;
        const enterX = w - 20;
        const enterY = h - 14;

        this.add.rectangle(enterX, enterY, 24, 16, 0x333333).setStrokeStyle(1, 0xffffff);
        this.add.text(enterX, enterY, '↵', {
            fontFamily: 'Arial',
            fontSize: 12,
            color: '#ffffff'
        }).setOrigin(0.5);

        // Menu screen: an empty placeholder panel, hidden at the start.
        this.menu = this.add.rectangle(w / 2, h / 2, w - 80, h - 60, 0x222222, 0.9)
            .setStrokeStyle(1, 0xffffff)
            .setVisible(false);

        // Pressing Enter opens the menu, pressing it again closes it.
        this.input.keyboard.on('keydown-ENTER', () => {
            this.menu.setVisible(!this.menu.visible);
        });
    }
}

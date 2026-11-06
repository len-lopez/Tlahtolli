import { Scene } from 'phaser';
import wordList from '../../data/wordlist.json';

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
        const w = this.scale.width;
        const h = this.scale.height;

        // --- q / w / e circles on the left edge ---
        const letters = [ 'q', 'w', 'e' ];

        const x = 18;         // distance from the left edge of the screen
        const radius = 10;
        const spacing = 26;   // distance between the circle centers
        const centerY = h / 2;

        // All circles and letters go into one container,
        // so they can be hidden and shown together.
        this.qweButtons = this.add.container(0, 0);

        letters.forEach((letter, i) => {
            // i = 0, 1, 2  ->  top, middle, bottom
            const y = centerY + (i - 1) * spacing;

            const circle = this.add.circle(x, y, radius, 0x333333).setStrokeStyle(1, 0xffffff);

            const label = this.add.text(x, y, letter, {
                fontFamily: 'Arial',
                fontSize: 12,
                color: '#ffffff'
            }).setOrigin(0.5);

            this.qweButtons.add([ circle, label ]);
        });

        // --- Enter key symbol in the bottom right corner ---
        const enterX = w - 20;
        const enterY = h - 14;

        this.add.rectangle(enterX, enterY, 24, 16, 0x333333).setStrokeStyle(1, 0xffffff);
        this.add.text(enterX, enterY, '↵', {
            fontFamily: 'Arial',
            fontSize: 12,
            color: '#ffffff'
        }).setOrigin(0.5);

        // --- Menu screen: shows the word list, hidden at the start ---
        this.menu = this.add.container(0, 0).setVisible(false);

        const panel = this.add.rectangle(w / 2, h / 2, w - 80, h - 60, 0x222222, 0.9)
            .setStrokeStyle(1, 0xffffff);
        this.menu.add(panel);

        // One line of text per entry in src/data/wordlist.json
        const listLeft = 60;
        const listTop = 45;
        const lineHeight = 16;

        wordList.forEach((entry, i) => {
            const line = this.add.text(listLeft, listTop + i * lineHeight, entry.word, {
                fontFamily: 'Arial',
                fontSize: 12,
                color: '#ffffff'
            });
            this.menu.add(line);
        });

        // Pressing Enter opens the menu, pressing it again closes it.
        this.input.keyboard.on('keydown-ENTER', () => {
            const opening = !this.menu.visible;

            this.menu.setVisible(opening);
            this.qweButtons.setVisible(!opening);

            // Pause the room while the menu is open, continue when it closes.
            if (opening)
            {
                this.scene.pause('TestRoom');
            }
            else
            {
                this.scene.resume('TestRoom');
            }
        });
    }
}

import { Scene } from 'phaser';
import wordList from '../../data/wordlist.json';

const SLOT_KEYS = [ 'q', 'w', 'e' ];

const COLOR_EMPTY = 0x333333;
const COLOR_USED = 0x2e7d9a;

const TEXT_STYLE = {
    fontFamily: 'Arial',
    fontSize: 12,
    color: '#ffffff'
};

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

        // What the player is doing right now:
        // 'play'   = walking around
        // 'menu'   = menu screen is open
        // 'prompt' = typing a word into a slot
        this.mode = 'play';

        // --- q / w / e slots on the left edge ---
        // Each slot is either empty (word = null) or used (word = a word from the list).
        this.slots = {};

        const x = 18;         // distance from the left edge of the screen
        const radius = 10;
        const spacing = 26;   // distance between the circle centers
        const centerY = h / 2;

        // All circles and letters go into one container,
        // so they can be hidden and shown together.
        this.qweButtons = this.add.container(0, 0);

        SLOT_KEYS.forEach((letter, i) => {
            // i = 0, 1, 2  ->  top, middle, bottom
            const y = centerY + (i - 1) * spacing;

            const circle = this.add.circle(x, y, radius, COLOR_EMPTY).setStrokeStyle(1, 0xffffff);
            const label = this.add.text(x, y, letter, TEXT_STYLE).setOrigin(0.5);

            // Shows the word next to the circle when the slot is used.
            const wordLabel = this.add.text(x + radius + 6, y, '', TEXT_STYLE).setOrigin(0, 0.5);

            this.qweButtons.add([ circle, label, wordLabel ]);

            this.slots[letter] = { word: null, circle, wordLabel };
        });

        // --- Enter key symbol in the bottom right corner ---
        const enterX = w - 20;
        const enterY = h - 14;

        this.add.rectangle(enterX, enterY, 24, 16, COLOR_EMPTY).setStrokeStyle(1, 0xffffff);
        this.add.text(enterX, enterY, '↵', TEXT_STYLE).setOrigin(0.5);

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
            const line = this.add.text(listLeft, listTop + i * lineHeight, entry.word, TEXT_STYLE);
            this.menu.add(line);
        });

        // --- Text prompt: a small box for typing a word, hidden at the start ---
        this.prompt = this.add.container(0, 0).setVisible(false);

        const promptBox = this.add.rectangle(w / 2, h / 2, 200, 32, 0x222222, 0.9)
            .setStrokeStyle(1, 0xffffff);
        this.promptText = this.add.text(w / 2, h / 2, '', TEXT_STYLE).setOrigin(0.5);
        this.prompt.add([ promptBox, this.promptText ]);

        this.typed = '';          // what has been typed so far
        this.promptSlot = null;   // which slot (q, w or e) the word is for

        // Every key press goes through here.
        this.input.keyboard.on('keydown', (event) => this.handleKey(event));
    }

    handleKey (event)
    {
        if (this.mode === 'prompt')
        {
            this.handlePromptKey(event);
            return;
        }

        // Holding a key down repeats it; ignore those repeats outside the prompt.
        if (event.repeat)
        {
            return;
        }

        if (event.key === 'Enter')
        {
            this.toggleMenu();
            return;
        }

        if (this.mode !== 'play')
        {
            return;
        }

        const letter = event.key.toLowerCase();
        if (!SLOT_KEYS.includes(letter))
        {
            return;
        }

        const slot = this.slots[letter];

        if (event.shiftKey)
        {
            // Shift + q/w/e empties the slot.
            this.setSlotWord(letter, null);
        }
        else if (slot.word === null)
        {
            // q/w/e on an empty slot opens the text prompt.
            this.openPrompt(letter);
        }
        else
        {
            // q/w/e on a used slot: do whatever the word does.
            this.useSlot(letter);
        }
    }

    // Looks up the word's action in the word list and tells the room to do it.
    useSlot (letter)
    {
        const word = this.slots[letter].word;
        const entry = wordList.find((e) => e.word === word);

        if (entry && entry.action)
        {
            this.scene.get('TestRoom').doAction(entry.action);
        }
    }

    toggleMenu ()
    {
        const opening = this.mode === 'play';

        this.mode = opening ? 'menu' : 'play';
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
    }

    openPrompt (letter)
    {
        this.mode = 'prompt';
        this.promptSlot = letter;
        this.typed = '';
        this.updatePromptText();
        this.prompt.setVisible(true);

        // The room stops but stays visible behind the prompt.
        this.scene.pause('TestRoom');
    }

    handlePromptKey (event)
    {
        if (event.key === 'Enter')
        {
            this.closePrompt();
        }
        else if (event.key === 'Backspace')
        {
            this.typed = this.typed.slice(0, -1);
        }
        else if (event.key.length === 1)
        {
            // A normal character (letters, also ā, ē, ... if your keyboard can type them)
            this.typed += event.key;
        }

        this.updatePromptText();
    }

    updatePromptText ()
    {
        // The underscore shows where the next letter goes.
        this.promptText.setText(this.typed + '_');
    }

    closePrompt ()
    {
        const found = this.findWord(this.typed);

        if (found)
        {
            this.setSlotWord(this.promptSlot, found);
        }

        this.prompt.setVisible(false);
        this.mode = 'play';
        this.promptSlot = null;
        this.scene.resume('TestRoom');
    }

    // Looks the typed word up in the word list.
    // Upper/lower case and extra spaces don't matter.
    // Returns the word as written in the list, or null if it's not there.
    findWord (typed)
    {
        const wanted = typed.trim().toLowerCase();
        const entry = wordList.find((e) => e.word.toLowerCase() === wanted);
        return entry ? entry.word : null;
    }

    // Puts a word into a slot, or empties it when word is null.
    setSlotWord (letter, word)
    {
        const slot = this.slots[letter];
        slot.word = word;
        slot.circle.setFillStyle(word ? COLOR_USED : COLOR_EMPTY);
        slot.wordLabel.setText(word ?? '');
    }
}

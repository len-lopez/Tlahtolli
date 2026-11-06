import { Scene } from 'phaser';
import wordList from '../../data/wordlist.json';
import fishingWords from '../../data/fishing-words.json';

const SLOT_KEYS = [ 'q', 'w', 'e' ];

// How long the player has to catch a biting fish, in milliseconds.
const MINIGAME_TIME = 5000;

// Splits a word into three parts of (roughly) the same length.
// The first parts get one letter more if it doesn't divide evenly.
// Example: "iztac" (5 letters) -> "iz", "ta", "c"
function splitIntoThree (word)
{
    const base = Math.floor(word.length / 3);
    const extra = word.length % 3;
    const parts = [];
    let start = 0;

    for (let i = 0; i < 3; i++)
    {
        const length = base + (i < extra ? 1 : 0);
        parts.push(word.slice(start, start + length));
        start += length;
    }
    return parts;
}

// Returns a copy of the list in a random order.
function shuffle (list)
{
    const copy = [ ...list ];
    for (let i = copy.length - 1; i > 0; i--)
    {
        const j = Math.floor(Math.random() * (i + 1));
        [ copy[i], copy[j] ] = [ copy[j], copy[i] ];
    }
    return copy;
}

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
        // 'play'     = walking around
        // 'menu'     = menu screen is open
        // 'prompt'   = typing a word into a slot
        // 'fishing'  = the fishing line is out (no powers, no menu)
        // 'minigame' = a fish bit, q/w/e boxes are on screen
        this.mode = 'play';

        // The fishing minigame while it's running, or null.
        this.minigame = null;

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

        if (this.mode === 'minigame')
        {
            this.handleMinigameKey(event);
            return;
        }

        if (this.mode === 'fishing')
        {
            // Line is out: q/w/e powers and the menu can't be used.
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

    // ---------- Fishing ----------

    // Called by the room when the line is thrown out.
    startFishing ()
    {
        this.mode = 'fishing';
        this.qweButtons.setVisible(false);
    }

    // Called by the room when the line is pulled in.
    endFishing ()
    {
        this.closeMinigame();
        this.mode = 'play';
        this.qweButtons.setVisible(true);
    }

    // Called by the room when a fish bites.
    // colorName is the fish's color, e.g. 'white'.
    // Returns false if there's no word for that color in the fishing word list.
    startMinigame (colorName)
    {
        const entry = fishingWords.find((e) => e.meaning.toLowerCase() === colorName);
        if (!entry)
        {
            return false;
        }

        const w = this.scale.width;
        const h = this.scale.height;

        // The word in lowercase, cut into three parts.
        // If the word list says how to split the word ("parts"), use that;
        // otherwise cut it into three parts of about the same length.
        // These are in the right order; the boxes get them in a random order.
        const parts = entry.parts
            ? entry.parts.map((part) => part.toLowerCase())
            : splitIntoThree(entry.word.toLowerCase());
        const mixed = shuffle(parts);

        // Everything on screen for the minigame goes into one container,
        // so it can be removed in one go.
        const ui = this.add.container(0, 0);

        // --- Three boxes for q, w, e, side by side in the middle of the screen ---
        const boxWidth = 64;
        const boxHeight = 32;
        const gap = 10;
        const boxY = h / 2;
        const boxes = {};

        SLOT_KEYS.forEach((letter, i) => {
            // i = 0, 1, 2  ->  left, middle, right
            const boxX = w / 2 + (i - 1) * (boxWidth + gap);

            const box = this.add.rectangle(boxX, boxY, boxWidth, boxHeight, COLOR_EMPTY)
                .setStrokeStyle(1, 0xffffff);
            const keyLabel = this.add.text(boxX - boxWidth / 2 + 3, boxY - boxHeight / 2 + 1, letter,
                { ...TEXT_STYLE, fontSize: 9 });
            const partLabel = this.add.text(boxX, boxY + 2, mixed[i], TEXT_STYLE).setOrigin(0.5);

            ui.add([ box, keyLabel, partLabel ]);
            boxes[letter] = { box, part: mixed[i], used: false };
        });

        // --- Timer in the top right corner: a bar that gets shorter ---
        const barWidth = 60;
        const barX = w - 10 - barWidth; // left end of the bar
        const barY = 12;

        const barBack = this.add.rectangle(barX, barY, barWidth, 6, COLOR_EMPTY)
            .setOrigin(0, 0.5).setStrokeStyle(1, 0xffffff);
        const bar = this.add.rectangle(barX, barY, barWidth, 6, COLOR_USED).setOrigin(0, 0.5);
        ui.add([ barBack, bar ]);

        this.minigame = {
            ui,
            boxes,
            parts,
            next: 0,                  // which part has to be pressed next (0, 1 or 2)
            timeLeft: MINIGAME_TIME,
            bar,
            barWidth
        };

        this.mode = 'minigame';
        return true;
    }

    // A key press during the minigame.
    handleMinigameKey (event)
    {
        const letter = event.key.toLowerCase();
        if (!SLOT_KEYS.includes(letter))
        {
            return; // other keys do nothing here
        }

        const game = this.minigame;
        const pressed = game.boxes[letter];

        if (pressed.used || pressed.part !== game.parts[game.next])
        {
            // Wrong box: the fish gets away.
            this.finishMinigame(false);
            return;
        }

        // Right box: mark it and wait for the next one.
        pressed.used = true;
        pressed.box.setFillStyle(COLOR_USED);
        game.next++;

        if (game.next === game.parts.length)
        {
            this.finishMinigame(true);
        }
    }

    // Ends the minigame and tells the room whether the fish was caught.
    finishMinigame (success)
    {
        this.closeMinigame();
        this.scene.get('TestRoom').fishingResult(success);
    }

    // Removes the minigame from the screen.
    closeMinigame ()
    {
        if (this.minigame)
        {
            this.minigame.ui.destroy();
            this.minigame = null;
        }
    }

    // Called every frame: runs the minigame timer.
    update (time, delta)
    {
        if (this.mode !== 'minigame' || !this.minigame)
        {
            return;
        }

        const game = this.minigame;
        game.timeLeft -= delta;

        // Shrink the bar to show how much time is left.
        const share = Math.max(game.timeLeft, 0) / MINIGAME_TIME;
        game.bar.setSize(game.barWidth * share, 6);

        if (game.timeLeft <= 0)
        {
            // Time's up: the fish gets away.
            this.finishMinigame(false);
        }
    }

    // ---------- Slots ----------

    // Puts a word into a slot, or empties it when word is null.
    setSlotWord (letter, word)
    {
        const slot = this.slots[letter];
        slot.word = word;
        slot.circle.setFillStyle(word ? COLOR_USED : COLOR_EMPTY);
        slot.wordLabel.setText(word ?? '');
    }
}

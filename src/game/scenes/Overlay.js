import { Scene, Geom } from 'phaser';
import wordList from '../../data/wordlist.json';
import fishingWords from '../../data/fishing-words.json';
import menuText from '../../data/menu.json';
import { createSave, downloadSave, pickSaveFile } from '../save.js';
import { MAX_LIFE } from './TestRoom.js';

const SLOT_KEYS = [ 'q', 'w', 'e' ];

// How long the player has to catch a biting fish, in milliseconds.
const MINIGAME_TIME = 5000;

// After a failed catch: how long the boxes stay on screen, in milliseconds
// (counted from the moment it failed, shaking included).
const REVEAL_TIME = 1500;

// After pressing a wrong box: how long the boxes shake, in milliseconds.
const SHAKE_TIME = 300;

// Size of the q/w/e boxes in the minigame, and the space between them.
const BOX_WIDTH = 64;
const BOX_HEIGHT = 32;
const BOX_GAP = 10;

// True if two lists have the same things in the same order.
function sameOrder (a, b)
{
    return a.every((item, i) => item === b[i]);
}

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
const COLOR_EDITING = 0xf2c418; // outline of the q/w/e circle you're typing a word for

const TEXT_STYLE = {
    fontFamily: 'Arial',
    fontSize: 12,
    color: '#ffffff'
};

// Life points (Yollotl) in the top left corner: small red squares.
const LIFE_SQUARE = 8;      // size of one square in pixels
const LIFE_GAP = 3;         // space between two squares
const LIFE_LEFT = 8;        // distance from the left edge of the screen
const LIFE_TOP = 8;         // distance from the top edge of the screen
const COLOR_LIFE = 0xd62828;

// Width of the menu panel (it sits in the middle of the screen).
const MENU_WIDTH = 200;

// Where the lines of the menu pages start on screen, and the space between lines.
// 512 is the width of the game screen (see main.js).
const LIST_LEFT = (512 - MENU_WIDTH) / 2 + 16;
const LIST_TOP = 45;
const LINE_HEIGHT = 16;

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
        // 'reveal'   = catch failed, the boxes show the right order for a moment
        this.mode = 'play';

        // The fishing minigame while it's running, or null.
        this.minigame = null;

        // The last q/w/e key used for a power, and the key the fishing line was cast with.
        this.lastUsedSlot = null;
        this.fishingSlot = null;

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

            // Clicking the circle does the same as pressing its key
            // (holding Shift while clicking empties the slot, like Shift + key).
            circle.setInteractive({ useHandCursor: true });
            circle.on('pointerdown', (pointer) => this.clickSlot(letter, pointer));
            const label = this.add.text(x, y, letter, TEXT_STYLE).setOrigin(0.5);

            // Shows the word next to the circle when the slot is used.
            const wordLabel = this.add.text(x + radius + 6, y, '', TEXT_STYLE).setOrigin(0, 0.5);

            this.qweButtons.add([ circle, label, wordLabel ]);

            this.slots[letter] = { word: null, circle, letterLabel: label, wordLabel };
        });

        // --- Life points (Yollotl) in the top left corner ---
        // One red square per life point, side by side.
        // The room knows how many life points there are (3 when full).
        this.lifeSquares = [];
        for (let i = 0; i < MAX_LIFE; i++)
        {
            const square = this.add.rectangle(
                LIFE_LEFT + i * (LIFE_SQUARE + LIFE_GAP), LIFE_TOP,
                LIFE_SQUARE, LIFE_SQUARE, COLOR_LIFE
            ).setOrigin(0, 0);
            this.lifeSquares.push(square);
        }

        // The word underneath the squares (from src/data/menu.json).
        this.add.text(LIFE_LEFT, LIFE_TOP + LIFE_SQUARE + 3, menuText.hud.life, TEXT_STYLE);

        // Show as many squares as the player has life points right now
        // (after loading a save file this can be fewer than 3).
        this.showLife(this.scene.get('TestRoom').life);

        // --- Enter key symbol in the bottom right corner ---
        const enterX = w - 20;
        const enterY = h - 14;

        const enterBox = this.add.rectangle(enterX, enterY, 24, 16, COLOR_EMPTY).setStrokeStyle(1, 0xffffff);
        const enterSign = this.add.text(enterX, enterY, '↵', TEXT_STYLE).setOrigin(0.5);

        // Box and arrow go into one container, so they can be hidden together (while fishing).
        this.enterButton = this.add.container(0, 0, [ enterBox, enterSign ]);

        // Clicking the Enter symbol does the same as pressing Enter.
        enterBox.setInteractive({ useHandCursor: true });
        enterBox.on('pointerdown', () => this.handleKey({ key: 'Enter', repeat: false, shiftKey: false }));

        // --- Menu screen, hidden at the start ---
        // It has several pages; only one is shown at a time:
        // 'main'  = Profile, Bag, Word List, Save
        // 'words' = the word list
        // 'save'  = download / upload a save file
        this.menu = this.add.container(0, 0).setVisible(false);

        const panel = this.add.rectangle(w / 2, h / 2, MENU_WIDTH, h - 60, 0x222222, 0.9)
            .setStrokeStyle(1, 0xffffff);
        this.menu.add(panel);

        // --- Button hints at the bottom of the screen, only while the menu is open ---
        // Bottom left: (q) confirm  (w) back. Bottom right, next to the Enter symbol: close.
        const hintY = h - 14;

        [ [ 'q', menuText.buttons.confirm ], [ 'w', menuText.buttons.back ] ].forEach(([ letter, label ], i) => {
            const circleX = 18 + i * 80;
            const circle = this.add.circle(circleX, hintY, 10, COLOR_EMPTY).setStrokeStyle(1, 0xffffff);
            const letterText = this.add.text(circleX, hintY, letter, TEXT_STYLE).setOrigin(0.5);
            const labelText = this.add.text(circleX + 16, hintY, label, TEXT_STYLE).setOrigin(0, 0.5);
            this.menu.add([ circle, letterText, labelText ]);
        });

        // Word just to the left of the Enter symbol (which is at w - 20, 24 pixels wide).
        // It says what Enter does right now: "menu", "confirm" or "close" (see updateEnterLabel).
        this.enterLabel = this.add.text(w - 20 - 12 - 6, hintY, '', TEXT_STYLE).setOrigin(1, 0.5);

        this.pages = {
            main: this.makeChoicePage('main', menuText.main),
            words: this.makeWordListPage(),
            save: this.makeChoicePage('save', menuText.save)
        };

        // Message under the save choices, e.g. when an uploaded file isn't a save file.
        // (Long messages wrap onto the next line so they stay inside the panel.)
        this.saveMessage = this.add.text(LIST_LEFT, LIST_TOP + 3 * LINE_HEIGHT, '',
            { ...TEXT_STYLE, wordWrap: { width: MENU_WIDTH - 32 } });
        this.pages.save.container.add(this.saveMessage);

        Object.values(this.pages).forEach((page) => this.menu.add(page.container));

        this.page = 'main'; // which page is shown

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

        // When the overlay is restarted (after loading a save file),
        // stop listening with the old one so no key is handled twice.
        this.events.once('shutdown', () => this.input.keyboard.off('keydown'));
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
            // Line is out: the powers and the menu can't be used,
            // but the key that cast the line pulls it in early (cancel).
            if (event.key.toLowerCase() === this.fishingSlot)
            {
                this.scene.get('TestRoom').stopFishing();
            }
            return;
        }

        if (this.mode === 'reveal')
        {
            // After a failed catch: q/w/e powers and the menu stay locked for a moment.
            return;
        }

        if (this.mode === 'menu')
        {
            this.handleMenuKey(event);
            return;
        }

        if (event.key === 'Enter')
        {
            this.openMenu();
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

    // A q/w/e circle on the left was clicked: same as pressing that key.
    clickSlot (letter, pointer)
    {
        // Clicks only count while walking around (not while typing a word or in the menu),
        // and while fishing only on the circle the line was cast with (= cancel).
        const cancelFishing = this.mode === 'fishing' && letter === this.fishingSlot;
        if ((this.mode !== 'play' && !cancelFishing) || !this.qweButtons.visible)
        {
            return;
        }

        this.handleKey({ key: letter, repeat: false, shiftKey: pointer.event.shiftKey });
    }

    // Looks up the word's action in the word list and tells the room to do it.
    useSlot (letter)
    {
        const word = this.slots[letter].word;
        const entry = wordList.find((e) => e.word === word);

        if (entry && entry.action)
        {
            // Remember which key it was: if this throws out the fishing line,
            // the same key pulls it in again (see startFishing).
            this.lastUsedSlot = letter;
            this.scene.get('TestRoom').doAction(entry.action);
        }
    }

    // ---------- Menu ----------

    // A menu page with a list of choices, e.g. Profile / Bag / Word List / Save.
    // name = the page's name ('main' or 'save').
    // items come from src/data/menu.json. The chosen line has a colored bar behind it.
    // Every line can also be clicked with the mouse.
    makeChoicePage (name, items)
    {
        const container = this.add.container(0, 0);

        const highlight = this.add.rectangle(LIST_LEFT - 4, LIST_TOP - 1, MENU_WIDTH - 24, LINE_HEIGHT - 1, COLOR_USED)
            .setOrigin(0, 0);
        container.add(highlight);

        items.forEach((item, i) => {
            const line = this.add.text(LIST_LEFT, LIST_TOP + i * LINE_HEIGHT, item.label, TEXT_STYLE);

            // Clickable on the whole blue bar, not just on the word.
            // The area is measured from the word's top left corner, so it starts 4 pixels
            // to the left and 1 pixel above it, exactly like the bar.
            // The mouse pointer turns into a hand over it.
            line.setInteractive({
                hitArea: new Geom.Rectangle(-4, -1, MENU_WIDTH - 24, LINE_HEIGHT - 1),
                hitAreaCallback: Geom.Rectangle.Contains,
                useHandCursor: true
            });
            line.on('pointerdown', () => this.clickChoice(name, i));

            container.add(line);
        });

        return { container, items, highlight, chosen: 0 };
    }

    // The word list page: one line of text per entry in src/data/wordlist.json.
    makeWordListPage ()
    {
        const container = this.add.container(0, 0);

        wordList.forEach((entry, i) => {
            container.add(this.add.text(LIST_LEFT, LIST_TOP + i * LINE_HEIGHT, entry.word, TEXT_STYLE));
        });

        return { container, items: [], highlight: null, chosen: 0 };
    }

    openMenu ()
    {
        this.mode = 'menu';
        this.menu.setVisible(true);
        this.qweButtons.setVisible(false);

        // The menu always opens on the main page, with the first choice marked.
        this.pages.main.chosen = 0;
        this.showPage('main');

        // The room stops while the menu is open.
        this.scene.pause('TestRoom');
    }

    closeMenu ()
    {
        this.mode = 'play';
        this.menu.setVisible(false);
        this.qweButtons.setVisible(true);
        this.scene.resume('TestRoom');
    }

    // Shows one menu page and hides the others.
    showPage (name)
    {
        this.page = name;
        Object.entries(this.pages).forEach(([ key, page ]) => page.container.setVisible(key === name));
        this.saveMessage.setText('');
        this.updateHighlight();
    }

    // Moves the colored bar to the chosen line.
    updateHighlight ()
    {
        const page = this.pages[this.page];
        if (page.highlight)
        {
            page.highlight.y = LIST_TOP - 1 + page.chosen * LINE_HEIGHT;
        }
    }

    // A key press while the menu is open:
    // up/down = choose, q = confirm, w = back, Enter = close the menu.
    handleMenuKey (event)
    {
        const key = event.key.toLowerCase();
        const page = this.pages[this.page];

        if (key === 'enter')
        {
            this.closeMenu();
        }
        else if (key === 'arrowup' || key === 'arrowdown')
        {
            if (page.items.length === 0)
            {
                return; // nothing to choose on this page
            }
            const step = key === 'arrowup' ? -1 : 1;
            // Stop at the first and last line.
            page.chosen = Math.min(Math.max(page.chosen + step, 0), page.items.length - 1);
            this.updateHighlight();
        }
        else if (key === 'q')
        {
            if (page.items.length > 0)
            {
                this.confirmChoice(page.items[page.chosen].id);
            }
        }
        else if (key === 'w')
        {
            if (this.page === 'main')
            {
                this.closeMenu();
            }
            else
            {
                this.showPage('main');
            }
        }
    }

    // A menu line was clicked: mark it and do the same as pressing q on it.
    clickChoice (pageName, index)
    {
        // Only lines on the page that is shown right now count.
        if (this.mode !== 'menu' || this.page !== pageName)
        {
            return;
        }

        const page = this.pages[pageName];
        page.chosen = index;
        this.updateHighlight();
        this.confirmChoice(page.items[index].id);
    }

    // q was pressed (or a line clicked) on a menu line. id comes from src/data/menu.json.
    confirmChoice (id)
    {
        if (id === 'words')
        {
            this.showPage('words');
        }
        else if (id === 'save')
        {
            this.pages.save.chosen = 0;
            this.showPage('save');
        }
        else if (id === 'download')
        {
            // The save file remembers which room the player is in and how many life points are left.
            const room = this.scene.get('TestRoom');
            downloadSave(createSave({ room: room.currentRoom, life: room.life }));
        }
        else if (id === 'upload')
        {
            pickSaveFile(
                (save) => this.loadSave(save),
                () => this.saveMessage.setText(menuText.messages.badFile)
            );
        }
        // 'profile', 'bag' and 'settings' do nothing yet.
    }

    // Starts the room again from the beginning with the loaded save file.
    // Everything that is made at random (like the fish) is made new.
    // The overlay is restarted by the room, so the menu is closed afterwards.
    loadSave (save)
    {
        this.scene.start('TestRoom', { save });
    }

    openPrompt (letter)
    {
        this.mode = 'prompt';
        this.promptSlot = letter;
        this.typed = '';
        this.updatePromptText();
        this.prompt.setVisible(true);

        // The circle being edited gets a thick yellow outline.
        this.slots[letter].circle.setStrokeStyle(2, COLOR_EDITING);

        // The letters inside the circles disappear while typing
        // (the circles and their words stay).
        Object.values(this.slots).forEach((slot) => slot.letterLabel.setVisible(false));

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

        // The edited circle gets its normal thin white outline back,
        // and the letters come back into the circles.
        this.slots[this.promptSlot].circle.setStrokeStyle(1, 0xffffff);
        Object.values(this.slots).forEach((slot) => slot.letterLabel.setVisible(true));
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

        // The key the line was cast with (q, w or e); pressing it again pulls the line in.
        this.fishingSlot = this.lastUsedSlot;

        // Only that circle stays on screen, with "cancel" next to it instead of its word.
        // The other two are hidden.
        SLOT_KEYS.forEach((letter) => {
            const slot = this.slots[letter];
            const keep = letter === this.fishingSlot;
            slot.circle.setVisible(keep);
            slot.letterLabel.setVisible(keep);
            slot.wordLabel.setVisible(keep);
        });
        this.slots[this.fishingSlot].wordLabel.setText(menuText.buttons.cancel);
    }

    // Puts all three circles back to normal after fishing: visible, each with its own word.
    // (Whether the whole row is shown is decided separately, with qweButtons.)
    restoreSlots ()
    {
        SLOT_KEYS.forEach((letter) => {
            const slot = this.slots[letter];
            slot.circle.setVisible(true);
            slot.letterLabel.setVisible(true);
            slot.wordLabel.setVisible(true);
            slot.wordLabel.setText(slot.word ?? '');
        });
    }

    // Called by the room when the line is pulled in.
    endFishing ()
    {
        // While the right word order is being shown after a failed catch,
        // the overlay stays as it is; the display ends by itself.
        if (this.mode === 'reveal')
        {
            return;
        }

        this.closeMinigame();
        this.mode = 'play';
        this.restoreSlots();
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
        // Mix the parts for the boxes. If they come out in the right order by chance,
        // mix them once more: so the right order still can happen, but much less often.
        let mixed = shuffle(parts);
        if (sameOrder(mixed, parts))
        {
            mixed = shuffle(parts);
        }

        // Everything on screen for the minigame goes into one container,
        // so it can be removed in one go.
        const ui = this.add.container(0, 0);

        // --- Three boxes for q, w, e, side by side in the middle of the screen ---
        const boxY = h / 2;
        const boxes = {};

        SLOT_KEYS.forEach((letter, i) => {
            // Each box (rectangle + key letter + word part) is its own little container,
            // so all three pieces move together when the box moves.
            // slot 0, 1, 2  ->  left, middle, right
            const holder = this.add.container(this.boxSlotX(i), boxY);

            const box = this.add.rectangle(0, 0, BOX_WIDTH, BOX_HEIGHT, COLOR_EMPTY)
                .setStrokeStyle(1, 0xffffff);
            const keyLabel = this.add.text(-BOX_WIDTH / 2 + 3, -BOX_HEIGHT / 2 + 1, letter,
                { ...TEXT_STYLE, fontSize: 9 });
            const partLabel = this.add.text(0, 2, mixed[i], TEXT_STYLE).setOrigin(0.5);

            holder.add([ box, keyLabel, partLabel ]);
            ui.add(holder);
            boxes[letter] = { holder, box, part: mixed[i], slot: i, used: false };
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
            barWidth,
            timers: []                // things waiting to happen later (cancelled when it closes)
        };

        this.mode = 'minigame';

        // A fish bit: the "cancel" circle goes away while the boxes are on screen
        // (q/w/e are the minigame boxes now). The circles come back normal afterwards.
        this.qweButtons.setVisible(false);
        this.restoreSlots();
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
            this.finishMinigame(false, true);
            return;
        }

        // Right box: mark it and move it to its place in the word.
        // The box that was in that place swaps over to where this one was.
        pressed.used = true;
        pressed.box.setFillStyle(COLOR_USED);

        const targetSlot = game.next;
        const other = Object.values(game.boxes).find((b) => b.slot === targetSlot);
        if (other !== pressed)
        {
            other.slot = pressed.slot;
            this.moveBox(other);
        }
        pressed.slot = targetSlot;
        this.moveBox(pressed);

        game.next++;

        if (game.next === game.parts.length)
        {
            this.finishMinigame(true);
        }
    }

    // Left/right position of box slot 0, 1 or 2 on the screen.
    boxSlotX (slot)
    {
        return this.scale.width / 2 + (slot - 1) * (BOX_WIDTH + BOX_GAP);
    }

    // Slides a box to the position of its slot.
    moveBox (b)
    {
        this.tweens.killTweensOf(b.holder); // stop any slide that is still going
        this.tweens.add({
            targets: b.holder,
            x: this.boxSlotX(b.slot),
            duration: 150,
            ease: 'Quad.easeOut'
        });
    }

    // Ends the minigame and tells the room whether the fish was caught.
    // wrongBox = true if it failed because a wrong box was pressed (not because time ran out).
    finishMinigame (success, wrongBox = false)
    {
        if (success)
        {
            this.closeMinigame();
            this.scene.get('TestRoom').fishingResult(true);
            return;
        }

        // Failed: show the right order for a moment.
        // q/w/e powers and the menu stay locked until it's over, but you can walk.
        const game = this.minigame;
        this.mode = 'reveal';

        if (wrongBox)
        {
            // Wrong box: all boxes shake first, then slide into the right order.
            this.shakeBoxes();
            game.timers.push(this.time.delayedCall(SHAKE_TIME, () => this.showRightOrder()));
        }
        else
        {
            this.showRightOrder();
        }

        // When the display is over: remove it and give the powers back.
        game.timers.push(this.time.delayedCall(REVEAL_TIME, () => {
            this.closeMinigame();
            this.mode = 'play';
            this.qweButtons.setVisible(true);
        }));

        // The line is pulled in right away and the fish gets away.
        this.scene.get('TestRoom').fishingResult(false);
    }

    // All three boxes shake quickly left and right: "that was wrong".
    shakeBoxes ()
    {
        Object.values(this.minigame.boxes).forEach((b) => {
            const x = this.boxSlotX(b.slot);
            this.tweens.killTweensOf(b.holder);
            this.tweens.add({
                targets: b.holder,
                x: { from: x - 3, to: x + 3 },
                duration: SHAKE_TIME / 6,
                yoyo: true,
                repeat: 2
            });
        });
    }

    // After a failed catch: the boxes slide into the right order,
    // to remind you of the word.
    showRightOrder ()
    {
        const game = this.minigame;

        // Give every box the slot of its part in the word.
        // (If two parts are the same, each gets its own slot.)
        const boxes = Object.values(game.boxes);
        const placed = [];

        game.parts.forEach((part, slot) => {
            const b = boxes.find((box) => box.part === part && !placed.includes(box));
            placed.push(b);
            b.slot = slot;
            this.moveBox(b);
        });
    }

    // Removes the minigame from the screen.
    closeMinigame ()
    {
        if (this.minigame)
        {
            // Cancel anything that was still waiting to happen.
            this.minigame.timers.forEach((timer) => timer.remove());
            this.minigame.ui.destroy();
            this.minigame = null;
        }
    }

    // Called every frame: runs the minigame timer.
    // The word next to the Enter symbol, depending on what the player is doing:
    // walking around = "menu", typing a word = "confirm", menu open = "close".
    // While fishing (line out, fish biting, after a failed catch) Enter does nothing,
    // so the Enter symbol and its word are hidden then.
    updateEnterLabel ()
    {
        const words = {
            play: menuText.buttons.menu,
            prompt: menuText.buttons.confirm,
            menu: menuText.buttons.close
        };
        const word = words[this.mode] ?? '';

        const fishing = [ 'fishing', 'minigame', 'reveal' ].includes(this.mode);
        this.enterButton.setVisible(!fishing);

        if (this.enterLabel.text !== word)
        {
            this.enterLabel.setText(word);
        }
    }

    update (time, delta)
    {
        this.updateEnterLabel();

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

    // ---------- Life points ----------

    // Shows one red square per life point. Lost life points disappear.
    // Called by the room whenever the life points change.
    showLife (life)
    {
        this.lifeSquares.forEach((square, i) => square.setVisible(i < life));
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

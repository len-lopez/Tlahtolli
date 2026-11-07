import { Scene, Geom } from 'phaser';
import wordList from '../../data/wordlist.json';
import fishingWords from '../../data/fishing-words.json';
import menuText from '../../data/menu.json';
import items from '../../data/items.json';
import { createSave, downloadSave, pickSaveFile } from '../save.js';
import { nahuatl, english, hasGloss, getAuxLanguage, setAuxLanguage } from '../language.js';
import { MAX_LIFE } from './TestRoom.js';

const SLOT_KEYS = [ 'q', 'w', 'e' ];

// How long the player has to catch a biting fish, in milliseconds.
const MINIGAME_TIME = 5000;

// After a failed catch: how long the boxes stay on screen, in milliseconds
// (counted from the moment it failed, shaking included).
const REVEAL_TIME = 1500;

// After a catch (caught or not): how long the whole word stays on screen, in milliseconds.
const FISH_WORD_TIME = 3000;

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
const COLOR_GLOSS = '#f2c418';  // text color of glosses (English), so they stand out from Nahuatl

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

// Cacao beans (the money) in the top right corner: a small brown rectangle,
// with the number of beans to its left.
const BEAN_WIDTH = 6;        // size of the rectangle in pixels
const BEAN_HEIGHT = 9;
const BEAN_RIGHT = 8;        // distance from the right edge of the screen
const BEAN_TOP = 8;          // distance from the top edge of the screen
const BEAN_GAP = 4;          // space between the number and the rectangle
const COLOR_BEAN = 0x5c3317;

// Width of the menu panel (it sits in the middle of the screen).
// (Wider than before, so the longer Nahuatl words and the gloss buttons fit.)
const MENU_WIDTH = 240;

// Where the lines of the menu pages start on screen, and the space between lines.
// 512 is the width of the game screen (see main.js).
const LIST_LEFT = (512 - MENU_WIDTH) / 2 + 16;
const LIST_TOP = 45;
const LINE_HEIGHT = 16;

// Bag page: where the item numbers end, near the right edge of the menu panel.
const LIST_RIGHT = (512 + MENU_WIDTH) / 2 - 16;

// Gloss button: a small square at the right end of every menu line.
// Clicking it switches the line between Nahuatl and English.
// It's only shown when English is chosen as auxiliary language in Settings.
const GLOSS_SIZE = 12;                                   // size of the square in pixels
const GLOSS_SPACE = GLOSS_SIZE + 6;                      // room it takes at the end of a line
const GLOSS_X = LIST_LEFT - 4 + MENU_WIDTH - 24 - GLOSS_SPACE / 2; // middle of the square

// Space between two words of a sentence that is glossed word by word, in pixels.
const WORD_GAP = 4;

// Settings page: a small white square shows which auxiliary language is chosen.
// It sits just left of the gloss buttons.
const SETTINGS_MARK_SIZE = 6;
const SETTINGS_MARK_X = GLOSS_X - GLOSS_SPACE;

// Placeholder fish next to "Michin" in the bag: same size as the fish in the water (10 x 5).
const BAG_FISH_WIDTH = 10;
const BAG_FISH_HEIGHT = 5;
const COLOR_BAG_FISH = 0x9fb7c9;

// Shop window (Cohua / Namaca): where things go on each line, from the right edge.
// Rightmost: a small cacao bean (like the one in the top right corner), with the price
// to its left. When selling, how many you have goes further left.
// Everything sits a little left of the right edge, to leave room for the gloss buttons.
const SHOP_BEAN_WIDTH = 5;
const SHOP_BEAN_HEIGHT = 7;
const SHOP_RIGHT = LIST_RIGHT - 18;                         // right edge of the bean
const SHOP_PRICE_RIGHT = SHOP_RIGHT - SHOP_BEAN_WIDTH - 3; // right edge of the price
const SHOP_COUNT_RIGHT = SHOP_RIGHT - 40;                   // right edge of the count

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
        // 'dialogue' = an NPC is talking, the dialogue box is open
        // 'trade'    = the shop window is open (buying with Cohua or selling with Namaca)
        this.mode = 'play';

        // The fishing minigame while it's running, or null.
        this.minigame = null;

        // The whole fishing word shown after a catch, or null (see showFishWord).
        this.fishWord = null;

        // The last q/w/e key used for a power, and the key the fishing line was cast with.
        this.lastUsedSlot = null;
        this.fishingSlot = null;

        // Every single text outside the menu lists that can be clicked for its gloss
        // (see makeGlossable).
        this.glossTexts = [];

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
            // Clicking the word shows its gloss (clicking the circle uses the power).
            const wordLabel = this.add.text(x + radius + 6, y, '', TEXT_STYLE).setOrigin(0, 0.5);
            this.makeGlossable(wordLabel);

            this.qweButtons.add([ circle, label, wordLabel ]);

            this.slots[letter] = { word: null, circle, letterLabel: label, wordLabel };
        });

        // --- Life points (Yollotl) in the top left corner ---
        // First the word (from src/data/menu.json), in the corner.
        // Clicking the word shows its gloss.
        const lifeLabel = this.add.text(LIFE_LEFT, LIFE_TOP, '', TEXT_STYLE);
        this.makeGlossable(lifeLabel);
        this.setGlossLabel(lifeLabel, menuText.hud.life);

        // Then one red square per life point, side by side, right after the word.
        // They start where the word ends (plus a small gap), and sit at the
        // same height as the middle of the word.
        // The room knows how many life points there are (3 when full).
        const squaresLeft = LIFE_LEFT + lifeLabel.width + LIFE_GAP * 2;
        const squaresTop = LIFE_TOP + (lifeLabel.height - LIFE_SQUARE) / 2;

        this.lifeSquares = [];
        for (let i = 0; i < MAX_LIFE; i++)
        {
            const square = this.add.rectangle(
                squaresLeft + i * (LIFE_SQUARE + LIFE_GAP), squaresTop,
                LIFE_SQUARE, LIFE_SQUARE, COLOR_LIFE
            ).setOrigin(0, 0);
            this.lifeSquares.push(square);
        }

        // Show as many squares as the player has life points right now
        // (after loading a save file this can be fewer than 3).
        this.showLife(this.scene.get('TestRoom').life);

        // --- Cacao beans in the top right corner ---
        // The brown rectangle sits in the corner. Its top left corner is worked out
        // from the right edge of the screen.
        const beanLeft = w - BEAN_RIGHT - BEAN_WIDTH;
        this.add.rectangle(beanLeft, BEAN_TOP, BEAN_WIDTH, BEAN_HEIGHT, COLOR_BEAN).setOrigin(0, 0);

        // The number goes to the left of the rectangle. Its right edge is fixed
        // (setOrigin(1, 0.5)), so when the number gets longer (9 -> 10) it grows to the left.
        this.beanText = this.add.text(beanLeft - BEAN_GAP, BEAN_TOP + BEAN_HEIGHT / 2, '', TEXT_STYLE)
            .setOrigin(1, 0.5);

        // Show how many beans the player has right now. The room knows this (0 for now).
        this.showBeans(this.scene.get('TestRoom').beans);

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
        // 'main'  = Profile, Bag, Map, Word List, Settings, Save
        // 'bag'   = items the player has, with how many
        // 'map'   = list of all rooms
        // 'words' = the word list
        // 'save'  = download / upload a save file
        // 'settings' = choose the auxiliary language (English or none)
        this.menu = this.add.container(0, 0).setVisible(false);

        const panel = this.add.rectangle(w / 2, h / 2, MENU_WIDTH, h - 60, 0x222222, 0.9)
            .setStrokeStyle(1, 0xffffff);
        this.menu.add(panel);

        // --- Button hints at the bottom of the screen, only while the menu is open ---
        // Bottom left: (q) confirm  (w) back. Bottom right, next to the Enter symbol: close.
        const hintY = h - 14;

        // Clicking a hint word shows its gloss.
        [ [ 'q', menuText.buttons.confirm ], [ 'w', menuText.buttons.back ] ].forEach(([ letter, label ], i) => {
            const circleX = 18 + i * 80;
            const circle = this.add.circle(circleX, hintY, 10, COLOR_EMPTY).setStrokeStyle(1, 0xffffff);
            const letterText = this.add.text(circleX, hintY, letter, TEXT_STYLE).setOrigin(0.5);
            const labelText = this.add.text(circleX + 16, hintY, '', TEXT_STYLE).setOrigin(0, 0.5);
            this.makeGlossable(labelText, 'menu');
            this.setGlossLabel(labelText, label);
            this.menu.add([ circle, letterText, labelText ]);
        });

        // Word just to the left of the Enter symbol (which is at w - 20, 24 pixels wide).
        // It says what Enter does right now: "menu", "confirm" or "close" (see updateEnterLabel).
        // Clicking the word shows its gloss (clicking the Enter symbol does what Enter does).
        this.enterLabel = this.add.text(w - 20 - 12 - 6, hintY, '', TEXT_STYLE).setOrigin(1, 0.5);
        this.makeGlossable(this.enterLabel);

        this.pages = {
            main: this.makeChoicePage('main', menuText.main),
            bag: { container: this.add.container(0, 0), items: [], highlight: null, chosen: 0, glosses: [] },
            map: this.makeChoicePage('map', menuText.map),
            words: this.makeWordListPage(),
            save: this.makeChoicePage('save', menuText.save),
            settings: this.makeChoicePage('settings', menuText.settings)
        };

        // The small white square on the Settings page next to the chosen language.
        this.settingsMark = this.add.rectangle(SETTINGS_MARK_X, 0, SETTINGS_MARK_SIZE, SETTINGS_MARK_SIZE, 0xffffff);
        this.pages.settings.container.add(this.settingsMark);
        this.updateSettingsMark();

        // Message under the save choices, e.g. when an uploaded file isn't a save file.
        // (Long messages wrap onto the next line so they stay inside the panel.)
        // Its words can be clicked for their glosses (see makeSentence).
        this.saveMessage = this.makeSentence(LIST_LEFT, LIST_TOP + 3 * LINE_HEIGHT, MENU_WIDTH - 32, 'menu');
        this.pages.save.container.add(this.saveMessage.container);

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

        // --- Dialogue box: what an NPC says (Ihtoa), hidden at the start ---
        // A wide box near the bottom of the screen, with the text inside,
        // an advance symbol (▶) at its right end, and the hint "(q) confirm"
        // at the bottom left (q closes it).
        this.dialogue = this.add.container(0, 0).setVisible(false);

        const dialogueBox = this.add.rectangle(w / 2, h - 52, w - 80, 44, 0x222222, 0.9)
            .setStrokeStyle(1, 0xffffff);

        // The text leaves room on the right for the advance symbol.
        // Clicking the text shows its gloss (it doesn't close the box): the whole sentence,
        // or one word at a time if the sentence is glossed word by word (see makeSentence).
        this.dialogueText = this.makeSentence(48, h - 52 - 22 + 8, w - 80 - 16 - 30, 'dialogue');

        // Advance symbol: clicking it does the same as pressing q.
        const advanceX = w - 40 - 18; // the box's right edge is at w - 40
        const advanceBox = this.add.rectangle(advanceX, h - 52, 20, 16, COLOR_EMPTY).setStrokeStyle(1, 0xffffff);
        const advanceSign = this.add.text(advanceX, h - 52, '▶', { ...TEXT_STYLE, fontSize: 9 }).setOrigin(0.5);
        advanceBox.setInteractive({ useHandCursor: true });
        advanceBox.on('pointerdown', () => this.closeDialogue());

        const qCircle = this.add.circle(18, h - 14, 10, COLOR_EMPTY).setStrokeStyle(1, 0xffffff);
        const qLetter = this.add.text(18, h - 14, 'q', TEXT_STYLE).setOrigin(0.5);
        const qLabel = this.add.text(34, h - 14, '', TEXT_STYLE).setOrigin(0, 0.5);
        this.makeGlossable(qLabel, 'dialogue');
        this.setGlossLabel(qLabel, menuText.buttons.confirm);

        this.dialogue.add([ dialogueBox, this.dialogueText.container, advanceBox, advanceSign, qCircle, qLetter, qLabel ]);

        // --- Shop window: buying (Cohua) or selling (Namaca), hidden at the start ---
        // Looks like the menu: the same panel, a list with a blue bar on the chosen line,
        // and the hints "(q) confirm  (w) back" at the bottom left.
        this.trade = this.add.container(0, 0).setVisible(false);

        const tradePanel = this.add.rectangle(w / 2, h / 2, MENU_WIDTH, h - 60, 0x222222, 0.9)
            .setStrokeStyle(1, 0xffffff);
        this.tradeHighlight = this.add.rectangle(LIST_LEFT - 4, LIST_TOP - 1, MENU_WIDTH - 24, LINE_HEIGHT - 1, COLOR_USED)
            .setOrigin(0, 0);
        this.tradeLines = this.add.container(0, 0); // the lines; redrawn after every buy/sell

        // Message under the list, e.g. when you don't have enough beans.
        // Its words can be clicked for their glosses (see makeSentence).
        this.tradeMessage = this.makeSentence(LIST_LEFT, 0, MENU_WIDTH - 32, 'trade');

        this.trade.add([ tradePanel, this.tradeHighlight, this.tradeLines, this.tradeMessage.container ]);

        // Clicking a hint word shows its gloss.
        [ [ 'q', menuText.buttons.confirm ], [ 'w', menuText.buttons.back ] ].forEach(([ letter, label ], i) => {
            const circleX = 18 + i * 80;
            const circle = this.add.circle(circleX, hintY, 10, COLOR_EMPTY).setStrokeStyle(1, 0xffffff);
            const letterText = this.add.text(circleX, hintY, letter, TEXT_STYLE).setOrigin(0.5);
            const labelText = this.add.text(circleX + 16, hintY, '', TEXT_STYLE).setOrigin(0, 0.5);
            this.makeGlossable(labelText, 'trade');
            this.setGlossLabel(labelText, label);
            this.trade.add([ circle, letterText, labelText ]);
        });

        // Amount picker: shown at the bottom of the window after choosing an item.
        // "Buy:" or "Sell:" on the left, the number in the middle with arrows above and
        // below it, and the total price (with a bean) on the right.
        // AMOUNT_Y = the middle of that row: a little above the bottom edge of the panel.
        const panelBottom = h / 2 + (h - 60) / 2;
        const AMOUNT_Y = panelBottom - 28;
        const AMOUNT_X = LIST_LEFT + 80; // middle of the number

        this.tradeAmount = this.add.container(0, 0).setVisible(false);
        this.tradeAmountLabel = this.add.text(LIST_LEFT, AMOUNT_Y, '', TEXT_STYLE).setOrigin(0, 0.5);
        this.makeGlossable(this.tradeAmountLabel, 'trade'); // "Niccohua:" can be clicked for its gloss
        this.tradeAmountText = this.add.text(AMOUNT_X, AMOUNT_Y, '', TEXT_STYLE).setOrigin(0.5);
        const arrowUp = this.add.text(AMOUNT_X, AMOUNT_Y - 13, '▲', { ...TEXT_STYLE, fontSize: 8 }).setOrigin(0.5);
        const arrowDown = this.add.text(AMOUNT_X, AMOUNT_Y + 13, '▼', { ...TEXT_STYLE, fontSize: 8 }).setOrigin(0.5);
        this.tradeTotalText = this.add.text(SHOP_PRICE_RIGHT, AMOUNT_Y, '', TEXT_STYLE).setOrigin(1, 0.5);
        this.tradeTotalBean = this.add.rectangle(SHOP_RIGHT - SHOP_BEAN_WIDTH, AMOUNT_Y, SHOP_BEAN_WIDTH, SHOP_BEAN_HEIGHT, COLOR_BEAN)
            .setOrigin(0, 0.5);
        this.tradeAmount.add([ this.tradeAmountLabel, this.tradeAmountText, arrowUp, arrowDown,
            this.tradeTotalText, this.tradeTotalBean ]);
        this.trade.add(this.tradeAmount);

        this.tradeKind = null;   // 'buy' or 'sell' while the window is open
        this.tradeGoods = [];    // ids of what the merchant sells
        this.tradeChosen = 0;    // which line is chosen
        this.tradeCount = null;  // how many, while picking an amount; null while choosing an item
        this.tradeMax = 0;       // the most you can pick right now

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

        if (this.mode === 'trade')
        {
            this.handleTradeKey(event);
            return;
        }

        if (this.mode === 'dialogue')
        {
            // An NPC is talking: q closes the dialogue box. Everything else does nothing.
            if (event.key.toLowerCase() === 'q')
            {
                this.closeDialogue();
            }
            return;
        }

        if (event.key === 'Enter')
        {
            // While sleeping (Cochi) or talking (Ihtoa), the menu can't be opened.
            if (!this.isBusy())
            {
                this.openMenu();
            }
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
            // q/w/e on an empty slot opens the text prompt
            // (but not while sleeping or talking: then nothing happens).
            if (!this.isBusy())
            {
                this.openPrompt(letter);
            }
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
    // name = the page's name ('main', 'map', 'save' or 'settings').
    // items come from src/data/menu.json. The chosen line has a colored bar behind it.
    // Every line can also be clicked with the mouse.
    // Each line has a gloss button at its right end (see clickGloss).
    makeChoicePage (name, items)
    {
        const container = this.add.container(0, 0);

        const highlight = this.add.rectangle(LIST_LEFT - 4, LIST_TOP - 1, MENU_WIDTH - 24, LINE_HEIGHT - 1, COLOR_USED)
            .setOrigin(0, 0);
        container.add(highlight);

        // One entry per line: its text, its gloss button, and whether it shows English right now.
        const glosses = [];

        items.forEach((item, i) => {
            const top = LIST_TOP + i * LINE_HEIGHT;
            const line = this.add.text(LIST_LEFT, top, nahuatl(item.label), TEXT_STYLE);

            // Clickable on the whole blue bar, not just on the word,
            // except for the gloss button at the right end.
            // The area is measured from the word's top left corner, so it starts 4 pixels
            // to the left and 1 pixel above it, exactly like the bar.
            // The mouse pointer turns into a hand over it.
            line.setInteractive({
                hitArea: new Geom.Rectangle(-4, -1, MENU_WIDTH - 24 - GLOSS_SPACE, LINE_HEIGHT - 1),
                hitAreaCallback: Geom.Rectangle.Contains,
                useHandCursor: true
            });
            line.on('pointerdown', () => this.clickChoice(name, i));

            container.add(line);

            // No gloss button for a line without English (e.g. "English" in Settings).
            if (!hasGloss(item.label))
            {
                return;
            }

            const gloss = { line, label: item.label, english: false };
            Object.assign(gloss, this.makeGlossButton(top, () => this.clickGloss(gloss, () => this.isPageShown(name))));
            glosses.push(gloss);
            container.add(gloss.button);
        });

        return { container, items, highlight, chosen: 0, glosses };
    }

    // Makes a gloss button for the menu line that starts at the height "top":
    // a small dark square with a white outline and a "?" in it.
    // It turns blue while the line shows English.
    // Returns { button, box }: button = square and "?" together (to show/hide them),
    // box = the square (to change its color).
    makeGlossButton (top, onClick)
    {
        const y = top + LINE_HEIGHT / 2 - 1;
        const box = this.add.rectangle(GLOSS_X, y, GLOSS_SIZE, GLOSS_SIZE, COLOR_EMPTY).setStrokeStyle(1, 0xffffff);
        const sign = this.add.text(GLOSS_X, y, '?', { ...TEXT_STYLE, fontSize: 9 }).setOrigin(0.5);

        box.setInteractive({ useHandCursor: true });
        box.on('pointerdown', onClick);

        const button = this.add.container(0, 0, [ box, sign ]);
        button.setVisible(getAuxLanguage(this) === 'en');
        return { button, box };
    }

    // True if the menu is open on this page.
    isPageShown (pageName)
    {
        return this.mode === 'menu' && this.page === pageName;
    }

    // A gloss button was clicked: switch its line between Nahuatl and English.
    // It does nothing else (it doesn't choose the line).
    // Glosses only work with the mouse / finger, never with a key.
    // isShown = a check whether the button's window/page is open right now.
    clickGloss (gloss, isShown)
    {
        // Only when its page is shown, and only with English chosen in Settings.
        if (!isShown() || getAuxLanguage(this) !== 'en')
        {
            return;
        }

        gloss.english = !gloss.english;
        this.showGloss(gloss);
    }

    // Writes a line in Nahuatl or English, and colors its gloss button to match.
    showGloss (gloss)
    {
        gloss.line.setText(gloss.english ? english(gloss.label) : nahuatl(gloss.label));
        gloss.line.setColor(gloss.english ? COLOR_GLOSS : TEXT_STYLE.color);
        gloss.box.setFillStyle(gloss.english ? COLOR_USED : COLOR_EMPTY);
    }

    // Puts every menu line back to Nahuatl, and shows the gloss buttons
    // only if English is chosen as auxiliary language.
    // Called whenever the menu opens and when the auxiliary language changes.
    resetGlosses ()
    {
        const showButtons = getAuxLanguage(this) === 'en';

        Object.values(this.pages).forEach((page) => {
            (page.glosses ?? []).forEach((gloss) => {
                gloss.english = false;
                this.showGloss(gloss);
                gloss.button.setVisible(showButtons);
            });
        });
    }

    // ---------- Glosses on single texts (overlay words, hints, dialogue, fishing word) ----------

    // Makes a text clickable: a click switches it between Nahuatl and English
    // (only with English chosen in Settings). It does nothing else, and no key does this.
    // group = when the text goes back to Nahuatl by itself:
    //   'menu' / 'trade' / 'dialogue' = whenever that window opens,
    //   nothing = only when the text itself changes (see setGlossLabel).
    // Every text goes back to Nahuatl when the auxiliary language changes.
    // onChange (optional) = what should happen after the text changed
    // (used by sentences to move the words after it, see makeSentence).
    makeGlossable (textObject, group = null, onChange = null)
    {
        textObject.setInteractive();
        textObject.gloss = { label: null, english: false, group, onChange };
        textObject.on('pointerdown', () => this.clickGlossText(textObject));
        this.glossTexts.push(textObject);
        this.updateGlossCursor(textObject);

        // When the text is removed from the screen, forget it.
        textObject.once('destroy', () => {
            this.glossTexts = this.glossTexts.filter((t) => t !== textObject);
        });
        return textObject;
    }

    // Puts a new text into a clickable text, in Nahuatl.
    // label = { nah: ..., en: ... }, or null for no text.
    setGlossLabel (textObject, label)
    {
        textObject.gloss.label = label;
        textObject.gloss.english = false;
        this.showGlossText(textObject);
    }

    // Writes a clickable text in Nahuatl, or in English (in the gloss color).
    showGlossText (textObject)
    {
        const { label, english: showEnglish } = textObject.gloss;

        textObject.setText(label ? (showEnglish ? english(label) : nahuatl(label)) : '');
        textObject.setColor(showEnglish ? COLOR_GLOSS : TEXT_STYLE.color);

        // The clickable area is as big as the text, so it changes with the text.
        textObject.input.hitArea.setSize(textObject.width, textObject.height);
        this.updateGlossCursor(textObject);

        if (textObject.gloss.onChange)
        {
            textObject.gloss.onChange();
        }
    }

    // A clickable text was clicked: switch between Nahuatl and English.
    clickGlossText (textObject)
    {
        // Texts without both versions (e.g. placeholders) can't be switched.
        if (getAuxLanguage(this) !== 'en' || !hasGloss(textObject.gloss.label))
        {
            return;
        }

        textObject.gloss.english = !textObject.gloss.english;
        this.showGlossText(textObject);
    }

    // Puts the clickable texts of one group back to Nahuatl (all of them if group is null).
    resetGlossTexts (group = null)
    {
        this.glossTexts
            .filter((t) => group === null || t.gloss.group === group)
            .forEach((t) => {
                t.gloss.english = false;
                this.showGlossText(t);
            });
    }

    // The mouse pointer turns into a hand over a clickable text, but only
    // with English chosen in Settings (without it, clicking does nothing).
    updateGlossCursor (textObject)
    {
        const clickable = getAuxLanguage(this) === 'en' && hasGloss(textObject.gloss.label);
        textObject.input.cursor = clickable ? 'pointer' : false;
    }

    // ---------- Sentences (dialogue box and messages) ----------

    // Makes a place for a sentence whose top left corner is at x, y.
    // Lines longer than wrapWidth go on to the next line.
    // group = when it goes back to Nahuatl by itself (see makeGlossable).
    // Returns the sentence; its "container" has to be added to the window it's in.
    makeSentence (x, y, wrapWidth, group)
    {
        return { container: this.add.container(x, y), wrapWidth, group, pieces: [] };
    }

    // Writes text into a sentence, in Nahuatl.
    // labels = one text from src/data/, a list of texts (each starts on a new line), or null (empty).
    // A text with "words" gets one clickable piece per word (each word is glossed by itself);
    // any other text is one clickable piece (the whole sentence is glossed).
    setSentence (sentence, labels)
    {
        // Take away the old pieces.
        sentence.container.removeAll(true);
        sentence.pieces = [];

        let list = labels;
        if (labels === null)
        {
            list = [];
        }
        else if (!Array.isArray(labels))
        {
            list = [ labels ];
        }

        list.forEach((label) => {
            const parts = label.words ?? [ label ];

            parts.forEach((part, i) => {
                // A whole sentence in one piece wraps by itself; single words don't need to.
                const style = label.words ? TEXT_STYLE : { ...TEXT_STYLE, wordWrap: { width: sentence.wrapWidth } };
                const piece = this.add.text(0, 0, '', style);
                piece.startsLine = i === 0; // the first piece of each text starts a new line

                sentence.container.add(piece);
                sentence.pieces.push(piece);
                this.makeGlossable(piece, sentence.group, () => this.layoutSentence(sentence));
                this.setGlossLabel(piece, part);
            });
        });

        this.layoutSentence(sentence);
    }

    // Puts the pieces of a sentence one after the other, with a small space between them.
    // A piece that doesn't fit on the line any more goes to the next line.
    // Called again whenever a piece changes (a word switched to English is longer or shorter).
    layoutSentence (sentence)
    {
        let x = 0;
        let y = 0;
        let lineHeight = 0;

        sentence.pieces.forEach((piece, i) => {
            const newLine = i > 0 && (piece.startsLine || x + piece.width > sentence.wrapWidth);
            if (newLine)
            {
                x = 0;
                y += lineHeight;
                lineHeight = 0;
            }

            piece.setPosition(x, y);
            x += piece.width + WORD_GAP;
            lineHeight = Math.max(lineHeight, piece.height);
        });
    }

    // A slot word as { nah, en }, from src/data/wordlist.json (null for an empty slot).
    slotLabel (word)
    {
        if (word === null)
        {
            return null;
        }
        const entry = wordList.find((e) => e.word === word);
        return { nah: word, en: entry ? entry.en : undefined };
    }

    // Moves the white square on the Settings page next to the chosen language.
    updateSettingsMark ()
    {
        const index = menuText.settings.findIndex((s) => s.language === getAuxLanguage(this));
        this.settingsMark.setY(LIST_TOP + index * LINE_HEIGHT + LINE_HEIGHT / 2 - 1);
    }

    // The word list page: one line of text per entry in src/data/wordlist.json,
    // each with a gloss button at its right end.
    makeWordListPage ()
    {
        const container = this.add.container(0, 0);
        const glosses = [];

        wordList.forEach((entry, i) => {
            const top = LIST_TOP + i * LINE_HEIGHT;
            const line = this.add.text(LIST_LEFT, top, entry.word, TEXT_STYLE);
            container.add(line);

            const gloss = { line, label: { nah: entry.word, en: entry.en }, english: false };
            Object.assign(gloss, this.makeGlossButton(top, () => this.clickGloss(gloss, () => this.isPageShown('words'))));
            glosses.push(gloss);
            container.add(gloss.button);
        });

        return { container, items: [], highlight: null, chosen: 0, glosses };
    }

    // Writes what's in the bag onto the bag page. Called every time the bag is opened,
    // because what's inside changes while playing.
    // One line per item the player has (items with 0 are left out):
    // placeholder picture on the left, name, the number, and a gloss button at the right end.
    // Like the word list, it's only a list to read; nothing can be chosen on it.
    fillBagPage ()
    {
        const container = this.pages.bag.container;
        container.removeAll(true); // take away what was written last time
        this.pages.bag.glosses = [];

        const bag = this.scene.get('TestRoom').bag;
        const owned = items.filter((item) => (bag[item.id] ?? 0) > 0);

        owned.forEach((item, i) => {
            const top = LIST_TOP + i * LINE_HEIGHT;

            // Placeholder picture: for now every item is a fish (Michin is the only one).
            const picture = this.add.rectangle(LIST_LEFT, top + LINE_HEIGHT / 2 - 1,
                BAG_FISH_WIDTH, BAG_FISH_HEIGHT, COLOR_BAG_FISH).setOrigin(0, 0.5);

            const name = this.add.text(LIST_LEFT + BAG_FISH_WIDTH + 6, top, nahuatl(item.name), TEXT_STYLE);

            // The number's right edge stays put, so bigger numbers grow to the left.
            // It ends a little left of the gloss button.
            const amount = this.add.text(GLOSS_X - GLOSS_SPACE, top, String(bag[item.id]), TEXT_STYLE).setOrigin(1, 0);

            // Gloss button, like on the other menu pages: switches the name to English and back.
            const gloss = { line: name, label: item.name, english: false };
            Object.assign(gloss, this.makeGlossButton(top, () => this.clickGloss(gloss, () => this.isPageShown('bag'))));
            this.pages.bag.glosses.push(gloss);

            container.add([ picture, name, amount, gloss.button ]);
        });

        // Nothing in the bag: "Your bag is empty."
        if (owned.length === 0)
        {
            const message = this.makeSentence(LIST_LEFT, LIST_TOP, MENU_WIDTH - 32, 'menu');
            this.setSentence(message, menuText.messages.bagEmpty);
            container.add(message.container);
        }
    }

    openMenu ()
    {
        this.mode = 'menu';
        this.menu.setVisible(true);
        this.qweButtons.setVisible(false);

        // The menu always opens on the main page, with the first choice marked,
        // and with every line in Nahuatl.
        this.resetGlosses();
        this.resetGlossTexts('menu');
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
        this.setSentence(this.saveMessage, null);
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
                this.confirmChoice(page.items[page.chosen]);
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
        this.confirmChoice(page.items[index]);
    }

    // q was pressed (or a line clicked) on a menu line.
    // item = that line from src/data/menu.json, e.g. { id: 'save', label: { nah: ..., en: ... } }.
    confirmChoice (item)
    {
        // On the map page, every line is a room: go there.
        if (this.page === 'map')
        {
            this.teleport(item.room);
            return;
        }

        // On the Settings page, every line is an auxiliary language: choose it.
        // All lines go back to Nahuatl, and the gloss buttons appear or disappear.
        if (this.page === 'settings')
        {
            setAuxLanguage(this, item.language);
            this.resetGlosses();
            this.resetGlossTexts();
            this.updateSettingsMark();
            return;
        }

        const id = item.id;

        if (id === 'bag')
        {
            this.fillBagPage();
            this.showPage('bag');
        }
        else if (id === 'map')
        {
            this.pages.map.chosen = 0;
            this.showPage('map');
        }
        else if (id === 'words')
        {
            this.showPage('words');
        }
        else if (id === 'save')
        {
            this.pages.save.chosen = 0;
            this.showPage('save');
        }
        else if (id === 'settings')
        {
            // Opens with the language that is chosen right now marked.
            this.pages.settings.chosen = menuText.settings.findIndex((s) => s.language === getAuxLanguage(this));
            this.showPage('settings');
        }
        else if (id === 'download')
        {
            // The save file remembers which room the player is in, how many life points are left,
            // how many cacao beans the player has, what's in the bag, and the settings.
            const room = this.scene.get('TestRoom');
            downloadSave(createSave({
                room: room.currentRoom,
                life: room.life,
                beans: room.beans,
                bag: room.bag,
                settings: { auxLanguage: getAuxLanguage(this) }
            }));
        }
        else if (id === 'upload')
        {
            pickSaveFile(
                (save) => this.loadSave(save),
                () => this.setSentence(this.saveMessage, menuText.messages.badFile)
            );
        }
        // 'profile' does nothing yet.
    }

    // For testing: closes the menu and puts the player into a room right away.
    // room = the room's number (0 = Marketplace, 1 = Home, 2 = Lake of Colors).
    teleport (room)
    {
        this.closeMenu();
        this.scene.get('TestRoom').goToRoom(room);
    }

    // Starts the room again from the beginning with the loaded save file.
    // Everything that is made at random (like the fish) is made new.
    // The overlay is restarted by the room, so the menu is closed afterwards.
    // The saved settings are used too. A save file without settings (older version)
    // keeps the settings that are chosen right now.
    loadSave (save)
    {
        const language = save.settings ? save.settings.auxLanguage : undefined;
        if (language === 'en' || language === null)
        {
            setAuxLanguage(this, language);
        }

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
        this.setGlossLabel(this.slots[this.fishingSlot].wordLabel, menuText.buttons.cancel);
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
            this.setGlossLabel(slot.wordLabel, this.slotLabel(slot.word));
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
            entry,                    // the word from src/data/fishing-words.json
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
        // Caught or not: the whole word appears for a moment.
        this.showFishWord(this.minigame.entry);

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

    // Shows the whole fishing word above the boxes for a moment (FISH_WORD_TIME),
    // e.g. "Chichiltic". Clicking it shows its gloss (the "meaning" in fishing-words.json).
    // It doesn't stop anything: you can walk and use your powers while it's there.
    showFishWord (entry)
    {
        this.removeFishWord(); // only one at a time

        const w = this.scale.width;
        const h = this.scale.height;

        const text = this.add.text(w / 2, h / 2 - BOX_HEIGHT / 2 - 14, '', TEXT_STYLE).setOrigin(0.5);
        this.makeGlossable(text);
        this.setGlossLabel(text, { nah: entry.word, en: entry.meaning });

        const timer = this.time.delayedCall(FISH_WORD_TIME, () => this.removeFishWord());
        this.fishWord = { text, timer };
    }

    // Takes the fishing word off the screen (if it's there).
    removeFishWord ()
    {
        if (this.fishWord)
        {
            this.fishWord.timer.remove();
            this.glossTexts = this.glossTexts.filter((t) => t !== this.fishWord.text);
            this.fishWord.text.destroy();
            this.fishWord = null;
        }
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
    // walking around = "menu", typing a word = "confirm", menu or shop window open = "close".
    // While fishing (line out, fish biting, after a failed catch) Enter does nothing,
    // so the Enter symbol and its word are hidden then.
    updateEnterLabel ()
    {
        const words = {
            play: menuText.buttons.menu,
            prompt: menuText.buttons.confirm,
            menu: menuText.buttons.close,
            trade: menuText.buttons.close
        };
        let word = words[this.mode] ?? null;

        // While sleeping, talking (Ihtoa) or with the dialogue box open,
        // Enter does nothing either, so it's hidden too.
        const fishing = [ 'fishing', 'minigame', 'reveal' ].includes(this.mode);
        const hidden = fishing || this.mode === 'dialogue' || this.isBusy();
        this.enterButton.setVisible(!hidden);
        if (hidden)
        {
            word = null;
        }

        // Only when the word changes (then it's back in Nahuatl).
        if (this.enterLabel.gloss.label !== word)
        {
            this.setGlossLabel(this.enterLabel, word);
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

    // True while the player is asleep (Cochi) or doing the speech animation (Ihtoa):
    // then the menu and the powers can't be used. The room knows this.
    isBusy ()
    {
        const room = this.scene.get('TestRoom');
        return room.sleep !== null || room.talking !== null;
    }

    // ---------- Shop window (Cohua / Namaca) ----------

    // Called by the room when the player uses Cohua or Namaca on a merchant.
    // kind  = 'buy' (shows what the merchant sells, with prices)
    //         or 'sell' (shows what's in your bag, how many, and what it sells for).
    // goods = ids of what this merchant sells (from src/data/npcs.json).
    // The room stops while the window is open, like with the menu.
    openTrade (kind, goods)
    {
        this.mode = 'trade';
        this.tradeKind = kind;
        this.tradeGoods = goods;
        this.tradeChosen = 0;
        this.setSentence(this.tradeMessage, null);
        this.resetGlossTexts('trade');
        this.stopPickingAmount(); // always start by choosing an item
        this.fillTradeLines();

        this.trade.setVisible(true);
        this.qweButtons.setVisible(false);
        this.scene.pause('TestRoom');
    }

    closeTrade ()
    {
        this.mode = 'play';
        this.trade.setVisible(false);
        this.qweButtons.setVisible(true);
        this.scene.resume('TestRoom');
    }

    // The lines shown in the shop window right now (items from src/data/items.json).
    // Buying: what the merchant sells. Selling: what's in your bag (at least 1)
    // and has a sell price.
    tradeEntries ()
    {
        if (this.tradeKind === 'buy')
        {
            return this.tradeGoods
                .map((id) => items.find((item) => item.id === id))
                .filter((item) => item !== undefined);
        }

        const bag = this.scene.get('TestRoom').bag;
        return items.filter((item) => (bag[item.id] ?? 0) > 0 && item.sellPrice !== undefined);
    }

    // Draws the lines of the shop window. Called when it opens and after every buy/sell,
    // because the numbers change (and sold-out items disappear from the sell list).
    // Each line: placeholder fish picture, name, (when selling: how many you have),
    // price, and a small cacao bean.
    fillTradeLines ()
    {
        this.tradeLines.removeAll(true); // take away the old lines

        const entries = this.tradeEntries();
        const bag = this.scene.get('TestRoom').bag;

        entries.forEach((item, i) => {
            const top = LIST_TOP + i * LINE_HEIGHT;
            const middle = top + LINE_HEIGHT / 2 - 1;

            // An invisible area over the whole line: clicking it is the same as choosing
            // the line and pressing q. (Added first, so it lies under the text.)
            // (It stops before the gloss button at the right end.)
            const clickArea = this.add.rectangle(LIST_LEFT - 4, top - 1, MENU_WIDTH - 24 - GLOSS_SPACE, LINE_HEIGHT - 1)
                .setOrigin(0, 0)
                .setInteractive({ useHandCursor: true });
            // (Only while choosing an item, not while picking an amount.)
            clickArea.on('pointerdown', () => {
                if (this.mode === 'trade' && this.tradeCount === null)
                {
                    this.tradeChosen = i;
                    this.updateTradeHighlight();
                    this.confirmTrade();
                }
            });

            const picture = this.add.rectangle(LIST_LEFT, middle, BAG_FISH_WIDTH, BAG_FISH_HEIGHT, COLOR_BAG_FISH)
                .setOrigin(0, 0.5);
            const name = this.add.text(LIST_LEFT + BAG_FISH_WIDTH + 6, top, nahuatl(item.name), TEXT_STYLE);

            const price = this.tradeKind === 'buy' ? item.buyPrice : item.sellPrice;
            const priceText = this.add.text(SHOP_PRICE_RIGHT, top, String(price), TEXT_STYLE).setOrigin(1, 0);
            const bean = this.add.rectangle(SHOP_RIGHT - SHOP_BEAN_WIDTH, middle, SHOP_BEAN_WIDTH, SHOP_BEAN_HEIGHT, COLOR_BEAN)
                .setOrigin(0, 0.5);

            // Gloss button: switches the item's name to English and back
            // (only while choosing an item).
            const gloss = { line: name, label: item.name, english: false };
            Object.assign(gloss, this.makeGlossButton(top,
                () => this.clickGloss(gloss, () => this.mode === 'trade' && this.tradeCount === null)));

            this.tradeLines.add([ clickArea, picture, name, priceText, bean, gloss.button ]);

            if (this.tradeKind === 'sell')
            {
                const count = this.add.text(SHOP_COUNT_RIGHT, top, String(bag[item.id]), TEXT_STYLE).setOrigin(1, 0);
                this.tradeLines.add(count);
            }
        });

        // The message goes under the last line (or at the top if the list is empty).
        this.tradeMessage.container.setY(LIST_TOP + entries.length * LINE_HEIGHT + 8);

        // Selling with nothing to sell: "Your bag is empty."
        if (this.tradeKind === 'sell' && entries.length === 0)
        {
            this.setSentence(this.tradeMessage, menuText.messages.bagEmpty);
        }

        // If the chosen line is gone (sold out), choose the last line instead.
        this.tradeChosen = Math.min(this.tradeChosen, Math.max(entries.length - 1, 0));
        this.tradeHighlight.setVisible(entries.length > 0);
        this.updateTradeHighlight();
    }

    // Moves the blue bar to the chosen line.
    updateTradeHighlight ()
    {
        this.tradeHighlight.y = LIST_TOP - 1 + this.tradeChosen * LINE_HEIGHT;
    }

    // A key press while the shop window is open. Two steps:
    // 1. Choosing an item:  up/down = choose, q = pick an amount (or close the window if
    //                       there is nothing to choose), w or Enter = close the window.
    // 2. Picking an amount: up/down = 1 more/less, right/left = 10 more/less,
    //                       q = buy/sell, w = back to choosing, Enter = close the window.
    handleTradeKey (event)
    {
        const key = event.key.toLowerCase();

        if (key === 'enter')
        {
            this.closeTrade();
            return;
        }

        if (this.tradeCount !== null)
        {
            const steps = { arrowup: 1, arrowdown: -1, arrowright: 10, arrowleft: -10 };

            if (key in steps)
            {
                // Never below 1, never more than you can buy/sell.
                this.tradeCount = Math.min(Math.max(this.tradeCount + steps[key], 1), this.tradeMax);
                this.showTradeAmount();
            }
            else if (key === 'q')
            {
                this.finishTrade();
            }
            else if (key === 'w')
            {
                this.stopPickingAmount();
            }
            return;
        }

        const entries = this.tradeEntries();

        if (key === 'w')
        {
            this.closeTrade();
        }
        else if ((key === 'arrowup' || key === 'arrowdown') && entries.length > 0)
        {
            const step = key === 'arrowup' ? -1 : 1;
            this.tradeChosen = Math.min(Math.max(this.tradeChosen + step, 0), entries.length - 1);
            this.updateTradeHighlight();
        }
        else if (key === 'q')
        {
            this.confirmTrade();
        }
    }

    // q (or a click) on an item: start picking how many.
    // The most you can pick: when buying, as many as your beans pay for;
    // when selling, as many as you have.
    // If you can't even buy one, the "not enough cacao" message appears instead.
    confirmTrade ()
    {
        const entries = this.tradeEntries();
        if (entries.length === 0)
        {
            // Nothing to buy or sell (e.g. the bag is empty): q closes the window.
            this.closeTrade();
            return;
        }

        const item = entries[this.tradeChosen];
        const room = this.scene.get('TestRoom');

        this.tradeMax = this.tradeKind === 'buy'
            ? Math.floor(room.beans / item.buyPrice)
            : room.bag[item.id];

        if (this.tradeMax < 1)
        {
            this.setSentence(this.tradeMessage, menuText.messages.notEnoughCacao);
            return;
        }

        this.tradeCount = 1;
        this.setSentence(this.tradeMessage, null);
        this.tradeAmount.setVisible(true);
        this.showTradeAmount();
    }

    // Writes the amount and the total price into the amount line.
    showTradeAmount ()
    {
        const item = this.tradeEntries()[this.tradeChosen];
        const price = this.tradeKind === 'buy' ? item.buyPrice : item.sellPrice;

        // Only when it changes (Buy/Sell), so a gloss stays while you change the amount.
        const label = this.tradeKind === 'buy' ? menuText.shop.buy : menuText.shop.sell;
        if (this.tradeAmountLabel.gloss.label !== label)
        {
            this.setGlossLabel(this.tradeAmountLabel, label);
        }
        this.tradeAmountText.setText(String(this.tradeCount));
        this.tradeTotalText.setText(String(price * this.tradeCount));
    }

    // Leaves the amount step and goes back to choosing an item.
    stopPickingAmount ()
    {
        this.tradeCount = null;
        this.tradeAmount.setVisible(false);
    }

    // q while picking an amount: buy or sell that many,
    // then show "Bought/Sold (number) (item)." under the list.
    finishTrade ()
    {
        const item = this.tradeEntries()[this.tradeChosen];
        const room = this.scene.get('TestRoom');
        const count = this.tradeCount;

        let done;
        let template;
        if (this.tradeKind === 'buy')
        {
            done = room.buyItem(item.id, item.buyPrice, count);
            template = nahuatl(menuText.messages.bought);
        }
        else
        {
            done = room.sellItem(item.id, item.sellPrice, count);
            template = nahuatl(menuText.messages.sold);
        }

        this.stopPickingAmount();
        this.fillTradeLines();

        // {count} and {item} in the message (src/data/menu.json) are replaced
        // with the number and the item's name.
        // (This message has no gloss yet: it's only a placeholder.)
        const message = [ done
            ? { nah: template.replace('{count}', count).replace('{item}', nahuatl(item.name)), en: null }
            : menuText.messages.notEnoughCacao ];

        // Just sold the last thing: also say that the bag is empty now (on a new line).
        if (this.tradeKind === 'sell' && this.tradeEntries().length === 0)
        {
            message.push(menuText.messages.bagEmpty);
        }

        this.setSentence(this.tradeMessage, message);
    }

    // ---------- Dialogue (Ihtoa) ----------

    // Called by the room when the player talks to an NPC: shows what the NPC says.
    // While the box is open, the player can't walk, use powers or open the menu.
    // text = what the NPC says, as { nah: ..., en: ... } (from src/data/npcs.json or menu.json).
    // afterClose (optional) = what should happen when the box is closed,
    // e.g. opening the shop window after the merchant has asked what you want.
    openDialogue (text, afterClose = null)
    {
        this.mode = 'dialogue';
        this.resetGlossTexts('dialogue');
        this.setSentence(this.dialogueText, text);
        this.dialogue.setVisible(true);
        this.qweButtons.setVisible(false);
        this.dialogueAfterClose = afterClose;
    }

    // q (or a click on the advance symbol) closes the dialogue box.
    closeDialogue ()
    {
        if (this.mode !== 'dialogue')
        {
            return;
        }

        this.mode = 'play';
        this.dialogue.setVisible(false);
        this.qweButtons.setVisible(true);

        // Do what should happen next, if anything (only once).
        const next = this.dialogueAfterClose;
        this.dialogueAfterClose = null;
        if (next)
        {
            next();
        }
    }

    // ---------- Life points ----------

    // Shows one red square per life point. Lost life points disappear.
    // Called by the room whenever the life points change.
    showLife (life)
    {
        this.lifeSquares.forEach((square, i) => square.setVisible(i < life));
    }

    // ---------- Cacao beans ----------

    // Writes the number of cacao beans next to the brown rectangle.
    // Call this whenever the number of beans changes.
    showBeans (beans)
    {
        this.beanText.setText(String(beans));
    }

    // ---------- Slots ----------

    // Puts a word into a slot, or empties it when word is null.
    setSlotWord (letter, word)
    {
        const slot = this.slots[letter];
        slot.word = word;
        slot.circle.setFillStyle(word ? COLOR_USED : COLOR_EMPTY);
        this.setGlossLabel(slot.wordLabel, this.slotLabel(word));
    }
}

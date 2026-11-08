import { Scene, Geom } from 'phaser';
import wordList from '../../data/wordlist.json';
import fishingWords from '../../data/fishing-words.json';
import numberWords from '../../data/numbers.json';
import menuText from '../../data/menu.json';
import items from '../../data/items.json';
import { createSave, downloadSave, pickSaveFile } from '../save.js';
import { nahuatl, english, hasGloss, getAuxLanguage, setAuxLanguage } from '../language.js';
import { MAX_LIFE } from './TestRoom.js';
import { savedProgress, timesRight, needsReminder, setReminder } from '../progress.js';

const SLOT_KEYS = [ 'q', 'w', 'e' ];

// How long the player has to catch a biting fish, in milliseconds.
const MINIGAME_TIME = 5000;

// Which of the two easy minigames you get after pulling in a fish, and how often.
// The numbers only matter compared to each other: 50 and 50 = half the time each;
// 75 and 25 would be three out of four times the word order puzzle.
// order  = put the three parts of the word in the right order
// choice = pick the right color word out of three
// (The hard one, typing, has its own rules below; the easy ones share whatever is left.)
const MINIGAME_CHANCES = {
    order: 50,
    choice: 50
};

// --- Typing minigame: type the color word and press Enter ---
// How long you have to type, in milliseconds.
const TYPING_TIME = 10000;
// A color can only be typed once it was caught at least once on this save file.
// Its chance then grows with every catch of that color (counted on the save file):
// from TYPING_START at the first catch to TYPING_MAX at TYPING_FULL_AT catches.
const TYPING_START = 1 / 6;
const TYPING_MAX = 2 / 3;
const TYPING_FULL_AT = 25;
// As long as that color wasn't caught yet in this session, its chance is multiplied by this
// (0.5 = halved), so every session starts with a bit of warming up.
const TYPING_NO_SESSION_CATCH = 0.5;
// After typing a color wrong, the next time that color bites it's always an easy minigame.
const TYPING_BOX_WIDTH = 160;

// Picks one name from a list of chances like MINIGAME_CHANCES (see above).
function pickByChance (chances)
{
    const names = Object.keys(chances);
    const total = names.reduce((sum, name) => sum + chances[name], 0);
    let spin = Math.random() * total;

    for (const name of names)
    {
        spin -= chances[name];
        if (spin < 0)
        {
            return name;
        }
    }
    return names[names.length - 1];
}

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

// Which group of five a number is in: 1-5 = 1, 6-10 = 2, 11-15 = 3, 16-20 = 4.
function numberGroup (n)
{
    return Math.ceil(n / 5);
}

// The beginning of a text, up to and including its n-th letter (spaces don't count).
// Example: firstLetters("Mahtlactli once", 12) -> "Mahtlactli on"
function firstLetters (text, n)
{
    let letters = 0;
    for (let i = 0; i < text.length; i++)
    {
        if (letters === n)
        {
            return text.slice(0, i);
        }
        if (text[i] !== ' ')
        {
            letters++;
        }
    }
    return text;
}

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
// Number entry (see openDigits): the window, the digit boxes, and the space between them.
const DIGIT_PANEL_WIDTH = 120;
const DIGIT_PANEL_HEIGHT = 70;
const DIGIT_BOX_WIDTH = 18;
const DIGIT_BOX_HEIGHT = 22;
const DIGIT_GAP = 6;
// The leftmost digit (hundreds) only goes up to this.
const DIGIT_FIRST_MAX = 4;

const COLOR_LOCKED = '#e63946'; // a locked text blinks in this color when you try to gloss it
const LOCKED_BLINKS = 3;          // how often it blinks
const LOCKED_BLINK_TIME = 120;    // milliseconds red, then the same white
const COLOR_GLOSS = '#f2c418';  // text color of glosses (English), so they stand out from Nahuatl
const COLOR_BITE = '#ff5c5c';   // text color of "Quixtia" while a fish is biting
const COLOR_CORRECT = 0x2e9a4a; // a minigame box turns this color when it's pressed in the right order
const COLOR_WRONG = 0xd62828;   // a minigame box turns this color when it's the wrong one

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
        // 'reveal'   = catch failed, the boxes and the whole word stay on screen for a moment
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

        // Only one gloss can show English at a time, in the whole game (see openOnlyThisGloss).
        // openGloss = the one that shows English right now, or null.
        this.openGloss = null;

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
        this.dialogueAdvance = [ advanceBox, advanceSign ]; // hidden while a question is asked

        const qCircle = this.add.circle(18, h - 14, 10, COLOR_EMPTY).setStrokeStyle(1, 0xffffff);
        const qLetter = this.add.text(18, h - 14, 'q', TEXT_STYLE).setOrigin(0.5);
        const qLabel = this.add.text(34, h - 14, '', TEXT_STYLE).setOrigin(0, 0.5);
        this.makeGlossable(qLabel, 'dialogue');
        this.setGlossLabel(qLabel, menuText.buttons.confirm);

        // While the NPC asks a yes/no question (see openQuestion), there is also
        // "(w) Ahmo" next to "(q) Quemah", and both circles can be clicked to answer.
        // In a long dialogue you can leave early (see openDialogue), there is "(w) Xictzacua" instead.
        // (Clicking the words still shows their glosses.)
        const wCircle = this.add.circle(18 + 80, h - 14, 10, COLOR_EMPTY).setStrokeStyle(1, 0xffffff);
        const wLetter = this.add.text(18 + 80, h - 14, 'w', TEXT_STYLE).setOrigin(0.5);
        const wLabel = this.add.text(34 + 80, h - 14, '', TEXT_STYLE).setOrigin(0, 0.5);
        this.makeGlossable(wLabel, 'dialogue');
        this.setGlossLabel(wLabel, menuText.buttons.no);
        this.dialogueNo = [ wCircle, wLetter, wLabel ]; // only shown for a question or a long dialogue
        this.dialogueNoLabel = wLabel;

        qCircle.setInteractive({ useHandCursor: true });
        qCircle.on('pointerdown', () => {
            if (this.optionList)
            {
                this.chooseOption(this.optionList.chosen);
            }
            else
            {
                this.answerQuestion(true);
            }
        });
        wCircle.setInteractive({ useHandCursor: true });
        wCircle.on('pointerdown', () => {
            if (this.dialogueQuestion)
            {
                this.answerQuestion(false);
            }
            else
            {
                this.quitDialogue();
            }
        });

        this.dialogue.add([ dialogueBox, this.dialogueText.container, advanceBox, advanceSign,
            qCircle, qLetter, qLabel, wCircle, wLetter, wLabel ]);

        // The question being asked right now: { onYes, onNo }, or null when the box
        // just shows a line (then q, w or the advance symbol simply close it).
        this.dialogueQuestion = null;
        // True while the box shows a line of a long dialogue that w can leave early.
        this.dialogueCanQuit = false;

        // The dialogue options while the player is choosing what to say (see openOptions),
        // or null.
        this.optionList = null;

        // The number entry while it's open (see openDigits), or null.
        this.digitEntry = null;

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
        // In the shop, w says "Ahmo" (No), as the partner of q "Quemah" (Yes).
        [ [ 'q', menuText.buttons.confirm ], [ 'w', menuText.buttons.no ] ].forEach(([ letter, label ], i) => {
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

        // For powers that only work while held down (Maneloa): the game can ask these
        // whether q, w or e is still down. (false = don't stop the browser from using the keys.)
        this.holdKeys = this.input.keyboard.addKeys({ q: 'Q', w: 'W', e: 'E' }, false);

        // The slot (q, w or e) that started swimming, and whether it was started by
        // clicking its circle (then holding the mouse button counts) instead of the key.
        this.swimSlot = null;
        this.swimByClick = false;
        this.clickingSlot = false;

        // When the overlay is restarted (after loading a save file),
        // stop listening with the old one so no key is handled twice.
        // (Same care as in the room: only if the keyboard is still there at that moment.)
        this.events.once('shutdown', () => {
            if (this.input.keyboard)
            {
                this.input.keyboard.off('keydown');
            }
        });
    }

    handleKey (event)
    {
        if (this.mode === 'prompt')
        {
            this.handlePromptKey(event);
            return;
        }

        if (this.mode === 'digits')
        {
            this.handleDigitKey(event);
            return;
        }

        // Holding a key down repeats it; ignore those repeats outside the prompt
        // and the typing minigame (there, holding Backspace keeps deleting).
        const typing = this.mode === 'minigame' && this.minigame && this.minigame.kind === 'typing';
        if (event.repeat && !typing)
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
            // but the key that cast the line pulls it (Quixtia). See pullLine in TestRoom.
            if (event.key.toLowerCase() === this.fishingSlot)
            {
                this.scene.get('TestRoom').pullLine();
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
            // An NPC is talking: q or w closes the dialogue box. Everything else does nothing.
            // If the NPC asked a yes/no question: q = yes, w = no.
            const key = event.key.toLowerCase();

            // Choosing what to say: up/down = choose, q = say it, w = leave.
            if (this.optionList)
            {
                const list = this.optionList;
                if (event.key === 'ArrowUp' || event.key === 'ArrowDown')
                {
                    const step = event.key === 'ArrowUp' ? -1 : 1;
                    const count = list.options.length;
                    this.markOption((list.chosen + step + count) % count);
                }
                else if (key === 'q')
                {
                    this.chooseOption(list.chosen);
                }
                else if (key === 'w')
                {
                    this.quitDialogue();
                }
                return;
            }

            if (this.dialogueQuestion && (key === 'q' || key === 'w'))
            {
                this.answerQuestion(key === 'q');
            }
            else if (key === 'w' && this.dialogueCanQuit)
            {
                // A long dialogue: w leaves it right away (nothing more is said).
                this.quitDialogue();
            }
            else if (key === 'q' || key === 'w')
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
        // and while fishing only on the circle the line was cast with (= pull).
        const pullFishing = this.mode === 'fishing' && letter === this.fishingSlot;
        if ((this.mode !== 'play' && !pullFishing) || !this.qweButtons.visible)
        {
            return;
        }

        // Remembered while the click is handled, so Maneloa knows it was started by a click.
        this.clickingSlot = true;
        this.handleKey({ key: letter, repeat: false, shiftKey: pointer.event.shiftKey });
        this.clickingSlot = false;
    }

    // Is Maneloa still held down? Asked by the room in every frame while swimming.
    // Its key (or, if it was started by clicking the circle, the mouse button) must still be down,
    // and nothing else may have opened (menu, dialogue, ...).
    isHoldingSwim ()
    {
        if (this.swimSlot === null || this.mode !== 'play')
        {
            return false;
        }
        return this.swimByClick
            ? this.input.activePointer.isDown
            : this.holdKeys[this.swimSlot].isDown;
    }

    // Swimming is over: forget which slot started it.
    releaseSwim ()
    {
        this.swimSlot = null;
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

            // Maneloa: remember how it was started, to know when it's let go (see isHoldingSwim).
            if (entry.action === 'swim')
            {
                this.swimSlot = letter;
                this.swimByClick = this.clickingSlot;
            }

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
        if (gloss.english)
        {
            this.openOnlyThisGloss(gloss, () => {
                if (gloss.english && gloss.box.active)
                {
                    gloss.english = false;
                    this.showGloss(gloss);
                }
            });
        }
        this.showGloss(gloss);
    }

    // Only one gloss can show English at a time, in the whole game.
    // Called when a gloss (a menu line's gloss button or a clickable text) switches to English:
    // the gloss that was showing English before goes back to Nahuatl.
    // owner = the gloss that switches to English now.
    // turnOff = how to put it back to Nahuatl later, when another gloss is opened.
    openOnlyThisGloss (owner, turnOff)
    {
        if (this.openGloss && this.openGloss.owner !== owner)
        {
            this.openGloss.turnOff();
        }
        this.openGloss = { owner, turnOff };
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

    // Makes a text blink red a few times (LOCKED_BLINKS), then shows it normally again.
    blinkRed (textObject)
    {
        if (textObject.blinking)
        {
            return; // already blinking
        }
        textObject.blinking = true;

        const changes = LOCKED_BLINKS * 2; // red, white, red, white, ...
        let done = 0;
        this.time.addEvent({
            delay: LOCKED_BLINK_TIME,
            repeat: changes - 1,
            callback: () => {
                done += 1;
                if (!textObject.active)
                {
                    return; // the text was removed in the meantime
                }
                const red = done % 2 === 1;
                textObject.setColor(red ? COLOR_LOCKED : (textObject.gloss.color ?? TEXT_STYLE.color));
                if (done === changes)
                {
                    textObject.blinking = false;
                }
            }
        });
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
    // The Nahuatl is white, unless the text has its own color (gloss.color, e.g. Quixtia during a bite).
    showGlossText (textObject)
    {
        const { label, english: showEnglish } = textObject.gloss;

        textObject.setText(label ? (showEnglish ? english(label) : nahuatl(label)) : '');
        textObject.setColor(showEnglish ? COLOR_GLOSS : (textObject.gloss.color ?? TEXT_STYLE.color));

        // The clickable area is as big as the text, so it changes with the text.
        textObject.input.hitArea.setSize(textObject.width, textObject.height);
        this.updateGlossCursor(textObject);

        if (textObject.gloss.onChange)
        {
            textObject.gloss.onChange();
        }
    }

    // A clickable text was clicked: switch between Nahuatl and English.
    // A text whose label is "locked" (e.g. a merchant's price during the cloth task)
    // can't be glossed: it blinks red instead.
    clickGlossText (textObject)
    {
        const label = textObject.gloss.label;
        if (label && label.locked && getAuxLanguage(this) === 'en')
        {
            this.blinkRed(textObject);
            return;
        }

        // Texts without both versions (e.g. placeholders) can't be switched.
        if (getAuxLanguage(this) !== 'en' || !hasGloss(textObject.gloss.label))
        {
            return;
        }

        textObject.gloss.english = !textObject.gloss.english;
        if (textObject.gloss.english)
        {
            this.openOnlyThisGloss(textObject, () => {
                if (textObject.gloss.english && textObject.active)
                {
                    textObject.gloss.english = false;
                    this.showGlossText(textObject);
                }
            });
        }
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
            // how many cacao beans the player has, what's in the bag, the settings,
            // and how often each word was answered right and wrong.
            const room = this.scene.get('TestRoom');
            downloadSave(createSave({
                room: room.currentRoom,
                life: room.life,
                beans: room.beans,
                bag: room.bag,
                settings: { auxLanguage: getAuxLanguage(this) },
                wordStats: savedProgress(room.progress)
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

        // The key the line was cast with (q, w or e); pressing it again pulls the line.
        this.fishingSlot = this.lastUsedSlot;

        // Only that circle stays on screen, with "pull" (Quixtia) next to it instead of its word.
        // The other two are hidden.
        SLOT_KEYS.forEach((letter) => {
            const slot = this.slots[letter];
            const keep = letter === this.fishingSlot;
            slot.circle.setVisible(keep);
            slot.letterLabel.setVisible(keep);
            slot.wordLabel.setVisible(keep);
        });
        this.setGlossLabel(this.slots[this.fishingSlot].wordLabel, menuText.buttons.pull);
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
            slot.wordLabel.gloss.color = null; // back to white (in case it was the bite color)
            this.setGlossLabel(slot.wordLabel, this.slotLabel(slot.word));
        });
    }

    // Called by the room when a fish bites: "Quixtia" turns COLOR_BITE.
    showBite ()
    {
        const label = this.slots[this.fishingSlot].wordLabel;
        label.gloss.color = COLOR_BITE;
        this.showGlossText(label);
    }

    // Called by the room when a biting fish got away but the line stays out:
    // "Quixtia" goes back to white.
    endBite ()
    {
        const label = this.slots[this.fishingSlot].wordLabel;
        label.gloss.color = null;
        this.showGlossText(label);
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

        const room = this.scene.get('TestRoom');
        this.startWordGame(entry, fishingWords, {
            onResult: (success, word) => room.fishingResult(success, word)
        });
        return true;
    }

    // Called by the room when the marketplace leader asks how many there are.
    // number = the right answer (1 to 20); its word is looked up in src/data/numbers.json.
    // onResult(success, word) = called right when the answer was given (or time ran out).
    // afterReveal() = only after a wrong answer: called when the boxes have disappeared again.
    // Returns false if there's no word for that number.
    startNumberGame (number, onResult, afterReveal)
    {
        const entry = numberWords.find((e) => e.number === number);
        if (!entry)
        {
            return false;
        }

        // lockWalking: the player can't walk away while answering (or right after a wrong answer).
        // hideWrong: after a wrong answer the right word is NOT shown (it would give away
        // the number before counting again).
        // choicePool: in the pick-one-of-three version, the two wrong answers come from the
        // same group of five as the right one (1-5, 6-10, 11-15, 16-20), so the answer isn't
        // too easy to guess. E.g. for 13, the others are two of 11, 12, 14, 15.
        this.startWordGame(entry, numberWords, {
            onResult,
            afterReveal,
            lockWalking: true,
            hideWrong: true,
            choicePool: (right, all) => all.filter((e) => numberGroup(e.number) === numberGroup(right.number))
        });
        return true;
    }

    // The word minigame (used for fishing and for the leader's counting question):
    // the player has to come up with the word of "entry" (one entry of a word list,
    // like src/data/fishing-words.json), in one of three ways (see chooseMinigame).
    // words = the whole word list (the color choice takes its two wrong answers from it).
    // options = { onResult, afterReveal, lockWalking } (see startNumberGame).
    startWordGame (entry, words, options)
    {
        const w = this.scale.width;
        const h = this.scale.height;

        // Which minigame this time: 'typing', 'order' or 'choice' (see chooseMinigame).
        const kind = this.chooseMinigame(entry, words);

        // The word in lowercase, cut into three parts.
        // If the word list says how to split the word ("parts"), use that;
        // otherwise cut it into three parts of about the same length.
        // These are in the right order; the boxes get them in a random order.
        const parts = entry.parts
            ? entry.parts.map((part) => part.toLowerCase())
            : splitIntoThree(entry.word.toLowerCase());

        // What's written in the three boxes (q, w, e from left to right).
        // (The typing minigame has no q/w/e boxes, so no labels.)
        let labels = [];
        if (kind === 'order')
        {
            // The three parts, mixed. If they come out in the right order by chance,
            // mix them once more: so the right order still can happen, but much less often.
            labels = shuffle(parts);
            if (sameOrder(labels, parts))
            {
                labels = shuffle(parts);
            }
        }
        else if (kind === 'choice')
        {
            // The fish's color word and two other color words picked at random, all mixed up.
            // (If a "choicePool" is given, the two others come only from the words it picks.)
            const pool = options.choicePool ? options.choicePool(entry, words) : words;
            const others = shuffle(pool.filter((e) => e !== entry)).slice(0, 2);
            // Written as in the word list, with a capital letter (e.g. "Chichiltic").
            labels = shuffle([ entry, ...others ]).map((e) => e.word);
        }

        // Everything on screen for the minigame goes into one container,
        // so it can be removed in one go.
        const ui = this.add.container(0, 0);

        // How wide the q/w/e boxes are: normally BOX_WIDTH, but wider if a word
        // doesn't fit (long number words like "mahtlactli onnahui").
        // Measured by writing each word once and looking at its width.
        let boxWidth = BOX_WIDTH;
        labels.forEach((label) => {
            const measure = this.add.text(0, 0, label, TEXT_STYLE);
            boxWidth = Math.max(boxWidth, Math.ceil(measure.width) + 12);
            measure.destroy();
        });

        // --- Three boxes for q, w, e, side by side in the middle of the screen ---
        // (Typing: one wide box in the middle instead, see below.)
        const boxY = h / 2;
        const boxes = {};

        const boxKeys = kind === 'typing' ? [] : SLOT_KEYS;
        boxKeys.forEach((letter, i) => {
            // Each box (rectangle + key letter + word part or color word) is its own
            // little container, so all three pieces move together when the box shakes.
            // slot 0, 1, 2  ->  left, middle, right
            const holder = this.add.container(this.boxSlotX(i, boxWidth), boxY);

            const box = this.add.rectangle(0, 0, boxWidth, BOX_HEIGHT, COLOR_EMPTY)
                .setStrokeStyle(1, 0xffffff);
            const keyLabel = this.add.text(-boxWidth / 2 + 3, -BOX_HEIGHT / 2 + 1, letter,
                { ...TEXT_STYLE, fontSize: 9 });
            const partLabel = this.add.text(0, 2, labels[i], TEXT_STYLE).setOrigin(0.5);

            // Clicking (or tapping) the box does the same as pressing its key.
            // (Only while the minigame is running: not while the boxes stay on screen after a mistake.)
            box.setInteractive({ useHandCursor: true });
            box.on('pointerdown', () => {
                if (this.mode === 'minigame')
                {
                    this.handleMinigameKey({ key: letter, repeat: false, shiftKey: false });
                }
            });

            holder.add([ box, keyLabel, partLabel ]);
            ui.add(holder);
            boxes[letter] = { holder, box, part: labels[i], slot: i, used: false };
        });

        // --- Typing: one wide box in the middle, showing what has been typed ---
        // It's kept in the same list as the q/w/e boxes (under the name 'typing', in the
        // middle slot), so it can turn red and shake the same way.
        let typedLabel = null;
        if (kind === 'typing')
        {
            const holder = this.add.container(this.boxSlotX(1, boxWidth), boxY);
            const box = this.add.rectangle(0, 0, TYPING_BOX_WIDTH, BOX_HEIGHT, COLOR_EMPTY)
                .setStrokeStyle(1, 0xffffff);
            typedLabel = this.add.text(0, 0, '_', TEXT_STYLE).setOrigin(0.5);

            holder.add([ box, typedLabel ]);
            ui.add(holder);
            boxes.typing = { holder, box, slot: 1 };
        }

        // --- The word, spelled out above the boxes one part at a time ---
        // It starts empty. It sits exactly where the whole word appears at the end
        // (see showFishWord), so the finished word is already in the right place.
        // To find that place, write the whole word once, measure it, then empty it again.
        const spelled = this.add.text(0, this.fishWordY(), entry.word, TEXT_STYLE).setOrigin(0, 0.5);
        spelled.x = w / 2 - spelled.width / 2;
        spelled.setText('');
        ui.add(spelled);

        // --- Timer in the top right corner: a bar that gets shorter ---
        const barWidth = 60;
        const barX = w - 10 - barWidth; // left end of the bar
        const barY = 12;

        const barBack = this.add.rectangle(barX, barY, barWidth, 6, COLOR_EMPTY)
            .setOrigin(0, 0.5).setStrokeStyle(1, 0xffffff);
        const bar = this.add.rectangle(barX, barY, barWidth, 6, COLOR_USED).setOrigin(0, 0.5);
        ui.add([ barBack, bar ]);

        // Typing takes longer than pressing a key, so it gets more time.
        const totalTime = kind === 'typing' ? TYPING_TIME : MINIGAME_TIME;

        this.minigame = {
            kind,                     // 'typing', 'order' or 'choice'
            entry,                    // the word from the word list
            ui,
            boxes,
            boxWidth,                 // how wide the q/w/e boxes are
            onResult: options.onResult,
            afterReveal: options.afterReveal ?? null,
            lockWalking: options.lockWalking ?? false,
            hideWrong: options.hideWrong ?? false,
            parts,
            spelled,                  // the text above the boxes that fills up
            next: 0,                  // which part has to be pressed next (0, 1 or 2)
            typed: '',                // typing: what has been typed so far
            typedLabel,               // typing: the text showing it
            timeLeft: totalTime,
            totalTime,
            bar,
            barWidth,
            timers: []                // things waiting to happen later (cancelled when it closes)
        };

        this.mode = 'minigame';

        // The fish is pulled: the "pull" circle goes away while the boxes are on screen
        // (q/w/e are the minigame boxes now). The circles come back normal afterwards.
        this.qweButtons.setVisible(false);
        this.restoreSlots();
    }

    // A key press during the minigame.
    handleMinigameKey (event)
    {
        if (this.minigame.kind === 'typing')
        {
            this.handleTypingKey(event);
            return;
        }

        const letter = event.key.toLowerCase();
        if (!SLOT_KEYS.includes(letter))
        {
            return; // other keys do nothing here
        }

        const game = this.minigame;
        const pressed = game.boxes[letter];

        if (game.kind === 'choice')
        {
            // Color choice: one press decides it.
            // Right word: the box turns green and the fish is caught.
            // Wrong word: the box turns red and the fish gets away.
            if (pressed.part === game.entry.word)
            {
                pressed.box.setFillStyle(COLOR_CORRECT);
                this.finishMinigame(true);
            }
            else
            {
                pressed.box.setFillStyle(COLOR_WRONG);
                this.finishMinigame(false);
            }
            return;
        }

        // Word order puzzle from here on.
        if (pressed.used || pressed.part !== game.parts[game.next])
        {
            // Wrong box: it turns red, and the fish gets away.
            pressed.box.setFillStyle(COLOR_WRONG);
            this.finishMinigame(false);
            return;
        }

        // Right box: it turns green and stays where it is (so q/w/e don't get mixed up),
        // and its part is added to the word above the boxes.
        pressed.used = true;
        pressed.box.setFillStyle(COLOR_CORRECT);

        game.next++;

        // Spell out the word up to here. The letters are taken from the word itself
        // (not the lowercase parts), so it looks exactly like the finished word,
        // e.g. "Chi", then "Chichil", then "Chichiltic".
        // Spaces don't count as letters: for "Mahtlactli once" with the parts
        // "mahtlactli", "on", "ce", the second step shows "Mahtlactli on".
        const lettersSoFar = game.parts.slice(0, game.next).join('').replace(/ /g, '').length;
        game.spelled.setText(firstLetters(game.entry.word, lettersSoFar));

        if (game.next === game.parts.length)
        {
            this.finishMinigame(true);
        }
    }

    // Left/right position of box slot 0, 1 or 2 on the screen.
    // boxWidth = how wide the boxes are (normally that of the running minigame).
    boxSlotX (slot, boxWidth = this.minigame ? this.minigame.boxWidth : BOX_WIDTH)
    {
        return this.scale.width / 2 + (slot - 1) * (boxWidth + BOX_GAP);
    }

    // A key press during the typing minigame: letters are typed, Backspace deletes
    // the last one, Enter checks the word.
    handleTypingKey (event)
    {
        const game = this.minigame;

        if (event.key === 'Enter')
        {
            // Upper/lower case and spaces at the start or end don't matter.
            const right = game.typed.trim().toLowerCase() === game.entry.word.toLowerCase();
            game.boxes.typing.box.setFillStyle(right ? COLOR_CORRECT : COLOR_WRONG);
            this.finishMinigame(right);
            return;
        }

        if (event.key === 'Backspace')
        {
            game.typed = game.typed.slice(0, -1);
        }
        else if (event.key.length === 1)
        {
            // A normal character (letters, also ā, ē, ... if your keyboard can type them)
            game.typed += event.key;
        }

        // The underscore shows where the next letter goes.
        game.typedLabel.setText(game.typed + '_');
    }

    // Decides which minigame comes for this word: 'typing', 'order' or 'choice'.
    // First a chance for typing (see typingChance); if it's not typing,
    // one of the two easy ones, picked with MINIGAME_CHANCES.
    // words = the whole word list the word comes from.
    chooseMinigame (entry, words)
    {
        const progress = this.scene.get('TestRoom').progress;

        // After typing this word wrong last time: an easy one this time (the reminder is used up).
        if (needsReminder(progress, entry.word))
        {
            setReminder(progress, entry.word, false);
        }
        else if (Math.random() < this.typingChance(entry.word))
        {
            return 'typing';
        }

        // The word order puzzle needs a word that can be cut into three parts:
        // either the word list says how ("parts"), or it has at least 3 letters.
        // (A very short word like "ce" can't; it always gets the choice.)
        const canOrder = Boolean(entry.parts) || entry.word.replace(/ /g, '').length >= 3;

        // The color choice needs at least two other words to choose from;
        // if the word list is too short, it's always the word order puzzle.
        if (words.length < 3)
        {
            return 'order';
        }
        if (!canOrder)
        {
            return 'choice';
        }
        return pickByChance(MINIGAME_CHANCES);
    }

    // How likely the typing minigame is for this word (0 = never, 1 = always).
    // See the TYPING_... settings at the top of this file.
    typingChance (word)
    {
        const progress = this.scene.get('TestRoom').progress;
        const caught = timesRight(progress, word, 'saved');

        // Never caught on this save file: no typing yet.
        if (caught === 0)
        {
            return 0;
        }

        // From TYPING_START at the 1st catch, evenly up to TYPING_MAX at the TYPING_FULL_AT-th catch.
        const grown = Math.min((caught - 1) / (TYPING_FULL_AT - 1), 1);
        let chance = TYPING_START + grown * (TYPING_MAX - TYPING_START);

        // Not caught yet in this session: less likely.
        if (timesRight(progress, word, 'session') === 0)
        {
            chance *= TYPING_NO_SESSION_CATCH;
        }
        return chance;
    }

    // Ends the minigame and tells the room whether the fish was caught.
    finishMinigame (success)
    {
        // Caught or not: the whole word appears for a moment, in the same place
        // as the spelled-out part (which is hidden, so the two don't overlap).
        // (Not after a wrong answer if hideWrong is set: the leader's counting question.)
        this.minigame.spelled.setVisible(false);
        if (success || !this.minigame.hideWrong)
        {
            this.showFishWord(this.minigame.entry);
        }

        // The word that was asked, so the room can count the answer.
        const word = this.minigame.entry.word;

        // Typed wrong (or too slow): next time this word comes up, an easy minigame reminds you of it.
        if (this.minigame.kind === 'typing' && !success)
        {
            setReminder(this.scene.get('TestRoom').progress, word, true);
        }

        const game = this.minigame;

        if (success)
        {
            this.closeMinigame();
            game.onResult(true, word);
            return;
        }

        // Failed: the boxes stay where they are for a moment, with the whole word above them.
        // q/w/e powers and the menu stay locked until it's over, but you can walk
        // (except in the leader's counting question, see lockWalking).
        this.mode = 'reveal';

        // Wrong box (already red) or time ran out: all boxes shake quickly.
        this.shakeBoxes();

        // When the display is over: remove it and give the powers back,
        // then do whatever comes next (e.g. the leader says to count again).
        game.timers.push(this.time.delayedCall(REVEAL_TIME, () => {
            this.closeMinigame();
            this.mode = 'play';
            this.qweButtons.setVisible(true);
            if (game.afterReveal)
            {
                game.afterReveal();
            }
        }));

        // Tell the room right away (fishing: the line is pulled in and the fish gets away).
        game.onResult(false, word);
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
                repeat: 2,
                // The shake stops a little to the side: put the box back exactly in its place.
                onComplete: () => { b.holder.x = x; }
            });
        });
    }

    // Shows the whole fishing word above the boxes for a moment (FISH_WORD_TIME),
    // e.g. "Chichiltic". Clicking it shows its gloss (the "meaning" in fishing-words.json).
    // It doesn't stop anything: you can walk and use your powers while it's there.
    showFishWord (entry)
    {
        this.removeFishWord(); // only one at a time

        const text = this.add.text(this.scale.width / 2, this.fishWordY(), '', TEXT_STYLE).setOrigin(0.5);
        this.makeGlossable(text);
        this.setGlossLabel(text, { nah: entry.word, en: entry.meaning });

        const timer = this.time.delayedCall(FISH_WORD_TIME, () => this.removeFishWord());
        this.fishWord = { text, timer };
    }

    // Up/down position of the fishing word: a little above the boxes.
    fishWordY ()
    {
        return this.scale.height / 2 - BOX_HEIGHT / 2 - 14;
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
            digits: menuText.buttons.confirm,
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
        const share = Math.max(game.timeLeft, 0) / game.totalTime;
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

    // ---------- Number entry (three digits) ----------

    // Lets the player enter a number with three digits, e.g. 233 (used by the cloth buyer:
    // "which one is the lowest price you found?"). A small window in the middle of the screen
    // shows three digits side by side; the chosen digit has a colored box and arrows
    // above and below it. No time limit.
    // - left/right = choose a digit, up/down = make it bigger/smaller (it goes around:
    //   after 9 comes 0). The leftmost digit only goes from 0 to DIGIT_FIRST_MAX.
    // - number keys = type the number: each new digit comes in from the right and the others
    //   move one place to the left (0 0 2 -> 0 2 3 -> 2 3 3). Backspace takes the last one away.
    // - q or Enter = done; w = give up (counts as a wrong answer).
    // Everything can also be clicked: a digit to choose it, the arrows, and the q/w circles.
    // onDone(number) = called with the entered number, or with null after w.
    openDigits (onDone)
    {
        const w = this.scale.width;
        const h = this.scale.height;
        const ui = this.add.container(0, 0);

        // The window
        const panel = this.add.rectangle(w / 2, h / 2, DIGIT_PANEL_WIDTH, DIGIT_PANEL_HEIGHT, 0x222222, 0.9)
            .setStrokeStyle(1, 0xffffff);
        ui.add(panel);

        // The three digits, each in a box, with arrows above and below.
        const digits = [];
        for (let i = 0; i < 3; i++)
        {
            const x = w / 2 + (i - 1) * (DIGIT_BOX_WIDTH + DIGIT_GAP);
            const box = this.add.rectangle(x, h / 2, DIGIT_BOX_WIDTH, DIGIT_BOX_HEIGHT, COLOR_EMPTY)
                .setStrokeStyle(1, 0xffffff);
            const text = this.add.text(x, h / 2, '0', TEXT_STYLE).setOrigin(0.5);
            const up = this.add.text(x, h / 2 - DIGIT_BOX_HEIGHT / 2 - 7, '▲', { ...TEXT_STYLE, fontSize: 8 })
                .setOrigin(0.5);
            const down = this.add.text(x, h / 2 + DIGIT_BOX_HEIGHT / 2 + 7, '▼', { ...TEXT_STYLE, fontSize: 8 })
                .setOrigin(0.5);

            box.setInteractive({ useHandCursor: true });
            box.on('pointerdown', () => this.chooseDigit(i));
            up.setInteractive({ useHandCursor: true });
            up.on('pointerdown', () => { this.chooseDigit(i); this.changeDigit(1); });
            down.setInteractive({ useHandCursor: true });
            down.on('pointerdown', () => { this.chooseDigit(i); this.changeDigit(-1); });

            ui.add([ box, text, up, down ]);
            digits.push({ box, text, up, down });
        }

        // Hints at the bottom left: (q) Quemah  (w) Ximocuepa. The circles can be clicked.
        const hintY = h - 14;
        [ [ 'q', menuText.buttons.confirm ], [ 'w', menuText.buttons.back ] ].forEach(([ letter, label ], i) => {
            const circleX = 18 + i * 80;
            const circle = this.add.circle(circleX, hintY, 10, COLOR_EMPTY).setStrokeStyle(1, 0xffffff);
            const letterText = this.add.text(circleX, hintY, letter, TEXT_STYLE).setOrigin(0.5);
            const labelText = this.add.text(circleX + 16, hintY, '', TEXT_STYLE).setOrigin(0, 0.5);
            this.makeGlossable(labelText);
            this.setGlossLabel(labelText, label);
            circle.setInteractive({ useHandCursor: true });
            circle.on('pointerdown', () => this.finishDigits(letter === 'q'));
            ui.add([ circle, letterText, labelText ]);
        });

        this.digitEntry = { ui, digits, values: [ 0, 0, 0 ], chosen: 0, onDone };
        this.mode = 'digits';
        this.qweButtons.setVisible(false);
        this.showDigits();
    }

    // Shows the three digits, and which one is chosen (colored box, arrows only there).
    showDigits ()
    {
        const entry = this.digitEntry;
        entry.digits.forEach((digit, i) => {
            const chosen = i === entry.chosen;
            digit.text.setText(String(entry.values[i]));
            digit.box.setFillStyle(chosen ? COLOR_USED : COLOR_EMPTY);
            digit.up.setVisible(chosen);
            digit.down.setVisible(chosen);
        });
    }

    // Chooses digit number i (0 = left, 2 = right).
    chooseDigit (i)
    {
        if (this.mode !== 'digits')
        {
            return;
        }
        this.digitEntry.chosen = i;
        this.showDigits();
    }

    // Makes the chosen digit 1 bigger (step 1) or 1 smaller (step -1), going around.
    // The leftmost digit goes from 0 to DIGIT_FIRST_MAX, the others from 0 to 9.
    changeDigit (step)
    {
        if (this.mode !== 'digits')
        {
            return;
        }
        const entry = this.digitEntry;
        const count = (entry.chosen === 0 ? DIGIT_FIRST_MAX : 9) + 1;
        entry.values[entry.chosen] = (entry.values[entry.chosen] + step + count) % count;
        this.showDigits();
    }

    // A key press while entering a number (see openDigits).
    handleDigitKey (event)
    {
        const entry = this.digitEntry;
        const key = event.key.toLowerCase();

        if (key === 'arrowleft' || key === 'arrowright')
        {
            const step = key === 'arrowleft' ? -1 : 1;
            this.chooseDigit(Math.min(Math.max(entry.chosen + step, 0), 2));
        }
        else if (key === 'arrowup' || key === 'arrowdown')
        {
            this.changeDigit(key === 'arrowup' ? 1 : -1);
        }
        else if (/^[0-9]$/.test(key))
        {
            // The new digit comes in from the right, the others move left.
            // Not possible if the leftmost digit would get too big.
            const moved = [ entry.values[1], entry.values[2], Number(key) ];
            if (moved[0] <= DIGIT_FIRST_MAX)
            {
                entry.values = moved;
                this.showDigits();
            }
        }
        else if (key === 'backspace')
        {
            // The last digit goes away, the others move right; a 0 comes in on the left.
            entry.values = [ 0, entry.values[0], entry.values[1] ];
            this.showDigits();
        }
        else if (key === 'q' || key === 'enter')
        {
            this.finishDigits(true);
        }
        else if (key === 'w')
        {
            this.finishDigits(false);
        }
    }

    // Closes the number entry. done = true: the entered number is given to onDone;
    // false (w): onDone gets null.
    finishDigits (done)
    {
        if (this.mode !== 'digits')
        {
            return;
        }
        const entry = this.digitEntry;
        const number = entry.values[0] * 100 + entry.values[1] * 10 + entry.values[2];

        entry.ui.destroy();
        this.digitEntry = null;
        this.mode = 'play';
        this.qweButtons.setVisible(true);

        entry.onDone(done ? number : null);
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
    // 2. Picking an amount: up/down = 1 more/less (down at 1 jumps to the most,
    //                       up at the most jumps to 1), right/left = 10 more/less,
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
                if (key === 'arrowdown' && this.tradeCount === 1)
                {
                    // Down at 1 jumps to the most you can buy/sell.
                    this.tradeCount = this.tradeMax;
                }
                else if (key === 'arrowup' && this.tradeCount === this.tradeMax)
                {
                    // Up at the most you can buy/sell jumps back to 1.
                    this.tradeCount = 1;
                }
                else
                {
                    // Never below 1, never more than you can buy/sell.
                    this.tradeCount = Math.min(Math.max(this.tradeCount + steps[key], 1), this.tradeMax);
                }
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
    // then show e.g. "Oticcouh ce michin." or "Otiquinnamac 10 mimichtin." under the list.
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
            template = count === 1 ? menuText.messages.boughtOne : menuText.messages.boughtMany;
        }
        else
        {
            done = room.sellItem(item.id, item.sellPrice, count);
            template = count === 1 ? menuText.messages.soldOne : menuText.messages.soldMany;
        }

        this.stopPickingAmount();
        this.fillTradeLines();

        const message = [ done ? this.fillTemplate(template, count, item) : menuText.messages.notEnoughCacao ];

        // Just sold the last thing: also say that the bag is empty now (on a new line).
        if (this.tradeKind === 'sell' && this.tradeEntries().length === 0)
        {
            message.push(menuText.messages.bagEmpty);
        }

        this.setSentence(this.tradeMessage, message);
    }

    // Fills in the gaps of a buy/sell message from src/data/menu.json:
    //   { "slot": "count" } = the number, in digits (it has no gloss)
    //   { "slot": "item" }  = the item's name from src/data/items.json: "name" for one,
    //                         "plural" for more than one; "end" is added after it (e.g. ".").
    //                         In the middle of the sentence its first letter is small (Michin -> michin).
    // The other words stay as they are.
    fillTemplate (template, count, item)
    {
        const words = template.words.map((word) => {
            if (word.slot === 'count')
            {
                return { nah: String(count), en: null };
            }
            if (word.slot === 'item')
            {
                const name = count === 1 ? item.name : (item.plural ?? item.name);
                const end = word.end ?? '';
                const small = (text) => text.charAt(0).toLowerCase() + text.slice(1);
                return { nah: small(nahuatl(name)) + end, en: small(english(name)) + end };
            }
            return word;
        });

        return { words };
    }

    // ---------- Dialogue (Ihtoa) ----------

    // Called by the room when the player talks to an NPC: shows what the NPC says.
    // While the box is open, the player can't walk, use powers or open the menu.
    // text = what the NPC says, as { nah: ..., en: ... } (from src/data/npcs.json or menu.json).
    // afterClose (optional) = what should happen when the box is closed,
    // e.g. opening the shop window after the merchant has asked what you want.
    // canQuit (optional) = true for a line of a long dialogue: then w (or clicking the w circle)
    // leaves the whole dialogue early, and afterClose does NOT happen. q goes on as usual.
    openDialogue (text, afterClose = null, canQuit = false)
    {
        this.removeOptions();
        this.mode = 'dialogue';
        this.resetGlossTexts('dialogue');
        this.setSentence(this.dialogueText, text);
        this.dialogue.setVisible(true);
        this.qweButtons.setVisible(false);
        this.dialogueAfterClose = afterClose;

        // A normal line: advance symbol, only "(q) Quemah".
        // A line of a long dialogue: also "(w) Xictzacua" to leave early.
        this.dialogueQuestion = null;
        this.dialogueCanQuit = canQuit;
        this.dialogueAdvance.forEach((thing) => thing.setVisible(true));
        this.dialogueNo.forEach((thing) => thing.setVisible(canQuit));
        this.setGlossLabel(this.dialogueNoLabel, menuText.buttons.close);
    }

    // Like openDialogue, but the NPC asks a yes/no question.
    // The box shows "(q) Quemah  (w) Ahmo" and no advance symbol.
    // onYes / onNo = what happens after the player answered (the box is closed first).
    openQuestion (text, onYes, onNo)
    {
        this.openDialogue(text);
        this.dialogueQuestion = { onYes, onNo };
        this.dialogueAdvance.forEach((thing) => thing.setVisible(false));
        this.dialogueNo.forEach((thing) => thing.setVisible(true));
        this.setGlossLabel(this.dialogueNoLabel, menuText.buttons.no);
    }

    // The player chooses what to say: the dialogue box shows a list of options
    // (at most 2 fit), one per line, the chosen one with a colored bar behind it.
    // up/down = choose, q (or clicking a line, or the q circle) = say it, w = leave.
    // Each line has a gloss button at its right end, like in the menu.
    // options = [ { label: { nah, en }, action } ]; action = what happens when it's chosen.
    openOptions (options)
    {
        this.openDialogue(null, null, true);
        this.dialogueAdvance.forEach((thing) => thing.setVisible(false));

        const w = this.scale.width;
        const h = this.scale.height;
        const left = 48;
        const top = h - 52 - 22 + 4;          // the dialogue box's top is at h - 74
        const barWidth = w - 80 - 8;          // the box is w - 80 wide

        const container = this.add.container(0, 0);
        const highlight = this.add.rectangle(left - 4, top - 1, barWidth, LINE_HEIGHT - 1, COLOR_USED)
            .setOrigin(0, 0);
        container.add(highlight);

        options.forEach((option, i) => {
            const lineTop = top + i * LINE_HEIGHT;
            const line = this.add.text(left, lineTop, nahuatl(option.label), TEXT_STYLE);
            line.setInteractive({
                hitArea: new Geom.Rectangle(-4, -1, barWidth - GLOSS_SPACE, LINE_HEIGHT - 1),
                hitAreaCallback: Geom.Rectangle.Contains,
                useHandCursor: true
            });
            line.on('pointerdown', () => this.chooseOption(i));
            container.add(line);

            // Gloss button at the right end of the line.
            if (hasGloss(option.label))
            {
                const glossX = left - 4 + barWidth - GLOSS_SPACE / 2;
                const y = lineTop + LINE_HEIGHT / 2 - 1;
                const box = this.add.rectangle(glossX, y, GLOSS_SIZE, GLOSS_SIZE, COLOR_EMPTY)
                    .setStrokeStyle(1, 0xffffff);
                const sign = this.add.text(glossX, y, '?', { ...TEXT_STYLE, fontSize: 9 }).setOrigin(0.5);
                const gloss = { line, label: option.label, english: false, box };
                box.setInteractive({ useHandCursor: true });
                box.on('pointerdown', () => this.clickGloss(gloss, () => this.optionList !== null));
                const button = this.add.container(0, 0, [ box, sign ]);
                button.setVisible(getAuxLanguage(this) === 'en');
                container.add(button);
            }
        });

        this.dialogue.add(container);
        this.optionList = { container, highlight, options, chosen: 0, top };
    }

    // Moves the colored bar to option number i.
    markOption (i)
    {
        const list = this.optionList;
        list.chosen = i;
        list.highlight.y = list.top - 1 + i * LINE_HEIGHT;
    }

    // Says option number i: the box closes, then the option's action happens.
    chooseOption (i)
    {
        if (this.mode !== 'dialogue' || !this.optionList)
        {
            return;
        }

        const action = this.optionList.options[i].action;
        this.removeOptions();
        this.dialogueAfterClose = action;
        this.closeDialogue();
    }

    // Takes the option list away (if there is one).
    removeOptions ()
    {
        if (this.optionList)
        {
            this.optionList.container.destroy();
            this.optionList = null;
        }
    }

    // Leaves a long dialogue early (w): closes the box without going on to the next line.
    quitDialogue ()
    {
        if (this.mode !== 'dialogue' || !this.dialogueCanQuit)
        {
            return;
        }

        this.dialogueAfterClose = null;
        this.closeDialogue();
    }

    // The player answered the question: yes = true (q), no = false (w).
    // Closes the box, then does what was given for that answer.
    answerQuestion (yes)
    {
        const question = this.dialogueQuestion;
        if (this.mode !== 'dialogue' || !question)
        {
            return;
        }

        this.dialogueQuestion = null;
        this.dialogueAfterClose = yes ? question.onYes : question.onNo;
        this.closeDialogue();
    }

    // q, w (or a click on the advance symbol) closes the dialogue box.
    closeDialogue ()
    {
        if (this.mode !== 'dialogue')
        {
            return;
        }

        this.removeOptions();
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

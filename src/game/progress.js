// Keeps track of how well the player knows each word: how often it was answered right
// and how often wrong, in any minigame (for now only fishing).
//
// There are two counts for every word:
//   saved   = everything since the save file was started. Goes into the save file.
//   session = only since the game was opened (or a save file was loaded). Not saved.
//
// The counts are kept under the word itself (e.g. "Chichiltic"), not under the minigame,
// so that later minigames can count toward the same numbers.
// Example: { "Chichiltic": { "right": 3, "wrong": 1 }, "Iztac": { "right": 1, "wrong": 0 } }

// Makes a new progress record.
// saved = the "wordStats" part of a save file, or nothing for a new game.
// Anything strange in it (not a whole number, below 0, ...) is left out.
export function createProgress (saved)
{
    const progress = { saved: {}, session: {} };

    if (saved !== null && typeof saved === 'object')
    {
        Object.entries(saved).forEach(([ word, counts ]) => {
            if (counts !== null && typeof counts === 'object')
            {
                progress.saved[word] = {
                    right: goodNumber(counts.right),
                    wrong: goodNumber(counts.wrong)
                };
            }
        });
    }

    return progress;
}

// Counts one answer for a word: right = true or false.
export function recordAnswer (progress, word, right)
{
    [ progress.saved, progress.session ].forEach((counts) => {
        if (!counts[word])
        {
            counts[word] = { right: 0, wrong: 0 };
        }
        counts[word][right ? 'right' : 'wrong'] += 1;
    });
}

// How often a word was answered right.
// which = 'saved' (whole save file) or 'session' (only since the game was opened).
export function timesRight (progress, word, which)
{
    const counts = progress[which][word];
    return counts ? counts.right : 0;
}

// A copy of the saved counts, for the save file.
export function savedProgress (progress)
{
    const copy = {};
    Object.entries(progress.saved).forEach(([ word, counts ]) => {
        copy[word] = { ...counts };
    });
    return copy;
}

// A whole number of 0 or more, or 0 if it's anything else.
function goodNumber (n)
{
    return Number.isInteger(n) && n >= 0 ? n : 0;
}

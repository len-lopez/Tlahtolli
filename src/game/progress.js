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
//
// There is also a list of words that need a reminder: words the player just got wrong in a
// hard minigame, so the next time one of them comes up, an easy minigame is shown instead.
// Only for this session; not saved.

// Makes a new progress record.
// saved = the "wordStats" part of a save file, or nothing for a new game.
// Anything strange in it (not a whole number, below 0, ...) is left out.
export function createProgress (saved)
{
    const progress = { saved: {}, session: {}, remind: {} };

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

// Marks a word as needing a reminder (see the top of this file), or takes the mark away.
export function setReminder (progress, word, needed)
{
    if (needed)
    {
        progress.remind[word] = true;
    }
    else
    {
        delete progress.remind[word];
    }
}

// Does this word need a reminder?
export function needsReminder (progress, word)
{
    return progress.remind[word] === true;
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

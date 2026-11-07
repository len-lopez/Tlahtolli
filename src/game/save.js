// Everything about save files happens in this file.
// A save file is a small text file (JSON) that the player downloads and can upload again later.

// Goes up by one whenever the contents of a save file change,
// so that older save files can still be read later.
// Version 1: room only. Version 2: room and life points.
const SAVE_VERSION = 2;

// Makes the contents of a new save file.
// state = what the game wants to remember:
//   room = the room the player is in (0 = room 1, 1 = room 2)
//   life = how many life points (Yollotl) the player has left
// More things (beans, bag, words, ...) will be added here later.
export function createSave (state)
{
    return {
        game: 'tlahtolli',
        version: SAVE_VERSION,
        savedAt: new Date().toISOString(),
        room: state.room,
        life: state.life
    };
}

// Lets the browser download the save as a file,
// e.g. "tlahtolli-save-2026-11-07-1305.json".
export function downloadSave (save)
{
    const text = JSON.stringify(save, null, 2);
    const file = new Blob([ text ], { type: 'application/json' });
    const address = URL.createObjectURL(file);

    // An invisible download link that is clicked once and removed again.
    const link = document.createElement('a');
    link.href = address;
    link.download = saveFileName();
    document.body.appendChild(link);
    link.click();
    link.remove();

    // Give the browser a moment to start the download, then free the memory.
    setTimeout(() => URL.revokeObjectURL(address), 1000);
}

// Opens the browser's "choose a file" window.
// onLoaded(save) is called with the contents if the file is a Tlahtolli save.
// onError() is called if it isn't (or can't be read).
// If the player closes the window without choosing a file, nothing happens.
export function pickSaveFile (onLoaded, onError)
{
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';

    input.addEventListener('change', async () => {
        const file = input.files[0];
        if (!file)
        {
            return;
        }

        try
        {
            const save = JSON.parse(await file.text());
            if (isValidSave(save))
            {
                onLoaded(save);
            }
            else
            {
                onError();
            }
        }
        catch
        {
            // Not a text file in JSON format at all.
            onError();
        }
    });

    input.click();
}

// Checks that a file really is a Tlahtolli save that this version of the game can read.
function isValidSave (save)
{
    return save !== null
        && typeof save === 'object'
        && save.game === 'tlahtolli'
        && Number.isInteger(save.version)
        && save.version >= 1
        && save.version <= SAVE_VERSION;
}

// The name of the downloaded file, with the date and time in it,
// so several save files don't get mixed up.
function saveFileName ()
{
    const now = new Date();
    const two = (n) => String(n).padStart(2, '0');

    return 'tlahtolli-save-'
        + now.getFullYear() + '-' + two(now.getMonth() + 1) + '-' + two(now.getDate())
        + '-' + two(now.getHours()) + two(now.getMinutes())
        + '.json';
}

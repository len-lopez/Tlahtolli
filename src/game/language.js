// Every text in src/data/ has two versions:
// { "nah": "Nahuatl version", "en": "English version" }.
// A sentence that is glossed word by word is a list of such words instead:
// { "words": [ { "nah": "Atle", "en": "Nothing" }, { "nah": "nican.", "en": "here." } ] }
// These helpers pick one of the versions.

// The Nahuatl version. If there is none yet ("nah": null), the English one is shown instead.
export function nahuatl (text)
{
    if (text.words)
    {
        return text.words.map(nahuatl).join(' ');
    }
    return text.nah ?? text.en;
}

// The English version (the gloss).
export function english (text)
{
    if (text.words)
    {
        return text.words.map(english).join(' ');
    }
    return text.en ?? text.nah;
}

// True if a text has both versions, so it can be switched between them.
export function hasGloss (text)
{
    return text !== null && text.nah != null && text.en != null;
}

// The auxiliary language chosen in Settings: 'en' (English) or null (none).
// It is kept in the game's registry, so it stays the same when the room or the
// overlay is restarted (e.g. after loading a save file).
// At the start of the game there is no auxiliary language.
export function getAuxLanguage (scene)
{
    return scene.registry.get('auxLanguage') ?? null;
}

export function setAuxLanguage (scene, language)
{
    scene.registry.set('auxLanguage', language);
}

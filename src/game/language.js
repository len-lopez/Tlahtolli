// Every text in src/data/menu.json has two versions:
// { "nah": "Nahuatl version", "en": "English version" }.
// These helpers pick one of them.

// The Nahuatl version. If there is none yet ("nah": null), the English one is shown instead.
export function nahuatl (text)
{
    return text.nah ?? text.en;
}

// The English version (the gloss).
export function english (text)
{
    return text.en ?? text.nah;
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

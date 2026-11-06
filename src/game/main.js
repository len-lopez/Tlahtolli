import { TestRoom } from './scenes/TestRoom';
import { Overlay } from './scenes/Overlay';
import { AUTO, Scale, Game } from 'phaser';

// Find out more information about the Game Config at:
// https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig
const config = {
    type: AUTO,
    // Wide 16:9 screen, 32 x 18 tiles of 16 pixels.
    // It's scaled up to fit the browser window.
    width: 512,
    height: 288,
    parent: 'game-container',
    backgroundColor: '#87a9c4',
    pixelArt: true, // keeps pixels sharp instead of blurry when scaled up
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { x: 0, y: 600 }
        }
    },
    scale: {
        mode: Scale.FIT,
        autoCenter: Scale.CENTER_BOTH
    },
    scene: [
        TestRoom,
        Overlay
    ]
};

const StartGame = (parent) => {
    return new Game({ ...config, parent });
}

export default StartGame;

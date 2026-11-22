# Set the Clock

A small learning game for Kindergarten to Grade 2. A voice asks the child to **"Set the clock to …"** a time, the child drags the clock hands, and the game checks the time automatically when a hand is let go. It is built with plain HTML, CSS and JavaScript so it can be embedded in **Articulate Storyline 360 as a Web Object**.

## How it plays

1. **Start.** A white screen with the start button (300 px). Tapping it starts the game and the first question.
2. **Listen.** The game says "Set the clock to 5 o'clock" or "Set the clock to 6 … 30". Tap the purple speaker to hear it again.
3. **Move the hands.** Drag the **red (hour)** or **blue (minute)** hand. The hands are linked like a real clock: moving one moves the other, and the digital display shows the time live. When you let go, the time snaps to the nearest 5 minutes.
4. **Automatic check.** Every time a hand is let go, the game compares the clock with the question.
   - Right time: a green tick and a happy chime, then the next question.
   - Any other time: nothing happens, so the child can keep adjusting without being told off.
5. **Finish.** After 10 questions, "Great job!" appears with a Play again button that starts a new random set.

The screen matches the reference image: there is no submit button and no score bar.

**Question rules:** 10 random questions. No time is repeated, the same hour never comes twice in a row, and two "o'clock" questions never come in a row, so the clock is never already showing the answer. 11 o'clock is never asked, because no `11 o'clock` recording was provided (11:05, 11:30 and so on are still used).

## How to open it

- **Quickest:** double-click `index.html`. It works offline in Chrome, Edge, Safari and Firefox.
- **Local web server (optional):** `npx serve .` or `python3 -m http.server`, then open the address it prints.
- **Storyline 360:** see [STORYLINE.md](STORYLINE.md).

The game is designed for a **720 × 540** frame and scales to fit any screen (desktop, tablet, phone), keeping its 4:3 shape.

## Files

```
index.html                 page structure (stage, start and end screens)
css/style.css              layout, 720x540 stage, animations
js/game.js                 game logic: hands, digital display, questions, audio, feedback
assets/images/
  background.jpg           the reference image with the hands and "4:00" removed
  hand-hour.png            red hand, cut from the reference image
  hand-minute.png          blue hand, cut from the reference image
  center-cap.png           green centre cap (sits above the hands)
  start.png                provided start button (unchanged)
assets/audio/              provided voice clips (unchanged; renamed without spaces)
  set-the-clock-to.mp3, hours/1-12.mp3, minutes/05-55.mp3, oclock/1-12.mp3 (no 11)
tools/extract_assets.py    one-off script used to cut the hands out of the reference image
package.json               only used to host a preview (e.g. Railway); not needed by the game
```

## Notes

- **No frameworks, no build step and no network requests.** Every path is relative.
- **The hands are the original artwork,** cut out of the reference image so they look exactly the same. The gaps they left were filled with the clock-face colour, and the display frame corner under the hour-hand tip was rebuilt by mirroring its other side.
- **The "correct" chime is generated in the browser** (Web Audio), because no feedback sounds were provided.
- **Touch, mouse and keyboard all work.** With the keyboard: Tab to a hand and use the arrow keys to move it; the answer is checked after each move.

## Tools used

HTML5, CSS3 and vanilla JavaScript. Python (Pillow, NumPy, SciPy) was used once to cut out the hands. The game was tested with headless Chrome (Puppeteer) at 720×540, desktop, tablet and phone sizes, with mouse and touch input.

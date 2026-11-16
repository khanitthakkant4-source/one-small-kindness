# One Small Kindness (web)

A working web version of the One Small Kindness hi-fi design: 9 screens at 390×844 that you can use from start to finish through a link.

It is a static site (`index.html`, `styles.css`, `app.js` and `assets/`) with no build step and no dependencies. The whole site is about 460 KB and uses the Prompt font from Google Fonts. Progress is saved in the browser's `localStorage`, and points and Care Days count once per day.

## Flow

1. Welcome
2. Choose an activity
3. Do the activity (1-minute timer)
4. Water the plant
5. Receive +10 Care Points
6. Reflection (optional)
7. Personalized card
8. Done for today

### Activity screen

The timer runs to the end once started, since the activity only takes a minute. While it runs, the main button is locked and "เปลี่ยนกิจกรรม" still works.

Each of the 6 activities has its own animation, which plays while the timer runs:

| Activity | Animation |
|---|---|
| Drink water | Mooca sips from the glass, and the water level drops until the time is up |
| Stretch | Mooca sways side to side |
| Rest eyes | Mooca pulls the mask down over the eyes |
| Breathe | The body grows and shrinks on an 8-second cycle that matches the breathing text |
| Kind words | The heart beats and small hearts float up |
| Sit & rest | Steam rises from the mug |

Mooca's head also tilts gently on every screen, at all times. Characters, the pot and the watering can stand on the center of the rug at any screen size (`seat()` in `app.js`).

## Edge cases

| Situation | What happens |
|---|---|
| Continue without choosing an activity | A hint appears above the button, the cards shake, and focus moves to the choices |
| Not ready yet ("ไว้ทีหลัง") | A "ไว้ค่อยกลับมานะ" page; the user can come back any time |
| Can't do the chosen activity | "เปลี่ยนกิจกรรม" resets the timer |
| Can't drag the watering can | Tap the can or the button instead |
| Activity finished but plant not watered, then the app is closed | The next visit offers "รดน้ำต้นไม้ของคุณ" so the user picks up where they left off |
| Save failed | A "ลองใหม่" button; points are never counted twice |
| Already done today | Shows existing progress; the user can do more but gets no extra points |
| Skip reflection | Generic encouragement card |
| Feeling worse | An empathetic message plus help options (ooca, mental health hotline 1323) |
| Away for several days | The plant doesn't wilt, points don't drop, and a welcome-back message shows |
| 7 Care Days | Full Bloom; the plant goes into the garden and a new cycle starts the next day |
| Browser or phone back button | Goes to the previous screen instead of leaving the site, and never repeats a step that has already been saved |

## Phone mockup

On a screen at least 600px wide and 600px tall, the app appears inside an iPhone 18 Pro Max frame at real proportions. The screen is 440×956 pt (6.9", 2868×1320 px at 3×) and the body is 78 × 163.4 mm, which works out to 470×986 pt. The screen corners have a 62 pt radius, and the Dynamic Island is 84×36 pt, the smaller version on the 18 Pro series. The frame includes the Action button, volume buttons, side button and Camera Control.

The phone is drawn at true point size and scaled to fit the window. On a real phone, including in landscape, the frame disappears and the app fills the screen.

## Tester panel

On desktop the panel sits to the right of the phone. On mobile, add `?demo` to the URL and a "ทดสอบ" button appears.

From the panel you can speed the timer up to 6 seconds, skip to the next day, simulate being away for 3 days, simulate 6 days already done (to see Full Bloom), simulate a failed save, or clear all data.

## Deploy

Pick one:

- Netlify Drop: open app.netlify.com/drop and drag this folder in. You get a link right away.
- Vercel: run `npx vercel` inside this folder.
- GitHub Pages: push to a repository, then go to Settings → Pages → Deploy from branch.

Opening `index.html` directly also works, because the site doesn't load any files through JS.

## Run locally

```bash
python -m http.server 5178
```

Then open http://localhost:5178

## Where the images come from

All illustrations are vectors cut from the Figma export (`1. แนวคิดและการออกแบบ2.svg`), so they match the design:

```bash
python -I tools/welcome_hero.py "<path to deck .svg>"    # welcome hero (assets/mooca-welcome.svg)
python -I tools/build_assets.py "<path to deck .svg>"    # icons, moods, plants, background + assets/heroes.js
python -P tools/build_inline.py                          # animated activity scenes → assets/inline.js (from mooca-activities/build.py)
```

`heroes.js` holds the welcome, peek and summary characters as inline SVG. Mooca's head is a separate layer (`.m-head`) so it can move, the plant in the pot changes with the Care Day stage, and Mooca's shadow is drawn under the pot.

## Colors

All colors match the Figma file, as the brief requires. Some text colors fall short of WCAG 2.2 AA contrast. To adjust them later, change the tokens at the top of `styles.css`:

| Element | Figma (in use) | Contrast | Value that passes AA |
|---|---|---|---|
| Teal heading | #00A28B | 2.8:1 | #008C7A (3.6:1, large text) |
| Text links | #00C4B3 | 2.0:1 | #007D6E (4.6:1) |
| Main button, white text | #00C4B3 | 2.2:1 | #009E91 + 19px bold (3.3:1) |

The app is light-only by design, because the illustrated room has no dark version.

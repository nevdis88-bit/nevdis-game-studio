# Field Goal Rush

A playable football mini-game demo with a responsive phone frame.

[Play the demo](https://nevdis88-bit.github.io/nevdis-game-studio/field-goal-rush/?demo=1&embed=1)

## Development

Requires Node.js 22.18 or later.

```sh
npm install
npm run dev
npm test
npm run build
```

The production build is written to `dist/`.

This is a frontend prototype. Coins and advertisements are simulated.

In demo mode, reloading starts fresh with 3 plays, 0 coins, and 0/100 daily progress. Extra plays, ad counters, bonus claims, and reward records reset; sound and music settings remain. Ad and invite tasks can still grant extra plays during the session.

The ball stands upright without a tee. A separate transparent boot sprite appears only when kicking, then fades out. The upper sock blends into the scene.

The phone presentation has no outer gutter or native-size limit. Use an embed aspect ratio of 414:868 (approximately 1:2.1) for an edge-to-edge frame with no distortion.

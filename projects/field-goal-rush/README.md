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

In demo mode, reloading restores 3 plays and resets the ad counter. Coins, daily reward progress, and settings are retained. Ad and invite tasks can still grant extra plays during the session.

The ball stands upright without a tee. A separate transparent boot sprite appears only when kicking, then fades out. The upper sock blends into the scene.

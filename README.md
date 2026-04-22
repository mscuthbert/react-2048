# React-2048: 2048 using React

This is my teach-myself to use React better project.

## Author

Michael Scott Asato Cuthbert
(michael.asato.cuthbert@gmail.com)

## Running the game

```bash
npm install      # install dependencies (only needed once)
npm start        # starts the dev server at http://localhost:3000
```

`npm start` runs webpack-dev-server with hot reloading — edit any source file
and the browser updates automatically without a full page reload.

To make a production build (minified, no source maps):

```bash
npm run build    # output goes to dist/
```

Then open `dist/index.html` in a browser, or serve it with any static file server.

## React vs Lit/Web Components: key differences

The main point of this repo is to compare React idioms to the web-components
version in `wc-2048/`. Each source file has inline comments explaining the
differences, but here are the big themes:

### State: `@property` vs `useState`

In Lit, `@property() score = 0` creates a reactive property — setting
`this.score = x` automatically schedules a re-render.

In React, `const [score, set_score] = useState(0)` gives you a read-only
value (`score`) and a setter (`set_score`). You never mutate `score` directly;
you call the setter and React re-renders.

### "Instance variables": class fields vs `useRef`

Lit components are class instances, so `this.tiles`, `this.last_touch` etc.
persist between renders as plain class fields.

In React, a component is a *function* that runs fresh on every render —
there are no instance fields. Use `useRef({ current: value })` for values that
should persist but not trigger re-renders (like animation guards, DOM refs,
or mirrors of state for async code).

### Lifecycle: `connectedCallback` vs `useEffect`

Lit:
```ts
connectedCallback() { document.addEventListener('keydown', this._handler); }
disconnectedCallback() { document.removeEventListener('keydown', this._handler); }
```

React:
```ts
useEffect(() => {
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);  // cleanup
}, []);  // [] = run once on mount
```

The returned cleanup function is React's `disconnectedCallback`.

### Child communication: custom events vs callback props

In Lit, `MOverlay` dispatched a bubbling custom event (`new Event('keep_going',
{bubbles:true, composed:true})`) and `MApp` listened at the document level.

In React, you just pass a callback as a prop:
```tsx
<GameMessage on_keep_going={keep_going} on_try_again={start_new_game} />
```
The child calls `props.on_keep_going()` directly. Simpler and type-safe.

### Styling: Shadow DOM vs global SCSS

Lit's Shadow DOM encapsulates each component's CSS — no leaking in or out.
That's why `MTile` had to query the DOM at render time to find its grid
position: it couldn't use CSS classes defined outside its shadow root.

React uses a single global stylesheet (`index.scss`). SASS loops pre-generate
all 16 tile-position classes (`tile_0_0` … `tile_3_3`) at build time, so
tiles just need a class name to be positioned — no DOM queries needed.

## Lessons learned

See `wc-2048` readme for lessons from that port. The main React lesson here:
async animation pipelines need refs (not state) to avoid stale closures —
see the comments in `src/app.tsx`.

/**
 * app.tsx — Main game component for React 2048
 *
 * ═══════════════════════════════════════════════════════════════════
 * REACT vs LIT/WEB COMPONENTS: Top-Level Architecture
 * ═══════════════════════════════════════════════════════════════════
 *
 * In Lit, the app is a CLASS that extends LitElement:
 *   @customElement('m-app')
 *   export class MApp extends LitElement { ... }
 *
 * Instance variables (this.tiles, this.score) persist across re-renders
 * as plain class properties. Methods can freely mutate them.
 *
 * In React, the app is a FUNCTION:
 *   export default function App() { ... }
 *
 * There are no "instance variables" — the function runs fresh on every
 * render. Persistent data lives in:
 *   - useState(): values that trigger re-renders when changed
 *   - useRef(): values that persist but do NOT trigger re-renders
 *
 * This distinction is critical for the animation pipeline below.
 * ═══════════════════════════════════════════════════════════════════
 */

import React, { useEffect, useCallback, useState, useRef } from 'react';
import choice from 'pick-random';

import { MGrid } from './grid';
import { GameMessage } from './overlay';
import { Scoreboard } from './scoreboard';
import { sleep, yx_to_index, index_to_yx } from './helpers';

// ─── Constants ───────────────────────────────────────────────────────────────

const DEBUG = false;
const debug_log = DEBUG ? console.log : () => {};

const STORAGE_KEY = 'react_2048';
const RANDOM_START_HIGH = 0.9;  // 90% chance of starting with 2 (vs 4)
const WINNING_VALUE = 2048;
const TRANSITION_SPEED = 100;   // ms — must match $transition_speed in index.scss

// ─── Keyboard mapping ────────────────────────────────────────────────────────

// Same in Lit and React: a plain object mapping key names to [y_shift, x_shift]
const shift_keys: Record<string, [number, number]> = {
    'ArrowLeft':  [0, -1],
    'ArrowRight': [0,  1],
    'ArrowUp':    [-1, 0],
    'ArrowDown':  [ 1, 0],
    'a': [0, -1],
    'd': [0,  1],
    'w': [-1, 0],
    's': [ 1, 0],
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface GridStatus {
    any_shifted: boolean;
    new_tile_positions: number[];                    // tile_id → grid position (-1 if removed)
    new_tile_values: number[];                       // tile_id → value (0 if removed)
    increased_value_tiles: Set<number>;              // tile_ids whose value doubled this move
    removed_tile_ids: number[];                      // tile_ids returning to the free pool
    removed_tile_slide_positions: Map<number, number>; // absorbed tile_id → where it slides before vanishing
    points_gained_this_move: number;
}

// What we persist to localStorage
interface StoredState {
    position_values: number[];  // value at each grid position (0 = empty), index = position
    score: number;
    best_score: number;
    show_game_won: boolean;
    game_won_already_shown: boolean;
    game_over: boolean;
}

// ─── Pure utility functions ───────────────────────────────────────────────────
// These are identical in purpose to helpers in wc-2048/src/app.ts.
// Because they don't touch the DOM or component state, they're just
// regular functions — same in Lit and React.

/**
 * Returns the iteration order for rows/cols when sliding in a direction.
 * e.g. sliding left: we process columns [1,2,3] (not 0) so each tile
 * tries to move into the column before it.
 */
function get_shift_iterators(y_shift: number, x_shift: number): [number[], number[]] {
    let y_iterate = [0, 1, 2, 3];
    let x_iterate = [0, 1, 2, 3];
    if (y_shift !== 0) {
        y_iterate = y_shift === -1 ? [1, 2, 3] : [2, 1, 0];
    } else {
        x_iterate = x_shift === -1 ? [1, 2, 3] : [2, 1, 0];
    }
    return [y_iterate, x_iterate];
}

/**
 * Invert tiles_to_positions: returns grid[position] = tile_id (-1 if empty).
 *
 * In wc-2048, the grid was a 2D array of MTile objects (or null).
 * Here it's a flat 16-element array of tile_ids (or -1).
 */
function make_grid(tiles_to_positions: number[]): number[] {
    const grid = new Array(16).fill(-1);
    for (let tile_id = 0; tile_id < 16; tile_id++) {
        const pos = tiles_to_positions[tile_id];
        if (pos !== -1) grid[pos] = tile_id;
    }
    return grid;
}

/** Invert make_grid: grid[position]=tile_id → positions[tile_id]=position */
function make_tile_positions(grid: number[]): number[] {
    const positions = new Array(16).fill(-1);
    for (let pos = 0; pos < 16; pos++) {
        const tile_id = grid[pos];
        if (tile_id !== -1) positions[tile_id] = pos;
    }
    return positions;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function App() {

    // ═══════════════════════════════════════════════════════════════════
    // STATE DECLARATION
    //
    // Lit:   @property({type: Number}) score: number = 0;
    //   → Setting `this.score = x` schedules a re-render automatically.
    //   → The value is readable anywhere as `this.score`.
    //
    // React: const [score, set_score] = useState<number>(0);
    //   → `score` is the value for THIS render (read-only).
    //   → `set_score(x)` schedules a re-render with the new value.
    //   → React BATCHES multiple setState calls in event handlers
    //     (React 18+), so calling set_score and set_best_score back-to-
    //     back only triggers one re-render.
    // ═══════════════════════════════════════════════════════════════════
    const [score, set_score]                         = useState(0);
    const [best_score, set_best_score]               = useState(0);
    const [score_add, set_score_add]                 = useState(0);  // the "+N" float animation value
    const [show_game_won, set_show_game_won]         = useState(false);
    const [game_won_already_shown, set_game_won_already_shown] = useState(false);
    const [game_over, set_game_over]                 = useState(false);
    const [touch_mode, set_touch_mode]               = useState(false);

    // ─── Tile state ──────────────────────────────────────────────────
    // In wc-2048, tiles were MTile DOM objects in a 2D array:
    //   this.tiles: MTile[][] (4×4, null for empty)
    //
    // Here we use three parallel flat arrays indexed by tile_id (0–15).
    // tile_id is a stable identity like an object reference:
    //   tiles_to_positions[tile_id] = grid position (0–15), or -1 if unused
    //   tile_values[tile_id]        = tile value (2, 4, 8…), or 0 if unused
    //   free_tiles                  = pool of tile_ids not currently on the board
    //
    // The separation of identity (tile_id) from position lets React's
    // reconciler keep the same DOM element as a tile slides around —
    // critical for CSS transition animations.
    const [tiles_to_positions, set_tiles_to_positions] = useState<number[]>(() => new Array(16).fill(-1));
    const [tile_values, set_tile_values]               = useState<number[]>(() => new Array(16).fill(0));
    const [free_tiles, set_free_tiles]                 = useState<number[]>(() => Array.from({length: 16}, (_, i) => i));
    const [pop_tiles, set_pop_tiles]                   = useState<boolean[]>(() => new Array(16).fill(false));

    // ═══════════════════════════════════════════════════════════════════
    // REFS — THE REACT EQUIVALENT OF INSTANCE VARIABLES
    //
    // Lit:   `this.last_touch_x_y`, `this.game_over` — plain class
    //        properties, readable anywhere, don't trigger re-renders.
    //
    // React: useRef({ current: value }) — mutable container that
    //        persists across renders WITHOUT triggering re-renders.
    //
    // We use refs in two ways here:
    //
    // 1. MIRRORS of useState values — so async animation code can
    //    always read the *current* value without stale-closure issues.
    //    (A closure captures the state value at the time the function
    //    was created; a ref always gives you the live value.)
    //
    // 2. MUTABLE NON-RENDER values — things like `is_animating` that
    //    control program flow but don't need to appear in the UI.
    // ═══════════════════════════════════════════════════════════════════

    // Mirrors of state — kept in sync by assigning at the top of the function body
    const tiles_to_positions_ref    = useRef(tiles_to_positions);
    const tile_values_ref           = useRef(tile_values);
    const free_tiles_ref            = useRef(free_tiles);
    const score_ref                 = useRef(score);
    const best_score_ref            = useRef(best_score);
    const show_game_won_ref         = useRef(show_game_won);
    const game_over_ref             = useRef(game_over);
    const game_won_already_shown_ref = useRef(game_won_already_shown);

    // Sync refs with state on every render (cheap assignment, not a hook)
    tiles_to_positions_ref.current     = tiles_to_positions;
    tile_values_ref.current            = tile_values;
    free_tiles_ref.current             = free_tiles;
    score_ref.current                  = score;
    best_score_ref.current             = best_score;
    show_game_won_ref.current          = show_game_won;
    game_over_ref.current              = game_over;
    game_won_already_shown_ref.current = game_won_already_shown;

    // Non-render instance variables
    const is_animating     = useRef(false);   // guards against overlapping shifts
    const last_touch_x_y   = useRef<[number, number]>([0, 0]);
    const score_add_timer  = useRef<number | null>(null);
    const initialized      = useRef(false);

    // DOM refs
    // In Lit: @query('.game-explanation') game_explanation: HTMLElement;
    // In React: const game_explanation = useRef<HTMLElement>(null);
    //   → passed as `ref={game_explanation}` on the JSX element
    const gameExplanation  = useRef<HTMLParagraphElement>(null);
    const gridHolder       = useRef<HTMLDivElement>(null);

    // ═══════════════════════════════════════════════════════════════════
    // PURE GAME LOGIC — compute_grid_after_shift
    //
    // In wc-2048 this was a method `compute_grid_after_shift` on MApp,
    // reading `this.tiles` directly.
    //
    // Here it's an inner function that takes explicit parameters.
    // This avoids stale-closure issues: we pass the current state
    // snapshot instead of relying on the closure capturing it.
    //
    // The algorithm is identical to the Lit version — bubble-sort style,
    // looping until no more tiles can move or merge in one pass.
    // ═══════════════════════════════════════════════════════════════════
    function compute_grid_after_shift(
        y_shift: number,
        x_shift: number,
        curr_values: number[],
        curr_positions: number[],
    ): GridStatus {
        const [y_iterate, x_iterate] = get_shift_iterators(y_shift, x_shift);

        // position → tile_id (working copy we mutate during the loop)
        const grid = make_grid(curr_positions);
        const new_tile_values = [...curr_values];

        // A tile being absorbed must first slide to the merge point.
        // We record its destination separately so it can animate there.
        const removed_tile_slide_positions = new Map<number, number>();
        const removed_tile_ids: number[] = [];

        // Track which tiles already merged this turn (no double-merging)
        const merged_already = new Set<number>();

        let any_shifted_ever = false;
        let any_shifted_this_iter = false;
        let first_run = true;
        let points_gained_this_move = 0;

        // Keep sweeping until nothing moves — handles chains like:
        //   [null, null, 2, 2] → (pass 1) [null, 2, null, 2] → (pass 2) [2, 2, null, null]
        //   → (pass 3) [4, null, null, null] (but merge is one step per pass)
        while (any_shifted_this_iter || first_run) {
            first_run = false;
            any_shifted_this_iter = false;
            for (const x of x_iterate) {
                for (const y of y_iterate) {
                    const prev_pos = yx_to_index(y + y_shift, x + x_shift);
                    const curr_pos = yx_to_index(y, x);
                    const prev_tile = grid[prev_pos];  // tile_id or -1
                    const this_tile = grid[curr_pos];  // tile_id or -1
                    if (this_tile === -1) continue;    // nothing here

                    if (prev_tile === -1) {
                        // Slide into empty space
                        any_shifted_this_iter = true;
                        any_shifted_ever = true;
                        grid[prev_pos] = this_tile;
                        grid[curr_pos] = -1;

                    } else if (
                        new_tile_values[prev_tile] === new_tile_values[this_tile]
                        && !merged_already.has(prev_tile)
                    ) {
                        // Merge: prev_tile is absorbed into this_tile
                        // prev_tile slides to prev_pos then disappears,
                        // this_tile inherits the doubled value.
                        any_shifted_this_iter = true;
                        any_shifted_ever = true;
                        grid[prev_pos] = this_tile;
                        grid[curr_pos] = -1;

                        removed_tile_slide_positions.set(prev_tile, prev_pos);
                        removed_tile_ids.push(prev_tile);
                        merged_already.add(this_tile);

                        const absorbed_val = new_tile_values[prev_tile];
                        new_tile_values[this_tile] += absorbed_val;
                        points_gained_this_move += absorbed_val;
                        new_tile_values[prev_tile] = 0;
                    }
                    // otherwise: blocked by a tile with a different value
                }
            }
        }

        return {
            any_shifted: any_shifted_ever,
            new_tile_positions: make_tile_positions(grid),
            new_tile_values,
            increased_value_tiles: merged_already,
            removed_tile_ids,
            removed_tile_slide_positions,
            points_gained_this_move,
        };
    }

    // ═══════════════════════════════════════════════════════════════════
    // ANIMATION PIPELINE — perform_shift
    //
    // In wc-2048, shift_tiles() was an async method that could freely
    // `await sleep()` between state mutations because Lit batches
    // property changes and re-renders as microtasks:
    //
    //   async shift_tiles(y_shift, x_shift) {
    //     // set new positions → CSS transitions fire
    //     this.tiles = new_grid;
    //     for (const [t, y, x] of ...) { t.y = y; t.x = x; }
    //     await sleep(100);              // wait for slide animation
    //     for (const rem of tiles_to_remove) { rem.active = false; }
    //     for (const [t, val] of new_values) { t.val = val; ... }
    //   }
    //
    // In React, you can't `await` in the middle of a render cycle —
    // the render function has already returned. But you CAN `await`
    // inside an async function triggered by an event handler, as long
    // as you call setState (not read state) after the awaits.
    //
    // The trick: read all current state from refs ONCE at the top
    // (avoiding stale closures), compute everything upfront, then
    // apply state changes with sleeps between phases.
    //
    // Also: we guard with `is_animating` ref to prevent a second
    // keypress from starting a new shift mid-animation.
    // ═══════════════════════════════════════════════════════════════════
    async function perform_shift(y_shift: number, x_shift: number): Promise<void> {
        if (is_animating.current) return;
        if (game_over_ref.current || show_game_won_ref.current) return;

        // Snapshot current state via refs (not the useState values,
        // which could be stale if called from a memoized event handler)
        const curr_positions = tiles_to_positions_ref.current;
        const curr_values    = tile_values_ref.current;
        const curr_free      = free_tiles_ref.current;

        const result = compute_grid_after_shift(y_shift, x_shift, curr_values, curr_positions);
        if (!result.any_shifted) return;

        is_animating.current = true;

        // ── Phase 1: Slide ──────────────────────────────────────────
        // Move all tiles toward their destinations in one batch.
        // Tiles being absorbed also slide to the merge point — they
        // need to visually travel there before disappearing.
        //
        // In Lit: directly mutate t.y, t.x on each MTile element;
        //   CSS `transition: all 100ms` handles the animation.
        // In React: set state → React re-renders → new CSS class
        //   (e.g. tile_2_3) → CSS transitions fire.
        const slide_positions = [...result.new_tile_positions];
        for (const [absorbed_id, dest_pos] of result.removed_tile_slide_positions) {
            slide_positions[absorbed_id] = dest_pos;
        }
        set_tiles_to_positions(slide_positions);
        tiles_to_positions_ref.current = slide_positions;

        await sleep(TRANSITION_SPEED);

        // ── Phase 2: Finalize values, remove absorbed tiles ─────────
        // In Lit: set rem_tile.active = false; update_tile.val = new_val
        // In React: update state arrays; the Board component re-renders
        //   and tiles at position -1 get display:none from CSS.
        const new_free = [...curr_free, ...result.removed_tile_ids];
        set_tile_values(result.new_tile_values);
        set_tiles_to_positions(result.new_tile_positions);
        set_free_tiles(new_free);
        tile_values_ref.current            = result.new_tile_values;
        tiles_to_positions_ref.current     = result.new_tile_positions;
        free_tiles_ref.current             = new_free;

        // ── Phase 3: Pop animation on merged tiles ───────────────────
        // In Lit: tile.classList.add('pop'); setTimeout → classList.remove
        //   Direct DOM manipulation — fine in Lit because Shadow DOM is
        //   managed by Lit, and classList changes don't go through render.
        //
        // In React, we NEVER touch the DOM directly. Instead, we set
        // state that controls the className in JSX. React reconciles.
        const pop_arr = new Array(16).fill(false);
        for (const tile_id of result.increased_value_tiles) {
            pop_arr[tile_id] = true;
        }
        set_pop_tiles(pop_arr);

        await sleep(TRANSITION_SPEED);
        set_pop_tiles(new Array(16).fill(false));

        // ── Phase 4: Add new tile, update score, check end state ────
        // Pass the computed state explicitly to avoid stale closures.
        add_new_random_tile(result.new_tile_values, result.new_tile_positions, new_free);

        if (result.points_gained_this_move) {
            add_score(result.points_gained_this_move);
        }

        check_game_won(result.new_tile_values);

        // check_game_over needs the post-add state; we read refs because
        // add_new_random_tile updated them synchronously.
        check_game_over(tiles_to_positions_ref.current, tile_values_ref.current);

        store_state();
        is_animating.current = false;
    }

    // ─── Add a new random tile ────────────────────────────────────────
    // Equivalent to wc-2048's add_new_random_tile() + add_tile().
    // Takes explicit state to avoid stale closures (see note above).
    function add_new_random_tile(
        curr_values: number[],
        curr_positions: number[],
        curr_free: number[],
        count = 1,
    ): void {
        // Find empty grid positions
        const pos_to_tile = make_grid(curr_positions);
        const available: number[] = [];
        for (let pos = 0; pos < 16; pos++) {
            if (pos_to_tile[pos] === -1) available.push(pos);
        }

        const new_values    = [...curr_values];
        const new_positions = [...curr_positions];
        const new_free      = [...curr_free];

        for (let i = 0; i < count && available.length > 0 && new_free.length > 0; i++) {
            const pos    = choice(available)[0];
            available.splice(available.indexOf(pos), 1);
            const val     = Math.random() < RANDOM_START_HIGH ? 2 : 4;
            const tile_id = new_free.pop()!;
            new_positions[tile_id] = pos;
            new_values[tile_id]    = val;
            debug_log(`add tile ${tile_id} at pos ${pos} val ${val}`);
        }

        set_tile_values(new_values);
        set_tiles_to_positions(new_positions);
        set_free_tiles(new_free);
        // Keep refs in sync for next async operation
        tile_values_ref.current        = new_values;
        tiles_to_positions_ref.current = new_positions;
        free_tiles_ref.current         = new_free;
    }

    // ─── Score ────────────────────────────────────────────────────────
    // In Lit: this.score += val; this.scoreboard.set_score(this.score)
    //   → Directly called set_score() on the child component.
    //
    // In React: we call set_score() and pass score/score_add as props.
    //   The Scoreboard component is "controlled" — its display is entirely
    //   determined by props, not internal state. The parent (App) owns the data.
    //   This is the React "lifting state up" pattern.
    function add_score(points: number): void {
        // We read from the ref (not the useState value) to avoid stale closures —
        // score_ref is kept in sync at the top of the render function.
        const new_score = score_ref.current + points;
        score_ref.current = new_score;
        set_score(new_score);
        if (new_score > best_score_ref.current) {
            best_score_ref.current = new_score;
            set_best_score(new_score);
        }

        // Show "+N" float animation on the scoreboard
        if (score_add_timer.current !== null) {
            clearTimeout(score_add_timer.current);
        }
        set_score_add(points);
        score_add_timer.current = window.setTimeout(() => {
            set_score_add(0);
            score_add_timer.current = null;
        }, 1200);
    }

    // ─── Win / lose detection ─────────────────────────────────────────
    function check_game_won(curr_values: number[]): void {
        if (game_won_already_shown_ref.current) return;
        if (curr_values.some(v => v === WINNING_VALUE)) {
            set_show_game_won(true);
            show_game_won_ref.current = true;
        }
    }

    function check_game_over(curr_positions: number[], curr_values: number[]): void {
        for (const [y_shift, x_shift] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
            const { any_shifted } = compute_grid_after_shift(y_shift, x_shift, curr_values, curr_positions);
            if (any_shifted) return;  // at least one move exists
        }
        set_game_over(true);
        game_over_ref.current = true;
    }

    // ─── New game ─────────────────────────────────────────────────────
    // In Lit:  prepare_for_new_game() mutates this.tiles, calls
    //          m_grid.remove_all_tiles(), then start_new_game() adds tiles.
    // In React: reset all state arrays. The Board component sees the
    //          empty tiles_to_positions and renders nothing (tiles have
    //          position -1 → display:none via CSS).
    function start_new_game(): void {
        is_animating.current = false;

        const empty_positions = new Array(16).fill(-1);
        const empty_values    = new Array(16).fill(0);
        const all_free        = Array.from({length: 16}, (_, i) => i);

        set_tiles_to_positions(empty_positions);
        set_tile_values(empty_values);
        set_free_tiles(all_free);
        set_pop_tiles(new Array(16).fill(false));
        set_score(0);
        set_score_add(0);
        set_game_over(false);
        set_show_game_won(false);
        set_game_won_already_shown(false);

        // Sync refs immediately so add_new_random_tile reads fresh state
        tiles_to_positions_ref.current     = empty_positions;
        tile_values_ref.current            = empty_values;
        free_tiles_ref.current             = all_free;
        score_ref.current                  = 0;
        game_over_ref.current              = false;
        show_game_won_ref.current          = false;
        game_won_already_shown_ref.current = false;

        add_new_random_tile(empty_values, empty_positions, all_free, 2);
    }

    function keep_going(): void {
        set_game_won_already_shown(true);
        set_show_game_won(false);
        game_won_already_shown_ref.current = true;
        show_game_won_ref.current          = false;
        store_state();
    }

    // ─── Persistence ──────────────────────────────────────────────────
    // In Lit: store_state() / load_state() used this.tiles (2D array).
    // Here we store a flat array: position_values[pos] = value (0=empty).
    // This is position-indexed, not tile_id-indexed, so it's stable.
    function store_state(): void {
        const curr_positions = tiles_to_positions_ref.current;
        const curr_values    = tile_values_ref.current;
        const pos_to_tile    = make_grid(curr_positions);
        const position_values = new Array(16).fill(0);
        for (let pos = 0; pos < 16; pos++) {
            const tid = pos_to_tile[pos];
            if (tid !== -1) position_values[pos] = curr_values[tid];
        }
        const state: StoredState = {
            position_values,
            score:                  score_ref.current,
            best_score:             best_score_ref.current,
            show_game_won:          show_game_won_ref.current,
            game_won_already_shown: game_won_already_shown_ref.current,
            game_over:              game_over_ref.current,
        };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function load_state(state: StoredState): void {
        const new_positions = new Array(16).fill(-1);
        const new_values    = new Array(16).fill(0);
        const new_free: number[] = [];
        let tile_id = 0;

        for (let pos = 0; pos < 16; pos++) {
            if (state.position_values[pos] !== 0) {
                new_positions[tile_id] = pos;
                new_values[tile_id]    = state.position_values[pos];
                tile_id++;
            }
        }
        // remaining tile_ids go into the free pool
        for (let i = tile_id; i < 16; i++) new_free.push(i);

        set_tiles_to_positions(new_positions);
        set_tile_values(new_values);
        set_free_tiles(new_free);
        set_score(state.score);
        set_best_score(state.best_score);
        set_show_game_won(state.show_game_won);
        set_game_won_already_shown(state.game_won_already_shown);
        set_game_over(state.game_over);

        tiles_to_positions_ref.current     = new_positions;
        tile_values_ref.current            = new_values;
        free_tiles_ref.current             = new_free;
        score_ref.current                  = state.score;
        best_score_ref.current             = state.best_score;
        show_game_won_ref.current          = state.show_game_won;
        game_won_already_shown_ref.current = state.game_won_already_shown;
        game_over_ref.current              = state.game_over;
    }

    // ═══════════════════════════════════════════════════════════════════
    // LIFECYCLE / EVENT LISTENERS
    //
    // Lit:  connectedCallback()    → add event listeners
    //       disconnectedCallback() → remove them
    //
    // React: useEffect(() => { ...; return cleanup; }, [deps])
    //   - The function body runs after the component mounts (and when
    //     deps change).
    //   - The returned cleanup function runs before the next effect
    //     fires, or when the component unmounts. Equivalent to
    //     disconnectedCallback.
    //   - `[]` dep array = run once on mount only (like connectedCallback).
    //
    // IMPORTANT: `perform_shift` uses refs internally, so it doesn't
    // need to be in the dep array — the closure always reads fresh data
    // via refs. Putting it in deps would cause a new listener to be
    // registered on every render (bad).
    // ═══════════════════════════════════════════════════════════════════

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const shift = shift_keys[e.key];
            if (!shift) return;
            e.preventDefault();
            perform_shift(...shift).catch(console.error);
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const handler = () => set_touch_mode(true);
        document.addEventListener('touchstart', handler, { passive: true });
        return () => document.removeEventListener('touchstart', handler);
    }, []);

    // ─── Initial load ─────────────────────────────────────────────────
    // In Lit: firstUpdated() → load_state() → start_new_game if empty
    // In React: useEffect with [] runs once after first render
    useEffect(() => {
        if (initialized.current) return;
        initialized.current = true;

        const state_str = window.localStorage.getItem(STORAGE_KEY);
        if (state_str) {
            try {
                const state: StoredState = JSON.parse(state_str);
                load_state(state);
                // Re-verify game_over in case the stored state was stale
                // (e.g. board is jammed but game_over was saved as false).
                // check_game_over reads from refs which load_state just synced.
                if (!state.game_over && !state.show_game_won) {
                    check_game_over(tiles_to_positions_ref.current, tile_values_ref.current);
                }
                return;
            } catch {
                // corrupted storage — fall through to new game
            }
        }
        start_new_game();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ─── Touch handlers ───────────────────────────────────────────────
    // In Lit: registered on m_grid element via addEventListener directly
    //         in setup_touch_events().
    // In React: passed as JSX props onTouchStart/onTouchMove/onTouchEnd.
    //   useCallback prevents re-creating the function on every render
    //   (not strictly necessary here since they use refs, but good practice).
    const handle_touch_start = useCallback((e: React.TouchEvent) => {
        if (game_over_ref.current || show_game_won_ref.current) return;
        const touch = e.changedTouches[0];
        last_touch_x_y.current = [touch.pageX, touch.pageY];
        e.preventDefault();
    }, []);

    const handle_touch_move = useCallback((e: React.TouchEvent) => {
        e.preventDefault();
    }, []);

    const handle_touch_end = useCallback((e: React.TouchEvent) => {
        if (game_over_ref.current || show_game_won_ref.current) return;
        const THRESHOLD = 10;
        const touch = e.changedTouches[0];
        const dx = touch.pageX - last_touch_x_y.current[0];
        const dy = last_touch_x_y.current[1] - touch.pageY;  // y-axis is flipped in screen coords
        if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return;

        const deg = ((180 * Math.atan2(dy, dx) / Math.PI) + 360) % 360;
        let swipe: [number, number] | null = null;
        if (deg < 30 || deg > 330)         swipe = [0,  1];   // right
        else if (deg > 60  && deg < 120)   swipe = [-1, 0];   // up
        else if (deg > 150 && deg < 210)   swipe = [0, -1];   // left
        else if (deg > 240 && deg < 300)   swipe = [1,  0];   // down
        if (swipe) perform_shift(...swipe).catch(console.error);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ─── UI helpers ───────────────────────────────────────────────────
    function how_to_play(): void {
        if (!gameExplanation.current) return;
        gameExplanation.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const el = gameExplanation.current;
        el.addEventListener('animationend', () => el.classList.remove('game-explanation-highlighted'), { once: true });
        el.classList.add('game-explanation-highlighted');
    }

    function start_playing(): void {
        gridHolder.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // ═══════════════════════════════════════════════════════════════════
    // RENDER / JSX
    //
    // Lit:   override render() { return html`...`; }
    //   - Tagged template literal
    //   - @click for event handlers
    //   - ?attr for boolean attributes (e.g. ?show_game_won="${...}")
    //   - ${expr} for interpolation
    //   - Child components as <m-scoreboard></m-scoreboard>
    //
    // React: return (<JSX />)
    //   - JSX is compiled to React.createElement() calls
    //   - onClick (camelCase) for event handlers
    //   - className instead of class (class is reserved in JS)
    //   - {expr} for interpolation
    //   - Child components as <Scoreboard /> (capitalized = component)
    //   - Inline styles use objects: style={{textTransform: 'uppercase'}}
    //     (two braces: outer = JS expression, inner = object literal)
    //   - Self-closing tags must have />, e.g. <br />
    // ═══════════════════════════════════════════════════════════════════
    return (
        <div className="main-app">
            <div className="container">
                <div className="heading">
                    <h1 className="title">2048</h1>
                    <div className="scores-container">
                        {/*
                         * In Lit, MScoreboard had its own set_score() method called imperatively.
                         * In React, Scoreboard is "controlled" — parent owns the data,
                         * child only displays what it receives via props.
                         * This is the React "unidirectional data flow" pattern.
                         */}
                        <Scoreboard score={score} score_add={score_add} is_current_score={true} />
                        <Scoreboard score={best_score} score_add={0} is_current_score={false} />
                    </div>
                </div>
                <div className="above-game">
                    <p className="game-intro">
                        Join the tiles, get to <strong>2048!</strong>
                        <br />
                        <a className="how-to-play-link" onClick={how_to_play}>How to play →</a>
                    </p>
                    <a className="restart-button" role="button" onClick={start_new_game}>New Game</a>
                </div>
                <div className="grid-holder" ref={gridHolder}>
                    {/*
                     * In Lit, MOverlay fired custom DOM events (bubbling):
                     *   const evt = new Event('keep_going', {bubbles: true, composed: true});
                     *   this.dispatchEvent(evt);
                     * and MApp listened: document.addEventListener('keep_going', ...)
                     *
                     * In React, we simply pass callback functions as props.
                     * No event bubbling needed — direct parent→child prop passing.
                     * This is simpler, more explicit, and avoids global event pollution.
                     */}
                    <GameMessage
                        show_game_won={show_game_won}
                        game_over={game_over}
                        on_keep_going={keep_going}
                        on_try_again={start_new_game}
                    />
                    <div
                        onTouchStart={handle_touch_start}
                        onTouchMove={handle_touch_move}
                        onTouchEnd={handle_touch_end}
                    >
                        <MGrid
                            tile_values={tile_values}
                            tiles_to_positions={tiles_to_positions}
                            pop_tiles={pop_tiles}
                        />
                    </div>
                </div>
                <div className="game-explanation-container">
                    <p className="game-explanation" ref={gameExplanation}>
                        <strong style={{textTransform: 'uppercase'}}>How to play: </strong>
                        {touch_mode
                            ? <span>Swipe with <strong>your fingers</strong> </span>
                            : <span>Use your <strong>arrow keys</strong> </span>}
                        to move the tiles.
                        Tiles with the same number <strong>merge into one </strong>
                        when they touch. Add them up to reach <strong>2048!</strong>
                        <br />
                        <a className="start-playing-link" onClick={start_playing}>Start playing →</a>
                        <a className="feedback-button" role="button"
                           href="mailto:michael.asato.cuthbert@gmail.com">Send Feedback</a>
                    </p>
                </div>
                <hr />
                <p>
                    You&apos;re <strong>not</strong> playing the official version of 2048.
                    This is a rewrite of <strong>Gabriele Cirulli</strong>&apos;s original
                    at <a href="https://play2048.co" target="_top">play2048.co</a>
                    {' '}written by{' '}
                    <strong><a href="http://www.trecento.com/">Michael Scott Asato Cuthbert</a></strong>
                    {' '}entirely in React.
                </p>
                <p>
                    Only Cirulli&apos;s styles/index.html layout have been borrowed. All other code
                    was written from scratch.
                    <small> Copyright © 2022–23, Michael Scott Asato Cuthbert, Released under BSD license.</small>
                </p>
            </div>
        </div>
    );
}

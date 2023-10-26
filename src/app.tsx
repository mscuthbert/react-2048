import React, {useEffect, useCallback} from "react";
import choice from 'pick-random';

import {MGrid} from "./grid";
import {GameMessage} from "./overlay";
import {Scoreboard} from "./scoreboard";
import {sleep, usePromiseState, yx_to_index} from "./helpers";

const DEBUG = true;

const debug_log = DEBUG ? console.log : () => {};

const shift_keys: Record<string, [number, number]> = {
    'ArrowLeft': [0, -1],
    'ArrowRight': [0, 1],
    'ArrowUp': [-1, 0],
    'ArrowDown': [1, 0],
    'a': [0, -1],
    'd': [0, 1],
    'w': [-1, 0],
    's': [1, 0],
};

interface GridComputation {
    y_shift: number,
    x_shift: number,
}

interface GridStatus {
    any_shifted: boolean,
    new_tile_positions: number[],
    new_tile_values: number[],
    increased_value_tiles: Set<number>,
    removed_tile_positions_move_positions: Map<number, number>,
    points_gained_this_move: number,
}

interface GameState {
    tile_values: number[],
    tile_positions: number[][],
    score: number,
    best_score: number,
    show_game_won: boolean,
    game_won_already_shown: boolean,
    game_over: boolean,
}

function get_shift_iterators(y_shift: number, x_shift: number): [number[], number[]] {
    let y_iterate: number[] = [0, 1, 2, 3];
    let x_iterate: number[] = [0, 1, 2, 3];

    if (y_shift !== 0) {
        // move in y-direction.
        if (y_shift === -1) {
            y_iterate = [1, 2, 3];
        } else {
            y_iterate = [2, 1, 0];
        }
    } else {
        if (x_shift === -1) {
            x_iterate = [1, 2, 3];
        } else {
            x_iterate = [2, 1, 0];
        }
    }
    return [y_iterate, x_iterate];
}

/**
 * get an array that maps positions to tile numbers (rather than vice-versa), with -1
 * for any empty tiles.
 */
function make_grid(tile_positions: number[]): number[] {
    const grid: number[] = new Array(16).fill(-1);
    for (let i = 0; i < 16; i++) {
        if (tile_positions[i] !== -1) {
            grid[tile_positions[i]] = i;
        }
    }
    return grid;
}

function make_tile_positions(grid: number[]): number[] {
    const new_tile_positions: number[] = new Array(16).fill(-1);
    for (let i = 0; i < 16; i++) {
        if (grid[i] !== -1) {
            new_tile_positions[grid[i]] = i;
        }
    }
    return new_tile_positions;
}



const RANDOM_START_HIGH = 0.9;
const WINNING_VALUE = 2048;
const TRANSITION_SPEED = DEBUG ? 1000 : 100;  // in ms

export default function App() {
    const [game_over, get_game_over, set_game_over] = usePromiseState<boolean>(false);
    const [show_game_won, get_show_game_won, set_show_game_won] = usePromiseState<boolean>(false);
    const [game_won_already_shown, get_game_won_already_shown, set_game_won_already_shown] = usePromiseState<boolean>(false);
    const [score, get_score, set_score] = usePromiseState<number>(0);
    const [best_score, get_best_score, set_best_score] = usePromiseState<number>(0);
    const [touch_mode, get_touch_mode, set_touch_mode] = usePromiseState<boolean>(false);
    const [tile_values, get_tile_values, set_tile_values] = usePromiseState<number[]>(
        new Array(16).fill(0));
    const [tiles_to_positions, get_tiles_to_positions, set_tiles_to_positions] = usePromiseState<number[]>(
        new Array(16).fill(-1));
    const [free_tiles, get_free_tiles, set_free_tiles] = usePromiseState<number[]>([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    const [pop_tiles, get_pop_tiles, set_pop_tiles] = usePromiseState<boolean[]>(
        new Array(16).fill(false));

    function how_to_play() {
        const ge = document.querySelector('.game-explanation') as HTMLElement;
        ge.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
        });
        ge.addEventListener('animationend', () => {
            ge.classList.remove('game-explanation-highlighted');
        });
        ge.classList.add('game-explanation-highlighted');

    }
    function start_new_game(prepare: boolean = true) {
        if (prepare) {
            set_tiles_to_positions(new Array(16).fill(-1));
            set_tile_values(new Array(16).fill(0));
            set_pop_tiles(new Array(16).fill(false));
            set_score(0);
            set_game_over(false);
            set_show_game_won(false);
            set_game_won_already_shown(false);
        }
        add_new_random_tile(2);
    }
    function start_playing() {

    }

    function add_new_random_tile(num_to_add=1) {
        const new_free_tiles = [...get_free_tiles()];
        const new_tiles_to_positions = [...get_tiles_to_positions()];
        const new_tile_values = [...get_tile_values()];
        const available_positions: number[] = [];
        for (let i = 0; i < 16; i++) {
            if (new_tile_values[i] === 0) {
                available_positions.push(i);
            }
        }
        debug_log('available_positions', available_positions);
        for (let add_tile = 0; add_tile < num_to_add; add_tile++) {
            const new_position = choice(available_positions)[0];
            available_positions.splice(available_positions.indexOf(new_position), 1);
            const val = Math.random() < RANDOM_START_HIGH ? 2 : 4;
            if (!new_free_tiles.length) {
                throw new Error('no free tiles');
            }
            const use_tile = new_free_tiles.pop();
            new_tiles_to_positions[use_tile] = new_position;
            new_tile_values[use_tile] = val;
            debug_log('assigning tile ', use_tile, ' to position ', new_position, ' with value ', val);
        }
        set_tile_values(new_tile_values);
        set_tiles_to_positions(new_tiles_to_positions);
        set_free_tiles(new_free_tiles);
        debug_log('new_tile_values', new_tile_values)
        debug_log('new_tiles_to_positions', new_tiles_to_positions);
        debug_log('new_free_tiles', new_free_tiles);
        return;
    }

    useEffect(() => {
        const touch_mode_listener = () => { set_touch_mode(true); };
//         this._try_again_listener = () => this.start_new_game();
//         this._keep_going_listener = () => {
//             this.game_won_already_shown = true;
//             this.show_game_won = false;
//             this.store_state().catch(console.error);
//         };
        //         document.addEventListener('try_again', this._try_again_listener);
//         document.addEventListener('keep_going', this._keep_going_listener);
        document.addEventListener('touchstart', touch_mode_listener);
        return () => {
            document.removeEventListener('touchstart', touch_mode_listener);
        }
    }, []);

    useEffect(() => {
        const keydown_listener = e => key_press(e);
        document.addEventListener('keydown', keydown_listener);
        return () => {
            document.removeEventListener('keydown', keydown_listener);
        }
    },[]);

    const renderedYet = React.useRef(false);
    useEffect(() => {
        if (!renderedYet.current) {
            renderedYet.current = true;
            start_new_game(false);
        }
    }, []);

    let last_touch_x_y = [0, 0];

    const touchstart_listener = e => {
        if (get_game_over() || get_show_game_won()) {
            return;
        }
        const touch: Touch = e.changedTouches[0];
        last_touch_x_y = [touch.pageX, touch.pageY];
        e.preventDefault();
    };

    const touchmove_listener = e => {
        if (get_game_over() || get_show_game_won()) {
            return;
        }
        e.preventDefault();
    };

    const touchend_listener = useCallback(e => {
        if (get_game_over() || get_show_game_won()) {
            return;
        }
        const TOUCH_MOVE_THRESHOLD = 10;
        const touch: Touch = e.changedTouches[0];
        const x_distance_signed = touch.pageX - last_touch_x_y[0];
        const y_distance_signed = last_touch_x_y[1] - touch.pageY;
        const x_distance = Math.abs(x_distance_signed);
        const y_distance = Math.abs(y_distance_signed);
        e.preventDefault();
        if (x_distance < TOUCH_MOVE_THRESHOLD && y_distance < TOUCH_MOVE_THRESHOLD) {
            return;
        }
        const angle_radians = Math.atan2(y_distance_signed, x_distance_signed);
        let deg = 180 * angle_radians / Math.PI;  // (-180 to 180)
        if (deg < 0) {
            deg = 360 + deg;  // (0 to 360 angles)
        }
        debug_log(Math.round(deg), x_distance_signed, y_distance_signed);
        const MEANINGLESS_SENTINEL = 99;
        let swipe: [number, number] = [MEANINGLESS_SENTINEL, MEANINGLESS_SENTINEL];
        if (deg < 30 || deg > 330) {
            swipe = [0, 1];  // strongly right
        } else if (deg > 60 && deg < 120) {
            swipe = [-1, 0];  // strongly up
        } else if (deg > 150 && deg < 210) {
            swipe = [0, -1];  // strongly left
        } else if (deg > 240 && deg < 300) {
            swipe = [1, 0];  // strongly down
        }
        if (swipe[0] === MEANINGLESS_SENTINEL) {
            return;  // too diagonal to interpret.
        }
        // this.perform_shift(swipe).catch(console.error);
    }, []);

    function key_press(e: KeyboardEvent): void {
        if (get_game_over() || get_show_game_won()) {
            return;
        }

        const k = e.key;
        if (k in shift_keys) {
            e.preventDefault();
            const shift_y_x = shift_keys[k];
            debug_log('key_press', shift_y_x);
            perform_shift(shift_y_x).catch(console.error);
        }
    }

    async function perform_shift(shift_y_x: [number, number]): Promise<void> {
        const any_shifted = await shift_tiles(...shift_y_x);
        if (any_shifted) {
            debug_log('adding_new_random_tile');
            add_new_random_tile();
            check_game_won();
            // check_game_over();
            // store_state();
        }
    }

    async function shift_tiles(y_shift: number, x_shift: number): Promise<boolean> {
        const {
            any_shifted,
            new_tile_positions,
            new_tile_values,
            increased_value_tiles,
            removed_tile_positions_move_positions,
            points_gained_this_move,
        } = compute_grid_after_shift({
            y_shift,
            x_shift,
        });

        const new_free_tiles = [...get_free_tiles()] as number[];
        const temp_tile_positions = [...new_tile_positions];
        for (const [tile_to_remove, move_to] of removed_tile_positions_move_positions.entries()) {
            new_free_tiles.push(tile_to_remove);
            temp_tile_positions[tile_to_remove] = move_to;
        }

        await set_tiles_to_positions(temp_tile_positions);
        debug_log('set_tiles_to_positions');
        await sleep(TRANSITION_SPEED);

        await set_free_tiles(new_free_tiles);
        debug_log('set_free_tiles');
        await sleep(TRANSITION_SPEED);
        await set_tile_values(new_tile_values);
        debug_log('set_tile_values');
        await sleep(TRANSITION_SPEED);
        await set_tiles_to_positions(new_tile_positions);
        debug_log('set_tiles_to_positions 2');
        await sleep(TRANSITION_SPEED);

        const new_pop_tiles = new Array(16).fill(false);
        for (const increased_value_tile of increased_value_tiles) {
            new_pop_tiles[increased_value_tile] = true;
        }
        // set_pop_tiles(new_pop_tiles);
        // debug_log('set_pop_tiles');
        // await sleep(TRANSITION_SPEED);
        if (any_shifted) {
            add_score(points_gained_this_move);
            // window.setTimeout(
            //     () => {
            //         debug_log('clear_pop_tiles');
            //         set_pop_tiles(new Array(16).fill(false));
            //     },
            //     TRANSITION_SPEED,
            //  );
        }
        return any_shifted;
    }

    function check_game_over(): void {
        for (const [y_shift, x_shift] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const {any_shifted} = compute_grid_after_shift({
                y_shift,
                x_shift,
            });
            if (any_shifted) {
                set_game_over(false);
                return;
            }
        }
        set_game_over(true);
    }


    function check_game_won(): void {
        if (get_game_won_already_shown()) {
            return;
        }
        let inner_game_won = false;
        for (let i = 0; i < 16; i++) {
            if (tile_values[i] === WINNING_VALUE) {
                inner_game_won = true;
            }
        }
        set_show_game_won(inner_game_won);
    }

    function compute_grid_after_shift({y_shift, x_shift}: GridComputation): GridStatus {
        const [y_iterate, x_iterate] = get_shift_iterators(y_shift, x_shift);

        const new_grid = make_grid(get_tiles_to_positions());
        // a tile might be removed but need to shift first, like:
        //    shift left:  [null, 2, 2, null]
        // the first 2 has to shift left before disappearing.
        // since it will not be in the final grid, we record its end position
        // separately.
        const removed_tile_positions_move_positions: Map<number, number> = new Map();
        const merged_already: Set<number> = new Set();
        let any_shifted_ever = false;
        let any_shifted_this_iter = false;
        let first_run = true;
        let points_gained_this_move: number = 0;
        const new_tile_values = [...get_tile_values()];
        while (any_shifted_this_iter || first_run) {
            first_run = false;
            any_shifted_this_iter = false;
            for (const x of x_iterate) {
                for (const y of y_iterate) {
                    const prev_y = y + y_shift;
                    const prev_x = x + x_shift;
                    const prev_tile = new_grid[yx_to_index(prev_y, prev_x)];
                    const this_tile = new_grid[yx_to_index(y, x)];
                    if (this_tile === -1) {
                        continue;
                    }

                    if (prev_tile === -1) {
                        // tile moving to empty position.
                        any_shifted_this_iter = true;
                        any_shifted_ever = true;
                        new_grid[yx_to_index(prev_y, prev_x)] = this_tile;
                        new_grid[yx_to_index(y, x)] = -1;
                        continue;
                    }

                    if (new_tile_values[prev_tile] === new_tile_values[this_tile]
                            && !merged_already.has(prev_tile)) {
                        // merge tiles
                        debug_log('merging ', prev_tile, ' and ', this_tile);
                        any_shifted_this_iter = true;
                        any_shifted_ever = true;
                        new_grid[yx_to_index(prev_y, prev_x)] = this_tile;
                        new_grid[yx_to_index(y, x)] = -1;
                        removed_tile_positions_move_positions.set(prev_tile, yx_to_index(prev_y, prev_x));
                        merged_already.add(this_tile);
                        // or *= 2, but maybe other games can have different rules...
                        const new_val = new_tile_values[this_tile] + new_tile_values[prev_tile];
                        new_tile_values[this_tile] = new_val;
                        points_gained_this_move += new_tile_values[prev_tile];
                        new_tile_values[prev_tile] = 0;
                    }
                    // otherwise, cannot move.
                }
            }
        }

        const new_tile_positions = make_tile_positions(new_grid);

        const out = {
            any_shifted: any_shifted_ever,
            new_tile_positions,
            new_tile_values,
            increased_value_tiles: merged_already,
            removed_tile_positions_move_positions,
            points_gained_this_move,
        };
        debug_log(out);
        return out;
    }

    function add_score(val: number) {
        set_score(get_score() + val);
        if (score + val > best_score) {
            set_best_score(score + val);
        }
        // this.store_state();
    }

    return (
        <div className="main-app">
            <div className="container">
                <div className="heading">
                    <h1 className="title">2048</h1>
                    <div className="scores-container">
                        <Scoreboard score={score} latest_add={0} is_current_score={true}></Scoreboard>&nbsp;
                        <Scoreboard score={best_score} latest_add={0} is_current_score={false}></Scoreboard>
                    </div>
                </div>
                <div className="above-game">
                    <p className="game-intro">
                        Join the tiles, get to <strong>2048!</strong>
                        <br />
                        <a className="how-to-play-link" onClick={how_to_play}>How to play →</a>
                    </p>
                    <a className="restart-button" role="button"
                       onClick={() => start_new_game(true)}>New Game</a>
                </div>
                <div className="grid-holder">
                    <GameMessage show_game_won={show_game_won} game_over={game_over}></GameMessage>
                    <div onTouchStart={touchstart_listener} onTouchMove={touchmove_listener} onTouchEnd={touchend_listener}>
                        <MGrid tile_values={tile_values} tiles_to_positions={tiles_to_positions} pop_tiles={pop_tiles}></MGrid>
                    </div>
                </div>
                <div className="game-explanation-container">
                    <p className="game-explanation">
                        <strong style={{textTransform: 'uppercase'}}>How to play: </strong>
                        {touch_mode
                            ? <span>Swipe with <strong>your fingers</strong> </span>
                            : <span>Use your <strong>arrow keys</strong> </span>}
                        to move the tiles.
                        Tiles with the same number <strong>merge into one </strong>
                        when they touch.  Add them up to reach <strong>2048!</strong>
                        <br/>
                        <a className="start-playing-link"
                           onClick={start_playing}>Start playing →</a>
                        <a className="feedback-button" role="button"
                            href="mailto:michael.asato.cuthbert@gmail.com">Send Feedback</a>
                    </p>
                </div>
                <hr />
                <p>
                    You're <strong>not</strong> playing the official version
                    of 2048.  This is a rewrite of <strong>Gabriele Cirulli</strong>'s
                    original at <a
                    href="https://play2048.co" target="_top">play2048.co</a> written
                    by <strong><a href="http://www.trecento.com/">Michael Scott Asato
                    Cuthbert</a></strong> entirely in React.
                </p>
                <p>
                    Only Cirulli's styles/index.html layout have been borrowed.  All other code was
                    written from scratch.  The only time the original code was consulted
                    was to verify the probability of starting with "4" instead of "2"
                    and to figure out how to trigger the "You won!" message without
                    needing to solve the game.
                </p>
            </div>
        </div>);
}

// export class MApp extends LitElement {
//     async store_state() {
//         await this.updateComplete;
//         const tile_values = this.store_tile_values();
//         const state: GameState = {
//             tile_values,
//             score: this.score,
//             best_score: this.best_score,
//             game_over: this.game_over,
//             show_game_won: this.show_game_won,
//             game_won_already_shown: this.game_won_already_shown,
//         };
//         window.localStorage.setItem('wc_2048', JSON.stringify(state));
//     }
//
//     load_state() {
//         const state_str = window.localStorage.getItem('wc_2048');
//         if (!state_str) {
//             return;
//         }
//         const state_storage: GameState = JSON.parse(state_str);
//         this.load_tile_values_from_storage(state_storage.tile_values);
//         this.score = state_storage.score;
//         // bypass effects by not using set_score
//         this.scoreboard.score = state_storage.score;
//         this.best_score = state_storage.best_score;
//         this.best_scoreboard.score = state_storage.best_score;
//         this.show_game_won = state_storage.show_game_won;
//         this.game_won_already_shown = state_storage.game_won_already_shown;
//         this.game_over = state_storage.game_over;
//     }
//
//     override connectedCallback(): void {
//         super.connectedCallback();
//         this._keydown_listener = e => this.key_press(e);
//         this._try_again_listener = () => this.start_new_game();
//         this._keep_going_listener = () => {
//             this.game_won_already_shown = true;
//             this.show_game_won = false;
//             this.store_state().catch(console.error);
//         };
//         document.addEventListener('keydown', this._keydown_listener);
//         document.addEventListener('try_again', this._try_again_listener);
//         document.addEventListener('keep_going', this._keep_going_listener);
//     }
//
//     override disconnectedCallback(): void {
//         document.removeEventListener('keydown', this._keydown_listener);
//         document.removeEventListener('try_again', this._try_again_listener);
//         document.removeEventListener('keep_going', this._keep_going_listener);
//         super.disconnectedCallback();
//     }
//
//     load_tile_values_from_storage(tile_values: number[][]) {
//         for (const y of [0, 1, 2, 3]) {
//             for (const x of [0, 1, 2, 3]) {
//                 const tv = tile_values[y][x];
//                 if (tv === 0) {
//                     continue;
//                 }
//                 this.add_tile(y, x, tv).catch(console.error);
//             }
//         }
//     }
//
//     start_playing() {
//         this.m_grid.scrollIntoView({
//             behavior: 'smooth',
//             block: 'center',
//         });
//     }
// }
//

/**
 * grid.tsx — The 4×4 board and tile container
 *
 * ═══════════════════════════════════════════════════════════════════
 * REACT vs LIT: Component decomposition
 * ═══════════════════════════════════════════════════════════════════
 *
 * In wc-2048, MGrid was a custom element that managed its own tile
 * children imperatively:
 *
 *   async append_tile(t: MTile): Promise<void> {
 *     this.shadowRoot.querySelector('.board').appendChild(t);
 *     await sleep(50);
 *     t.active = true;  // triggers fade-in CSS transition
 *   }
 *
 *   remove_all_tiles() {
 *     this.shadowRoot.querySelector('.board').innerHTML = '';
 *   }
 *
 * Tiles were actual DOM nodes that MApp created with `new MTile()`
 * and added/removed from the DOM manually.
 *
 * In React, there is no imperative "add/remove child" pattern.
 * Instead, the Board component receives all tile data as props and
 * renders the complete set declaratively on every render.
 * React's reconciler diffs the output and makes minimal DOM changes.
 *
 * Key insight: we always render ALL 16 tile slots. Unused tiles have
 * position=-1 which maps to CSS class `tile_-1_-1` → display:none.
 * This means tile DOM elements are never created/destroyed during play
 * — only their CSS classes change, which is what drives the animations.
 *
 * In Lit, tile DOM elements were created/destroyed.
 * In React, they're always present but shown/hidden via CSS.
 * Both approaches produce the same visual result.
 * ═══════════════════════════════════════════════════════════════════
 */

import React from 'react';
import { MTile } from './tile';

interface MGridProps {
    tile_values: number[];
    tiles_to_positions: number[];
    pop_tiles: boolean[];
}

export function MGrid({ tile_values, tiles_to_positions, pop_tiles }: MGridProps) {
    return (
        <div className="m-grid">
            {/* Static background grid — 16 empty cells for visual structure.
                In Lit this was also a static structure inside MGrid's shadow DOM. */}
            <div className="grid">
                {[0, 1, 2, 3].map(y =>
                    [0, 1, 2, 3].map(x =>
                        <div className="grid-cell" key={`${y}-${x}`} data-y={y} data-x={x} />
                    )
                )}
            </div>
            <Board tile_values={tile_values} tiles_to_positions={tiles_to_positions} pop_tiles={pop_tiles} />
        </div>
    );
}

function Board({ tile_values, tiles_to_positions, pop_tiles }: MGridProps) {
    // Render all 16 tile slots regardless of whether they're active.
    // React identifies each tile by its `key` prop (tile_id) — this is
    // critical for animations. If tile_id 3 moves from position 5 to
    // position 1, React keeps the same DOM element and only its CSS
    // class changes, triggering the slide transition.
    //
    // In Lit, the MTile DOM element itself moved (its x/y properties
    // changed), which updated the transform style and triggered the
    // CSS transition. Same visual result, different mechanism.
    return (
        <div className="board">
            {Array.from({length: 16}, (_, tile_id) => (
                <MTile
                    key={tile_id}
                    tile_id={tile_id}
                    position={tiles_to_positions[tile_id]}
                    val={tile_values[tile_id]}
                    active={tile_values[tile_id] > 0}
                    popping={pop_tiles[tile_id]}
                />
            ))}
        </div>
    );
}

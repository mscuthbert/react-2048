import React from 'react';
import {MTile} from "./tile";
import {index_to_yx} from "./helpers";

export function MGrid({tile_values, tiles_to_positions, pop_tiles}) {
    return (
        <div className="m-grid">
            <div className="grid">
                {[0, 1, 2, 3].map(y => [0, 1, 2, 3].map(
                    x => <div className="grid-cell" key={`${y}-${x}`} data-y={y} data-x={x}></div>
                ))}
            </div>
            <Board tile_values={tile_values} tiles_to_positions={tiles_to_positions} pop_tiles={pop_tiles}></Board>
        </div>
    );
}

export function Board({tile_values, tiles_to_positions, pop_tiles}) {
    const all_tiles = [];
    for (let i = 0; i < 16; i++) {
        const [y, x] = index_to_yx(tiles_to_positions[i]);
        all_tiles.push(<MTile key={i} y={y} x={x} val={tile_values[i]} tile_id={i}
                              active={tile_values[i] > 0} popping={pop_tiles[i]}></MTile>);
    }

    return (
        <div className="board">
            {all_tiles}
        </div>
    );
}

// export class MGrid extends LitElement {
//     remove_all_tiles() {
//         this.shadowRoot.querySelector('.board').innerHTML = '';
//     }
//
//     async append_tile(t: OldMTile): Promise<void> {
//         this.shadowRoot.querySelector('.board').appendChild(t);
//         await sleep(50);
//         await t.updateComplete;
//         t.active = true;
//         await sleep(s.transition_speed);
//     }
// }
//

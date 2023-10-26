import React from 'react';

// import {s} from './styles';
// import {rgb_s} from './help';

interface MTileState {
    val: number,
    y: number,
    x: number,
    active: boolean,
    popping: boolean,
    tile_id: number,
}

export function MTile({ val, y, x, active, popping, tile_id }: MTileState) {
    const level = Math.min(Math.floor(Math.log2(val)), 12);
    const classes = `tile tile_${y}_${x} level_${level} ${active ? 'active' : ''} ${popping ? 'pop' : ''}`;
    return (
            <div className="tile_container">
                <div className={classes}>{val}<span style={{fontSize: '7px'}}>{tile_id}</span></div>
            </div>
    );
}

export class OldMTile {
    render() {
        const y = 0;
        const x = 0;
        const grid = document.parentElement?.previousElementSibling;
        if (!grid) {
            return null;
        }
        const grid_rect = grid.getBoundingClientRect();
        const cell = grid.querySelector(`[data-y="${y}"][data-x="${x}"]`);
        const rect = cell.getBoundingClientRect();
        const translate_x = rect.x - grid_rect.x;
        const translate_y = rect.y - grid_rect.y;
        const trans_style = `translate(${translate_x}px, ${translate_y}px)`;
        console.log(trans_style)
    }
}

/**
 * tile.tsx — Individual tile component
 *
 * ═══════════════════════════════════════════════════════════════════
 * REACT vs LIT: Tile positioning
 * ═══════════════════════════════════════════════════════════════════
 *
 * In wc-2048, MTile was a custom element that calculated its own
 * screen position at render time by querying the DOM:
 *
 *   override render() {
 *     const grid = this.parentElement?.previousElementSibling;
 *     const cell = grid.querySelector(`[data-y="${this.y}"][data-x="${this.x}"]`);
 *     const rect = cell.getBoundingClientRect();
 *     const trans_style = `translate(${rect.x - grid_rect.x}px, ...)`;
 *     return html`<div style="transform: ${trans_style}">...`;
 *   }
 *
 * This DOM query approach is necessary in web components because
 * tiles live in the shadow DOM and can't use pre-computed CSS classes
 * that reference grid geometry defined outside the component.
 *
 * In React, we don't use Shadow DOM, so a single global stylesheet
 * can define the positions for all cells. We use SCSS loops to
 * pre-generate all 16 position classes:
 *
 *   @for $y from 0 through 3 {
 *     @for $x from 0 through 3 {
 *       &.tile_#{$y}_#{$x} {
 *         transform: translate(
 *           #{$x * ($tile_size + $grid_spacing) + $grid_spacing},
 *           #{$y * ($tile_size + $grid_spacing) + $grid_spacing}
 *         );
 *       }
 *     }
 *   }
 *
 * This is simpler, faster (no DOM queries on every render), and
 * CSS transitions work perfectly between classes.
 *
 * The tradeoff: the SCSS now knows about the grid geometry, coupling
 * the stylesheet to the layout constants. In the Lit version, each
 * tile was self-contained. For a fixed 4×4 game, the SCSS approach
 * is clearly the right call.
 * ═══════════════════════════════════════════════════════════════════
 */

import React from 'react';
import { index_to_yx } from './helpers';

interface MTileProps {
    val: number;
    tile_id: number;
    position: number;  // grid position 0-15, or -1 if not in use
    active: boolean;
    popping: boolean;
}

export function MTile({ val, tile_id, position, active, popping }: MTileProps) {
    const [y, x] = index_to_yx(position);

    // log2(2)=1, log2(4)=2, ..., log2(2048)=11. Cap at 12 for CSS.
    const level = val > 0 ? Math.min(Math.floor(Math.log2(val)), 12) : 0;

    // Build the className string declaratively from props.
    // In Lit: classMap({active: this.active, pop: popping}) via lit/directives.
    // In React: just string interpolation — no special directive needed.
    const classes = [
        'tile',
        `tile_${y}_${x}`,
        `level_${level}`,
        active ? 'active' : '',
        popping ? 'pop' : '',
    ].filter(Boolean).join(' ');

    return (
        <div className="tile_container">
            <div className={classes}>{active ? val : ''}</div>
        </div>
    );
}

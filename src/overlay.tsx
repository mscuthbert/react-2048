/**
 * overlay.tsx — Game won / game over overlay
 *
 * ═══════════════════════════════════════════════════════════════════
 * REACT vs LIT: Custom events vs callback props
 * ═══════════════════════════════════════════════════════════════════
 *
 * In wc-2048, MOverlay communicated upward by dispatching custom
 * DOM events that bubble through the shadow DOM to the document:
 *
 *   keep_going() {
 *     const evt = new Event('keep_going', {bubbles: true, composed: true});
 *     this.dispatchEvent(evt);
 *   }
 *
 * `composed: true` is required for events to cross shadow DOM boundaries.
 * MApp then listened at the document level:
 *   document.addEventListener('keep_going', this._keep_going_listener);
 *
 * In React, there is no Shadow DOM, and the React idiom for child→parent
 * communication is simply to pass callback functions as props:
 *
 *   <GameMessage on_keep_going={keep_going} on_try_again={start_new_game} />
 *
 * This is more explicit, type-safe, and doesn't pollute the global
 * event namespace. The flow is: user clicks → handler calls prop → parent
 * function runs.
 *
 * Which is better? React props are cleaner for direct parent/child.
 * Custom events (or React Context) are better when you need to
 * communicate across many levels without "prop drilling".
 * ═══════════════════════════════════════════════════════════════════
 */

import React from 'react';

interface GameMessageProps {
    show_game_won: boolean;
    game_over: boolean;
    on_keep_going: () => void;
    on_try_again: () => void;
}

export function GameMessage({ show_game_won, game_over, on_keep_going, on_try_again }: GameMessageProps) {
    const is_active = show_game_won || game_over;

    // In Lit, the overlay was always in the DOM but hidden via CSS.
    // The Lit version used `?show_game_won` and `?game_over` boolean
    // attributes and CSS selectors like :host([game_over]) to show/hide.
    //
    // In React, we can either:
    //  (a) always render but control visibility with a CSS class, or
    //  (b) conditionally render with {is_active && <div>...}
    //
    // Option (a) lets CSS animations trigger properly (the element exists
    // in the DOM when the class is added, so transitions work).
    // Option (b) is cleaner but means the fade-in animation always runs
    // from scratch each time, which is actually what we want here.
    //
    // We use (a) with an `.active` class so the element stays in the DOM
    // but the CSS fade-in animation fires when `.active` is added.
    return (
        <div className={`game-message${is_active ? ' active' : ''}`}>
            <p className={show_game_won ? 'game-won' : 'game-over'}>
                {game_over ? 'Game over!' : ''}
                {show_game_won ? 'You win!' : ''}
            </p>
            <div className="lower">
                {show_game_won && (
                    <a className="button keep_playing_button" role="button"
                       onClick={on_keep_going}>Keep going</a>
                )}
                <a className="button retry_button" role="button"
                   onClick={on_try_again}>Try again</a>
            </div>
        </div>
    );
}

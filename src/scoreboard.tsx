/**
 * scoreboard.tsx — Score display with animated "+N" increment
 *
 * ═══════════════════════════════════════════════════════════════════
 * REACT vs LIT: "Controlled" vs imperative components
 * ═══════════════════════════════════════════════════════════════════
 *
 * In wc-2048, MScoreboard was an independent element with its own
 * mutable state. MApp called `scoreboard.set_score(val)` directly —
 * an imperative method call on a child element:
 *
 *   @query('m-scoreboard.current') scoreboard: MScoreboard;
 *   this.scoreboard.set_score(this.score);
 *
 * In React, the idiomatic pattern is a "controlled component":
 *   - The child (Scoreboard) has NO internal state for the score.
 *   - The parent (App) owns the data and passes it as props.
 *   - The child only renders what it receives.
 *
 * This "unidirectional data flow" (parent → child via props) makes
 * data flow explicit and predictable. There's no need to hold refs
 * to child components or call methods on them.
 *
 * For the "+N" animation, the parent also controls `score_add`:
 *   - When score increases, App sets score_add = points
 *   - App clears it after 1200ms with a setTimeout
 *   - Scoreboard renders a floating element keyed on score,
 *     so React unmounts/remounts it each time, restarting the CSS animation
 * ═══════════════════════════════════════════════════════════════════
 */

import React from 'react';

interface ScoreboardProps {
    score: number;
    score_add: number;   // points gained this move (0 when not animating)
    is_current_score: boolean;
}

export function Scoreboard({ score, score_add, is_current_score }: ScoreboardProps) {
    const show_add = is_current_score && score_add > 0;

    return (
        <div className="scoreboard">
            <div className={`score ${is_current_score ? 'current' : 'best'}`}>
                {score}
            </div>
            {/*
             * The `key={score}` prop forces React to unmount and remount
             * this element whenever the score changes — restarting the
             * CSS animation from scratch each time.
             *
             * In Lit, MScoreboard did something similar by temporarily
             * adding/removing an 'inactive' class to reset the transition
             * state. The React `key` trick is cleaner for this use case.
             *
             * Without `key`, if the score increases twice quickly, the
             * element would already be partially through its animation and
             * the second +N would not restart from the visible position.
             */}
            {show_add && (
                <div className="latest_add" key={score}>
                    +{score_add}
                </div>
            )}
        </div>
    );
}

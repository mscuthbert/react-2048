import React from "react";

export function GameMessage({show_game_won, game_over}) {
    return (
        <div className="game-message">
            <p className={show_game_won ? 'game-won' : 'game-over'}>
                {show_game_won ? 'You win!' : 'Game over!'}
            </p>
            <div className="lower">
                {show_game_won ? <a className="button keep_playing_button" role="button">Keep going</a> : ''}
                <a className="button retry_button" role="button">Try again</a>
            </div>
        </div>
    );
}
//     static override styles = css`
//     `;
//
//     keep_going() {
//         const evt = new Event('keep_going', {bubbles: true, composed: true});
//         this.dispatchEvent(evt);
//     }
//
//     try_again() {
//         const evt = new Event('try_again', {bubbles: true, composed: true});
//         this.dispatchEvent(evt);
//     }
//
//     override render() {
//         const classes = {'game-won': this.show_game_won, 'game-over': this.game_over};
//         return html`
//             <div class="game-message ${classMap(classes)}">
//                 <p>
//                     ${this.game_over ? 'Game over!' : ''}
//                     ${this.show_game_won ? 'You win!' : ''}
//                 </p>
//                 <div class="lower">
//                     ${this.show_game_won ? html`
//                         <a class="button keep_playing_button"
//                            role="button"
//                            @click="${this.keep_going}">Keep going</a>` : ''}
//                     <a class="button retry_button"
//                            role="button"
//                            @click="${this.try_again}">Try again</a>
//                 </div>
//             </div>`;
//     }
// }

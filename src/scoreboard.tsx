import React from "react";

export function Scoreboard({ score, latest_add, is_current_score }) {
    const active = (latest_add !== 0);
    return (
        <div className="scoreboard">
            <div className={'score ' + (is_current_score ? 'current' : 'best')}>
                {score}
            </div>
            <div className={'latest_add ' + (active && 'active')}>
                {active ? '+' + this.latest_add : null}
            </div>
        </div>
    )
}

// import {customElement, property, query} from 'lit/decorators.js';
// import {css, html, LitElement} from 'lit';
// import {classMap} from 'lit/directives/class-map.js';
//
// import {rgb_s, sleep} from './help';
// import {s} from './styles';
//
// @customElement('m-scoreboard')
// export class MScoreboard extends LitElement {
//     @property({type: Number}) score: number = 0;
//     @property({type: Number}) latest_add: number = 0;
//     @property({type: Boolean}) is_current_score: boolean = false;
//
//     @query('.latest_add') latest_add_div: HTMLElement;
//
//     _add_timeout: number;
//
//     static override get styles() {
//         const height = 25;
//         return css`
//         `;
//     }
//
//     async set_score(val: number) {
//         if (this._add_timeout !== undefined) {
//             window.clearTimeout(this._add_timeout);
//             this._add_timeout = 0;
//             this.latest_add = 0;
//             this.latest_add_div.classList.add('inactive');
//             await this.updateComplete;
//             await sleep(3);
//             this.latest_add_div.classList.remove('inactive');
//         }
//         const prev_score = this.score;
//         this.score = val;
//         if (!this.is_current_score) {
//             return;
//         }
//         this.latest_add = val - prev_score;
//         this._add_timeout = window.setTimeout(() => {
//             this.latest_add = 0;
//             this._add_timeout = undefined;
//         }, 1000);
//     }
//
//     override render() {
//         const active = (this.latest_add !== 0);
//         const active_classes = {active};
//         return html`
//             <div class="score">
//                 ${this.score}
//             </div>
//             <div class="latest_add ${classMap(active_classes)}">
//                 ${active ? html`+${this.latest_add}` : null}
//             </div>
//         `;
//     }
// }

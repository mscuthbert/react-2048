import {useRef, useState} from "react";

export function index_to_yx(index: number): number[] {
    return [Math.floor(index / 4), index % 4];
}

export function yx_to_index(y: number, x: number): number {
    return y * 4 + x;
}

export async function sleep(ms?: number): Promise<number> {
    if (ms) {
        return new Promise(resolve => window.setTimeout(resolve, ms));
    } else {
        return new Promise(requestAnimationFrame);
    }
}

export function usePromiseState<T>(initialState: T): readonly [T, () => T, (value: T) => Promise<T>] {
    const [default_state, default_set_state] = useState(initialState);
    const state_ref = useRef(default_state);

    const asyncSetState = (value: T): Promise<T> => {
        return new Promise(resolve => {
            state_ref.current = value;
            default_set_state(value);
            default_set_state((current: T): T => {
                resolve(current);
                return current;
            })
        })
    }

    const ret_ref = () => {
        return state_ref.current
    }

    return [default_state, ret_ref, asyncSetState] as const;
}

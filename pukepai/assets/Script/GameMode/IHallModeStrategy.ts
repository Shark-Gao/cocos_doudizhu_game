/*
 * @author: sharkgao
 * @LastEditors: sharkgao
 */
/**
 * IHallModeStrategy - Strategy contract for hall-side mode-aware behaviour.
 *
 * Each concrete strategy answers "what does the hall need for this mode?":
 *   - Whether to expose the special-rules panel
 *   - Min/max player counts (used for tooltips & match queue UI)
 *   - The exact payload `createRoom` / `match` should send
 *
 * Doudizhu and Shuangjian implementations live in this same file because the
 * surface area is small.
 */
import { GameMode } from './IGameModeView';

export interface SpecialRules {
    drawAsOne?: boolean;
    doubleScore?: boolean;
    fiveAwardChallenge?: boolean;
}

export abstract class IHallModeStrategy {
    public abstract get gameMode(): GameMode;
    public abstract showSpecialRulesPanel(): boolean;
    public abstract getMinPlayerCount(specialRules?: SpecialRules): number;
    public abstract getMaxPlayerCount(specialRules?: SpecialRules): number;

    /** Build the payload used for /createRoom & /matching messages. */
    public buildPayload(level: number, specialRules?: SpecialRules, robotCount: number = 0, robotLevel: number = 0): any {
        return {
            level,
            gameMode: this.gameMode,
            specialRules: specialRules || {},
            robotCount,
            robotLevel,
        };
    }
}

class DoudizhuHallStrategy extends IHallModeStrategy {
    public get gameMode(): GameMode { return GameMode.DOUDIZHU; }
    public showSpecialRulesPanel(): boolean { return false; }
    public getMinPlayerCount(): number { return 3; }
    public getMaxPlayerCount(): number { return 3; }
}

class ShuangjianHallStrategy extends IHallModeStrategy {
    public get gameMode(): GameMode { return GameMode.SHUANGJIAN; }
    public showSpecialRulesPanel(): boolean { return true; }
    public getMinPlayerCount(_rules?: SpecialRules): number { return 4; }
    public getMaxPlayerCount(_rules?: SpecialRules): number { return 4; }
}

const cache: Map<number, IHallModeStrategy> = new Map();

/** Singleton-style accessor; returns the right strategy for the given mode. */
export function getHallStrategy(gameMode: number): IHallModeStrategy {
    const key = gameMode ?? GameMode.DOUDIZHU;
    if (cache.has(key)) return cache.get(key)!;
    let strat: IHallModeStrategy;
    switch (key) {
        case GameMode.SHUANGJIAN:
            strat = new ShuangjianHallStrategy();
            break;
        case GameMode.DOUDIZHU:
        default:
            strat = new DoudizhuHallStrategy();
            break;
    }
    cache.set(key, strat);
    return strat;
}

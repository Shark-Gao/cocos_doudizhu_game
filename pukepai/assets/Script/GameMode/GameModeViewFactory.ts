/*
 * @author: sharkgao
 * @LastEditors: sharkgao
 */
/**
 * GameModeViewFactory - Returns the IGameModeView instance suitable for the
 * room's current `gameMode` field.
 */
import { IGameModeView, GameMode } from './IGameModeView';
import { DoudizhuModeView } from './Doudizhu/DoudizhuModeView';
import { ShuangjianModeView } from './Shuangjian/ShuangjianModeView';

class GameModeViewFactory {
    private cache: Map<number, IGameModeView> = new Map();

    public create(gameMode: number): IGameModeView {
        const key = gameMode ?? GameMode.DOUDIZHU;
        if (this.cache.has(key)) return this.cache.get(key)!;
        let inst: IGameModeView;
        switch (key) {
            case GameMode.SHUANGJIAN:
                inst = new ShuangjianModeView();
                break;
            case GameMode.DOUDIZHU:
            default:
                inst = new DoudizhuModeView();
                break;
        }
        this.cache.set(key, inst);
        return inst;
    }
}

export const gameModeViewFactory = new GameModeViewFactory();
export { GameMode } from './IGameModeView';

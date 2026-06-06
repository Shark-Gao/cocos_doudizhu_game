/*
 * @author: sharkgao
 * @LastEditors: sharkgao
 */
/**
 * ShuangjianRoomLifecycle - One-liner integration helper for RoomScene.
 *
 * Usage from RoomScene (pseudo):
 *
 *   // onLoad()
 *   this.modeLifecycle = new ShuangjianRoomLifecycle();
 *   this.modeLifecycle.attach(this.node, roomInfo);
 *
 *   // onDestroy()
 *   this.modeLifecycle.detach();
 *
 * The helper resolves the right IGameModeView via the factory, registers
 * its socket events and tears them all down on detach. It also clears any
 * lingering Shuangjian state (camps, partner card, baopai timers) so a
 * mid-game reconnect doesn't carry stale data into the next round.
 */
import { Node } from 'cc';
import { gameModeViewFactory, GameMode } from './GameModeViewFactory';
import { IGameModeView } from './IGameModeView';
import { ShuangjianModeView } from './Shuangjian/ShuangjianModeView';

export class ShuangjianRoomLifecycle {
    private view: IGameModeView | null = null;
    private gameMode: number = GameMode.DOUDIZHU;

    public attach(roomSceneNode: Node, roomInfo: any): IGameModeView {
        // Re-attaching is common when roomInfo refreshes; always clean up the old view first.
        this.detach();

        // Tolerate missing room_type / game_mode by falling back to Doudizhu
        // and logging a warning instead of crashing. (Spec 19.x)
        let mode: number = roomInfo?.game_mode;
        if (mode === undefined || mode === null) {
            console.warn('[ShuangjianRoomLifecycle] room.game_mode missing, defaulting to Doudizhu');
            mode = GameMode.DOUDIZHU;
        }
        this.gameMode = mode;

        this.view = gameModeViewFactory.create(mode);
        this.view.attach(roomSceneNode);
        this.view.registerSocketEvents();

        // Reset Shuangjian transient state so a reconnect into a half-played
        // room starts from a known baseline.
        if (mode === GameMode.SHUANGJIAN) {
            (this.view as ShuangjianModeView).resetRoundState();
        }
        return this.view;
    }

    public detach(): void {
        if (!this.view) return;
        this.view.detach();
        this.view = null;
    }

    public getView(): IGameModeView | null { return this.view; }
    public getGameMode(): number { return this.gameMode; }
    public isShuangjian(): boolean { return this.gameMode === GameMode.SHUANGJIAN; }
}

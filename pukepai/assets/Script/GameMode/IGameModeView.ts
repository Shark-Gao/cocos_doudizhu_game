/*
 * @author: sharkgao
 * @LastEditors: sharkgao
 */
/**
 * IGameModeView - Abstract base class for client-side game-mode views.
 *
 * Each concrete view (DoudizhuModeView, ShuangjianModeView) is responsible
 * for:
 *   - Returning the seat layout used by RoomScene to position avatars/cards
 *   - Registering / unregistering its own websocket events
 *   - Reacting to mode-specific lifecycle events (deal, partner-card, etc.)
 *
 * RoomScene only knows about IGameModeView; concrete logic stays in subclasses.
 */
import { Node } from 'cc';

export enum GameMode {
    DOUDIZHU = 0,
    SHUANGJIAN = 1,
}

export interface SpecialRules {
    drawAsOne?: boolean;          // 平局算一分
    doubleScore?: boolean;        // 输赢分翻倍
    fiveAwardChallenge?: boolean; // 五奖冲关
}

/**
 * Seat layout descriptor returned by `getSeatLayout`.
 *   - playerCount: 2/3/4 seats are valid
 *   - useUser3Box: whether the 4th seat (top of the screen) should appear
 */
export interface SeatLayout {
    playerCount: number;
    useUser3Box: boolean;
}

export abstract class IGameModeView {
    /** The cocos node that hosts the room scene (for event subscriptions). */
    protected roomSceneNode: Node | null = null;

    /** Bind the view to the RoomScene root once. */
    public attach(roomSceneNode: Node): void {
        this.roomSceneNode = roomSceneNode;
    }

    /** Detach & clean up any timers / listeners the view created. */
    public detach(): void {
        this.unregisterSocketEvents();
        this.roomSceneNode = null;
    }

    // -------- Capability --------
    /** Return how the seats should be laid out for this mode. */
    public abstract getSeatLayout(specialRules: SpecialRules): SeatLayout;

    // -------- Socket plumbing --------
    /** Subscribe to mode-specific server messages (selectBaopai, partnerReveal, ...). */
    public abstract registerSocketEvents(): void;
    /** Inverse of registerSocketEvents. */
    public abstract unregisterSocketEvents(): void;

    // -------- Lifecycle hooks --------
    /** Called when the deal-cards animation should start. */
    public onDealCards(_data: any): void { /* default: noop */ }
    /** Called when banker information arrives. */
    public onLandlordSelect(_data: any): void { /* default: noop */ }
    /** Called when partner card is revealed (Shuangjian only). */
    public onPartnerReveal(_data: any): void { /* default: noop */ }
}

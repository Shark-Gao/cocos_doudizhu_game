/*
 * @author: sharkgao
 * @LastEditors: sharkgao
 */
/**
 * DoudizhuModeView - Default 3-player Landlord layout.
 *
 * Doudizhu's view logic already lives inside RoomScene.ts (the legacy code).
 * This file only provides the seat layout & event registration stubs that
 * RoomScene queries through the IGameModeView abstraction.
 */
import { IGameModeView, SeatLayout, SpecialRules } from '../IGameModeView';

export class DoudizhuModeView extends IGameModeView {
    public getSeatLayout(_specialRules: SpecialRules): SeatLayout {
        // 3-seat ring: bottom (self), left & right opponents. User3Box stays hidden.
        return { playerCount: 3, useUser3Box: false };
    }

    public registerSocketEvents(): void {
        // No-op: Doudizhu events (snatchLandlord, selectDouble, mingPai, ...)
        // are already handled by the legacy RoomScene listeners.
    }

    public unregisterSocketEvents(): void { /* no-op */ }
}

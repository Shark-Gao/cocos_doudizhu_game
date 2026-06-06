/*
 * @author: sharkgao
 * @LastEditors: sharkgao
 */
/**
 * ShuangjianModeView - Fengcheng Twin-Sword 4-player (or 2-player) view.
 *
 * Behaviour delivered here:
 *   - 4-seat (or 2-seat) layout that activates User3CardBox at the top of
 *     the screen when 4 players are seated.
 *   - Subscribes to Shuangjian-only socket events:
 *       dealCardsShuangjian, shuangjianLandlord, selectBaopai, baopaiResult,
 *       partnerReveal, shuangjianStartPlay
 *   - Stores camp / partner / baopai state for the round so the gameOver
 *     panel and play-card validation can read them.
 *   - Exposes `validatePlay()` & `getHint()` proxies into ShuangjianCardHint.
 *
 * RoomScene only needs to:
 *   1. Call `attach(this.node)` & `registerSocketEvents()` on enter.
 *   2. Call `detach()` on leave.
 *   3. Forward play-validation requests to `validatePlay()`.
 */
import { IGameModeView, SeatLayout, SpecialRules } from '../IGameModeView';
import {
    judgeCardTypeShuangjian,
    compareShuangjian,
    cardHintShuangjian,
    SjJudgeResult,
} from './ShuangjianCardHint';
import { eventTarget } from '../../../Utils/EventListening';
import { WebsocketMgr } from '../../Api/WebsocketMgr';

interface DealData {
    roomUsers: any;
    seatCount: number;
    perPlayer: number;
}

export class ShuangjianModeView extends IGameModeView {
    /** Cached partner card known only to the banker (-1 for others). */
    public partnerCard: number = -1;
    public landlordCamp: string[] = [];
    public farmerCamp: string[] = [];
    public partnerRevealed: boolean = false;
    public isBaopai: boolean = false;
    public bankerId: string = '';

    /**
     * Last-seen baopai-window countdown. Updated every tick from the server
     * so the RoomScene can render a progress label.
     */
    public baopaiCountDown: number = -1;

    // Bound references so we can off() cleanly in unregisterSocketEvents.
    private boundHandlers: { [type: string]: (data: any) => void } = {};

    public getSeatLayout(_specialRules: SpecialRules): SeatLayout {
        // Shuangjian is a fixed 4-player mode.
        return { playerCount: 4, useUser3Box: true };
    }

    public registerSocketEvents(): void {
        // Build & store handlers so off() works.
        this.boundHandlers['dealCardsShuangjian'] = this.onDealCards.bind(this);
        this.boundHandlers['shuangjianLandlord'] = this.onLandlordSelect.bind(this);
        this.boundHandlers['selectBaopai'] = this.onSelectBaopai.bind(this);
        this.boundHandlers['baopaiResult'] = this.onBaopaiResult.bind(this);
        this.boundHandlers['partnerReveal'] = this.onPartnerReveal.bind(this);
        this.boundHandlers['shuangjianStartPlay'] = this.onStartPlay.bind(this);

        for (const type in this.boundHandlers) {
            eventTarget.on(type, this.boundHandlers[type], this);
        }
    }

    public unregisterSocketEvents(): void {
        for (const type in this.boundHandlers) {
            eventTarget.off(type, this.boundHandlers[type], this);
        }
        this.boundHandlers = {};
    }

    // -------- Lifecycle handlers --------
    public onDealCards(data: any): void {
        const payload: DealData = data?.data || data;
        if (!payload) return;
        this.resetRoundState();
        // Trigger any visual hooks via re-emit so RoomScene can pick it up
        // without coupling to the concrete view.
        eventTarget.emit('shuangjian:dealRendered', payload);
    }

    public onLandlordSelect(data: any): void {
        const payload = data?.data || data;
        this.bankerId = payload?.userId || '';
        eventTarget.emit('shuangjian:bankerRendered', payload);
    }

    /** Banker-only window opens; renders timer & buttons in the scene. */
    public onSelectBaopai(data: any): void {
        const payload = data?.data || data;
        this.baopaiCountDown = payload?.downTime ?? -1;
        eventTarget.emit('shuangjian:baopaiTick', payload);
    }

    /** Banker resolved the baopai prompt (manually or by timeout). */
    public onBaopaiResult(data: any): void {
        const payload = data?.data || data;
        this.isBaopai = !!payload?.isBaopai;
        if (typeof payload?.partnerCard === 'number' && payload.partnerCard > 0) {
            this.partnerCard = payload.partnerCard;
        }
        this.partnerRevealed = !!payload?.partnerRevealed;
        this.landlordCamp = payload?.landlordCamp || this.landlordCamp;
        this.farmerCamp = payload?.farmerCamp || this.farmerCamp;
        eventTarget.emit('shuangjian:baopaiResolved', payload);
        if (this.partnerRevealed) {
            eventTarget.emit('shuangjian:partnerRevealed', payload);
        }
    }

    /** Partner card has surfaced — camps are now public. */
    public onPartnerReveal(data: any): void {
        const payload = data?.data || data;
        this.partnerRevealed = true;
        this.landlordCamp = payload?.landlordCamp || this.landlordCamp;
        this.farmerCamp = payload?.farmerCamp || this.farmerCamp;
        if (typeof payload?.partnerCard === 'number') this.partnerCard = payload.partnerCard;
        eventTarget.emit('shuangjian:partnerRevealed', payload);
    }

    public onStartPlay(data: any): void {
        const payload = data?.data || data;
        eventTarget.emit('shuangjian:startPlayRendered', payload);
    }

    // -------- Public helpers used by RoomScene --------

    /**
     * Send the banker's bao-or-not selection to the server.
     * RoomScene's UI should call this when the player taps either button.
     */
    public async sendBaopaiChoice(roomId: string, isBaopai: boolean): Promise<void> {
        const sock = await WebsocketMgr.instance({});
        sock.send({
            type: 'selectBaopai',
            params: { roomId, isBaopai },
        });
    }

    /**
     * Validate that `selected` (cards in hand) can beat `target` (last play).
     * Returns true if valid (or a free play).
     */
    public validatePlay(selected: number[], target: number[]): boolean {
        if (!selected || selected.length === 0) return false;
        const sj: SjJudgeResult = judgeCardTypeShuangjian(selected);
        if (!sj.valid) return false;
        if (!target || target.length === 0) return true;
        const tj = judgeCardTypeShuangjian(target);
        if (!tj.valid) return true;
        return compareShuangjian(tj, sj) > 0;
    }

    /** Hint-button helper. */
    public getHint(target: number[], myCards: number[]): number[] {
        return cardHintShuangjian(target || [], myCards || []);
    }

    /** Reset round-scoped state (banker decided, camps cleared). */
    public resetRoundState(): void {
        this.partnerCard = -1;
        this.landlordCamp = [];
        this.farmerCamp = [];
        this.partnerRevealed = false;
        this.isBaopai = false;
        this.bankerId = '';
        this.baopaiCountDown = -1;
    }
}

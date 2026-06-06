/**
 * ShuangjianGameOverPanel - Twin-Sword settlement panel (4-seat layout).
 *
 * Mirrors the existing Doudizhu GameOver UI but with 4 player slots and
 * Shuangjian-specific decorations:
 *   - Camp (banker / opponent) badge per row
 *   - Rank (1..N), score (base × multiplier) and award list per row
 *   - Title showing victory category: 包牌 / 双关 / 单关 / 平局
 *   - Optional "n奖×(n-3)" row when fiveAwardChallenge is on
 *
 * The component intentionally does NOT touch the legacy GameOver script so
 * Doudizhu rounds keep their tested behaviour.
 */
import { _decorator, Component, Label, Node, Color, resources, SpriteFrame, sys } from 'cc';
import { findChildByNameRecursive, loadRemoteImg } from '../../../Utils/Tools';
import { RoundBox } from '../../UI/RoundBox';

const { ccclass, property } = _decorator;

/** Per-user row data passed to `showGameOver`. */
export interface ShuangjianResultRow {
    user_id: string;
    user_name?: string;
    user_head_img?: string;
    rank: number;
    camp: 'landlord' | 'farmer';
    awards: any;          // raw AwardDetail object
    get_score: number;
    gold?: number | string;
}

export interface ShuangjianGameOverData {
    /** Ordered list (head-first). Length should match seat count (2/4). */
    results: ShuangjianResultRow[];
    /** Server-side victoryStatus enum. */
    victoryStatus: 'baopai-win' | 'baopai-lose' | 'double' | 'single' | 'draw';
    /** Special-rule flags so the panel can render the bonus row. */
    fiveAwardChallenge?: boolean;
    /** Partner card for display (banker side). */
    partnerCard?: number;
    landlordCamp?: string[];
    farmerCamp?: string[];
}

const VICTORY_TITLE: { [k: string]: { text: string; color: Color } } = {
    'baopai-win': { text: '包牌胜利', color: new Color(226, 98, 98) },
    'baopai-lose': { text: '包牌失败', color: new Color(58, 58, 58) },
    'double': { text: '双关', color: new Color(226, 98, 98) },
    'single': { text: '单关', color: new Color(226, 98, 98) },
    'draw': { text: '平局', color: new Color(120, 120, 120) },
};

@ccclass('ShuangjianGameOverPanel')
export class ShuangjianGameOverPanel extends Component {
    @property({ type: Node, displayName: '再来一局' })
    PlayAnotherRound: Node = null;

    /** Optional row for the 5-award-challenge multiplier readout. */
    @property({ type: Node, displayName: '五奖冲关行' })
    fiveAwardRow: Node = null;

    private currentData: ShuangjianGameOverData | null = null;

    public showGameOver(data: ShuangjianGameOverData): void {
        this.currentData = data;
        this.node.active = true;

        // Title
        const titleNode = this.node.getChildByName('Title');
        const meta = VICTORY_TITLE[data.victoryStatus] || VICTORY_TITLE['draw'];
        if (titleNode) {
            titleNode.getComponent(Label).string = meta.text;
            titleNode.getComponent(Label).color = meta.color;
        }

        // Slots (User1..User4)
        const slotNames = ['User1', 'User2', 'User3', 'User4'];
        for (let i = 0; i < slotNames.length; i++) {
            const slot = this.node.getChildByName(slotNames[i]);
            if (!slot) continue;
            const row = data.results[i];
            if (!row) {
                slot.active = false;
                continue;
            }
            slot.active = true;
            this.renderRow(slot, row, data);
        }

        // Five-award-challenge bonus row
        if (this.fiveAwardRow) {
            this.fiveAwardRow.active = !!data.fiveAwardChallenge;
            if (data.fiveAwardChallenge) {
                const winner = data.results.find(r => r.awards?.totalAwards >= 5);
                const txt = findChildByNameRecursive(this.fiveAwardRow, 'BonusText');
                if (txt && winner) {
                    const n = winner.awards.totalAwards;
                    const each = n * (n - 3);
                    const total = each * (data.results.length - 1);
                    txt.getComponent(Label).string = `${n}奖×${(n - 3)}：每人${each}，总计${total}`;
                }
            }
        }
    }

    private renderRow(slot: Node, row: ShuangjianResultRow, data: ShuangjianGameOverData): void {
        // Avatar
        const head = findChildByNameRecursive(slot, 'Head');
        if (head) {
            if (!row.user_head_img || row.user_head_img === '/Image/default_head.png') {
                resources.load('Image/default_head/spriteFrame', SpriteFrame, (err, spriteFrame) => {
                    if (err) return;
                    head.getComponent(RoundBox).spriteFrame = spriteFrame;
                });
            } else {
                loadRemoteImg(row.user_head_img, head);
            }
        }
        // Rank label
        const rankLabel = findChildByNameRecursive(slot, 'Rank');
        if (rankLabel) rankLabel.getComponent(Label).string = `第${row.rank}名`;
        // Camp badge
        const campLabel = findChildByNameRecursive(slot, 'Camp');
        if (campLabel) {
            campLabel.getComponent(Label).string = row.camp === 'landlord' ? '庄' : '闲';
        }
        // Score
        const scoreLabel = findChildByNameRecursive(slot, 'GetGold');
        if (scoreLabel) {
            const sign = row.get_score >= 0 ? '+' : '';
            scoreLabel.getComponent(Label).string = `${sign}${row.get_score}`;
            scoreLabel.getComponent(Label).color = row.get_score >= 0
                ? new Color(105, 250, 8)
                : new Color(195, 73, 73);
        }
        // Awards summary (e.g. "4个头×1, 2王×1")
        const awardsLabel = findChildByNameRecursive(slot, 'Awards');
        if (awardsLabel) {
            awardsLabel.getComponent(Label).string = this.formatAwards(row.awards);
        }
    }

    /**
     * Convert an AwardDetail object into a one-line readable string. Spec
     * note: "1×510K" should display "0个奖" because a single 510K is worth 0
     * awards.
     */
    private formatAwards(d: any): string {
        if (!d) return '0奖';
        const parts: string[] = [];
        if (d.heads) {
            for (const sz of [4, 5, 6, 7, 8]) {
                if (d.heads[sz]) parts.push(`${sz}个头×${d.heads[sz]}`);
            }
        }
        if (d.kingCount === 2) parts.push(d.twoKingIdentical ? '同王×2' : '双王×1');
        else if (d.kingCount === 3) parts.push('三王×3');
        else if (d.kingCount === 4) parts.push('四王×6');
        if (d.fiveTenKCount === 1) parts.push('1×510K（0奖）');
        else if (d.fiveTenKCount >= 3) parts.push(`${d.fiveTenKCount}×510K`);
        parts.push(`合计${d.totalAwards || 0}奖`);
        return parts.join('，');
    }

    public hideGameOver(): void {
        this.node.active = false;
        if (this.PlayAnotherRound) this.PlayAnotherRound.active = true;
        this.currentData = null;
    }
}

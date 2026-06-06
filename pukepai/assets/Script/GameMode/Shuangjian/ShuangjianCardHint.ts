/**
 * ShuangjianCardHint - Client-side card-type judgment & hint helper for the
 * Fengcheng Twin-Sword mode.
 *
 * This file is a slim re-implementation of the server's ShuangjianCardLogic
 * trimmed to what the client actually needs:
 *   - judging whether the player's current selection is a legal play
 *   - suggesting a follow-on play for the hint button
 *
 * We deliberately copy the logic instead of importing the server file to
 * keep the cocos build self-contained.
 *
 * Card encoding mirrors the server: [1..54] for the first deck, [101..154]
 * for the second deck. Use `toRealCard()` to drop the deck offset.
 */

export enum SjCardType {
    INVALID = 0,
    SINGLE = 1,
    PAIR = 2,
    THREE_WITH_TWO = 3,
    PLANE = 4,
    STRAIGHT = 5,
    DOUBLE_STRAIGHT = 6,
    FIVE_TEN_K = 7,
    BOMB = 8,
    KING_BOMB = 9,
}

export interface SjJudgeResult {
    valid: boolean;
    type: SjCardType;
    headCount: number;
    kingCount: number;
    fiveTenKCount: number;
    fiveTenKSuited: boolean;
    mainRank: number;
    cards: number[];
}

export function toRealCard(id: number): number {
    return id > 100 ? id - 100 : id;
}

const SJ_RANK_ORDER: number[] = [54, 53, 2, 1, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3];

function rankValue(real: number): number {
    if (real === 53 || real === 54) return real;
    return (real - 1) % 13 + 1;
}
function suit(real: number): number {
    if (real === 53 || real === 54) return 4;
    return Math.ceil(real / 13) - 1;
}
function countByRank(cards: number[]): { [k: number]: number } {
    const map: { [k: number]: number } = {};
    for (const c of cards) {
        const r = rankValue(toRealCard(c));
        map[r] = (map[r] || 0) + 1;
    }
    return map;
}

const INVALID: SjJudgeResult = {
    valid: false, type: SjCardType.INVALID,
    headCount: 0, kingCount: 0, fiveTenKCount: 0, fiveTenKSuited: false,
    mainRank: 0, cards: [],
};

function detect510K(cards: number[]): { valid: boolean; suited: boolean } {
    if (cards.length !== 3) return { valid: false, suited: false };
    const ranks = cards.map(c => rankValue(toRealCard(c))).sort((a, b) => a - b);
    if (ranks[0] !== 5 || ranks[1] !== 10 || ranks[2] !== 13) return { valid: false, suited: false };
    const suits = cards.map(c => suit(toRealCard(c)));
    return { valid: true, suited: suits.every(s => s === suits[0]) };
}

function detectMulti510K(cards: number[]): { count: number; allSuited: boolean } | null {
    if (cards.length === 0 || cards.length % 3 !== 0) return null;
    const counts = countByRank(cards);
    const need = cards.length / 3;
    if ((counts[5] || 0) !== need) return null;
    if ((counts[10] || 0) !== need) return null;
    if ((counts[13] || 0) !== need) return null;
    const fives = cards.filter(c => rankValue(toRealCard(c)) === 5).map(c => suit(toRealCard(c))).sort();
    const tens = cards.filter(c => rankValue(toRealCard(c)) === 10).map(c => suit(toRealCard(c))).sort();
    const kings = cards.filter(c => rankValue(toRealCard(c)) === 13).map(c => suit(toRealCard(c))).sort();
    let suited = true;
    for (let i = 0; i < need; i++) {
        if (!(fives[i] === tens[i] && tens[i] === kings[i])) { suited = false; break; }
    }
    return { count: need, allSuited: suited };
}

function detectBombOrKingBomb(cards: number[]): SjJudgeResult | null {
    if (cards.length >= 2 && cards.every(c => {
        const r = rankValue(toRealCard(c));
        return r === 53 || r === 54;
    })) {
        return {
            valid: true, type: SjCardType.KING_BOMB,
            headCount: 0, kingCount: cards.length, fiveTenKCount: 0, fiveTenKSuited: false,
            mainRank: 0, cards: cards.slice(),
        };
    }
    if (cards.length < 4) return null;
    const map = countByRank(cards);
    const ranks = Object.keys(map);
    if (ranks.length === 1 && map[Number(ranks[0])] >= 4) {
        const r = Number(ranks[0]);
        return {
            valid: true, type: SjCardType.BOMB,
            headCount: cards.length, kingCount: 0, fiveTenKCount: 0, fiveTenKSuited: false,
            mainRank: r === 1 ? 14 : (r === 2 ? 15 : r),
            cards: cards.slice(),
        };
    }
    return null;
}

function detectStraight(cards: number[]): SjJudgeResult | null {
    if (cards.length < 7) return null;
    const map = countByRank(cards);
    const ranks = Object.keys(map).map(Number);
    if (!ranks.every(r => map[r] === 1)) return null;
    if (ranks.some(r => r === 2 || r === 53 || r === 54)) return null;
    const orderedAsc = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 1];
    const sorted = ranks.slice().sort((a, b) => orderedAsc.indexOf(a) - orderedAsc.indexOf(b));
    for (let i = 1; i < sorted.length; i++) {
        if (orderedAsc.indexOf(sorted[i]) - orderedAsc.indexOf(sorted[i - 1]) !== 1) return null;
    }
    return {
        valid: true, type: SjCardType.STRAIGHT,
        headCount: 0, kingCount: 0, fiveTenKCount: 0, fiveTenKSuited: false,
        mainRank: orderedAsc.indexOf(sorted[0]) + 3,
        cards: cards.slice(),
    };
}

function detectDoubleStraight(cards: number[]): SjJudgeResult | null {
    if (cards.length < 6 || cards.length % 2 !== 0) return null;
    const map = countByRank(cards);
    const ranks = Object.keys(map).map(Number);
    if (!ranks.every(r => map[r] === 2)) return null;
    if (ranks.some(r => r === 2 || r === 53 || r === 54)) return null;
    const orderedAsc = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 1];
    const sorted = ranks.slice().sort((a, b) => orderedAsc.indexOf(a) - orderedAsc.indexOf(b));
    if (sorted.length < 3) return null;
    for (let i = 1; i < sorted.length; i++) {
        if (orderedAsc.indexOf(sorted[i]) - orderedAsc.indexOf(sorted[i - 1]) !== 1) return null;
    }
    return {
        valid: true, type: SjCardType.DOUBLE_STRAIGHT,
        headCount: 0, kingCount: 0, fiveTenKCount: 0, fiveTenKSuited: false,
        mainRank: orderedAsc.indexOf(sorted[0]) + 3,
        cards: cards.slice(),
    };
}

function detectThreeWithTwoOrPlane(cards: number[]): SjJudgeResult | null {
    if (cards.length < 5) return null;
    const map = countByRank(cards);
    const tripleRanks = Object.keys(map).map(Number).filter(r => map[r] >= 3 && r !== 53 && r !== 54);
    if (tripleRanks.length === 0) return null;
    const orderedAsc = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 1, 2];
    tripleRanks.sort((a, b) => orderedAsc.indexOf(a) - orderedAsc.indexOf(b));
    let bestRun: number[] = [];
    for (let s = 0; s < tripleRanks.length; s++) {
        const run = [tripleRanks[s]];
        for (let i = s + 1; i < tripleRanks.length; i++) {
            if (orderedAsc.indexOf(tripleRanks[i]) - orderedAsc.indexOf(run[run.length - 1]) === 1
                && tripleRanks[i] !== 2) run.push(tripleRanks[i]);
            else break;
        }
        if (run.length > bestRun.length) bestRun = run;
    }
    if (bestRun.length === 1 && cards.length === 5) {
        return {
            valid: true, type: SjCardType.THREE_WITH_TWO,
            headCount: 0, kingCount: 0, fiveTenKCount: 0, fiveTenKSuited: false,
            mainRank: bestRun[0] === 1 ? 14 : (bestRun[0] === 2 ? 15 : bestRun[0]),
            cards: cards.slice(),
        };
    }
    if (bestRun.length >= 2) {
        const tripleSize = bestRun.length * 3;
        const tail = cards.length - tripleSize;
        if (tail >= 0 && tail <= 2 * bestRun.length) {
            return {
                valid: true, type: SjCardType.PLANE,
                headCount: 0, kingCount: 0, fiveTenKCount: 0, fiveTenKSuited: false,
                mainRank: bestRun[0] === 1 ? 14 : (bestRun[0] === 2 ? 15 : bestRun[0]),
                cards: cards.slice(),
            };
        }
    }
    return null;
}

export function judgeCardTypeShuangjian(cards: number[]): SjJudgeResult {
    if (!cards || cards.length === 0) return INVALID;
    const kb = detectBombOrKingBomb(cards);
    if (kb && kb.type === SjCardType.KING_BOMB) return kb;
    if (cards.length === 3) {
        const r = detect510K(cards);
        if (r.valid) {
            return {
                valid: true, type: SjCardType.FIVE_TEN_K,
                headCount: 0, kingCount: 0,
                fiveTenKCount: 1, fiveTenKSuited: r.suited,
                mainRank: 0, cards: cards.slice(),
            };
        }
    } else if (cards.length >= 6 && cards.length % 3 === 0) {
        const r = detectMulti510K(cards);
        if (r) {
            return {
                valid: true, type: SjCardType.FIVE_TEN_K,
                headCount: 0, kingCount: 0,
                fiveTenKCount: r.count, fiveTenKSuited: r.allSuited,
                mainRank: 0, cards: cards.slice(),
            };
        }
    }
    if (kb && kb.type === SjCardType.BOMB) return kb;
    if (cards.length === 1) {
        const r = rankValue(toRealCard(cards[0]));
        return {
            valid: true, type: SjCardType.SINGLE,
            headCount: 0, kingCount: 0, fiveTenKCount: 0, fiveTenKSuited: false,
            mainRank: r === 1 ? 14 : (r === 2 ? 15 : (r === 53 ? 16 : (r === 54 ? 17 : r))),
            cards: cards.slice(),
        };
    }
    if (cards.length === 2) {
        const r0 = rankValue(toRealCard(cards[0]));
        const r1 = rankValue(toRealCard(cards[1]));
        if (r0 === r1 && r0 !== 53 && r0 !== 54) {
            return {
                valid: true, type: SjCardType.PAIR,
                headCount: 0, kingCount: 0, fiveTenKCount: 0, fiveTenKSuited: false,
                mainRank: r0 === 1 ? 14 : (r0 === 2 ? 15 : r0),
                cards: cards.slice(),
            };
        }
        return INVALID;
    }
    const planeRes = detectThreeWithTwoOrPlane(cards);
    if (planeRes) return planeRes;
    const sr = detectStraight(cards);
    if (sr) return sr;
    const ds = detectDoubleStraight(cards);
    if (ds) return ds;
    return INVALID;
}

function categoryWeight(r: SjJudgeResult): number {
    if (r.type === SjCardType.FIVE_TEN_K) {
        if (r.fiveTenKCount >= 4) return 120;
        if (r.fiveTenKCount === 3) return 80;
        return r.fiveTenKSuited ? 20 : 10;
    }
    if (r.type === SjCardType.BOMB) {
        switch (r.headCount) {
            case 4: return 30;
            case 5: return 50;
            case 6: return 60;
            case 7: return 90;
            case 8: return 100;
            default: return 30 + r.headCount;
        }
    }
    if (r.type === SjCardType.KING_BOMB) {
        if (r.kingCount >= 4) return 110;
        if (r.kingCount === 3) return 70;
        return 40;
    }
    return 1;
}

export function compareShuangjian(previous: SjJudgeResult, current: SjJudgeResult): number {
    if (!previous.valid || !current.valid) return -1;
    const wp = categoryWeight(previous);
    const wc = categoryWeight(current);
    if (wc !== wp) return wc - wp;
    if (previous.type !== current.type) return -1;
    if (previous.cards.length !== current.cards.length) return -1;
    return current.mainRank - previous.mainRank;
}

/**
 * Suggest a single-card response or pair beating `targetCards`.
 * Falls back to bombs / king-bombs if available. Returns [] when no legal
 * response exists.
 */
export function cardHintShuangjian(targetCards: number[], myCards: number[]): number[] {
    const targetJ = targetCards.length === 0 ? null : judgeCardTypeShuangjian(targetCards);
    const byRank: { [r: number]: number[] } = {};
    for (const c of myCards) {
        const r = rankValue(toRealCard(c));
        if (!byRank[r]) byRank[r] = [];
        byRank[r].push(c);
    }
    if (!targetJ) {
        const orderedSmallToBig = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 1, 2, 53, 54];
        for (const r of orderedSmallToBig) {
            if (byRank[r] && byRank[r].length > 0) return [byRank[r][0]];
        }
        return [];
    }
    if (targetJ.type === SjCardType.SINGLE) {
        const order = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 1, 2, 53, 54];
        for (const r of order) {
            const myRank = r === 1 ? 14 : (r === 2 ? 15 : (r === 53 ? 16 : (r === 54 ? 17 : r)));
            if (myRank > targetJ.mainRank && byRank[r] && byRank[r].length > 0) return [byRank[r][0]];
        }
    } else if (targetJ.type === SjCardType.PAIR) {
        const order = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 1, 2];
        for (const r of order) {
            const myRank = r === 1 ? 14 : (r === 2 ? 15 : r);
            if (myRank > targetJ.mainRank && byRank[r] && byRank[r].length >= 2) {
                return byRank[r].slice(0, 2);
            }
        }
    }
    const bombRanks = Object.keys(byRank).map(Number)
        .filter(r => byRank[r].length >= 4 && r !== 53 && r !== 54);
    if (bombRanks.length > 0) {
        bombRanks.sort((a, b) => {
            const ra = a === 1 ? 14 : (a === 2 ? 15 : a);
            const rb = b === 1 ? 14 : (b === 2 ? 15 : b);
            return ra - rb;
        });
        for (const r of bombRanks) {
            const candidate = byRank[r].slice(0, 4);
            const cj = judgeCardTypeShuangjian(candidate);
            if (compareShuangjian(targetJ, cj) > 0) return candidate;
        }
    }
    const kings = (byRank[53] || []).concat(byRank[54] || []);
    if (kings.length >= 2) {
        const cj = judgeCardTypeShuangjian(kings);
        if (compareShuangjian(targetJ, cj) > 0) return kings;
    }
    return [];
}

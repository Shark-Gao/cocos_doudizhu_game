const CARD_RANK_ORDER = [54, 53, 2, 1, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3];

type GroupKind = 'bomb' | 'triple' | 'pair' | 'single';

interface DisplayGroup {
    cards: number[];
    kind: GroupKind;
    minIndex: number;
}

interface GroupSortOptions {
    includeBombs?: boolean;
}

export function getClientRealCard(cardIndex: number): number {
    const n = Number(cardIndex);
    if (!Number.isFinite(n)) return 0;
    return n > 100 ? n - 100 : n;
}

export function getClientCardRank(cardIndex: number): number {
    const realCard = getClientRealCard(cardIndex);
    if (realCard === 53 || realCard === 54) return realCard;
    return (realCard - 1) % 13 + 1;
}

export function sortCardsByRankDesc(cards: number[]): number[] {
    return cards.slice().sort((a, b) => {
        const rankCompare = CARD_RANK_ORDER.indexOf(getClientCardRank(a)) - CARD_RANK_ORDER.indexOf(getClientCardRank(b));
        if (rankCompare !== 0) return rankCompare;
        return getClientRealCard(a) - getClientRealCard(b);
    });
}

export function sortCardGroupsForDisplay(cards: number[], options: GroupSortOptions = {}): number[] {
    const includeBombs = options.includeBombs !== false;
    const baseCards = sortCardsByRankDesc(cards);
    const rankMap: { [rank: number]: { card: number, index: number }[] } = {};

    baseCards.forEach((card, index) => {
        const rank = getClientCardRank(card);
        if (!rankMap[rank]) rankMap[rank] = [];
        rankMap[rank].push({ card, index });
    });

    const groups: DisplayGroup[] = [];
    Object.keys(rankMap).forEach(rankKey => {
        const sameRankCards = rankMap[Number(rankKey)];
        let kind: GroupKind | null = null;
        if (includeBombs && sameRankCards.length >= 4) {
            kind = 'bomb';
        } else if (sameRankCards.length === 3) {
            kind = 'triple';
        } else if (sameRankCards.length === 2) {
            kind = 'pair';
        } else if (sameRankCards.length === 1) {
            kind = 'single';
        }

        if (!kind) return;
        groups.push({
            cards: sameRankCards.map(item => item.card),
            kind,
            minIndex: Math.min(...sameRankCards.map(item => item.index)),
        });
    });

    const priority: Record<GroupKind, number> = {
        bomb: 0,
        triple: 1,
        pair: 2,
        single: 3,
    };

    return groups
        .sort((a, b) => priority[a.kind] - priority[b.kind] || a.minIndex - b.minIndex)
        .reduce((list, group) => list.concat(group.cards), [] as number[]);
}

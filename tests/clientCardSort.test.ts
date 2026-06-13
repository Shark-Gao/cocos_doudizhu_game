import assert from 'node:assert/strict';
import { sortCardGroupsForDisplay } from '../pukepai/assets/Utils/clientCardSort';

const ranksOf = (cards: number[]) => cards.map(card => {
    if (card === 53 || card === 54) return card;
    return (card - 1) % 13 + 1;
});

const mixedCards = [
    3, 16, 29, 42, // 3 炸弹
    7, 20, 33,     // 7 三个头
    9, 22,         // 9 对子
    54,            // 大王单张
    1,             // A 单张
];

const sorted = sortCardGroupsForDisplay(mixedCards);

assert.deepEqual(
    ranksOf(sorted),
    [3, 3, 3, 3, 7, 7, 7, 9, 9, 54, 1],
    'client display sort should order groups as bomb, triple, pair, single',
);

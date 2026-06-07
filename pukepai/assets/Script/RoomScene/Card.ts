/*
 * @author: sharkgao
 * @LastEditors: sharkgao
 */
/*
 * @author: sharkgao
 * @LastEditors: sharkgao
 */
import { _decorator, CCInteger, Component, Enum, instantiate, math, Node, Prefab, Quat, tween, UITransform, v2, v3, Widget } from 'cc';
import { BUILD } from 'cc/env';
import { CardItem } from './CardItem';
import type { CardSelection } from './CardSelection';
import { toRealCard } from '../../Utils/Tools';
import { GameMode } from '../GameMode/IGameModeView';
import { compareShuangjian, judgeCardTypeShuangjian, SjCardType } from '../GameMode/Shuangjian/ShuangjianCardHint';
import type { SjJudgeResult } from '../GameMode/Shuangjian/ShuangjianCardHint';
const { ccclass, property } = _decorator;

// 定义一个枚举类型，包含下拉框的选项
enum DropdownOptions {
    my,
    leftUser,
    rightUser,
    topUser,
}

// 将枚举类型注册到 Cocos Creator 中
const DropdownOptionsEnum = Enum(DropdownOptions);

@ccclass('Card')
export class Card extends Component {
    @property({
        type: [String],
        displayName: '卡牌列表',
    })
    public cardList = [];
    @property({
        type: Prefab,
        displayName: '卡片',
    })
    cardPrefab: Prefab = null;
    @property({
        type: DropdownOptionsEnum,
        displayName: '卡牌渲染类型',
    })
    cardUser: DropdownOptions = DropdownOptions.my;
    private sortFiveTenKGroups: boolean = true;
    private gameMode: number | null = null;

    start() {

    }

    public setSortFiveTenKGroups(enabled: boolean) {
        this.sortFiveTenKGroups = enabled;
    }

    public setGameMode(gameMode: any) {
        const mode = Number(gameMode);
        this.gameMode = Number.isNaN(mode) ? null : mode;
    }

    // 初始化卡牌
    init(isFirstInit = false) {
        if (this.cardUser == DropdownOptions.my) {
            this.initMyCard(isFirstInit);
        } else if (this.cardUser == DropdownOptions.leftUser) {
            this.initLeftUserCard();
        } else if (this.cardUser == DropdownOptions.rightUser) {
            this.initRightUserCard();
        } else if (this.cardUser == DropdownOptions.topUser) {
            this.initTopUserCard();
        }
    }

    // 卡牌重新排序
    cardSort(callback?) {
        if (this.cardUser == DropdownOptions.my) {
            this.myCardSort(callback);
        } else if (this.cardUser == DropdownOptions.leftUser) {
            this.LeftUserCardSort(callback);
        } else if (this.cardUser == DropdownOptions.rightUser) {
            this.RightUserCardSort(callback);
        } else if (this.cardUser == DropdownOptions.topUser) {
            this.TopUserCardSort(callback);
        }
    }

    public getMyCardSpacing() {
        const cardCount = this.getMyDisplayCardList().length;
        const buildSpacingOffset = BUILD ? 10 : 0;
        if (cardCount <= 20) return 40 + buildSpacingOffset;
        if (cardCount <= 27) return 36 + buildSpacingOffset;
        return 40 + buildSpacingOffset;
    }

    private getTopCardSpacing() {
        return this.getMyCardSpacing();
    }

    private getVerticalCardSpacing() {
        return this.cardList.length > 20 ? 15 : 22;
    }

    private getRank(cardIndex: number) {
        const realCard = toRealCard(cardIndex);
        if (realCard === 53 || realCard === 54) return realCard;
        return (realCard - 1) % 13 + 1;
    }

    private getShuangjianSortedCardList(cards: number[]) {
        const rankOrder = [54, 53, 2, 1, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3];
        return cards.slice().sort((a, b) => {
            const rankCompare = rankOrder.indexOf(this.getRank(a)) - rankOrder.indexOf(this.getRank(b));
            if (rankCompare !== 0) return rankCompare;
            return toRealCard(a) - toRealCard(b);
        });
    }

    private isShuangjianMode() {
        if (this.gameMode !== null) return this.gameMode === GameMode.SHUANGJIAN;
        const roomScene = (this.node.getComponent('CardSelection') as CardSelection)?.roomScene;
        return Number(roomScene?.roomInfo?.game_mode) === GameMode.SHUANGJIAN;
    }

    private is510KCombination(cards: number[]) {
        if (cards.length < 3 || cards.length % 3 !== 0) return false;
        const rankCounts: { [rank: number]: number } = {};
        cards.forEach(card => {
            const rank = this.getRank(card);
            rankCounts[rank] = (rankCounts[rank] || 0) + 1;
        });
        const groupCount = cards.length / 3;
        return rankCounts[5] === groupCount && rankCounts[10] === groupCount && rankCounts[13] === groupCount;
    }

    private getShuangjianGroupSortResult(cards: number[]): SjJudgeResult | null {
        const result = judgeCardTypeShuangjian(cards);
        if (!result.valid || result.type === SjCardType.FIVE_TEN_K || this.is510KCombination(cards)) return null;
        if (result.type !== SjCardType.BOMB && result.type !== SjCardType.KING_BOMB) return null;
        return result;
    }

    private getFiveTenKSortResult(cards: number[]): SjJudgeResult | null {
        if (!this.sortFiveTenKGroups || cards.length < 3 || cards.length % 3 !== 0) return null;
        const result = judgeCardTypeShuangjian(cards);
        if (!result.valid || result.type !== SjCardType.FIVE_TEN_K) return null;
        return result;
    }

    private collectShuangjianDisplayGroups(cardList: number[]) {
        const groups: { cards: number[], result: SjJudgeResult, minIndex: number }[] = [];
        const usedIndexes: { [index: number]: boolean } = {};
        const rankMap: { [rank: number]: { card: number, index: number }[] } = {};

        cardList.forEach((card, index) => {
            const rank = this.getRank(card);
            if (!rankMap[rank]) rankMap[rank] = [];
            rankMap[rank].push({ card, index });
        });

        Object.keys(rankMap).forEach(rankKey => {
            const rank = Number(rankKey);
            const sameRankCards = rankMap[rank];
            if ((rank === 53 || rank === 54) || sameRankCards.length < 4) return;
            const cards = sameRankCards.map(item => item.card);
            const result = this.getShuangjianGroupSortResult(cards);
            if (!result) return;
            groups.push({
                cards,
                result,
                minIndex: Math.min(...sameRankCards.map(item => item.index)),
            });
            sameRankCards.forEach(item => usedIndexes[item.index] = true);
        });

        if (this.sortFiveTenKGroups) {
            const fives = rankMap[5] || [];
            const tens = rankMap[10] || [];
            const kings = rankMap[13] || [];
            const groupCount = Math.min(fives.length, tens.length, kings.length);
            const addFiveTenKGroup = (groupCards: { card: number, index: number }[]) => {
                if (groupCards.some(item => usedIndexes[item.index])) return;
                const cards = groupCards.map(item => item.card);
                const result = this.getFiveTenKSortResult(cards);
                if (!result) return;
                groups.push({
                    cards,
                    result,
                    minIndex: Math.min(...groupCards.map(item => item.index)),
                });
                groupCards.forEach(item => usedIndexes[item.index] = true);
            };

            if (groupCount === 2) {
                for (let i = 0; i < groupCount; i++) {
                    addFiveTenKGroup([fives[i], tens[i], kings[i]]);
                }
            } else if (groupCount > 0) {
                addFiveTenKGroup(fives.slice(0, groupCount).concat(tens.slice(0, groupCount), kings.slice(0, groupCount)));
            }
        }

        const kingCards = cardList
            .map((card, index) => ({ card, index }))
            .filter(item => {
                const rank = this.getRank(item.card);
                return rank === 53 || rank === 54;
            });
        if (kingCards.length >= 2) {
            const cards = kingCards.map(item => item.card);
            const result = this.getShuangjianGroupSortResult(cards);
            if (result) {
                groups.push({
                    cards,
                    result,
                    minIndex: Math.min(...kingCards.map(item => item.index)),
                });
                kingCards.forEach(item => usedIndexes[item.index] = true);
            }
        }

        return { groups, usedIndexes };
    }

    private getMyDisplayCardList() {
        if (!this.isShuangjianMode()) return this.cardList;

        const baseCardList = this.getShuangjianSortedCardList(this.cardList);
        const { groups, usedIndexes } = this.collectShuangjianDisplayGroups(baseCardList);
        if (groups.length <= 0) return baseCardList;

        groups.sort((a, b) => {
            const compareResult = compareShuangjian(a.result, b.result);
            if (compareResult !== 0) return compareResult;
            return a.minIndex - b.minIndex;
        });

        const restCards = baseCardList.filter((_, index) => !usedIndexes[index]);
        return groups.reduce((list, group) => list.concat(group.cards), []).concat(restCards);
    }

    // 初始化我的牌, isDealCards：是否第一次发牌，第一次执行动画默认隐藏卡牌
    private initMyCard(isFirstInit) {
        // 每次渲染之前先删除掉之前渲染的卡牌
        this.node.removeAllChildren();
        const displayCardList = this.getMyDisplayCardList();
        this.cardList = displayCardList;
        const spacing = this.getMyCardSpacing();
        displayCardList.forEach((cardNum, index) => {
            const card = instantiate(this.cardPrefab);
            console.log("渲染我的卡牌 isFirstInit", isFirstInit);
            // 设置卡片值 — toRealCard 把双剑第二副牌(>100)归一到 1..54
            const realNum = toRealCard(cardNum);
            card.getComponent(CardItem).cardIndex = cardNum;
            card.getComponent(CardItem).cardNum = realNum % 13 == 0 ? 13 : realNum % 13;
            card.getComponent(CardItem).cardType = Math.ceil(realNum / 13) - 1;
            card.getComponent(CardItem).mingpai = true; // 我的牌必定是展示正面的
            card.getComponent(Widget).left = index * spacing;
            this.node.addChild(card);
            // 默认隐藏，等待动画结束展示
            card.active = !isFirstInit;
        });

        // 第一次发牌执行动画的话，等动画执行完毕回调中初始化，选择卡牌方法
        if (!isFirstInit) {
            this.scheduleOnce(() => {
                // 设置卡牌选择功能
                (this.node.getComponent('CardSelection') as CardSelection)?.initSelectCard();
            }, 0)
        }
    }

    // 卡牌重新排序
    private myCardSort(callback?) {
        console.log("还剩余", this.node.children.filter(child => child.isValid).length);
        const displayCardList = this.getMyDisplayCardList();
        this.cardList = displayCardList;
        const spacing = this.getMyCardSpacing();
        const orderMap: { [cardIndex: number]: number[] } = {};
        displayCardList.forEach((cardNum, index) => {
            if (!orderMap[cardNum]) orderMap[cardNum] = [];
            orderMap[cardNum].push(index);
        });
        const orderCursor: { [cardIndex: number]: number } = {};
        const validCards = this.node.children.filter(child => child.isValid).map((card, originalIndex) => {
            const cardIndex = card.getComponent(CardItem).cardIndex;
            const cursor = orderCursor[cardIndex] || 0;
            orderCursor[cardIndex] = cursor + 1;
            return {
                card,
                originalIndex,
                order: orderMap[cardIndex]?.[cursor] ?? originalIndex,
            };
        });
        validCards.sort((a, b) => a.order - b.order);
        validCards.forEach(({ card }, index) => {
            card.setSiblingIndex(index);
            tween(card.getComponent(Widget)).to(0.2, {
                left: index * spacing
            }).call(() => {
                callback && callback();
            }).start()
        });
    }

    // 初始化左侧用户牌
    private initLeftUserCard() {
        console.log(this.cardList)
        // 每次渲染之前先删除掉之前渲染的卡牌
        this.node.removeAllChildren();
        const spacing = this.getVerticalCardSpacing();
        this.cardList.forEach((cardNum, index) => {
            const card = instantiate(this.cardPrefab);
            // 0 没有明牌,不去设置牌值
            if (cardNum != 0) {
                const realNum = toRealCard(cardNum);
                card.getComponent(CardItem).cardIndex = cardNum;
                // 设置卡片值
                card.getComponent(CardItem).cardNum = (realNum % 13 == 0 ? 13 : realNum % 13);
                // 设置卡牌类型
                card.getComponent(CardItem).cardType = Math.ceil(realNum / 13) - 1;
            }
            card.getComponent(CardItem).mingpai = (cardNum == 0 ? false : true);
            card.getComponent(Widget).top = index * spacing;
            card.getComponent(Widget).left = 9;
            card.getComponent(Widget).updateAlignment();
            card.getComponent(UITransform).setContentSize(53, 72);
            // 创建一个四元数对象
            const rotationQuat = new Quat();
            // 围绕 Z 轴旋转 45 度
            Quat.fromEuler(rotationQuat, 0, 0, -90);
            // 设置节点的旋转
            card.setRotation(rotationQuat);
            card.parent = this.node;
        });
    }

    // 右侧用户牌排序
    private LeftUserCardSort(callback?) {
        const spacing = this.getVerticalCardSpacing();
        this.node.children.filter(child => child.isValid).forEach((card, index) => {
            tween(card.getComponent(Widget)).to(0.2, {
                top: index * spacing
            }).call(() => {
                callback && callback();
            }).start()
        });
    }

    // 初始化右侧用户牌
    private initRightUserCard() {
        console.log("initRightUserCard", this.cardList)
        // 每次渲染之前先删除掉之前渲染的卡牌
        this.node.removeAllChildren();
        const spacing = this.getVerticalCardSpacing();
        const cardNodes: any[] = []; // 用于暂存创建的 card 节点
        this.cardList.reverse().forEach((cardNum, index, temp) => {
            const card = instantiate(this.cardPrefab);
            // 0 没有明牌,不去设置牌值
            if (cardNum != 0) {
                const realNum = toRealCard(cardNum);
                card.getComponent(CardItem).cardIndex = cardNum;
                // 设置卡片值
                card.getComponent(CardItem).cardNum = (realNum % 13 == 0 ? 13 : realNum % 13);
                // 设置卡牌类型
                card.getComponent(CardItem).cardType = Math.ceil(realNum / 13) - 1;
            }
            card.getComponent(CardItem).mingpai = (cardNum == 0 ? false : true);
            card.getComponent(Widget).top = index * spacing;
            card.getComponent(Widget).left = 9;
            card.getComponent(Widget).updateAlignment();
            card.getComponent(UITransform).setContentSize(53, 72);
            // 创建一个四元数对象
            const rotationQuat = new Quat();
            // 围绕 Z 轴旋转 90 度
            Quat.fromEuler(rotationQuat, 0, 0, 90);
            // 设置节点的旋转
            card.setRotation(rotationQuat);
            card.parent = this.node;
            // 设置目标节点的兄弟索引
            cardNodes.push(card);
        });

        cardNodes.forEach((card, index, temp) => {
            // 反向下标
            const reverseIndex = (temp.length - 1 - index);
            card.setSiblingIndex(reverseIndex);
        })
    }

    // 右侧用户牌排序
    private RightUserCardSort(callback?) {
        const spacing = this.getVerticalCardSpacing();
        this.node.children.filter(child => child.isValid).forEach((card, index, temp) => {
            // 反向下标
            const reverseIndex = (temp.length - 1 - index);
            tween(card.getComponent(Widget)).to(0.2, {
                top: reverseIndex * spacing
            }).call(() => {
                callback && callback();
            }).start()
        });
    }

    /**
     * 初始化顶部玩家手牌（双剑 4 人位的对面玩家）。
     * 视觉：水平排列、卡背朝上不明牌、不旋转。
     * 顶部玩家和底部玩家使用同一套横向自适应间距。
     */
    private initTopUserCard() {
        // 每次渲染之前先删除掉之前渲染的卡牌
        this.node.removeAllChildren();
        const spacing = this.getTopCardSpacing();
        this.cardList.forEach((cardNum, index) => {
            const card = instantiate(this.cardPrefab);
            // 0 没有明牌,不去设置牌值
            if (cardNum != 0) {
                const realNum = toRealCard(cardNum);
                card.getComponent(CardItem).cardIndex = cardNum;
                card.getComponent(CardItem).cardNum = (realNum % 13 == 0 ? 13 : realNum % 13);
                card.getComponent(CardItem).cardType = Math.ceil(realNum / 13) - 1;
            }
            card.getComponent(CardItem).mingpai = (cardNum == 0 ? false : true);
            card.getComponent(Widget).left = index * spacing;
            card.getComponent(Widget).updateAlignment();
            card.getComponent(UITransform).setContentSize(53, 72);
            card.parent = this.node;
        });
    }

    // 顶部玩家牌排序
    private TopUserCardSort(callback?) {
        const spacing = this.getTopCardSpacing();
        this.node.children.filter(child => child.isValid).forEach((card, index) => {
            tween(card.getComponent(Widget)).to(0.2, {
                left: index * spacing
            }).call(() => {
                callback && callback();
            }).start()
        });
    }

    // 名牌翻转
    mingpai() {
        this.node.children.forEach((card, index) => {
            const cardNum = this.cardList[index];
            const cardItem = card.getComponent(CardItem);
            if (cardNum) {
                const realNum = toRealCard(cardNum);
                cardItem.cardIndex = cardNum;
                cardItem.cardNum = realNum % 13 == 0 ? 13 : realNum % 13;
                cardItem.cardType = Math.ceil(realNum / 13) - 1;
            }
            cardItem.mingpai = true;
            cardItem.init();
        });
    }

    update(deltaTime: number) {

    }
}

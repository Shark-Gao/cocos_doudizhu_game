/*
 * @author: sharkgao
 * @LastEditors: sharkgao
 */
/*
 * @author: sharkgao
 * @LastEditors: sharkgao
 */
import { _decorator, CCInteger, Component, Enum, instantiate, math, Node, Prefab, Quat, tween, UITransform, v2, v3, Widget } from 'cc';
import { CardItem } from './CardItem';
import type { CardSelection } from './CardSelection';
import { toRealCard } from '../../Utils/Tools';
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

    start() {

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
        const cardCount = this.cardList.length;
        if (cardCount <= 20) return 40;
        if (cardCount <= 27) return 28;
        return 24;
    }

    private getTopCardSpacing() {
        return this.getMyCardSpacing();
    }

    private getVerticalCardSpacing() {
        return this.cardList.length > 20 ? 15 : 22;
    }

    // 初始化我的牌, isDealCards：是否第一次发牌，第一次执行动画默认隐藏卡牌
    private initMyCard(isFirstInit) {
        // 每次渲染之前先删除掉之前渲染的卡牌
        this.node.removeAllChildren();
        const spacing = this.getMyCardSpacing();
        this.cardList.forEach((cardNum, index) => {
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
        const spacing = this.getMyCardSpacing();
        this.node.children.filter(child => child.isValid).forEach((card, index) => {
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



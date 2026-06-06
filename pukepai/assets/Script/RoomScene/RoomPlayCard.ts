import { _decorator, Button, Color, Component, instantiate, Label, Node, Prefab, Sprite, sys, tween, UITransform, Vec3, Widget, director, AudioClip } from 'cc';
import { WebsocketMgr } from '../Api/WebsocketMgr';
import { eventTarget } from '../../Utils/EventListening';
import { findChildByNameRecursive, playCardAudio, toRealCard } from '../../Utils/Tools';
import { RoomScene } from './RoomScene';
import { CardItem } from './CardItem';
import { Card } from './Card';
import { CardSelection } from './CardSelection';
import { CommonUIManager } from '../CommonUIManager';
import CardHint from '../../Utils/cardHint';
import { GameOver } from './GameOver';
import { AudioMgr } from '../AudioMgr';
import { getPlayAudio, getRoomMainAudio, getRoomMusicAudio, RoomMainAudio, RoomMusicAudio } from '../../Utils/constant';
import { GameMode } from '../GameMode/IGameModeView';
import { cardHintShuangjian } from '../GameMode/Shuangjian/ShuangjianCardHint';
const { ccclass, property } = _decorator;
@ccclass('RoomPlayCard')
export class RoomPlayCard extends Component {

    @property({
        type: RoomScene,
        displayName: "房间场景脚本"
    })
    roomScene: RoomScene = null;
    @property({
        type: Node,
        displayName: "我的信息节点（包含用户信息、卡片）"
    })
    myInfoNode: Node = null;
    @property({
        type: Node,
        displayName: "我的卡片存放节点"
    })
    myCardParentNode: Node = null;
    @property({
        type: Prefab,
        displayName: "卡牌预制体"
    })
    cardItem: Prefab = null;
    @property({
        type: Prefab,
        displayName: "不要精灵预制体"
    })
    noPlayCards: Prefab = null;
    @property({
        type: Node,
        displayName: "玩家1卡片存放节点"
    })
    user1CardParent: Node = null;
    @property({
        type: Node,
        displayName: "玩家2卡片存放节点"
    })
    user2CardParent: Node = null;
    @property({
        type: Node,
        displayName: "游戏结束弹框"
    })
    gameOverPopUp: Node = null;

    // 本地存储用户信息
    userInfo: any = {};
    // 玩家出牌期间第一次获取到出牌倒计时信息
    firstGetPlayCardTimeDown: boolean = true;
    // 提示卡牌第几个
    hintCardNum: number = 0;
    // 510K辅助选择第几个
    fiveTenKHintNum: number = 0;
    // 当前局是否已经切换到紧张背景音乐
    private hasPlayedExcitingMusic: boolean = false;

    start() {
        try {
            // 解析本地用户信息
            this.userInfo = JSON.parse(sys.localStorage.getItem("userInfo"));
        } catch (error) {
            console.log("获取用户信息失败");
        }

        console.log(this.roomScene);
        // 监听出牌倒计时器
        eventTarget.on("playCardTimer", this.onPlayCardTimer, this);
        // 监听新局发牌，重置残局音乐状态
        eventTarget.on("dealCards", this.onDealCards, this);
        // 监听发牌动画结束，此时手牌可以手动选择
        eventTarget.on("dealCardsAmt", this.onDealCardsAmt, this);
        // 取消托管监听
        eventTarget.on("cancelTrusteeship", this.onCancelTrusteeship, this);
        // 监听机器人出牌
        eventTarget.on("robotPlay", this.onRobotPlay, this);
        // 监听用户出牌回调
        eventTarget.on("userPlayCard", this.onUserPlayCard, this);
        // 被挤掉线
        eventTarget.on("replaceLogin", this.onReplaceLogin, this);
        // 双剑专属：结算推送
        eventTarget.on("shuangjianGameOver", this.onShuangjianGameOver, this);
        this.bindFiveTenKButton();
        this.setFiveTenKButtonActive(false);

        // 测试提示方法
        // console.log("提示出牌", CardHint.cardHint([], [17, 17, 17, 4, 5, 6, 7, 8, 54]))
    }

    private bindFiveTenKButton() {
        const fiveTenKBtn = findChildByNameRecursive(this.myInfoNode, "510K") || findChildByNameRecursive(this.node, "510K");
        if (!fiveTenKBtn) return;
        const button = fiveTenKBtn.getComponent(Button);
        if (!button) return;
        fiveTenKBtn.off(Button.EventType.CLICK, this.selectFiveTenK, this);
        fiveTenKBtn.on(Button.EventType.CLICK, this.selectFiveTenK, this);
    }

    private setFiveTenKButtonActive(active: boolean) {
        const fiveTenKBtn = findChildByNameRecursive(this.myInfoNode, "510K") || findChildByNameRecursive(this.node, "510K");
        if (!fiveTenKBtn) return;
        const canManualSelectCard = this.myCardParentNode?.children?.some(card => card?.active) || false;
        fiveTenKBtn.active = active && canManualSelectCard && Number(this.roomScene?.roomInfo?.game_mode) === GameMode.SHUANGJIAN;
    }

    protected onDestroy(): void {
        eventTarget.off("playCardTimer", this.onPlayCardTimer, this);
        eventTarget.off("dealCards", this.onDealCards, this);
        eventTarget.off("dealCardsAmt", this.onDealCardsAmt, this);
        eventTarget.off("cancelTrusteeship", this.onCancelTrusteeship, this);
        eventTarget.off("robotPlay", this.onRobotPlay, this);
        eventTarget.off("userPlayCard", this.onUserPlayCard, this);
        eventTarget.off("replaceLogin", this.onReplaceLogin, this);
        eventTarget.off("shuangjianGameOver", this.onShuangjianGameOver, this);
        const fiveTenKBtn = findChildByNameRecursive(this.myInfoNode, "510K") || findChildByNameRecursive(this.node, "510K");
        fiveTenKBtn?.off(Button.EventType.CLICK, this.selectFiveTenK, this);
    }

    update(deltaTime: number) {

    }

    private tryPlayExcitingMusic(leftCardCount: number) {
        if (!this.hasPlayedExcitingMusic && leftCardCount > 0 && leftCardCount <= 2) {
            this.hasPlayedExcitingMusic = true;
            AudioMgr.inst.play(getRoomMusicAudio(RoomMusicAudio.exciting), 1, true, director.getScene().name);
        }
    }

    private onDealCards() {
        this.hasPlayedExcitingMusic = false;
        this.fiveTenKHintNum = 0;
        this.setFiveTenKButtonActive(false);
    }

    private onDealCardsAmt() {
        this.setFiveTenKButtonActive(true);
    }

    private getHintCards(targetCards: number[] = [], myCards: number[] = []) {
        try {
            const safeTargetCards = targetCards || [];
            const safeMyCards = myCards || [];
            if (Number(this.roomScene?.roomInfo?.game_mode) === GameMode.SHUANGJIAN) {
                const hint = cardHintShuangjian(safeTargetCards, safeMyCards);
                return hint?.length > 0 ? [hint] : [];
            }
            if (safeTargetCards.length <= 0) {
                return safeMyCards.length > 0 ? [[safeMyCards[0]]] : [];
            }
            return CardHint.cardHint(safeTargetCards, safeMyCards) || [];
        } catch (error) {
            console.log("获取提示牌失败", error);
            return [];
        }
    }

    private playRoomMainCardEffect(playCard: number[]): void {
        const playCardAudioName = playCardAudio(playCard);
        if (playCardAudioName === 'zhadan' || playCardAudioName === 'wangzha') {
            AudioMgr.inst.playOneShot(getRoomMainAudio(RoomMainAudio.boom));
        } else if (playCardAudioName === 'feiji') {
            AudioMgr.inst.playOneShot(getRoomMainAudio(RoomMainAudio.plane));
        } else if (playCard?.length > 0) {
            AudioMgr.inst.playOneShot(getRoomMainAudio(RoomMainAudio.sendcard));
        }
    }

    private playUserAudio(userId: any, audioName: string): void {
        const audioUrl = getPlayAudio(audioName, this.roomScene?.roomInfo?.roomUsers?.[userId]);
        if (audioUrl) {
            AudioMgr.inst.playOneShot(audioUrl);
        }
    }

    // 监听被挤掉线
    onReplaceLogin({ data, code, message }) {
        if (code == 200) {
            this.node.getChildByName("ReplaceLogin").active = true;
            WebsocketMgr.close(1000, "被挤掉线");
            CommonUIManager.inst.showToast(message);
            // 被挤掉线了，重置第一次获取出牌倒计时状态
            this.firstGetPlayCardTimeDown = true;
        }
    }

    // 监听出牌倒计时
    onPlayCardTimer({ data, code }) {
        if (code == 200) {
            // 获取节点上的用户分别都是谁
            const userNodeId = this.roomScene.getUserNodeInfo();

            // 轮到我出牌了，删除上次出牌记录
            if (data.userId == this.userInfo.user_id) {
                this.myInfoNode.getChildByName("PlayCardBox").removeAllChildren();
            }

            userNodeId.forEach(async ({ nodeId, node }) => {
                // 出牌倒计时没有结束 && 查询哪个节点用户在出牌中
                if (data.downTime != 0 && nodeId == data.userId) {
                    // 查询最近一条的出牌记录
                    const lastRecord = this.roomScene.getLastRecord();

                    // 判断当前出牌用户是否是自己
                    if (data.userId == this.userInfo.user_id) {
                        console.log("展示出牌按钮", data.isYaPai, this.firstGetPlayCardTimeDown)
                        const PlayHandBtn = findChildByNameRecursive(node, "PlayHandBtn");
                        const noPlayBtn = findChildByNameRecursive(node, "btn_buchu");
                        const hintBtn = findChildByNameRecursive(node, "btn_tisji");
                        const myCardSelection = this.myCardParentNode.getComponent(CardSelection);
                        myCardSelection.setCurrentTurnIsYaPai(!!data.isYaPai);

                        // 自己回合每次倒计时都恢复操作区，避免房间信息刷新或其他逻辑隐藏按钮后只剩倒计时。
                        if (PlayHandBtn) {
                            PlayHandBtn.active = true;
                        }
                        if (hintBtn) {
                            hintBtn.active = true;
                        }
                        this.setFiveTenKButtonActive(true);
                        if (noPlayBtn) {
                            noPlayBtn.active = !!data.isYaPai;
                        }
                        findChildByNameRecursive(this.myInfoNode, "Regardless").active = false;
                        if (PlayHandBtn) {
                            PlayHandBtn.getComponent(Widget).horizontalCenter = data.isYaPai ? 0 : -57.5;
                        }

                        // 第一次获取出牌倒计时
                        if (this.firstGetPlayCardTimeDown) {
                            // 提示出牌次数重置
                            this.hintCardNum = 0;
                            console.log(data.isYaPai ? "压牌" : "不压牌")

                            // 第一次获取到出牌倒计时，判断是否默认禁用出牌按钮，没有选择卡牌&&选择卡牌小于上一个玩家出的牌，禁用按钮
                            myCardSelection.updatePlayCardBtnStyle();

                            // 默认获取一次提示，如果管不上就展示要不起遮罩。
                            // 双剑提示算法只用于辅助选牌，不覆盖全部可压牌型，不能用提示为空来阻挡手动选牌。
                            const hintCardList = this.getHintCards(data.isYaPai ? (lastRecord?.playCard || []) : [], this.myCardParentNode.getComponent(Card).cardList || []);
                            if (hintCardList.length <= 0 && data.isYaPai && this.roomScene?.roomInfo?.game_mode !== GameMode.SHUANGJIAN) {
                                findChildByNameRecursive(this.myInfoNode, "Regardless").active = true;
                            }

                            this.firstGetPlayCardTimeDown = false;
                        }
                    }

                    // 轮到该用户出牌时，删除上一次的出牌记录
                    node.getChildByName("PlayCardBox").removeAllChildren();
                    // 展示出牌倒计时
                    findChildByNameRecursive(node, "TimeDown").active = true;
                    const timeDown = findChildByNameRecursive(node, "TimeDown");
                    timeDown.getChildByName('Str').getComponent(Label).string = data.downTime;
                    if (nodeId == this.userInfo.user_id) {
                        AudioMgr.inst.playOneShot(getRoomMainAudio(data.downTime <= 3 ? RoomMainAudio.remind : RoomMainAudio.ring));
                    }
                } else {
                    if (nodeId == this.userInfo.user_id && data.downTime <= 0) {
                        AudioMgr.inst.playOneShot(getRoomMainAudio(RoomMainAudio.timeup));
                        this.setFiveTenKButtonActive(false);
                    }
                    // 隐藏出牌按钮
                    const SnatchLandlord = findChildByNameRecursive(node, "PlayHandBtn");
                    SnatchLandlord ? SnatchLandlord.active = false : null;
                    // 隐藏倒计时
                    findChildByNameRecursive(node, "TimeDown").active = false;
                }
            })
        }
    }

    /**
     * 出牌动作执行
     * @param playCard 出牌数组
     * @param userId 出牌用户id
     */
    playCardRender(playCard: Array<number>, userId) {
        const userNodeId = this.roomScene.getUserNodeInfo();
        // 没有出牌（不出|管不上）
        if (playCard?.length <= 0) {
            userNodeId.forEach(({ nodeId, node }) => {
                if (nodeId == userId) {
                    // 删除出牌内容
                    node.getChildByName("PlayCardBox").removeAllChildren();
                    // 展示不要图片
                    node.getChildByName("PlayCardBox").addChild(instantiate(this.noPlayCards));
                }
            })
        } else if (userId == this.userInfo.user_id) { // 当前出牌的玩家是自己的话有动画
            // 我的卡牌节点组件Card
            const myCardCom = this.myCardParentNode.getComponent(Card);
            const myCardSelectionCom = this.myCardParentNode.getComponent(CardSelection);
            // 需要出的卡牌节点
            const playCardNode = [];
            // 获取要出的卡牌节点
            this.myCardParentNode.children.forEach((card, index) => {
                const cardItem = card.getComponent(CardItem)
                const cardIndex = cardItem.cardIndex || (cardItem.cardNum + cardItem.cardType * 13);
                // 获取卡牌
                if (playCard.indexOf(cardIndex) != -1) {
                    playCardNode.push(card)
                }
            })
            // 我出的卡牌存放节点
            const playCardBox = this.myInfoNode.getChildByName("PlayCardBox");
            // 获取位子
            const playCardBoxPos = playCardBox.getWorldPosition();
            // 计算出的牌总宽度，宽高 70*96，默认宽高, 每张向右偏移25
            const totalWidth = (playCardNode.length - 1) * 25 + 70;
            // 相对世界位子，开始位子
            const worldStartLeft = playCardBoxPos.x - ((totalWidth - 70) / 2);
            // 相对父级开始位子
            const startLeftst = -((totalWidth - 70) / 2);
            // 自动出牌删除上一次出牌记录
            playCardBox.removeAllChildren();


            // 执行出牌动画
            playCardNode.forEach((card: Node, index) => {
                const cardWorldPos = card.getWorldPosition();
                const cardPos = card.getPosition();
                const world_x = worldStartLeft + 25 * index;
                const x = startLeftst + 25 * index;
                // 世界位置的差值，进行相对位置的移动
                const x_difference_value = world_x - cardWorldPos.x;
                const y_difference_value = playCardBoxPos.y - cardWorldPos.y;
                const startWidth = card.getComponent(UITransform).width;
                const startHeight = card.getComponent(UITransform).height;

                // 复制一份用户出的卡牌，到playCardBox节点下，然后动画结束，删除掉用户卡牌中已出卡牌
                const cardItem = instantiate(this.cardItem);
                cardItem.getComponent(CardItem).cardIndex = card.getComponent(CardItem).cardIndex;
                cardItem.getComponent(CardItem).cardType = card.getComponent(CardItem).cardType;
                cardItem.getComponent(CardItem).cardNum = card.getComponent(CardItem).cardNum;
                cardItem.getComponent(CardItem).mingpai = true;
                cardItem.getComponent(UITransform).setContentSize(70, 96);
                cardItem.active = false;
                playCardBox.addChild(cardItem);

                // 创建一个tween动画
                tween(card)
                    .to(0.2, {
                        position: new Vec3(cardPos.x + x_difference_value, cardPos.y + y_difference_value, playCardBoxPos.z),
                    }, {
                        onUpdate: (target, ratio) => {
                            // 动画执行中，执行回调
                            target.getComponent(UITransform).width = startWidth + (70 - startWidth) * ratio;
                            target.getComponent(UITransform).height = startHeight + (96 - startHeight) * ratio;
                        }
                    }).call(() => {
                        // 动画完成后的回调
                        playCardBox.children.forEach((item, index) => {
                            item.getComponent(Widget).left = startLeftst + 25 * index;
                            item.active = true;
                        })
                        // 删除原卡牌
                        card.destroy();

                        // 最后一个动画执行完毕
                        if (index == playCardNode.length - 1) {
                            this.scheduleOnce(() => {
                                // 删除已出卡牌
                                myCardCom.cardList = myCardCom.cardList.filter((cardNum, index) => { return playCard.indexOf(cardNum) == -1 });
                                this.tryPlayExcitingMusic(myCardCom.cardList.length);
                                // 卡牌排序
                                myCardCom.cardSort(() => {
                                    // 更新选中卡牌方法（出了一张牌，所以需要更新以下）
                                    myCardSelectionCom.initSelectCard();
                                    this.setFiveTenKButtonActive(true);
                                });
                            }, 0)
                        }
                    })
                    .start();
            })
        } else { // 其他玩家出牌的话没有动画
            userNodeId.forEach(({ nodeId, node, cardParentNode, cardNodeName }) => {
                if (nodeId == userId) {
                    // 删除掉上一次的出牌记录
                    findChildByNameRecursive(node, "PlayCardBox").removeAllChildren();
                    // 判断是否明牌
                    if (this.roomScene.roomInfo.roomUsers[nodeId].mingpai) { // 明牌删除对应卡牌，并出牌
                        cardParentNode.children.forEach((card, index) => {
                            const cardItem = card.getComponent(CardItem)
                            const cardIndex = cardItem.cardIndex || (cardItem.cardNum + cardItem.cardType * 13);
                            if (playCard.indexOf(cardIndex) != -1) {
                                card.destroy();
                            }
                        })

                        this.scheduleOnce(() => {
                            // 重新排序
                            cardParentNode.getComponent(Card).cardSort();
                        }, 0)
                    } else {
                        const cardCom = cardParentNode.getComponent(Card)
                        // 从结尾开始删除
                        if (cardNodeName == "leftUser") {
                            cardCom.cardList = cardCom.cardList.slice(0, cardCom.cardList.length - playCard.length);
                        } else {
                            // 从头开始删除
                            cardCom.cardList = cardCom.cardList.slice(0 + playCard.length, cardCom.cardList.length);
                        }
                        this.tryPlayExcitingMusic(cardCom.cardList.length);
                        cardCom.init();
                    }

                    // 出牌
                    playCard.forEach((cardNum, index, temp) => {
                        const cardItem = instantiate(this.cardItem);
                        const realCardNum = toRealCard(cardNum);
                        cardItem.getComponent(CardItem).cardIndex = cardNum;
                        // 反向下标
                        const reverseIndex = (temp.length - 1 - index);

                        // 右侧玩家需要反向排列；左侧和顶部玩家从父节点 0 坐标开始向右排列。
                        if (cardNodeName == "rightUser") {
                            cardItem.getComponent(Widget).left = -(reverseIndex * 25);
                            cardItem.getComponent(CardItem).cardType = Math.ceil(realCardNum / 13) - 1;
                            cardItem.getComponent(CardItem).cardNum = realCardNum % 13 == 0 ? 13 : realCardNum % 13;
                        } else {
                            cardItem.getComponent(Widget).left = index * 25;
                            cardItem.getComponent(CardItem).cardType = Math.ceil(realCardNum / 13) - 1;
                            cardItem.getComponent(CardItem).cardNum = realCardNum % 13 == 0 ? 13 : realCardNum % 13;
                        }
                        cardItem.getComponent(CardItem).mingpai = true;
                        cardItem.getComponent(UITransform).setContentSize(70, 96);
                        findChildByNameRecursive(node, "PlayCardBox").addChild(cardItem);
                    })
                }
            })
        }
    }

    // 监听取消托管
    onCancelTrusteeship({ data, code }) {
        if (code == 200) {
            // 获取节点上的用户分别都是谁
            const userNodeId = this.roomScene.getUserNodeInfo();
            userNodeId.forEach(({ nodeId, node }) => {
                if (nodeId == data.userId) {
                    // 隐藏托管按钮
                    findChildByNameRecursive(node, "Trusteeship").active = false;
                }
            })
        }
    }

    // 取消托管
    async cancelTrusteeship() {
        const socket = await WebsocketMgr.instance({ url: `/roomInfo?roomId=${sys.localStorage.getItem("joinRoomId")}&userId=${this.userInfo.user_id}` });
        socket.send({
            type: "cancelTrusteeship",
            params: {
                roomId: sys.localStorage.getItem("joinRoomId"),
            }
        });
    }

    /**
     * 用户出牌
     * @param event 
     * @param type 1 不出 2 出牌
     */
    async userPlayCard(event, type) {
        AudioMgr.inst.playOneShot(getRoomMainAudio(RoomMainAudio.click));
        const selectCard = this.myCardParentNode.getComponent(CardSelection).getSelectCards() || [];
        console.log("selectCard", selectCard);

        // 用户点击按钮，隐藏要不起遮罩
        findChildByNameRecursive(this.myInfoNode, "Regardless").active = false;

        // 选择卡牌为空
        if (type == 2 && selectCard.length == 0) {
            AudioMgr.inst.playOneShot(getRoomMainAudio(RoomMainAudio.error_acl));
            return CommonUIManager.inst.showToast("请选择出牌");
        } else if (type == 1) {
            // 选中卡牌取消
            this.myCardParentNode.getComponent(CardSelection).noPlayCard();
        }

        const playHandBtn = findChildByNameRecursive(this.myInfoNode, "PlayHandBtn");
        const timeDown = findChildByNameRecursive(this.myInfoNode, "TimeDown");
        const wasPlayHandBtnActive = !!playHandBtn?.active;
        const wasTimeDownActive = !!timeDown?.active;
        const fiveTenKBtn = findChildByNameRecursive(this.myInfoNode, "510K") || findChildByNameRecursive(this.node, "510K");
        const wasFiveTenKBtnActive = !!fiveTenKBtn?.active;
        if (playHandBtn) {
            playHandBtn.active = false;
        }
        if (timeDown) {
            timeDown.active = false;
        }
        this.setFiveTenKButtonActive(false);

        try {
            const socket = await WebsocketMgr.instance({ url: `/roomInfo?roomId=${sys.localStorage.getItem("joinRoomId")}&userId=${this.userInfo.user_id}` });
            socket.send({
                type: "userPlayCard",
                params: {
                    roomId: sys.localStorage.getItem("joinRoomId"),
                    playCards: type == 1 ? [] : selectCard.map(item => item.cardIndex)
                }
            });
        } catch (error) {
            console.log("userPlayCard error", error);
            if (playHandBtn) {
                playHandBtn.active = wasPlayHandBtnActive;
            }
            if (timeDown) {
                timeDown.active = wasTimeDownActive;
            }
            if (fiveTenKBtn) {
                fiveTenKBtn.active = wasFiveTenKBtnActive;
            }
            CommonUIManager.inst.showToast("操作失败，请重试");
        }
    }

    private getCardRank(cardIndex: number) {
        const realCard = toRealCard(cardIndex);
        if (realCard === 53 || realCard === 54) return realCard;
        return (realCard - 1) % 13 + 1;
    }

    private getCardSuit(cardIndex: number) {
        const realCard = toRealCard(cardIndex);
        if (realCard === 53 || realCard === 54) return 4;
        return Math.ceil(realCard / 13) - 1;
    }

    private getFiveTenKHintCards(cardList: number[]) {
        const rankCards: { [rank: number]: number[] } = {};
        cardList.forEach(card => {
            const rank = this.getCardRank(card);
            if (!rankCards[rank]) {
                rankCards[rank] = [];
            }
            rankCards[rank].push(card);
        });

        const fives = rankCards[5] || [];
        const tens = rankCards[10] || [];
        const kings = rankCards[13] || [];
        const result: number[][] = [];
        fives.forEach(five => {
            tens.forEach(ten => {
                kings.forEach(king => {
                    result.push([five, ten, king]);
                });
            });
        });

        return result.sort((a, b) => {
            const aSuited = this.getCardSuit(a[0]) === this.getCardSuit(a[1]) && this.getCardSuit(a[1]) === this.getCardSuit(a[2]);
            const bSuited = this.getCardSuit(b[0]) === this.getCardSuit(b[1]) && this.getCardSuit(b[1]) === this.getCardSuit(b[2]);
            if (aSuited !== bSuited) return aSuited ? -1 : 1;
            return Math.min(...a) - Math.min(...b);
        });
    }

    // 510K辅助选牌
    selectFiveTenK() {
        AudioMgr.inst.playOneShot(getRoomMainAudio(RoomMainAudio.click));
        if (Number(this.roomScene?.roomInfo?.game_mode) !== GameMode.SHUANGJIAN) {
            AudioMgr.inst.playOneShot(getRoomMainAudio(RoomMainAudio.alert));
            return;
        }

        const myCards = this.myCardParentNode.getComponent(Card).cardList || [];
        const fiveTenKList = this.getFiveTenKHintCards(myCards);
        if (fiveTenKList.length <= 0) {
            AudioMgr.inst.playOneShot(getRoomMainAudio(RoomMainAudio.alert));
            return CommonUIManager.inst.showToast("没有可选的510K");
        }

        if (this.fiveTenKHintNum > fiveTenKList.length - 1) {
            this.fiveTenKHintNum = 0;
        }
        this.myCardParentNode.getComponent(CardSelection).hintSelectCard(fiveTenKList[this.fiveTenKHintNum]);
        this.fiveTenKHintNum++;
    }

    // 卡牌提示
    cardHint() {
        AudioMgr.inst.playOneShot(getRoomMainAudio(RoomMainAudio.click));
        // 查询最近一条的出牌记录
        const lastRecord = this.roomScene.getLastRecord();
        const myCardSelection = this.myCardParentNode.getComponent(CardSelection);
        const currentTurnIsYaPai = myCardSelection.getCurrentTurnIsYaPai();
        // 优先使用服务端当前回合下发的压牌状态，避免已出完玩家最后一手旧牌继续作为提示目标。
        const isYaPai = currentTurnIsYaPai !== null
            ? currentTurnIsYaPai
            : ((!lastRecord?.userId || lastRecord?.userId == this.userInfo.user_id) ? false : true);
        // 获取提示卡牌
        const hintCardList = this.getHintCards(isYaPai ? (lastRecord?.playCard || []) : [], this.myCardParentNode.getComponent(Card).cardList || []);
        console.log("提示卡牌为", hintCardList)
        console.log("获取当前玩家卡牌信息", this.myCardParentNode.getComponent(Card).cardList);
        // 判断是否有提示卡牌（是否能管的上）
        if (hintCardList.length > 0) {
            // 判断提示的卡牌，是否已经提示一圈了，如果已经提示过，则从0开始提示
            if (this.hintCardNum > hintCardList.length - 1) {
                this.hintCardNum = 0;
            }
            // 提示卡牌
            this.myCardParentNode.getComponent(CardSelection).hintSelectCard(hintCardList[hintCardList.length - 1 - this.hintCardNum]);
            // 提示次数加1
            this.hintCardNum++;
        } else {
            AudioMgr.inst.playOneShot(getRoomMainAudio(RoomMainAudio.alert));
        }
    }

    // 监听机器人出牌
    onRobotPlay({ data, code }) {
        if (code == 200) {
            // 更新房间出牌记录
            this.roomScene.updataRoomInfoPlayCardRecord(data.play_card_record);

            // 展示托管按钮
            const userNodeId = this.roomScene.getUserNodeInfo();
            // 机器人托管，隐藏要不起遮罩
            findChildByNameRecursive(this.myInfoNode, "Regardless").active = false;
            userNodeId.forEach(({ nodeId, node }) => {
                // 出牌用户
                if (nodeId == data.userId) {
                    findChildByNameRecursive(node, "Trusteeship").active = true;
                }
            })

            // 渲染卡牌
            this.playCardRender(data.playCard, data.userId);

            // 判断是否所有玩家都已经被托管了，都被托管的话，不播放出牌音乐了
            // if (data.isAllHosted == false) {
            if (data.playCard?.length <= 0) {
                this.playUserAudio(data.userId, "buyao");
            } else {
                // 出牌音频名称;
                const playCardAudioName = playCardAudio(data.playCard);
                // 播放音频
                this.playUserAudio(data.userId, playCardAudioName);
            }
            // }

            this.playRoomMainCardEffect(data.playCard);

            // 当前登录玩家机器人出牌后，重置第一次获取出牌倒计时状态，下次轮到自己出牌时，更新出牌按钮状态
            if (this.userInfo.user_id == data.userId) {
                this.myCardParentNode.getComponent(CardSelection).setCurrentTurnIsYaPai(null);
                this.firstGetPlayCardTimeDown = true;
                this.setFiveTenKButtonActive(false);
            }

            // 判断游戏是否结束
            if (data.gameOver) {
                this.gameOver(data)
            }
        }
    }

    // 监听用户出牌, 隐藏出牌按钮
    onUserPlayCard({ data, code }) {
        if (code == 200) {
            // 获取节点上的用户分别都是谁
            const userNodeId = this.roomScene.getUserNodeInfo();
            // 游戏结束清空出牌记录，更新房间出牌记录
            this.roomScene.updataRoomInfoPlayCardRecord(data.gameOver ? [] : data.play_card_record);

            // 用户不出牌，展示不要图片
            if (data.playCard?.length <= 0) {
                userNodeId.forEach(({ nodeId, node }) => {
                    if (nodeId == data.userId) {
                        const playCardBox = node.getChildByName("PlayCardBox");
                        playCardBox.removeAllChildren();
                        // 展示不要图片
                        playCardBox.addChild(instantiate(this.noPlayCards));
                    }
                });
                this.playUserAudio(data.userId, "buyao");
            } else {
                // 渲染用户出的卡牌
                this.playCardRender(data.playCard, data.userId);
                // 出牌音频名称;
                const playCardAudioName = playCardAudio(data.playCard);
                // 播放音频
                this.playUserAudio(data.userId, playCardAudioName);
                this.playRoomMainCardEffect(data.playCard);
            }

            // 当前玩家出牌后
            if (this.userInfo.user_id == data.userId) {
                // 隐藏出牌按钮
                findChildByNameRecursive(this.myInfoNode, "PlayHandBtn").active = false;
                // 隐藏倒计时
                findChildByNameRecursive(this.myInfoNode, "TimeDown").active = false;
                this.myCardParentNode.getComponent(CardSelection).setCurrentTurnIsYaPai(null);
                // 重置首次获取出牌倒计时，下次轮到自己出牌时，更新出牌按钮状态
                this.firstGetPlayCardTimeDown = true;
                this.setFiveTenKButtonActive(false);
            }

            // 判断游戏是否结束
            if (data.gameOver) {
                this.gameOver(data)
            }
        }
    }

    /**
     * 双剑专属结算回调。把服务端推过来的 settlement 列表对齐成现有 GameOver
     * 弹窗能识别的 gameOverData 数组（按胜利方在前），再复用 gameOver 流程。
     * 当前 GameOver UI 仅有 3 个槽位 (User1/2/3)；4 人模式下第 4 个玩家的
     * 数据会在控制台打印出来，待后续完善 4 人结算面板时再渲染。
     */
    onShuangjianGameOver({ data, code }) {
        if (code !== 200) return;
        const winners = (data?.winners || []).slice();
        const losers = (data?.losers || []).slice();
        const gameOverData = [...winners, ...losers];
        const myIsWinner = winners.some(w => w.user_id === this.userInfo.user_id);
        const victoryStatus = myIsWinner ? 1 : 2;
        if (gameOverData.length > 3) {
            console.log('[Shuangjian] gameOver 4-player extras (UI not yet rendered):', gameOverData[3]);
        }
        // Reuse the existing 3-slot GameOver popup. roomUsers is shaped the
        // same as Doudizhu so the post-game card-flip animation still runs.
        this.gameOver({
            gameOverData,
            roomUsers: data?.roomUsers || {},
            victoryStatus,
        });
    }


    // 游戏结束
    gameOver({ gameOverData, roomUsers, victoryStatus }) {
        // 隐藏所有玩家倒计时，隐藏出牌按钮，隐藏机器人托管样式
        const userNodeId = this.roomScene.getUserNodeInfo()
        this.setFiveTenKButtonActive(false);

        // 筛选需要明牌的用户卡牌节点（过滤当前玩家和已出完牌玩家和明牌玩家）
        const mingPaiAnimationUser = userNodeId.filter(item => item.nodeId != this.userInfo.user_id && roomUsers[item.nodeId].user_card.length > 0 && roomUsers[item.nodeId].mingpai == false) || [];

        // 设置游戏结束，需要隐藏的UI
        userNodeId.forEach(({ nodeId, node, cardParentNode }, i) => {
            // 更新玩家元宝信息
            findChildByNameRecursive(node, "Gold").getComponent(Label).string = roomUsers[nodeId].gold > 10000 ? `${(roomUsers[nodeId].gold / 10000).toFixed(2)}万` : roomUsers[nodeId].gold;

            // 当前玩家节点
            if (nodeId == this.userInfo.user_id) {
                // 隐藏掉当前玩家的出牌按、要不起样式
                findChildByNameRecursive(this.myInfoNode, "PlayHandBtn").active = false;
                findChildByNameRecursive(this.myInfoNode, "Regardless").active = false;
            }
            // 所有玩家需要隐藏节点
            findChildByNameRecursive(node, "TimeDown").active = false;
            findChildByNameRecursive(node, "Trusteeship").active = false;
        })

        if (mingPaiAnimationUser.length > 0) {
            // 默认为第一个用户的卡牌length
            let lastIndex = roomUsers[mingPaiAnimationUser[0].nodeId].user_card.length;
            // 如果有两个玩家需要执行明牌动画，需要对比一下谁的牌多，等他执行完毕，展示结束弹框
            if (mingPaiAnimationUser[0] && mingPaiAnimationUser[1] && roomUsers[mingPaiAnimationUser[0].nodeId].user_card.length < roomUsers[mingPaiAnimationUser[1].nodeId].user_card.length) {
                lastIndex = roomUsers[mingPaiAnimationUser[1].nodeId].user_card.length;
            }

            mingPaiAnimationUser.forEach(({ nodeId, node, cardParentNode, cardNodeName }, index) => {
                // 卡牌明牌
                cardParentNode.getComponent(Card).cardList = roomUsers[nodeId].user_card;
                // 执行明牌动画
                roomUsers[nodeId].user_card.forEach((cardNum, index) => {
                    const card = cardParentNode.children[index];
                    if (!card.getComponent) {
                        console.log("执行结束翻牌动画错误", card);
                        return
                    }
                    this.scheduleOnce(() => {
                        card.getComponent(CardItem).cardNum = toRealCard(cardNum) % 13 == 0 ? 13 : toRealCard(cardNum) % 13;
                        card.getComponent(CardItem).cardType = Math.ceil(toRealCard(cardNum) / 13) - 1;
                        card.getComponent(CardItem).mingpai = true;
                        card.getComponent(CardItem).init();

                        if (index == lastIndex - 1) {
                            this.scheduleOnce(() => {
                                // 展示游戏结束弹框
                                this.gameOverPopUp.getComponent(GameOver).showGameOver(gameOverData, victoryStatus);
                            }, 0.3)
                        }
                    }, 0.05 * index)
                });

            })
        } else { // 没有需要明牌的玩家，直接展示结束弹框
            // 展示游戏结束弹框
            this.gameOverPopUp.getComponent(GameOver).showGameOver(gameOverData, victoryStatus);
        }

        console.log("mingPaiAnimationUser", mingPaiAnimationUser, mingPaiAnimationUser.length);
    }
}

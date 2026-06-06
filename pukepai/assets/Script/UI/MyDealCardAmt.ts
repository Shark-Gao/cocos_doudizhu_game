import { _decorator, AudioClip, Component, Node, tween, Vec3 } from 'cc';
import { eventTarget } from '../../Utils/EventListening';
import { AudioMgr } from '../AudioMgr';
import { getRoomMainAudio, RoomMainAudio } from '../../Utils/constant';
const { ccclass, property } = _decorator;
@ccclass('MyDealCardAmt')
export class MyDealCardAmt extends Component {
    @property({
        type: Node,
        displayName: "我的牌父节点(用于获取位子做动画)"
    })
    myCardParent: Node = null;
    @property({
        type: AudioClip,
        displayName: "发牌音频"
    })
    fapaiAudio: AudioClip = null;

    start() {
    }

    update(deltaTime: number) {

    }

    // 发牌动画
    dealCardAnimation() {
        const cards = this.node.children;
        const cardList = this.myCardParent.children;
        console.log("cards", cards);

        // 没有真实手牌时，直接结束动画流程
        if (cardList.length <= 0) {
            eventTarget.emit("dealCardsAmt", 0);
            return;
        }

        // 没有动画牌节点时，至少保证真实手牌全部展示
        if (cards.length <= 0) {
            cardList.forEach(card => card.active = true);
            eventTarget.emit("dealCardsAmt", cardList.length - 1);
            return;
        }

        // 初始化动画牌节点，动画牌数量可能少于真实手牌数量，后续会复用动画节点
        cards.forEach((element) => {
            element.setPosition(0, 71, 0);
            element.active = false;
        });

        // 展示
        this.node.active = true;
        // 发牌音频只在整段发牌动画开始时播放一次
        AudioMgr.inst.playOneShot(getRoomMainAudio(RoomMainAudio.sendcard));
        // 要移动到的目标节点位子
        const targetOpt = this.myCardParent.getWorldPosition();
        const spacing = (this.myCardParent.getComponent('Card') as any)?.getMyCardSpacing?.() || 40;
        console.log(targetOpt.x)

        for (let i = 0; i < cardList.length; i++) {
            const card = cards[i % cards.length];

            this.scheduleOnce(() => {
                card.setPosition(0, 71, 0);
                card.active = true;

                // 发牌动画
                tween(card)
                    .to(0.35, { worldPosition: new Vec3(targetOpt.x + i * spacing + 50, targetOpt.y, targetOpt.z) }, {
                        easing: 'quartOut'
                    })
                    .call(() => {
                        cardList[i].active = true;
                        card.active = false;

                        if (i == cardList.length - 1) {
                            // 动画完成后的回调
                            eventTarget.emit("dealCardsAmt", i);
                        }
                    })
                    .start();
            }, 0.1 * i);
        }
    }
}



import { _decorator, AudioClip, Button, Color, Component, director, EditBox, HorizontalTextAlignment, instantiate, Label, Layers, Node, Prefab, resources, SpriteFrame, sys, UITransform, VerticalTextAlignment } from 'cc';
import { noLoadingPost, post } from '../Api/FetchMgr';
import { CommonUIManager } from '../CommonUIManager';
import { WebsocketMgr } from '../Api/WebsocketMgr'
import { eventTarget } from '../../Utils/EventListening';
import { LabelEllipsisOptimized } from '../UI/LabelEllipsisOptimized';
import { findChildByNameRecursive, loadRemoteImg, secondsToMinuteSecond, timestampToDateTime } from '../../Utils/Tools';
import { RoundBox } from '../UI/RoundBox';
import { ConfirmPopUp } from '../UI/ConfirmPopUp';
import { CONFIG } from '../Config';
import { AudioMgr } from '../AudioMgr';
import Global from '../../Utils/Global'
import { getRoomMusicAudio, RoomMusicAudio } from '../../Utils/constant';
import { getHallStrategy, SpecialRules } from '../GameMode/IHallModeStrategy';
const { ccclass, property } = _decorator;

enum CreateRoomType {
    CreateRoom, // 创建房间
    MatchRoom // 匹配房间
}

// AI difficulty levels
export enum RobotLevel {
    Easy = 0,
    Medium = 1,
    Hell = 2,
}

const RobotLevelLabels: Record<RobotLevel, string> = {
    [RobotLevel.Easy]: '简单',
    [RobotLevel.Medium]: '中等',
    [RobotLevel.Hell]: '地狱',
};

// 玩法类型枚举
export enum GameMode {
    Doudizhu = 0, // 斗地主玩法
    Shuangjian = 1  // 双剑玩法
}

@ccclass('HallSceneMgr')
export class HallSceneMgr extends Component {

    @property({
        type: Node,
        displayName: "选择等级"
    })
    selectLevel = null;
    
    @property({
        type: Node,
        displayName: "玩法选择节点"
    })
    gameModeSelect = null;

    @property({
        type: Node,
        displayName: "双剑特殊规则面板"
    })
    specialRulesPanel: Node = null;

    @property({
        type: Node,
        displayName: "机器人数量下拉框"
    })
    robotCountDropdown: Node = null;

    @property({
        type: Node,
        displayName: "AI难度下拉框"
    })
    robotLevelDropdown: Node = null;
    
    @property({
        type: Node,
        displayName: "用户名称"
    })
    userNameBox = null;
    @property({
        type: Node,
        displayName: "用户头像"
    })
    userAvatar = null;
    @property({
        type: Label,
        displayName: "用户ID"
    })
    userId = null;
    @property({
        type: Label,
        displayName: "用户元宝"
    })
    userIngot = null;
    @property({
        type: Node,
        displayName: "加入房间输入框"
    })
    RoomNum = null;
    @property({
        type: Node,
        displayName: "匹配弹框"
    })
    MatchLoading = null;
    @property({
        type: Node,
        displayName: "战绩弹框"
    })
    Record = null;
    @property({
        type: Node,
        displayName: "问题反馈"
    })
    Feedback = null;
    @property({
        type: Node,
        displayName: "每日赠送元宝弹框"
    })
    GetGoldPop = null;

    userInfo = null; // 用户信息
    level = []; // 房间等级
    createRoomType: CreateRoomType = null; // 房间类型（创建|匹配）
    selectLevelNum: any = 0; // 选择等级
    matchTimer: number = 0; // 匹配时间
    wxLaunchOptions: any = {}; // 微信启动参数
    selectedGameMode: GameMode = GameMode.Shuangjian; // 默认双剑玩法
    selectedRobotCount: number = 0;
    selectedRobotLevel: RobotLevel = RobotLevel.Easy;
    private robotCountDropdownReady: boolean = false;
    private robotCountOptions: Node = null;
    private robotCountValueLabel: Label = null;
    private robotCountOptionLabels: Label[] = [];
    private robotCountOptionNodes: Node[] = [];
    private robotLevelDropdownReady: boolean = false;
    private robotLevelOptions: Node = null;
    private robotLevelValueLabel: Label = null;
    private robotLevelOptionLabels: Label[] = [];
    private robotLevelOptionNodes: Node[] = [];
    /** Shuangjian special-rule toggles. Stays empty for Doudizhu. */
    specialRules: SpecialRules = {
        drawAsOne: false,
        doubleScore: false,
        fiveAwardChallenge: false,
    };

    protected async onLoad() {
        // 预加载资源
        resources.preload('Prefabs/Loading', Prefab);
        resources.preload('Prefabs/ConfirmPopUp', Prefab);

        // 默认展示加载动画请求接口
        CommonUIManager.inst.showLoading();
        // 获取用户信息
        await this.getUserInfo();
        // 获取创建房间等级
        await this.getLevel();
        // 获取每日赠送元宝
        await this.claimDaily();
        this.ensureRobotCountDropdown();
        this.ensureRobotLevelDropdown();
        this.refreshRobotCountDropdown();
        this.refreshRobotLevelDropdown(true);

        // 获取用户是否又加入的房间，尝试重连
        const reConnectSuccess = await this.reConnection();
        // 没有加入的房间，判断是否有分享房间ID(有已加入的房间，不能加入其他房间)
        if (!reConnectSuccess) {
            if (window.wx) {
                // 由于wx.onShow只有在热更新的时候才会触发，冷启动不会触发，故写如下
                this.wxLaunchOptions = wx.getLaunchOptionsSync() || {};
                // 默认调用一次
                this.queryShareJoinRoom();
                if (Global.isOnShowRegistered == false) {
                    // 判断是否携带分享房间ID
                    window.wx.onShow(async (options) => {
                        console.warn(options, "onShow")
                        this.queryShareJoinRoom(options);
                    })
                    Global.isOnShowRegistered = true;
                }
            }
        }
    }

    async start() {
        // 监听匹配回调
        eventTarget.on("match", this.onMatchRoom, this);
        // 监听取消匹配
        eventTarget.on("cancelMatch", this.onCancelMatch, this);
    }

    update(deltaTime: number) {

    }

    // 查询分享连接加入
    async queryShareJoinRoom(onShowOption?) {
        // 如果传入了onShowOption，则优先去切入前台传递的参数
        const roomId = onShowOption?.query?.roomId || this.wxLaunchOptions?.query?.roomId;
        // 有 onShowOption?.query?.roomId 证明点击了分享连接进入，没有可能是首次加载小游戏，调用方法获取小游戏参数（第一次不会触发小游戏的onShow事件）
        if (onShowOption?.query?.roomId || (this.wxLaunchOptions?.query?.roomId && !Global.autoJoinShareRoomId)) {
            let data = await post("/queryJoinRoom", {
                roomId: roomId
            })

            if (data.code == 200 && data.data.success == true) {
                // 加入房间
                sys.localStorage.setItem('joinRoomId', roomId);
                director.loadScene('RoomScene');
                Global.autoJoinShareRoomId = roomId;
            }
        }
    }

    // 每日领取
    async claimDaily() {
        let res = await post(`/claimDaily`);
        // 领取成功 
        if (res.code == 200 && res.data.success == true) {
            // 更新用户金币
            this.userIngot.string = res.data.gold;
            // 展示领取弹框
            this.GetGoldPop.active = true;
        }
    }

    // 关闭弹框
    closeClaimDaily() {
        this.GetGoldPop.active = false;
    }

    // 获取玩家是否在游戏中
    async getUserPlaying(callback) {
        return await new Promise(async (resolve, reject) => {
            let res = await post('/getUserPlaying')
            if (res.code == 200) {
                // 玩家正在游戏中，不能匹配、创建、加入其他房间
                if (res.data.isInRoom == true) {
                    this.playingTip(res.data.roomId);
                } else {
                    callback()
                }
            } else {
                reject(res.message)
            }
        });
    }

    // 游戏中提示
    playingTip(roomId) {
        resources.load('Prefabs/ConfirmPopUp', Prefab, (err, prefab: Prefab) => {
            if (err) {
                console.error('加载预制体失败:', err);
                return;
            }
            // 创建节点
            let node = instantiate(prefab);
            node.getComponent(ConfirmPopUp).initConfirmPopUp('提示', '有正在进行的游戏，是否加入游戏？', () => {
                sys.localStorage.setItem('joinRoomId', roomId);
                // 重连
                this.reConnection()
            })
            node.setParent(this.node);
        })
    }

    // 不根据本地存储roomId进行查询了，可能不准确（切换设备等操作，恶意修改）
    async reConnection() {
        // loading 
        CommonUIManager.inst.showLoading("加载中...");
        // 查询房间是否还存在，玩家是否还在房间中（断线重连的清空）
        let [res]: any = await Promise.all([
            noLoadingPost('/reConnection'),
            new Promise((resolve) => {
                setTimeout(resolve, 1000);
            })
        ]);

        // 关闭加载动画
        CommonUIManager.inst.hideLoading();
        if (res.code == 200 && res.data.roomId) {
            // 用户在房间中，本地 joinRoomId 不存在，证明用户是手动退出，不自动加入房间 
            if (sys.localStorage.getItem('joinRoomId')) {
                // 加入房间
                let joinRes = await post("/joinRoom", {
                    roomId: res.data.roomId
                })

                if (joinRes.code == 200) {
                    sys.localStorage.setItem('joinRoomId', res.data.roomId);
                    // 切换场景之后，获取存到本地的房间id，再通过room_id 获取房间信息
                    director.loadScene('RoomScene');
                    return true;
                }
            }

            return false;
        } else {
            // 删除本地存储
            sys.localStorage.removeItem('joinRoomId');
            return false;
        }
    }

    // 获取创建房间等级
    async getLevel() {
        let res = await post('/getRoomLevel');
        if (res.code == 200) {
            this.level = res.data;
            this.level.forEach((item, index) => {
                const levelNode = findChildByNameRecursive(this.selectLevel, `Level${index + 1}`);
                levelNode.getChildByName("Num").getComponent(Label).string = item.base;
                // 设置自定义数据level
                levelNode.getComponent(Button).clickEvents[0].customEventData = item.level;
            });
        }
    }

    /**
     * 获取用户信息
     * @param updataUserInfo 是否只更新用户信息，不设置背景音乐
     */
    async getUserInfo(updataUserInfo = false) {
        let res = await post('/getUserInfo');
        if (res.code == 200) {
            this.userInfo = res.data;
            sys.localStorage.setItem('userInfo', JSON.stringify(res.data));
            this.userNameBox.getComponent(LabelEllipsisOptimized).setLabelText(res.data.user_name);
            this.userId.getComponent(Label).string = `ID：${res.data.id}`;
            this.userIngot.getComponent(Label).string = res.data.gold;
            // 加载本地头像
            if (res.data.user_head_img == "/Image/default_head.png") {
                resources.load('Image/default_head/spriteFrame', SpriteFrame, (err, spriteFrame) => {
                    if (err) {
                        console.error('加载 SpriteFrame 文件失败:', err);
                        return;
                    }

                    // 设置头像
                    this.userAvatar.getComponent(RoundBox).spriteFrame = spriteFrame;
                });
            } else {
                // 加载远程图片，并赋值
                loadRemoteImg(res.data.user_head_img, this.userAvatar);
            }

            if (res.data.bg_audio === 1 && updataUserInfo == false) {
                AudioMgr.inst.play(getRoomMusicAudio(RoomMusicAudio.welcome), 1, true, director.getScene().name);
            }
        }
        console.log(res);
    }


    // 创建房间
    createRoomFun() {
        this.getUserPlaying(() => {
            this.createRoomType = CreateRoomType.CreateRoom;
            this.selectLevelShow();
        })
    }

    // 匹配房间
    async matchRoomFun() {
        this.getUserPlaying(() => {
            this.createRoomType = CreateRoomType.MatchRoom;
            this.selectLevelShow();
        })

    }

    selectLevelShow() {
        this.selectLevel.active = true;
        // 如果存在玩法选择节点，也显示
        if (this.gameModeSelect) {
            this.gameModeSelect.active = true;
        }
        // 按策略决定是否展示双剑特殊规则面板
        this.refreshSpecialRulesPanelVisibility();
        this.ensureRobotCountDropdown();
        this.ensureRobotLevelDropdown();
        this.refreshRobotCountDropdown();
        this.refreshRobotLevelDropdown(true);
    }

    selectLevelHide() {
        this.selectLevel.active = false;
        // 如果存在玩法选择节点，也隐藏
        if (this.gameModeSelect) {
            this.gameModeSelect.active = false;
        }
        if (this.specialRulesPanel) {
            this.specialRulesPanel.active = false;
        }
        if (this.robotCountDropdown) {
            this.robotCountDropdown.active = false;
        }
        if (this.robotLevelDropdown) {
            this.robotLevelDropdown.active = false;
        }
        if (this.robotLevelOptions) {
            this.robotLevelOptions.active = false;
        }
    }

    /**
     * Show the Shuangjian special-rules panel only when the strategy says
     * it's relevant for the current mode (Doudizhu hides it).
     */
    private refreshSpecialRulesPanelVisibility(): void {
        if (!this.specialRulesPanel) return;
        const strategy = getHallStrategy(this.selectedGameMode);
        this.specialRulesPanel.active = strategy.showSpecialRulesPanel();
    }


    // 选择房间等级
    selectLevelFun(event, level) {
        this.selectLevelNum = level;
        if (this.createRoomType == CreateRoomType.CreateRoom) {
            this.createRoom(event, level)
        } else {
            CommonUIManager.inst.showLoading("进入房间中...");
            this.matchRoom()
        }
    }

    // 匹配房间
    async matchRoom() {
        try {
            // 获取当前选择的玩法类型
            const gameMode = this.getSelectedGameMode();
            const strategy = getHallStrategy(gameMode);
            const payload = strategy.buildPayload(this.selectLevelNum, this.specialRules, this.selectedRobotCount, this.selectedRobotLevel);
            console.log("matchRoom payload", payload);

            // await 等待连接成功返回
            const socketInstance = await WebsocketMgr.instance({ url: "/matching" });

            socketInstance.send({
                type: "match",
                params: payload,
            });
        } catch (error) {
            CommonUIManager.inst.hideLoading();
            console.log("matchRoom error", error);
            CommonUIManager.inst.showToast("进入房间失败，请重试");
        }
    }

    // 监听匹配结果
    onMatchRoom({ data, code }) {
        console.log("matchRoom", data, code)
        if (code == 200) {
            if (data?.roomId) { // 放回房间ID，证明匹配成功
                // 匹配结束，关闭websocket 连接
                WebsocketMgr.close();
                this.scheduleOnce(() => {
                    sys.localStorage.setItem("joinRoomId", data.roomId);
                    director.loadScene('RoomScene');
                }, 0)
            } else {
                CommonUIManager.inst.hideLoading();
                // 隐藏选择房间等级弹窗
                this.selectLevelHide();
                // 展示匹配中弹窗
                this.matchLoadingShow();
            }
        } else {
            CommonUIManager.inst.hideLoading();
        }
    }

    // 匹配间隔函数
    matchIntervalFun() {
        this.matchTimer++;
        this.MatchLoading.getChildByName("Time").getComponent(Label).string = secondsToMinuteSecond(this.matchTimer);
    }

    // 计时器函数
    matchLoadingShow() {
        // 展示匹配弹框
        this.MatchLoading.active = true;
        this.schedule(this.matchIntervalFun, 1);
    }

    async matchLoadingHide() {
        // 停止计时器
        this.unschedule(this.matchIntervalFun);
        // 隐藏匹配弹框
        this.MatchLoading.active = false;
        this.matchTimer = 0;
        // 关闭连接
        WebsocketMgr.close();
    }

    // 取消匹配
    onCancelMatch({ data, code }) {
        if (code == 200) {
            // 隐藏匹配弹框
            this.matchLoadingHide();
        }
    }

    // 取消匹配
    async cancelMatch() {
        // 获取当前选择的玩法类型
        const gameMode = this.getSelectedGameMode();
        const strategy = getHallStrategy(gameMode);
        const payload = strategy.buildPayload(this.selectLevelNum, this.specialRules, this.selectedRobotCount, this.selectedRobotLevel);

        // await 等待连接成功返回
        const socketInstance = await WebsocketMgr.instance({ url: "/matching" });

        socketInstance.send({
            type: "cancelMatch",
            params: payload,
        });
    }


    // 创建房间
    async createRoom(event, level) {
        console.log("level", level)
        // 获取当前选择的玩法类型
        const gameMode = this.getSelectedGameMode();
        const strategy = getHallStrategy(gameMode);
        const payload = strategy.buildPayload(level, this.specialRules, this.selectedRobotCount, this.selectedRobotLevel);
        console.log("createRoom payload", payload);

        // await 等待连接成功返回
        let res = await post("/createRoom", payload);

        if (res.code == 200) {
            // 保存加入房间ID，到房间详情再去获取
            sys.localStorage.setItem('joinRoomId', res.data);
            director.loadScene('RoomScene');
        }
    }

    // 加入房间
    joinRoomPopShow() {
        this.getUserPlaying(() => {
            this.node.getChildByName("JoinRoom").active = true;
        })

    }

    // 隐藏加入房间弹框
    joinRoomPopHide() {
        this.node.getChildByName("JoinRoom").active = false;
    }

    // 加入房间
    async inputRoomNum(event, data) {
        console.log(data);
        const inputList = this.RoomNum.children.map(item => {
            return item.getComponent(Label).string || "";
        });
        // 获取最近一个空白
        const index = inputList.indexOf("");
        if (index != -1) {
            // 输入数字
            this.RoomNum.children[index].getComponent(Label).string = data;
        }
        if (index == 5) {
            const roomNum = [...inputList, data];
            // 输入完毕调用接口加入房间
            let res = await post("/joinRoom", {
                roomId: roomNum.join("")
            })

            if (res.code == 200) {
                // 保存加入房间ID，到房间详情再去获取
                sys.localStorage.setItem('joinRoomId', res.data.roomId);
                // 切换场景之后，获取存到本地的房间id，再通过room_id 获取房间信息
                director.loadScene('RoomScene');
            }
        }
    }

    // 房间号删除
    RoomNumDelete() {
        const inputList = this.RoomNum.children.map(item => {
            return item.getComponent(Label).string || "";
        });
        // 获取最近一个空白
        const index = inputList.indexOf("") == 0 ? 0 : (inputList.indexOf("") == -1 ? 5 : inputList.indexOf("") - 1);
        console.log("删除下标", index);
        // 输入数字
        this.RoomNum.children[index].getComponent(Label).string = "";
    }

    // 展示战绩
    async showRecord() {
        this.Record.active = true;
        // 获取战绩数据
        let res = await post('/getRecord');
        if (res.code == 200) {
            // 加载预制体
            resources.load('Prefabs/RecordItem', Prefab, (err, prefab: Prefab) => {
                if (err) {
                    console.error('加载预制体失败:', err);
                    return;
                }

                // 添加节点到场景
                const RecordContent = findChildByNameRecursive(this.Record, "RecordContent");

                // 循环创建节点
                res.data.forEach((element, index, arr) => {
                    const victory = JSON.parse(element.victory_user_id).indexOf(this.userInfo.user_id) !== -1;
                    // 用户的记录
                    const userRecord = [
                        {
                            user_id: element.user_1_id,
                            get_ingots: element.user_1_get_ingots,
                            mingpai: element.user_1_mingpai,
                            redouble: element.user_1_redouble,
                        },
                        {
                            user_id: element.user_2_id,
                            get_ingots: element.user_2_get_ingots,
                            mingpai: element.user_2_mingpai,
                            redouble: element.user_2_redouble,
                        },
                        {
                            user_id: element.user_3_id,
                            get_ingots: element.user_3_get_ingots,
                            mingpai: element.user_3_mingpai,
                            redouble: element.user_3_redouble,
                        },
                    ]
                    // 创建节点
                    const node = instantiate(prefab);
                    // 设置节点信息
                    node.getChildByName("ResultText").getComponent(Label).string = victory ? "胜" : "败";
                    node.getChildByName("ResultText").getComponent(Label).color = victory ? new Color(235, 183, 20) : new Color(184, 37, 37);
                    node.getChildByName("Time").getComponent(Label).string = timestampToDateTime(element.end_time);
                    node.getChildByName("DIzhu").getComponent(Label).string = element.landlord_id == this.userInfo.user_id ? "地主" : "农民";
                    findChildByNameRecursive(node, "Text").getComponent(Label).string = `${victory ? "+" : ""}${userRecord.filter(item => item.user_id == this.userInfo.user_id)[0].get_ingots}`;
                    findChildByNameRecursive(node, "Text").getComponent(Label).color = victory ? new Color(105, 250, 8) : new Color(195, 73, 73);
                    // 设置位子
                    node.setPosition(0, -index * (85));

                    if (index == arr.length - 1) {
                        // 设置滚动容器高度
                        RecordContent.getComponent(UITransform).height = arr.length * (85);
                    }

                    RecordContent.addChild(node);
                });

            })
        }
    }

    // 隐藏战绩
    hidRecord() {
        this.Record.active = false;
        // 添加节点到场景
        const RecordContent = findChildByNameRecursive(this.Record, "RecordContent");
        RecordContent.removeAllChildren();
    }

    // 展示反馈弹框
    showFeedbackPop() {
        this.Feedback.active = true;
    }

    // 展示反馈弹框
    hidFeedbackPop() {
        this.Feedback.active = false;
    }

    // 提交反馈
    async submitFeedback() {
        let text = findChildByNameRecursive(this.Feedback, "EditBox").getComponent(EditBox).string;
        console.log('test', text)
        if (!text) { return CommonUIManager.inst.showToast("请输入反馈内容"); }
        let res = await post('/feedback', {
            feedback: text,
        });
        if (res.code == 200) {
            this.hidFeedbackPop();
            findChildByNameRecursive(this.Feedback, "EditBox").getComponent(EditBox).string = "";
            CommonUIManager.inst.showToast("提交成功");
        } else {
            CommonUIManager.inst.showToast("提交失败");
        }
    }

    // 微信分享好友功能
    wxShare() {
        if (window.wx) {
            window.wx.shareAppMessage({
                title: '在家无聊，不如一起斗地主',
                imageUrl: CONFIG.RESOURCE_BASE_URL + "/images/homeShare.png",
            })
        } else {
            CommonUIManager.inst.showToast("请使用微信小程序打开");
        }
    }

    // 获取当前选择的玩法类型
    private getSelectedGameMode(): GameMode {
        // Trust the in-memory selection first; fall back to UI state for safety.
        if (this.selectedGameMode === GameMode.Shuangjian || this.selectedGameMode === GameMode.Doudizhu) {
            return this.selectedGameMode;
        }
        if (!this.gameModeSelect) return GameMode.Doudizhu;
        const radioButtons = this.gameModeSelect.children;
        for (let i = 0; i < radioButtons.length; i++) {
            const radioButton = radioButtons[i];
            const checkmark = radioButton.getChildByName("Checkmark");
            if (checkmark && checkmark.active) {
                return i === 0 ? GameMode.Doudizhu : GameMode.Shuangjian;
            }
        }
        return GameMode.Doudizhu;
    }

    private getMaxRobotCount(): number {
        const strategy = getHallStrategy(this.getSelectedGameMode());
        return Math.max(0, strategy.getMaxPlayerCount(this.specialRules) - 1);
    }

    private ensureRobotCountDropdown(): void {
        if (!this.robotCountDropdown) return;
        this.initRobotCountDropdownRefs();
    }

    private ensureRobotLevelDropdown(): void {
        if (!this.robotLevelDropdown) {
            this.robotLevelDropdown = findChildByNameRecursive(this.gameModeSelect, 'RobotLevel');
        }
        if (!this.robotLevelDropdown) return;
        this.initRobotLevelDropdownRefs();
    }

    private setNodeTreeLayer(node: Node, layer: number): void {
        node.layer = layer;
        node.children.forEach((child) => this.setNodeTreeLayer(child, layer));
    }

    private initRobotCountDropdownRefs(): void {
        if (!this.robotCountDropdown || this.robotCountDropdownReady) return;
        const buttonNode = findChildByNameRecursive(this.robotCountDropdown, 'RobotCountButton');
        if (!buttonNode) return;
        this.robotCountValueLabel = this.getNodeLabel(buttonNode) || this.robotCountValueLabel;
        buttonNode.off(Node.EventType.TOUCH_END, this.toggleRobotCountOptions, this);
        buttonNode.on(Node.EventType.TOUCH_END, this.toggleRobotCountOptions, this);

        this.robotCountOptions = findChildByNameRecursive(this.gameModeSelect, 'RobotCountOptions');
        this.robotCountOptionNodes = [];
        this.robotCountOptionLabels = [];
        this.robotCountOptions.children.forEach((optionNode) => {
            const matched = optionNode.name.match(/^RobotCountOption(\d+)$/);
            if (!matched) return;
            const index = Number(matched[1]);
            const label = this.getNodeLabel(optionNode);
            this.robotCountOptionNodes[index] = optionNode;
            if (label) this.robotCountOptionLabels[index] = label;
            optionNode.off(Node.EventType.TOUCH_END);
            optionNode.on(Node.EventType.TOUCH_END, (event) => this.selectRobotCount(index, event), this);
        });
        this.robotCountDropdownReady = true;
        this.syncRobotCountOptions(this.getMaxRobotCount());
    }

    private initRobotLevelDropdownRefs(): void {
        if (!this.robotLevelDropdown || this.robotLevelDropdownReady) return;
        this.robotLevelValueLabel = this.getNodeLabel(this.robotLevelDropdown) || this.robotLevelValueLabel;
        this.robotLevelDropdown.off(Node.EventType.TOUCH_END, this.toggleRobotLevelOptions, this);
        this.robotLevelDropdown.on(Node.EventType.TOUCH_END, this.toggleRobotLevelOptions, this);

        this.robotLevelOptions = findChildByNameRecursive(this.gameModeSelect, 'RobotLevelOptions');
        if (!this.robotLevelOptions) return;
        this.robotLevelOptionNodes = [];
        this.robotLevelOptionLabels = [];
        this.robotLevelOptions.children.forEach((optionNode) => {
            const matched = optionNode.name.match(/^RobotLevelOption(\d+)$/);
            if (!matched) return;
            const index = Number(matched[1]) as RobotLevel;
            const label = this.getNodeLabel(optionNode);
            this.robotLevelOptionNodes[index] = optionNode;
            if (label) this.robotLevelOptionLabels[index] = label;
            optionNode.off(Node.EventType.TOUCH_END);
            optionNode.on(Node.EventType.TOUCH_END, (event) => this.selectRobotLevel(index, event), this);
        });
        this.robotLevelDropdownReady = true;
        this.syncRobotLevelOptions();
    }

    private rebindRobotCountDropdownRefs(): void {
        this.robotCountDropdownReady = false;
        this.robotCountOptions = null;
        this.robotCountValueLabel = null;
        this.robotCountOptionNodes = [];
        this.robotCountOptionLabels = [];
        this.initRobotCountDropdownRefs();
    }

    private rebindRobotLevelDropdownRefs(): void {
        this.robotLevelDropdownReady = false;
        this.robotLevelOptions = null;
        this.robotLevelValueLabel = null;
        this.robotLevelOptionNodes = [];
        this.robotLevelOptionLabels = [];
        this.initRobotLevelDropdownRefs();
    }

    private syncRobotLevelOptions(): void {
        if (!this.robotLevelOptions) return;
        const levelValues = [RobotLevel.Easy, RobotLevel.Medium, RobotLevel.Hell];
        levelValues.forEach((level, index) => {
            if (this.robotLevelOptionNodes[level]) return;
            const optionNode = new Node(`RobotLevelOption${level}`);
            optionNode.setParent(this.robotLevelOptions);
            optionNode.setPosition(0, -index * 36, 0);
            const optionTransform = optionNode.addComponent(UITransform);
            optionTransform.setAnchorPoint(0.5, 1);
            optionTransform.setContentSize(100, 34);
            optionNode.addComponent(Button);
            const label = optionNode.addComponent(Label);
            label.string = RobotLevelLabels[level];
            label.fontSize = 22;
            label.horizontalAlign = HorizontalTextAlignment.CENTER;
            label.verticalAlign = VerticalTextAlignment.CENTER;
            label.color = new Color(255, 255, 255, 255);
            this.robotLevelOptionNodes[level] = optionNode;
            this.robotLevelOptionLabels[level] = label;
            optionNode.on(Node.EventType.TOUCH_END, (event) => this.selectRobotLevel(level, event), this);
            this.setNodeTreeLayer(optionNode, Layers.Enum.UI_2D);
        });
        const optionsTransform = this.robotLevelOptions.getComponent(UITransform);
        if (optionsTransform) {
            optionsTransform.setContentSize(100, levelValues.length * 36);
        }
    }

    private syncRobotCountOptions(maxRobotCount: number): void {
        for (let i = 0; i <= maxRobotCount; i++) {
            if (this.robotCountOptionNodes[i]) continue;
            const optionNode = new Node(`RobotCountOption${i}`);
            optionNode.setParent(this.robotCountOptions);
            optionNode.setPosition(0, -i * 36, 0);
            const optionTransform = optionNode.addComponent(UITransform);
            optionTransform.setAnchorPoint(0.5, 1);
            optionTransform.setContentSize(92, 34);
            optionNode.addComponent(Button);
            const label = optionNode.addComponent(Label);
            label.string = `${i}个`;
            label.fontSize = 22;
            label.horizontalAlign = HorizontalTextAlignment.CENTER;
            label.verticalAlign = VerticalTextAlignment.CENTER;
            label.color = new Color(255, 255, 255, 255);
            this.robotCountOptionNodes[i] = optionNode;
            this.robotCountOptionLabels[i] = label;
            optionNode.on(Node.EventType.TOUCH_END, (event) => this.selectRobotCount(i, event), this);
            this.setNodeTreeLayer(optionNode, Layers.Enum.UI_2D);
        }
        const optionsHeight = Math.max(34, (maxRobotCount + 1) * 36);
        const optionsTransform = this.robotCountOptions.getComponent(UITransform);
        if (optionsTransform) {
            optionsTransform.setContentSize(92, optionsHeight);
        }
    }

    private getNodeLabel(node: Node): Label {
        const label = node.getComponent(Label);
        if (label) return label;
        for (const child of node.children) {
            const childLabel = this.getNodeLabel(child);
            if (childLabel) return childLabel;
        }
        return null;
    }

    private toggleRobotCountOptions(): void {
        if (!this.robotCountOptions) return;
        this.robotCountOptions.active = !this.robotCountOptions.active;
        if (this.robotCountOptions.active && this.robotLevelOptions) {
            this.robotLevelOptions.active = false;
        }
    }

    private toggleRobotLevelOptions(): void {
        if (!this.robotLevelOptions) return;
        this.robotLevelOptions.active = !this.robotLevelOptions.active;
        if (this.robotLevelOptions.active && this.robotCountOptions) {
            this.robotCountOptions.active = false;
        }
    }

    private selectRobotCount(count: number, event?: any): void {
        event?.propagationStopped !== undefined ? event.propagationStopped = true : event?.stopPropagation?.();
        this.selectedRobotCount = Math.min(Math.max(0, Number(count) || 0), this.getMaxRobotCount());
        this.refreshRobotCountDropdown(true);
    }

    private selectRobotLevel(level: RobotLevel, event?: any): void {
        event?.propagationStopped !== undefined ? event.propagationStopped = true : event?.stopPropagation?.();
        const normalizedLevel = Number(level);
        this.selectedRobotLevel = normalizedLevel >= RobotLevel.Easy && normalizedLevel <= RobotLevel.Hell
            ? normalizedLevel as RobotLevel
            : RobotLevel.Easy;
        this.refreshRobotLevelDropdown(true);
    }

    private refreshRobotCountDropdown(closeOptions: boolean = false): void {
        if (!this.robotCountDropdown) return;
        const maxRobotCount = this.getMaxRobotCount();
        if (this.selectedRobotCount > maxRobotCount) {
            this.selectedRobotCount = maxRobotCount;
        }
        this.syncRobotCountOptions(maxRobotCount);
        this.robotCountDropdown.active = !!this.selectLevel?.active;
        if (this.robotCountOptions && closeOptions) {
            this.robotCountOptions.active = false;
        }
        if (this.robotCountValueLabel) {
            this.robotCountValueLabel.string = `${this.selectedRobotCount}/${maxRobotCount}个`;
        }
        for (let i = 0; i < this.robotCountOptionNodes.length; i++) {
            const optionNode = this.robotCountOptionNodes[i];
            const label = this.robotCountOptionLabels[i];
            if (optionNode) {
                optionNode.active = i <= maxRobotCount;
            }
            if (label) {
                label.string = `${i}个`;
                label.color = i === this.selectedRobotCount
                    ? new Color(255, 230, 90, 255)
                    : new Color(255, 255, 255, 255);
            }
        }
    }

    private refreshRobotLevelDropdown(closeOptions: boolean = false): void {
        this.ensureRobotLevelDropdown();
        if (!this.robotLevelDropdown) return;
        this.syncRobotLevelOptions();
        this.robotLevelDropdown.active = !!this.selectLevel?.active;
        if (this.robotLevelOptions && closeOptions) {
            this.robotLevelOptions.active = false;
        }
        if (this.robotLevelValueLabel) {
            this.robotLevelValueLabel.string = RobotLevelLabels[this.selectedRobotLevel];
        }
        [RobotLevel.Easy, RobotLevel.Medium, RobotLevel.Hell].forEach((level) => {
            const label = this.robotLevelOptionLabels[level];
            if (label) {
                label.string = RobotLevelLabels[level];
                label.color = level === this.selectedRobotLevel
                    ? new Color(255, 230, 90, 255)
                    : new Color(255, 255, 255, 255);
            }
        });
    }

    // 玩法选择切换
    onGameModeSelected(event, gameMode: GameMode) {
        // The button-bound customEventData arrives as a string in Cocos
        const mode: GameMode = (typeof gameMode === 'string') ? Number(gameMode) as GameMode : gameMode;
        console.log("选择的玩法:", mode);
        this.selectedGameMode = mode;

        // 更新所有radio按钮的状态
        if (this.gameModeSelect) {
            const radioButtons = this.gameModeSelect.children;
            for (let i = 0; i < radioButtons.length; i++) {
                const radioButton = radioButtons[i];
                const checkmark = radioButton.getChildByName("Checkmark");
                if (checkmark) {
                    checkmark.active = (mode === GameMode.Doudizhu && i === 0)
                        || (mode === GameMode.Shuangjian && i === 1);
                }
            }
        }
        // Reset Shuangjian special rules when leaving the mode.
        if (mode === GameMode.Doudizhu) {
            this.specialRules = { drawAsOne: false, doubleScore: false, fiveAwardChallenge: false };
        }
        this.refreshSpecialRulesPanelVisibility();
        this.ensureRobotCountDropdown();
        this.ensureRobotLevelDropdown();
        this.rebindRobotCountDropdownRefs();
        this.rebindRobotLevelDropdownRefs();
        this.refreshRobotCountDropdown(false);
        this.refreshRobotLevelDropdown(false);
        if (this.robotCountOptions) {
            this.robotCountOptions.active = true;
        }
        if (this.robotLevelOptions) {
            this.robotLevelOptions.active = false;
        }
    }

    /**
     * Toggle a Shuangjian special rule. Bind from the inspector with
     * customEventData equal to one of: 'drawAsOne' | 'doubleScore' |
     * 'fiveAwardChallenge'.
     */
    onSpecialRuleToggle(event: any, ruleKey: keyof SpecialRules): void {
        if (!ruleKey) return;
        this.specialRules[ruleKey] = !this.specialRules[ruleKey];
        // Keep the visual checkmark in sync if the toggle node has one.
        const target: Node = event?.target as Node;
        if (target) {
            const checkmark = target.getChildByName('Checkmark');
            if (checkmark) checkmark.active = !!this.specialRules[ruleKey];
        }
        console.log('specialRules', this.specialRules);
        this.refreshRobotCountDropdown();
    }

    protected onDestroy(): void {
        // 监听匹配回调
        eventTarget.off("match", this.onMatchRoom, this);
    }
}

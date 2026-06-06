# 需求文档 - 丰城双剑玩法接入

## 引言

本需求旨在为现有的"扑克牌（斗地主）"项目引入新的"丰城双剑"玩法（GameMode = 1）。当前 [HallSceneMgr.ts](g:\workspace\cocos_doudizhu_game\pukepai\assets\Script\SceneScript\HallSceneMgr.ts) 已经具备：
- 玩法切换 UI（`gameModeSelect`）
- `GameMode` 枚举（`Doudizhu = 0`、`Shuangjian = 1`）
- 创建房间 / 匹配房间时已携带 `gameMode` 参数

[RoomScene.ts](g:\workspace\cocos_doudizhu_game\pukepai\assets\Script\RoomScene\RoomScene.ts) 也已新增 `User3CardBox`（顶部第四个玩家位）。

服务端（Node.js / Koa + ws）相关基础设施已存在于 `pukepai_server/puke_server` 目录：
- 房间数据结构 [room.js](g:\workspace\cocos_doudizhu_game\pukepai_server\puke_server\utils\room.js) 中的 `Room` 类、`CreateRoom`、`userJoinRoom`（当前固定 3 人 `roomUserIdList`）
- 匹配逻辑 [webSocketMatch.js](g:\workspace\cocos_doudizhu_game\pukepai_server\puke_server\router\websocket\webSocketMatch.js)（当前 `length >= 3` 自动开局）
- 发牌、抢地主、加倍 [webSocketDealCardsRouter.js](g:\workspace\cocos_doudizhu_game\pukepai_server\puke_server\router\websocket\webSocketDealCardsRouter.js)
- 出牌、结算、入库 [webSocketPlayCardRouter.js](g:\workspace\cocos_doudizhu_game\pukepai_server\puke_server\router\websocket\webSocketPlayCardRouter.js)
- 牌型识别与提示 [cardLogic.js](g:\workspace\cocos_doudizhu_game\pukepai_server\puke_server\cardLogic\cardLogic.js) / [cardHint.js](g:\workspace\cocos_doudizhu_game\pukepai_server\puke_server\cardLogic\cardHint.js)
- 用户与创建房间接口 [user.js](g:\workspace\cocos_doudizhu_game\pukepai_server\puke_server\router\user.js)（`POST /createRoom`、`POST /joinRoom`、`POST /reConnection`）

本次需求需要 **客户端 + 服务端** 两侧同步实现。客户端将"丰城双剑"玩法的差异化逻辑接入大厅与房间场景；服务端提供发牌（27 张 / 108 张双副牌）、4 人房、包牌/搭档牌、接风、双剑牌型、双剑结算（含奖与特殊规则）等能力。整体覆盖：
- 人数（4 人 / 2 人）、发牌（27 张 / 双副牌 108 张）
- 玩法流程（包牌、搭档牌、接风、明牌）
- 出牌牌型、压牌大小、机器人出牌
- 奖（头/王/510K）
- 结算（包牌/双关/单关/平局）
- 特殊规则开关（二人玩法、平局算1分、输赢分翻倍、五奖冲关）

## 代码架构设计要求（接口与多态）

为避免在 [webSocketDealCardsRouter.js](g:\workspace\cocos_doudizhu_game\pukepai_server\puke_server\router\websocket\webSocketDealCardsRouter.js)、[webSocketPlayCardRouter.js](g:\workspace\cocos_doudizhu_game\pukepai_server\puke_server\router\websocket\webSocketPlayCardRouter.js)、[cardLogic.js](g:\workspace\cocos_doudizhu_game\pukepai_server\puke_server\cardLogic\cardLogic.js)、[cardHint.js](g:\workspace\cocos_doudizhu_game\pukepai_server\puke_server\cardLogic\cardHint.js)中间添加大量 `if (game_mode == 1) {...} else {...}` 分支、避免两种玩法逻辑互相侵入，本需求采用 **接口 + 多态**的策略模式设计：

### 服务端抽象层级

```
IGameMode (抽象接口 / 基类)
  ├─ DoudizhuMode  (现有斗地主逻辑重构到该类中)
  └─ ShuangjianMode (双剑玩法新增)
```

`IGameMode` 接口必须声明以下统一方法（由各子类独立实现）：
- `getMaxPlayerCount(specialRules): number` 返回该玩法房间人数上限
- `getMinPlayerCount(specialRules): number` 返回开局最小人数
- `dealCards(roomInfo): void` 发牌（27 张 / 17 张，108 张 / 54 张牌库由实现决定）
- `selectLandlord(roomInfo): void` 庄家/地主选取（抢地主 vs 随机/头游做庄）
- `onAfterLandlordDecided(roomInfo): void` 地主确定后的后续动作（斗地主: 发底牌+加倍 / 双剑: 包牌选择或随机搭档牌）
- `judgeCardType(cards): CardTypeEnum` 牌型识别
- `compareCards(prev, current): boolean` 压牌大小比较
- `getCardHint(target, hand): number[][]` 提示/机器人出牌候选
- `onPlayCard(roomInfo, userId, cards): void` 出牌后的副作用（炸弹 *2 / 搭档牌揭晓阵营 等）
- `isGameOver(roomInfo): boolean` 是否结束（1个走完 vs 阵营两人都走完）
- `calcSettlement(roomInfo): SettlementResult` 计算输赢得分、奖项、victoryStatus
- `saveRecordMysql(roomInfo, settlement): Promise<void>` 入库（不同表）

### 工厂 / 注册表

- 必须提供 `GameModeFactory.create(game_mode): IGameMode`，在 `Room` 创建时一次性实例化并挂在 `roomInfo.gameModeImpl` 上。
- 外层 Router 只面向 `IGameMode` 接口编程，不出现 `if (game_mode == 1)` 分支（除了工厂本身）。

### 客户端抽象层级

同样在 [pukepai/assets/Script](g:\workspace\cocos_doudizhu_game\pukepai\assets\Script) 下提供接口 `IGameModeView`，由13 个同名领域接口中必须覆盖的方法由两个子类 `DoudizhuModeView` / `ShuangjianModeView` 实现：
- `getSeatLayout(): SeatInfo[]` 返回玩家位节点信息（斗地主 3 / 双剑 4）
- `getCardHintImpl(): ICardHint` 返回对应的牌型/提示实现
- `getGameOverPanel(): IGameOverPanel` 返回对应的结算弹框实现
- `registerSocketEvents(scene): void` / `unregisterSocketEvents(scene): void` 注册/注销玩法专属事件
- `onDealCards(scene, data)` / `onPartnerCard(scene, data)` / `onLandlordSelect(scene, data)` 等玩法独有需要重写的场景回调

[RoomScene.ts](g:\workspace\cocos_doudizhu_game\pukepai\assets\Script\RoomScene\RoomScene.ts) 需要重构为：根据 `roomInfo.game_mode` 创建对应的 `IGameModeView` 实例，业务代码仅调用接口，不手写 `if/else`。

### 代码领域隔离原则

- 双剑专有逻辑集中在新目录：
  - 服务端：`pukepai_server/puke_server/gameMode/shuangjian/`
  - 客户端：`pukepai/assets/Script/GameMode/Shuangjian/`
- 斗地主现有逻辑重构到：
  - 服务端：`pukepai_server/puke_server/gameMode/doudizhu/`
  - 客户端：`pukepai/assets/Script/GameMode/Doudizhu/`
- 原 Router/Scene 只保留通用流程（如 token 验证、ws 连接、准备、退出房间）与 工厂调用。

---

## 需求

### 需求 1：服务端 - GameMode 抽象与工厂

**用户故事：** 作为服务端开发者，我希望两种玩法都遵守同一抽象接口，以便后续新增玩法（如《其他金花》、《财神到》）时只需新增一个子类。

#### 验收标准

1. WHEN 服务端启动 THEN `pukepai_server/puke_server/gameMode/IGameMode.js` SHALL 定义抽象基类或 ts interface，包含《代码架构设计要求》中列出的9+ 个方法签名，所有方法在基类中默认 throw "Not Implemented"。
2. WHEN `pukepai_server/puke_server/gameMode/doudizhu/DoudizhuMode.js` 被实例化 THEN 它 SHALL 继承 `IGameMode` 并覆写所有方法，实现升与现有 [webSocketDealCardsRouter.js](g:\workspace\cocos_doudizhu_game\pukepai_server\puke_server\router\websocket\webSocketDealCardsRouter.js) / [webSocketPlayCardRouter.js](g:\workspace\cocos_doudizhu_game\pukepai_server\puke_server\router\websocket\webSocketPlayCardRouter.js) 中斗地主逻辑 100% 一致。
3. WHEN `pukepai_server/puke_server/gameMode/shuangjian/ShuangjianMode.js` 被实例化 THEN 它 SHALL 继承 `IGameMode` 并覆写所有方法。
4. WHEN `pukepai_server/puke_server/gameMode/GameModeFactory.js` 提供静态方法 `create(gameMode)` THEN 它 SHALL 返回对应玩法的单例实现，gameMode 未知时抛出错误。
5. WHEN `CreateRoom` 在 [room.js](g:\workspace\cocos_doudizhu_game\pukepai_server\puke_server\utils\room.js) 中被调用 THEN 它 SHALL 调用 `GameModeFactory.create(game_mode)` 并将实例赋值为 `roomInfo.gameModeImpl`。
6. WHEN 任何 Router（如 [webSocketRoomBaseRouter.js](g:\workspace\cocos_doudizhu_game\pukepai_server\puke_server\router\websocket\webSocketRoomBaseRouter.js)、[webSocketDealCardsRouter.js](g:\workspace\cocos_doudizhu_game\pukepai_server\puke_server\router\websocket\webSocketDealCardsRouter.js)、[webSocketPlayCardRouter.js](g:\workspace\cocos_doudizhu_game\pukepai_server\puke_server\router\websocket\webSocketPlayCardRouter.js)）需要执行玩法逻辑 THEN 它们 SHALL 仅调用 `roomInfo.gameModeImpl.xxx()`，不出现中心化的 `if (game_mode == 1)` 分支（应 ESLint/code review 可检查出这种分支仅出现在工厂中）。

### 需求 2：客户端 - GameMode 抽象与工厂

**用户故事：** 作为客户端开发者，我希望 `RoomScene` 能面向接口编程，以便两种玩法 UI/交互/Socket 事件各自独立。

#### 验收标准

1. WHEN 项目编译 THEN `pukepai/assets/Script/GameMode/IGameModeView.ts` SHALL 定义 TypeScript 接口 / 抽象类，列出《代码架构设计要求》中客户端抽象层级的所有方法。
2. WHEN `pukepai/assets/Script/GameMode/Doudizhu/DoudizhuModeView.ts` 被实例化 THEN 它 SHALL 实现 `IGameModeView`，多个事件回调（如抢地主、加倍、明牌）从原 [RoomScene.ts](g:\workspace\cocos_doudizhu_game\pukepai\assets\Script\RoomScene\RoomScene.ts) 迁移过来。
3. WHEN `pukepai/assets/Script/GameMode/Shuangjian/ShuangjianModeView.ts` 被实例化 THEN 它 SHALL 实现 `IGameModeView`，提供 4 人布局、包牌 UI、搭档牌揭晓动画、双剑结算弹框。
4. WHEN `pukepai/assets/Script/GameMode/GameModeViewFactory.ts` 被调用 THEN 它 SHALL 根据 `GameMode` 枚举返回对应的 `IGameModeView` 实例。
5. WHEN `RoomScene.start` 被调用 THEN 它 SHALL 从 `getRoomInfo` 返回中读取 `game_mode`，调用工厂创建对应 `IGameModeView` 实例并保存到 `this.modeView`，后续业务代码只调用 `this.modeView.xxx()`。
6. WHEN [HallSceneMgr.ts](g:\workspace\cocos_doudizhu_game\pukepai\assets\Script\SceneScript\HallSceneMgr.ts) 中与玩法相关的交互存在差异 THEN 它们 SHALL 被抽象为 `IHallModeStrategy` 接口由两种玩法各自实现（如“是否展示特殊规则面板”、“min/max 人数”、“创建房间 payload”）。

### 需求 3：玩法选择与房间创建/匹配

**用户故事：** 作为玩家，我希望在大厅中选择"丰城双剑"玩法并创建或匹配房间，以便进入对应玩法的对局。

#### 验收标准

1. WHEN 玩家点击"创建房间"或"匹配房间" THEN `HallSceneMgr` SHALL 显示 `gameModeSelect` 节点，提供"斗地主"和"丰城双剑"两个 Radio 按钮。
2. WHEN 玩家切换玩法 Radio 按钮 THEN `HallSceneMgr.onGameModeSelected` SHALL 更新 `selectedGameMode` 并刷新所有 Radio 的 `Checkmark` 显示状态。
3. WHEN 玩家在选定"丰城双剑"后点击某个等级 THEN `HallSceneMgr.createRoom` 或 `matchRoom` SHALL 携带 `gameMode = GameMode.Shuangjian (1)` 调用对应接口或 WebSocket。
4. WHEN 取消匹配（`cancelMatch`）时 THEN `HallSceneMgr` SHALL 携带当前选中的 `gameMode` 一同发送，避免服务端误把玩家从错误队列中取消。
5. IF 玩家选择"丰城双剑"且开启了"二人玩法"特殊规则 THEN 客户端 SHALL 允许房间最少 2 人即可开始（满足规则①："二人玩法：输赢分为3分，没有包牌"）。
6. IF 未开启"二人玩法" THEN 客户端 SHALL 在房间未满 4 人时禁用"开始/准备"流程，并在 UI 上提示"丰城双剑需要 4 人"。

### 需求 4：双剑房间座位与 4 人布局

**用户故事：** 作为玩家，我希望在双剑模式下房间能正确显示 4 个玩家（含我自己），以便看清自己和盟友、对手的位置。

#### 验收标准

1. WHEN `RoomScene` 收到 `getRoomInfo` 且 `room_type` 为双剑模式 THEN 场景 SHALL 启用 `User3CardBox`（顶部位）作为第 4 个玩家展示节点，并隐藏与斗地主互斥的 UI（如"地主图标"、"底牌区"等）。
2. WHEN `getUserNodeInfo()` 在双剑模式下被调用 THEN 它 SHALL 返回 4 个玩家节点信息（my、左、顶、右），按照逆时针顺序排列。
3. WHEN 房间内玩家数变化（加入/离开） THEN `renderUserInfo` SHALL 同步更新所有 4 个位置的头像、昵称、金币显示；空位置显示默认占位。
4. IF 当前是斗地主模式 THEN `User3CardBox` SHALL 保持隐藏，原有 3 人布局逻辑不受影响。
5. WHEN 进入断线重连流程 THEN 重置 UI 的逻辑 SHALL 同时清理第 4 个玩家节点上的倒计时、出牌区、手牌区。

### 需求 5：双剑玩法发牌与底牌

**用户故事：** 作为玩家，我希望在双剑模式下被发到 27 张手牌（双副108张）并展示，以便开始正常游戏。

#### 验收标准

1. WHEN 服务端推送 `dealCards` 且 `room_type` 为双剑 THEN 客户端 SHALL 为每位玩家渲染 27 张手牌。
2. WHEN 双剑模式发牌动画播放 THEN `MyDealCardAmt` / 卡牌渲染流程 SHALL 兼容 27 张手牌的排版宽度（必要时调整间距）。
3. IF `room_type` 为双剑 THEN 客户端 SHALL 不展示"底牌（3张）"节点和底牌动画，因为双剑无底牌。
4. WHEN `Card` / `CardItem` 渲染同一花色出现重复牌（双副牌） THEN 排序与显示 SHALL 不发生错乱（按 `cardNum + cardType*13` 进行稳定排序）。

### 需求 6：包牌与搭档牌（庄家盟友机制）

**用户故事：** 作为庄家，我希望可以选择"包牌"（1打3）或不包牌后由系统分配搭档牌（2打2），以便进行对应阵营对局。

#### 验收标准

1. WHEN 服务端推送 `selectBaopai`（或同义事件）且 `userId == 当前庄家` THEN 客户端 SHALL 在 `myInfoNode` 上显示"包牌 / 不包牌"两个按钮和倒计时。
2. WHEN 玩家点击"包牌" THEN 客户端 SHALL 通过 WebSocket 发送 `type: "selectBaopai", params: { roomId, isBaopai: true }`。
3. WHEN 玩家点击"不包牌"或倒计时结束未选择 THEN 客户端 SHALL 发送 `isBaopai: false`，并等待服务端推送"搭档牌"。
4. WHEN 收到服务端 `partnerCard` 事件（包含搭档牌的牌值） THEN 客户端 SHALL 在所有玩家头部展示该搭档牌的图标，并播放提示音。
5. WHEN 搭档牌"出现"（被某玩家打出）后 THEN 该玩家盟友身份公开 SHALL 通过事件 `partnerReveal` 通知，客户端在该玩家头像下展示"盟友"标识，对应阵营也同步展示。
6. IF 当前是包牌模式（1打3） THEN 客户端 SHALL 不展示"搭档牌"图标与盟友揭晓相关 UI。

### 需求 7：双剑出牌牌型与压牌校验（客户端提示）

**用户故事：** 作为玩家，我希望在出牌时获得正确的牌型校验和提示，以便顺利打出双剑特有的牌型。

#### 验收标准

1. WHEN 客户端进行牌型识别（`CardHint` 或新建 `ShuangjianCardHint`） THEN 它 SHALL 支持以下牌型：单张、对子、三带二（三带二中"二"可为任意两张牌）、飞机（最后一手可不带够）、顺子（≥7 张连续）、连对（≥3 对连续）、510K、炸弹（≥4 张相同）、王炸（≥2 个王）。
2. WHEN 比较两手出牌大小 THEN 比较顺序 SHALL 为：510K（非同花）< 510K（同花）< 4个头 < 2 王 < 5个头 < 6个头 < 3 王 < 3 个510K < 7个头 < 8个头 < 4 王 < ≥4 个510K（与规则一致）。
3. WHEN 玩家点击"提示"按钮 `cardHint` THEN 在双剑房间 SHALL 调用双剑专用提示函数返回可压上家牌的所有合法组合，并循环高亮。
4. WHEN 玩家选择卡牌后点击"出牌" THEN `CardSelection.updatePlayCardBtnStyle` 在双剑模式 SHALL 使用双剑牌型校验，错误牌型时禁用按钮。
5. IF 上家是盟友且当前规则允许"接风" THEN 出牌按钮 SHALL 视作主动出牌（不需要压上家），客户端在 UI 上标识"接风"。

### 需求 8：游戏结束判定（包牌/双关/单关/平局）

**用户故事：** 作为玩家，我希望游戏结束时正确显示阵营、排名和赢分，以便了解本局结果。

#### 验收标准

1. WHEN 服务端推送 `gameOver` 且 `room_type` 为双剑 THEN 客户端 SHALL 通过 `gameOverData.victoryStatus` 判断：包牌、双关、单关、平局四种结算类型并展示对应文案。
2. WHEN 显示结算弹框 `GameOver.showGameOver` THEN 它 SHALL 在双剑模式下扩展为 4 人布局，分别显示每位玩家的：头像、昵称、阵营（庄/闲）、排名（1~4）、得分（基于 `底注 × 倍数`）。
3. IF `victoryStatus == 包牌` THEN 客户端 SHALL 展示"底注 × 6"作为基础倍数。
4. IF `victoryStatus == 双关` THEN 客户端 SHALL 展示"底注 × 2"。
5. IF `victoryStatus == 单关` THEN 客户端 SHALL 展示"底注 × 1"。
6. IF `victoryStatus == 平局` AND 未开启"平局算1分" THEN 客户端 SHALL 展示"底注 × 0"；ELSE 展示"+1 / -1"分布。
7. WHEN 任意一方触发结束 THEN 未出完牌的玩家 SHALL 执行明牌动画（参考 `gameOver` 中的 `mingPaiAnimationUser` 逻辑），动画结束再展示弹框。

### 需求 9：奖（头/王/510K）展示与计算

**用户故事：** 作为玩家，我希望在结算时看到自己拿到的奖（头/王/510K），以便了解每局奖项收益。

#### 验收标准

1. WHEN 客户端收到 `gameOver` 事件 THEN `gameOverData` SHALL 包含 `awards` 字段，其中含每位玩家的：4个头/5个头/6个头/7个头/8个头数量，王数（2同2不同/3/4），510K 数量及对应奖数。
2. WHEN `GameOver` 渲染奖列表 THEN 它 SHALL 按照规则文案生成奖项明细（例如"4 个头：1 个奖"、"3 个510K：3 个奖"等）并求和总奖数。
3. IF 开启"五奖冲关" THEN 客户端 SHALL 展示对每位玩家的 `奖 × 倍数`：5奖×2、6奖×3、7奖×4、8奖×5、9奖×6、10奖×7，公式为 `n奖 × (n-3)`。
4. IF 拿到 1 个 510K THEN 该项 SHALL 显示"1 个510K：0 个奖"（规则要求 1 个 510K 不计奖）。
5. WHEN 总奖数计算 THEN 客户端 SHALL 严格按规则文档：4 个头=1，5头(4+1)=2 / 5头(3+2)=1，6头(4+2)=3 / 6头(3+3)=2，7头=4，8头=6；2 不同王=1，2 相同王=2，3 王=3，4 王=6；3张510K=3，4张510K=6，5=7，6=8，7=9，8=10。

### 需求 10：特殊规则开关 UI

**用户故事：** 作为房主或匹配玩家，我希望在大厅或创建房间时勾选双剑特殊规则，以便影响整局结算计算。

#### 验收标准

1. WHEN 玩家在大厅选择"丰城双剑"玩法 THEN `HallSceneMgr` SHALL 在 `selectLevel` 弹窗中展示 4 个特殊规则复选框：①二人玩法 ②平局算一分 ③输赢分翻倍 ④五奖冲关。
2. WHEN 玩家点击"创建房间"或"匹配房间" THEN 选中的规则 SHALL 以 `specialRules: { twoPlayer, drawAsOne, doubleScore, fiveAwardChallenge }` 字段附加到接口/WebSocket 参数。
3. IF 当前玩法不是"丰城双剑" THEN 特殊规则 UI SHALL 隐藏，不发送 `specialRules` 字段。
4. WHEN 进入房间后 `getRoomInfo` 返回 `specialRules` THEN `RoomScene` SHALL 在房间右上角"规则面板"按钮中展示当前已启用规则。
5. IF "二人玩法"启用 THEN 房间最少 2 人即可开始，且 UI 不展示"包牌"按钮（规则①规定无包牌）。

### 需求 11：socket 事件兼容（双剑专属事件接入）

**用户故事：** 作为客户端开发者，我希望统一注册和注销双剑专属事件，避免内存泄漏和事件遗漏。

#### 验收标准

1. WHEN `RoomScene.start` 在双剑模式下执行 THEN 它 SHALL 注册：`selectBaopai`、`partnerCard`、`partnerReveal`、`shuangjianGameOver`（或共用 `gameOver`）等事件监听。
2. WHEN `RoomScene.onDestroy` 触发 THEN 上述事件 SHALL 被全部 `eventTarget.off` 注销。
3. WHEN 同一房间从斗地主切换到双剑（理论上不会发生，但需防御） THEN 客户端 SHALL 根据 `room_type` 切换事件监听器集合。
4. WHEN WebSocket 发送指令 THEN 双剑专属指令 SHALL 通过 `WebsocketMgr` 已有的 `socket.send({ type, params })` 通道发送，保持协议一致。

### 需求 12：服务端 - 房间数据结构与玩法字段扩展

**用户故事：** 作为服务端开发者，我希望 `Room` 类与房间创建/匹配接口能存储"玩法类型"和"特殊规则"，以便后续逻辑分支判断。

#### 验收标准

1. WHEN 服务端启动 THEN [room.js](g:\workspace\cocos_doudizhu_game\pukepai_server\puke_server\utils\room.js) 中的 `Room` 类 SHALL 新增以下字段：
   - `game_mode: number`（0 斗地主 / 1 双剑）
   - `special_rules: { twoPlayer, drawAsOne, doubleScore, fiveAwardChallenge }`（4 个布尔开关）
   - `partner_card: number | null`（搭档牌，仅双剑用）
   - `is_baopai: boolean`（是否包牌）
   - `landlord_camp: string[]` / `farmer_camp: string[]`（双剑阵营 userId 数组）
   - `partner_revealed: boolean`（搭档牌是否已亮牌）
   - `pass_user_record: { userId: string, rank: number }[]`（玩家走完牌的顺序，用于排名 1~4）
2. WHEN `CreateRoom` 被调用且 `game_mode == 1` THEN `roomUserIdList` SHALL 初始化为长度 4 的空数组 `["", "", "", ""]`；当 `special_rules.twoPlayer == true` 时仍可保持 4 但满 2 即可开局。
3. WHEN [user.js](g:\workspace\cocos_doudizhu_game\pukepai_server\puke_server\router\user.js) 的 `POST /createRoom` 接口被调用 THEN 它 SHALL 接收并校验 `gameMode` 与 `specialRules` 字段，然后传给 `CreateRoom`。
4. WHEN [webSocketMatch.js](g:\workspace\cocos_doudizhu_game\pukepai_server\puke_server\router\websocket\webSocketMatch.js) 的 `match` 被调用 THEN 它 SHALL 按 `level + gameMode` 组合维护匹配队列（如 `matchUserList["1_1"]`），并在双剑模式下满 4 人（或开启二人玩法时满 2 人）才创建房间。
5. WHEN `userJoinRoom` 在双剑房间被调用 THEN 满员判定 SHALL 由原来的 `>= 3` 改为根据 `game_mode` 动态判断（双剑 4 / 双剑二人 2 / 斗地主 3）。
6. WHEN [webSocketRoomBaseRouter.js](g:\workspace\cocos_doudizhu_game\pukepai_server\puke_server\router\websocket\webSocketRoomBaseRouter.js) 的 `ready` 检测全员准备时 THEN 触发开局的人数 SHALL 也按 `game_mode` 与 `special_rules.twoPlayer` 动态判断。

### 需求 13：服务端 - 双剑发牌与庄家选取

**用户故事：** 作为服务端开发者，我希望根据双剑规则给每个玩家发 27 张牌，并随机一名庄家（首局），以便游戏开局。

#### 验收标准

1. WHEN 服务端在双剑模式下进入发牌流程 THEN [webSocketDealCardsRouter.js](g:\workspace\cocos_doudizhu_game\pukepai_server\puke_server\router\websocket\webSocketDealCardsRouter.js) SHALL 新增 `dealCardsShuangjian` 方法，使用 108 张双副牌池（每张牌带"副本编号"用于排序与去重）洗牌，按 4 人各发 27 张。
2. IF `special_rules.twoPlayer == true` AND 房间为 2 人 THEN 服务端 SHALL 给每位玩家发 54 张牌。
3. WHEN 双剑发牌完成 THEN 服务端 SHALL 通过 `wsSend` 推送 `type: "dealCardsShuangjian"`，data 包含每位玩家的卡牌、`game_mode`、`special_rules`。
4. WHEN 首局开局 THEN 服务端 SHALL 随机一名玩家为庄家，写入 `roomInfo.landlord_id`；从第二局开始 SHALL 由上局头游做庄。
5. WHEN 庄家确定 THEN 服务端 SHALL 推送 `type: "shuangjianLandlord", data: { landlordId, isFirstRound }` 通知所有玩家。

### 需求 14：服务端 - 包牌与搭档牌（庄家盟友机制）

**用户故事：** 作为服务端开发者，我希望服务端能驱动包牌选择 / 搭档牌指定 / 接风规则，以便正确推进 1打3 / 2打2 阵营。

#### 验收标准

1. WHEN 庄家确定后 THEN 服务端 SHALL 在双剑模式下推送 `type: "selectBaopai", data: { userId: landlordId, downTime: 15 }`，并启动倒计时。
2. WHEN 庄家发送 `type: "selectBaopai", params: { roomId, isBaopai }` THEN 服务端 SHALL 写入 `roomInfo.is_baopai`：
   - 若 `isBaopai == true`：`landlord_camp = [landlordId]`，`farmer_camp = 其他三位`，进入出牌阶段
   - 若 `isBaopai == false`：从庄家手牌之外的牌池中随机一张作为 `partner_card`，仅庄家可见，进入出牌阶段
3. WHEN `special_rules.twoPlayer == true` THEN 服务端 SHALL 跳过包牌阶段（规则①）。
4. WHEN 任意玩家打出牌包含 `partner_card` THEN 服务端 SHALL 揭晓阵营，将该玩家加入 `landlord_camp`，剩余玩家归入 `farmer_camp`，设置 `partner_revealed = true`，并广播 `type: "partnerReveal", data: { userId, partnerCard, landlordCamp, farmerCamp }`。
5. IF 出现"接风"场景（盟友刚出过牌且本玩家是其盟友） THEN 服务端 SHALL 在 `playCardTimer` 中下发 `canPick: true`，允许该玩家不压上家直接主动出牌。

### 需求 15：服务端 - 双剑牌型识别与压牌

**用户故事：** 作为服务端开发者，我希望服务端能正确识别与比较双剑特有牌型，以便机器人出牌、出牌校验都基于服务端权威。

#### 验收标准

1. WHEN 服务端识别牌型 THEN [cardLogic.js](g:\workspace\cocos_doudizhu_game\pukepai_server\puke_server\cardLogic\cardLogic.js) SHALL 新增 `judgeCardTypeShuangjian` 函数，输出枚举：单张、对子、三带二、飞机（最后一手可不带够）、顺子（≥7 连）、连对（≥3 对连）、510K、炸弹（≥4 张）、王炸（≥2 王）。
2. WHEN 服务端比较两手出牌大小 THEN 比较顺序 SHALL 严格按需求规则：510K（非同花）< 510K（同花）< 4个头 < 2 王 < 5个头 < 6个头 < 3 王 < 3 个510K < 7个头 < 8个头 < 4 王 < ≥4 个510K。
3. WHEN [cardHint.js](g:\workspace\cocos_doudizhu_game\pukepai_server\puke_server\cardLogic\cardHint.js) 在双剑模式下被调用 THEN 它 SHALL 提供 `cardHintShuangjian(targetCards, myCards)` 返回所有合法的可压牌组合，供机器人出牌与玩家提示共用。
4. WHEN [webSocketPlayCardRouter.js](g:\workspace\cocos_doudizhu_game\pukepai_server\puke_server\router\websocket\webSocketPlayCardRouter.js) 的 `userPlayCard` 在双剑房间被调用 THEN 它 SHALL 使用双剑校验函数；非法牌型返回 `code: 400, message: "牌型错误"`。
5. WHEN 服务端处理双剑炸弹 / 王炸 / 510K 时 THEN 倍率提升规则 SHALL 不复用斗地主"炸弹×2"逻辑，改为按双剑奖项体系（在结算环节统一计算）。
6. WHEN 出牌切换下家 THEN `switchNextUserPlay` SHALL 按 `roomUserIdList` 长度 4（或 2）逆时针轮转。

### 需求 16：服务端 - 双剑结束判定与排名

**用户故事：** 作为服务端开发者，我希望根据规则判定游戏结束并算出 4 人排名，以便驱动结算。

#### 验收标准

1. WHEN 玩家手牌清零 THEN 服务端 SHALL 推送该玩家进入 `pass_user_record`（rank 自增 1）。
2. IF 当前是包牌（1打3） THEN 当 `landlord_camp` 中任意玩家走完，或 `farmer_camp` 中任意玩家走完 THEN 游戏 SHALL 立即结束。
3. IF 当前是 2打2 THEN 必须 `landlord_camp` 两位都走完 或 `farmer_camp` 两位都走完，游戏 SHALL 才结束。
4. IF `special_rules.twoPlayer == true` THEN 任意一方走完即结束。
5. WHEN 游戏结束 THEN 服务端 SHALL 计算结算类型：
   - `victoryStatus = 1`（包牌）：包牌方独胜或独败
   - `victoryStatus = 2`（双关）：盟友方两人都走完，且对方两人都没走
   - `victoryStatus = 3`（单关）：盟友方两人都走完，对方一走一未走
   - `victoryStatus = 4`（平局）：盟友方两人都走完，对方两人都已走（即排名 1/3 vs 2/4 等）
6. WHEN 计算结算分数 THEN 服务端 SHALL 按底注 ×{6/2/1/0} 倍数生成每位玩家 `get_score`，并应用特殊规则：
   - `doubleScore` 启用：每个玩家 `get_score *= 2`
   - `drawAsOne` 启用：平局时改为头游 +1 / 末游 -1（具体按规则②）
   - `twoPlayer` 启用：输赢分为 3 分

### 需求 17：服务端 - 奖（头/王/510K）计算

**用户故事：** 作为服务端开发者，我希望在结算时统计每位玩家的奖项，以便支持五奖冲关与奖励展示。

#### 验收标准

1. WHEN 游戏结束 THEN 服务端 SHALL 新增 `calcAwards(userCards, isFirstHandLeftover)` 函数，统计每位玩家的：
   - 头：4个头/5个头/6个头/7个头/8个头（同点数同花色为"头"，按规则文档奖数计算）
   - 王：2 不同王=1 / 2 相同王=2 / 3 王=3 / 4 王=6
   - 510K：≤2张=0 / 3张=3 / 4张=6 / 5张=7 / 6张=8 / 7张=9 / 8张=10
2. WHEN `special_rules.fiveAwardChallenge == true` THEN 总奖数 ≥ 5 时 SHALL 按 `n奖 × (n-3)` 公式扩大每人需出奖数（5奖×2、6奖×3、…），所有非该玩家的输家平均承担。
3. WHEN 结算消息推送 THEN `gameOverData` SHALL 包含每位玩家的 `awards: { heads, kings, fiveTenK, total }` 字段。
4. IF 玩家有 1 个 510K THEN `awards.fiveTenK = 0`（规则要求 1 个 510K 不计奖）。

### 需求 18：服务端 - 双剑战绩入库

**用户故事：** 作为服务端开发者，我希望双剑对局有独立的战绩表，以便不与斗地主战绩冲突。

#### 验收标准

1. WHEN 数据库初始化 THEN 服务端 SHALL 新增 `shuangjian_record` 表，字段含：`id, room_id, start_time, end_time, level, room_base, game_mode, special_rules(JSON), is_baopai, partner_card, landlord_id, user_1_id..user_4_id, user_1_rank..user_4_rank, user_1_get_score..user_4_get_score, user_1_awards..user_4_awards(JSON), play_card_record(JSON), victory_status`。
2. WHEN [webSocketPlayCardRouter.js](g:\workspace\cocos_doudizhu_game\pukepai_server\puke_server\router\websocket\webSocketPlayCardRouter.js) 的 `gameOver` 在双剑分支被调用 THEN 它 SHALL 调用 `saveShuangjianRecordMysql(roomId, ...)` 写入战绩。
3. WHEN [user.js](g:\workspace\cocos_doudizhu_game\pukepai_server\puke_server\router\user.js) 中 `POST /getRecord` 接口被调用 THEN 它 SHALL 同时返回斗地主与双剑两类战绩，或新增 `POST /getShuangjianRecord` 单独返回。
4. WHEN 战绩写入失败 THEN 服务端 SHALL 打印错误日志但不影响后续 `clearRoomInfo` 流程。

### 需求 19：边界与异常情况

**用户故事：** 作为玩家，我希望异常场景下客户端不会崩溃或显示错误信息，以便有良好的体验。

#### 验收标准

1. IF 玩家在双剑模式下断线重连 THEN `RoomScene` 重连分支 SHALL 同步清理第 4 个玩家节点，并依据 `room_type` 重新走双剑渲染。
2. IF 服务端 `room_type` 字段缺失或值非法 THEN 客户端 SHALL 默认按斗地主渲染，并打印警告日志（不弹错误）。
3. IF 玩家在双剑包牌阶段超时未选择 THEN 客户端 SHALL 隐藏包牌按钮、显示"自动不包牌"提示文本 0.4 秒后清除。
4. IF 玩家在搭档牌阶段尚未揭晓搭档身份 THEN 客户端 SHALL 不允许玩家通过 UI 推测盟友（即不展示任何带"盟友/敌人"暗示的 UI）。
5. WHEN 房间被销毁或玩家退出 THEN 双剑相关的所有计时器、监听器、缓存 SHALL 全部释放。

---

## 成功标准

- 玩家可以在大厅中选择"丰城双剑"创建/匹配房间，进入 4 人房间并完成一整局对局，客户端 UI 与服务端结算结果一致。
- 双剑专属牌型（510K、3 个王、≥4 个510K 等）能被服务端正确识别、压牌、托管出牌；客户端能正确提示。
- 包牌（1打3）、搭档牌（2打2）、接风、明牌动画、4 种结算类型（包牌/双关/单关/平局）端到端跑通。
- 4 个特殊规则开关（二人玩法/平局算1分/输赢分翻倍/五奖冲关）可在大厅勾选，并由服务端落地到结算逻辑。
- 双剑战绩独立入库 `shuangjian_record`，大厅"战绩"页可按玩法切换查看。
- 现有"斗地主"玩法（客户端 + 服务端）不受任何影响，回归测试通过。


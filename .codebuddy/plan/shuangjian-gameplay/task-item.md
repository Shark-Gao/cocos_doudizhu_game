<!--
 * @author: sharkgao
 * @LastEditors: sharkgao
-->
# 实施计划 - 丰城双剑玩法接入

> 本计划基于 `.codebuddy/plan/shuangjian-gameplay/requirements.md`，将"丰城双剑"玩法接入分解为独立、可逐步推进的编码任务。
> 所有任务采用"接口 + 多态（策略模式）"架构，避免散落的 `if (game_mode == 1)` 分支。
> 实施顺序：**先抽象接口骨架 → 服务端规则 → 客户端视图 → 入库与异常**。

---

- [ ] 1. 服务端 - 搭建 GameMode 抽象层与工厂
  - 新建 `pukepai_server/puke_server/gameMode/IGameMode.js` 抽象基类，声明 `getMaxPlayerCount / getMinPlayerCount / dealCards / selectLandlord / onAfterLandlordDecided / judgeCardType / compareCards / getCardHint / onPlayCard / isGameOver / calcSettlement / saveRecordMysql` 等 12+ 方法，默认 `throw "Not Implemented"`
  - 新建 `pukepai_server/puke_server/gameMode/GameModeFactory.js`，提供 `create(gameMode)` 单例方法
  - 在 [room.js](g:\workspace\cocos_doudizhu_game\pukepai_server\puke_server\utils\room.js) 的 `Room` 类中增加 `game_mode / special_rules / partner_card / is_baopai / landlord_camp / farmer_camp / partner_revealed / pass_user_record / gameModeImpl` 字段，并在 `CreateRoom` 中通过工厂实例化
  - _需求：1.1, 1.4, 1.5, 12.1, 12.2_

- [ ] 2. 服务端 - 重构现有斗地主逻辑到 DoudizhuMode
  - 新建 `pukepai_server/puke_server/gameMode/doudizhu/DoudizhuMode.js`，将 [webSocketDealCardsRouter.js](g:\workspace\cocos_doudizhu_game\pukepai_server\puke_server\router\websocket\webSocketDealCardsRouter.js) / [webSocketPlayCardRouter.js](g:\workspace\cocos_doudizhu_game\pukepai_server\puke_server\router\websocket\webSocketPlayCardRouter.js) 中斗地主流程迁移过来（发牌、抢地主、加倍、出牌、结算、入库）
  - 改造 [webSocketRoomBaseRouter.js](g:\workspace\cocos_doudizhu_game\pukepai_server\puke_server\router\websocket\webSocketRoomBaseRouter.js) / [webSocketDealCardsRouter.js](g:\workspace\cocos_doudizhu_game\pukepai_server\puke_server\router\websocket\webSocketDealCardsRouter.js) / [webSocketPlayCardRouter.js](g:\workspace\cocos_doudizhu_game\pukepai_server\puke_server\router\websocket\webSocketPlayCardRouter.js) 的 Router 层，统一改为调用 `roomInfo.gameModeImpl.xxx()`，确保斗地主功能 100% 回归
  - _需求：1.2, 1.6_

- [ ] 3. 服务端 - 双剑房间创建/匹配与人数判定
  - 在 [user.js](g:\workspace\cocos_doudizhu_game\pukepai_server\puke_server\router\user.js) 的 `POST /createRoom` 接口接收并校验 `gameMode` 与 `specialRules` 字段
  - 改造 [webSocketMatch.js](g:\workspace\cocos_doudizhu_game\pukepai_server\puke_server\router\websocket\webSocketMatch.js)：按 `level + gameMode` 维护匹配队列（如 `matchUserList["1_1"]`），双剑满 4 人或开启二人玩法满 2 人才创建房间
  - 改造 `userJoinRoom` 与 `ready` 流程：满员/开局判定按 `gameModeImpl.getMaxPlayerCount/getMinPlayerCount` 动态计算
  - _需求：3.3, 3.4, 12.3, 12.4, 12.5, 12.6_

- [ ] 4. 服务端 - ShuangjianMode 发牌、庄家与包牌/搭档牌
  - 新建 `pukepai_server/puke_server/gameMode/shuangjian/ShuangjianMode.js` 实现 `dealCards`：使用 108 张双副牌（每张含副本编号）洗牌，4 人各发 27 张；二人玩法各发 54 张；推送 `dealCardsShuangjian`
  - 实现 `selectLandlord`：首局随机庄家，后续由头游做庄；推送 `shuangjianLandlord`
  - 实现 `onAfterLandlordDecided`：推送 `selectBaopai` + 倒计时；处理 `selectBaopai` 入参写入 `is_baopai`；不包牌则从余牌随机一张写入 `partner_card`；二人玩法跳过该阶段
  - 在 `onPlayCard` 中检测 `partner_card` 出现 → 划分 `landlord_camp / farmer_camp`，广播 `partnerReveal`；处理"接风"标记 `canPick`
  - _需求：5.1, 6.1, 6.2, 6.3, 13.1, 13.2, 13.3, 13.4, 13.5, 14.1, 14.2, 14.3, 14.4, 14.5_

- [ ] 5. 服务端 - 双剑牌型识别、压牌与提示
  - 在 [cardLogic.js](g:\workspace\cocos_doudizhu_game\pukepai_server\puke_server\cardLogic\cardLogic.js) 新增 `judgeCardTypeShuangjian`：单张/对子/三带二（二可任意）/飞机（最后手可不带够）/顺子(≥7)/连对(≥3)/510K/炸弹(≥4)/王炸(≥2 王)
  - 实现 `compareCardsShuangjian`，比较顺序严格按规则：510K非同花 < 510K同花 < 4头 < 2王 < 5头 < 6头 < 3王 < 3个510K < 7头 < 8头 < 4王 < ≥4个510K
  - 在 [cardHint.js](g:\workspace\cocos_doudizhu_game\pukepai_server\puke_server\cardLogic\cardHint.js) 新增 `cardHintShuangjian(targetCards, myCards)`，供 `userPlayCard` 校验、机器人托管、玩家提示共用
  - `switchNextUserPlay` 按 `roomUserIdList` 长度（4 / 2）逆时针轮转
  - _需求：7.1, 7.2, 15.1, 15.2, 15.3, 15.4, 15.6_

- [ ] 6. 服务端 - 双剑结束判定、奖项计算与结算
  - 在 `ShuangjianMode.isGameOver` 中按规则判定：包牌任一方一人走完即结束；2打2 必须同阵营两人都走完；二人玩法任一方走完即结束
  - 实现 `calcAwards(userCards)`：统计每位玩家头(4/5/6/7/8)、王(2不同/2相同/3/4)、510K(≥3 张计奖) 各自奖数
  - 实现 `calcSettlement`：根据 `victoryStatus`（包牌/双关/单关/平局）应用底注 ×{6/2/1/0} 倍数；应用特殊规则（`doubleScore` ×2、`drawAsOne` 头游+1/末游-1、`twoPlayer` 输赢分3、`fiveAwardChallenge` 按 `n×(n-3)`）
  - `gameOver` 推送时 `gameOverData` 包含 `victoryStatus / awards / get_score / pass_user_record / partnerCard / landlordCamp / farmerCamp`
  - _需求：8.1, 8.3-8.6, 9.5, 16.1-16.6, 17.1-17.4_

- [ ] 7. 服务端 - 双剑战绩入库与查询
  - 新建 `shuangjian_record` 表（DDL 脚本 + 启动建表），字段含 `room_id / level / room_base / game_mode / special_rules(JSON) / is_baopai / partner_card / landlord_id / user_1..4_id / user_1..4_rank / user_1..4_get_score / user_1..4_awards(JSON) / play_card_record(JSON) / victory_status / start_time / end_time`
  - 在 `ShuangjianMode.saveRecordMysql` 中调用 `saveShuangjianRecordMysql(roomId, ...)` 写库；写入失败仅打日志不影响 `clearRoomInfo`
  - 在 [user.js](g:\workspace\cocos_doudizhu_game\pukepai_server\puke_server\router\user.js) 的 `POST /getRecord` 中按 `gameMode` 返回对应表，或新增 `POST /getShuangjianRecord`
  - _需求：18.1, 18.2, 18.3, 18.4_

- [ ] 8. 客户端 - 搭建 GameMode 视图抽象层与工厂
  - 新建 `pukepai/assets/Script/GameMode/IGameModeView.ts` 抽象基类，声明 `getSeatLayout / getCardHintImpl / getGameOverPanel / registerSocketEvents / unregisterSocketEvents / onDealCards / onPartnerCard / onLandlordSelect` 等方法
  - 新建 `pukepai/assets/Script/GameMode/GameModeViewFactory.ts`，按 `GameMode` 枚举返回对应实例
  - 新建 `pukepai/assets/Script/GameMode/Doudizhu/DoudizhuModeView.ts`，将 [RoomScene.ts](g:\workspace\cocos_doudizhu_game\pukepai\assets\Script\RoomScene\RoomScene.ts) 中抢地主/加倍/明牌等斗地主独有回调迁移过来
  - 改造 `RoomScene.start`：依据 `roomInfo.game_mode` 通过工厂创建 `this.modeView`，业务代码改为调用 `this.modeView.xxx()`；`onDestroy` 调用 `unregisterSocketEvents` 防泄漏
  - _需求：2.1, 2.2, 2.4, 2.5, 11.2, 11.3_

- [ ] 9. 客户端 - 大厅玩法选择 UI 与特殊规则
  - 完善 [HallSceneMgr.ts](g:\workspace\cocos_doudizhu_game\pukepai\assets\Script\SceneScript\HallSceneMgr.ts)：`gameModeSelect` 切换 Radio 时刷新 Checkmark；`createRoom`/`matchRoom`/`cancelMatch` 携带当前 `gameMode`
  - 在 `selectLevel` 弹窗中渲染 4 个特殊规则复选框（二人玩法 / 平局算一分 / 输赢分翻倍 / 五奖冲关），仅在选中"丰城双剑"时显示
  - 提交时打包 `specialRules: { twoPlayer, drawAsOne, doubleScore, fiveAwardChallenge }` 一并发送
  - 抽出 `IHallModeStrategy` 接口，由 `DoudizhuHallStrategy` / `ShuangjianHallStrategy` 两个实现分别提供"是否展示规则面板/min/max 人数/创建房间 payload"
  - _需求：2.6, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ] 10. 客户端 - ShuangjianModeView：4 人布局、发牌、包牌/搭档牌、出牌校验
  - 新建 `pukepai/assets/Script/GameMode/Shuangjian/ShuangjianModeView.ts`，`getSeatLayout` 启用 `User3CardBox` 并按逆时针返回 4 个玩家节点；`renderUserInfo` 兼容 4 位（空位置占位）；隐藏地主图标 / 底牌区
  - `onDealCards` 按 27 张排版（兼容双副牌稳定排序 `cardNum + cardType*13`）；不展示底牌动画
  - 监听并处理 `selectBaopai`（显示包牌/不包牌按钮 + 倒计时 + 超时自动不包牌）、`partnerCard`（仅庄家展示）、`partnerReveal`（揭晓阵营/盟友标识）、`canPick`（接风提示）
  - 新建 `pukepai/assets/Script/GameMode/Shuangjian/ShuangjianCardHint.ts` 实现 `judgeCardTypeShuangjian` / `cardHintShuangjian`，被 `cardHint` 按钮和 `CardSelection.updatePlayCardBtnStyle` 调用
  - 二人玩法启用时不展示包牌按钮
  - _需求：4.1-4.5, 5.1-5.4, 6.1-6.6, 7.1-7.5, 10.5, 11.1, 11.4_

- [ ] 11. 客户端 - 双剑结算弹框、奖展示与异常/断线重连
  - 新建 `pukepai/assets/Script/GameMode/Shuangjian/ShuangjianGameOverPanel.ts`，扩展为 4 人布局：头像 / 昵称 / 阵营（庄/闲）/ 排名 / 得分（底注 × 倍数）；按 `victoryStatus` 展示包牌/双关/单关/平局文案
  - 渲染奖列表（按规则文案：4个头=1奖、3个510K=3奖等），并按"五奖冲关"开启时展示 `n奖×(n-3)` 倍率与每人需出奖数
  - 1 个 510K 显示"0 个奖"；明牌动画结束后再展示弹框
  - 异常处理：双剑断线重连分支同步清理 `User3CardBox` 节点（倒计时/出牌区/手牌区）；`room_type` 缺失或非法时默认走斗地主渲染并打警告；包牌阶段超时显示"自动不包牌"0.4s 后清除；房间销毁/退出时释放双剑所有计时器/监听器/缓存
  - _需求：8.1, 8.2, 8.7, 9.1-9.5, 19.1-19.5_


import { CONFIG } from "../Script/Config";

// 甜美女生音频地址
const sweetGirlAudio = "RoomAudio/girlv1/";
const roomMainV1Audio = "RoomAudio/RoomMainV1/";
const roomMusicV1Audio = `${CONFIG.RESOURCE_BASE_URL}/RoomAudio/musicV1/`;
// 当前用户使用的音频包名，后期如果想做多个的话可以修改
export const audioPageageName = "sweetGirlAudio";
export const defaultAudioPackageName = audioPageageName;
export const girlAudioPackageName = "sweetGirlAudio";
// 胜利音频
export const gameOverSuccessAudio = "RoomAudio/RoomMainV1/win";
// 失败音频
export const gameOverLoseAudio = "RoomAudio/RoomMainV1/lose";

export enum AudioType {
  duizi_1 = "duizi_1",
  duizi_2 = "duizi_2",
  duizi_3 = "duizi_3",
  duizi_4 = "duizi_4",
  duizi_5 = "duizi_5",
  duizi_6 = "duizi_6",
  duizi_7 = "duizi_7",
  duizi_8 = "duizi_8",
  duizi_9 = "duizi_9",
  duizi_10 = "duizi_10",
  duizi_11 = "duizi_11",
  duizi_12 = "duizi_12",
  duizi_13 = "duizi_13",
  one_1 = "one_1",
  one_2 = "one_2",
  one_3 = "one_3",
  one_4 = "one_4",
  one_5 = "one_5",
  one_6 = "one_6",
  one_7 = "one_7",
  one_8 = "one_8",
  one_9 = "one_9",
  one_10 = "one_10",
  one_11 = "one_11",
  one_12 = "one_12",
  one_13 = "one_13",
  shunzi = "shunzi",
  liandui = "liandui",
  feiji = "feiji",
  dai_3_1 = "dai_3_1",
  dai_3_2 = "dai_3_2",
  zhadan = "zhadan",
  wangzha = "wangzha",
  buyao = "buyao",
  yaobuqi = "yaobuqi",
  sanzhang = "sanzhang",
  sanzhang_1 = "sanzhang_1",
  sanzhang_2 = "sanzhang_2",
  sanzhang_3 = "sanzhang_3",
  sanzhang_4 = "sanzhang_4",
  sanzhang_5 = "sanzhang_5",
  sanzhang_6 = "sanzhang_6",
  sanzhang_7 = "sanzhang_7",
  sanzhang_8 = "sanzhang_8",
  sanzhang_9 = "sanzhang_9",
  sanzhang_10 = "sanzhang_10",
  sanzhang_11 = "sanzhang_11",
  sanzhang_12 = "sanzhang_12",
  sanzhang_13 = "sanzhang_13",
  xiaowang = "xiaowang",
  dawang = "dawang",
  mingpai = "mingpai",
  bujiabei = "bujiabei",
  jiabei = "jiabei",
  chaojijiabei = "chaojijiabei",
  qiangdizhu = "qiangdizhu",
  buqiang = "buqiang",
}

export enum RoomMainAudio {
  alert = "alert",
  boom = "boom",
  chat = "chat",
  click = "click",
  error_acl = "error_acl",
  flower = "flower",
  givecard = "givecard",
  lose = "lose",
  plane = "plane",
  remind = "remind",
  ring = "ring",
  screenshot = "screenshot",
  select = "select",
  sendcard = "sendcard",
  spring = "spring",
  start = "start",
  timeup = "timeup",
  win = "win",
}

export const roomMainAudios: Record<RoomMainAudio, string> = {
  [RoomMainAudio.alert]: roomMainV1Audio + RoomMainAudio.alert,
  [RoomMainAudio.boom]: roomMainV1Audio + RoomMainAudio.boom,
  [RoomMainAudio.chat]: roomMainV1Audio + RoomMainAudio.chat,
  [RoomMainAudio.click]: roomMainV1Audio + RoomMainAudio.click,
  [RoomMainAudio.error_acl]: roomMainV1Audio + RoomMainAudio.error_acl,
  [RoomMainAudio.flower]: roomMainV1Audio + RoomMainAudio.flower,
  [RoomMainAudio.givecard]: roomMainV1Audio + RoomMainAudio.givecard,
  [RoomMainAudio.lose]: roomMainV1Audio + RoomMainAudio.lose,
  [RoomMainAudio.plane]: roomMainV1Audio + RoomMainAudio.plane,
  [RoomMainAudio.remind]: roomMainV1Audio + RoomMainAudio.remind,
  [RoomMainAudio.ring]: roomMainV1Audio + RoomMainAudio.ring,
  [RoomMainAudio.screenshot]: roomMainV1Audio + RoomMainAudio.screenshot,
  [RoomMainAudio.select]: roomMainV1Audio + RoomMainAudio.select,
  [RoomMainAudio.sendcard]: roomMainV1Audio + RoomMainAudio.sendcard,
  [RoomMainAudio.spring]: roomMainV1Audio + RoomMainAudio.spring,
  [RoomMainAudio.start]: roomMainV1Audio + RoomMainAudio.start,
  [RoomMainAudio.timeup]: roomMainV1Audio + RoomMainAudio.timeup,
  [RoomMainAudio.win]: roomMainV1Audio + RoomMainAudio.win,
};

export function getRoomMainAudio(audio: RoomMainAudio): string {
  return roomMainAudios[audio];
}

export enum RoomMusicAudio {
  welcome = "Welcome",
  normal = "Normal",
  normal2 = "Normal",
  exciting = "Exciting",
}

export const roomMusicAudios: Record<RoomMusicAudio, string> = {
  [RoomMusicAudio.welcome]: roomMusicV1Audio + RoomMusicAudio.welcome + ".mp3",
  [RoomMusicAudio.normal]: roomMusicV1Audio + RoomMusicAudio.normal + ".mp3",
  // [RoomMusicAudio.normal2]: roomMusicV1Audio + RoomMusicAudio.normal2 + ".mp3",
  [RoomMusicAudio.exciting]: roomMusicV1Audio + RoomMusicAudio.exciting + ".mp3",
};

export function getRoomMusicAudio(audio: RoomMusicAudio): string {
  return roomMusicAudios[audio];
}

function getGenderAudioPackageName(gender?: any): string {
  const sex = String(gender ?? "").toLowerCase();
  if (sex === "0" || sex === "2" || sex === "female" || sex === "girl" || sex === "woman") {
    return girlAudioPackageName;
  }
  return defaultAudioPackageName;
}

export function getUserAudioPackageName(userInfo?: any): string {
  return getGenderAudioPackageName(userInfo?.sex ?? userInfo?.gender ?? userInfo?.user_sex ?? userInfo?.user_gender);
}

function getFallbackAudio(audio: string): string {
  if (/^sanzhang_\d+$/.test(audio)) {
    return AudioType.dai_3_1;
  }
  return "";
}

function getPackagePlayAudio(packageName: string, audio: string): string {
  const packageAudios = playAudios[packageName];
  const fallbackAudio = getFallbackAudio(audio);
  return packageAudios?.[audio] || packageAudios?.[fallbackAudio] || "";
}

export function getPlayAudio(audio: string, userInfo?: any): string {
  const packageName = getUserAudioPackageName(userInfo);
  return getPackagePlayAudio(packageName, audio) || getPackagePlayAudio(defaultAudioPackageName, audio) || "";
}

export interface QuickVoicePhrase {
  id: number;
  text: string;
  audio: string;
}

export const quickVoicePhrases: QuickVoicePhrase[] = [
  { id: 1, text: "快点儿吧，我等的花儿都谢了", audio: "msgChatMsg03" },
  { id: 2, text: "和你合作真是太愉快了", audio: "msgChatMsg02" },
  { id: 3, text: "你的牌打得也太好了", audio: "msgChatMsg04" },
  { id: 4, text: "不要走，决战到天亮", audio: "msgChatMsg08" },
  { id: 5, text: "怎么又断线了，网络怎么这么差啊", audio: "msgChatMsg06" },
  { id: 6, text: "各位不好意思，我要离开一会儿", audio: "msgChatMsg07" },
  { id: 7, text: "不要吵了，专心玩游戏吧", audio: "msgChatMsg05" },
  { id: 8, text: "你是妹妹还是哥哥啊", audio: "msgChatMsg09" },
  { id: 9, text: "大家好，很高兴见到各位", audio: "msgChatMsg01" },
  { id: 10, text: "交个朋友吧，能告诉我联系方式吗", audio: "msgChatMsg10" },
  { id: 11, text: "再见了，我会想念大家的", audio: "msgChatMsg11" },
  { id: 12, text: "不好意思哦，我出错牌了", audio: "msgChatMsg12" },
];

export function getQuickVoicePhrase(voiceId: number): QuickVoicePhrase | null {
  return quickVoicePhrases.find(item => item.id === Number(voiceId)) || null;
}

export function getQuickVoiceAudio(voiceId: number, userInfo?: any): string {
  const phrase = getQuickVoicePhrase(voiceId);
  if (!phrase) return "";
  const packageName = getUserAudioPackageName(userInfo);
  return getPackagePlayAudio(packageName, phrase.audio) || getPackagePlayAudio(defaultAudioPackageName, phrase.audio) || "";
}

const sweetGirlPlayAudios: Record<string, string> = {
  [AudioType.shunzi]: sweetGirlAudio + AudioType.shunzi,
  [AudioType.liandui]: sweetGirlAudio + AudioType.liandui,
  [AudioType.feiji]: sweetGirlAudio + AudioType.feiji,
  [AudioType.dai_3_1]: sweetGirlAudio + "sandaiyi",
  [AudioType.dai_3_2]: sweetGirlAudio + "sandaiyidui",
  [AudioType.zhadan]: sweetGirlAudio + AudioType.zhadan,
  [AudioType.wangzha]: sweetGirlAudio + AudioType.wangzha,
  [AudioType.buyao]: sweetGirlAudio + "buyao1",
  [AudioType.yaobuqi]: sweetGirlAudio + AudioType.yaobuqi,
  [AudioType.xiaowang]: sweetGirlAudio + "114",
  [AudioType.dawang]: sweetGirlAudio + "115",
  [AudioType.mingpai]: sweetGirlAudio + AudioType.mingpai,
  [AudioType.bujiabei]: sweetGirlAudio + "jiabei0",
  [AudioType.jiabei]: sweetGirlAudio + "jiabei1",
  [AudioType.chaojijiabei]: sweetGirlAudio + "jiabei1",
  [AudioType.qiangdizhu]: sweetGirlAudio + "order",
  [AudioType.buqiang]: sweetGirlAudio + "noorder",
};

quickVoicePhrases.forEach(item => {
  sweetGirlPlayAudios[item.audio] = sweetGirlAudio + item.audio;
});

for (let cardNum = 1; cardNum <= 13; cardNum++) {
  sweetGirlPlayAudios[AudioType[`one_${cardNum}`]] = sweetGirlAudio + `1${String(cardNum).padStart(2, "0")}`;
  sweetGirlPlayAudios[AudioType[`duizi_${cardNum}`]] = sweetGirlAudio + `2${String(cardNum).padStart(2, "0")}`;
  sweetGirlPlayAudios[AudioType[`sanzhang_${cardNum}`]] = sweetGirlAudio + `3${String(cardNum).padStart(2, "0")}`;
}

sweetGirlPlayAudios[AudioType.sanzhang] = sweetGirlPlayAudios[AudioType.sanzhang_1];

export const playAudios: Record<string, Record<string, string>> = {
  // 甜美女生音频（后期可以添加多种语音，key必须一致）
  [girlAudioPackageName]: sweetGirlPlayAudios,
}

export const GameModel = {
  0: "创建模式",
  1: "匹配模式",
  3: "人机模式", // 后续看看能不能添加
}

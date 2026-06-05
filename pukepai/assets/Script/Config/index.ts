/*
 * @author: sharkgao
 * @LastEditors: sharkgao
 */
/*
 * @author: sharkgao
 * @LastEditors: sharkgao
 */
const dev = false;//window.CC_DEBUG; //   && false

export const CONFIG = {
    API_BASE_URL: dev
        ? 'http://localhost:3002'
        : 'https://doudizhu-game-server.onrender.com', // 打包线上接口
    RESOURCE_BASE_URL: dev
        ? 'http://localhost:3002/static'
        : 'https://doudizhu-game-server.onrender.com/static', // 打包线上静态资源
    // /ws 在nginx代理判断用的，/ws后面的随便
    SOCKET_BASE_URL: dev
        ? 'ws://localhost:3002/ws'
        : 'wss://doudizhu-game-server.onrender.com/ws', // 打包线上websocket接口
};
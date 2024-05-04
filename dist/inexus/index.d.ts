import { INexusMessage, INexusSendMessageOptions } from "./types";
export interface INexus {
    /**
     * send message
     * @param contents
     * @param options
     */
    sendMessage(contents: INexusMessage['contents'], options: INexusSendMessageOptions): Promise<INexusMessage>;
    /**
     * message token
     * @param messages
     */
    getMessageToken(...messages: INexusMessage[]): number;
    /**
     * message contents token
     * @param contents
     */
    getMessageContentsToken(contents: INexusMessage['contents']): number;
    /**
     * 计算token数量
     * @param args
     */
    getTextToken(...args: string[]): number;
}

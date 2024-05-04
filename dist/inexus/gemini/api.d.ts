import { INexusConfig, INexusLoadMessage, INexusMessage, INexusRequestMessage, INexusResponse, INexusResponseTool, INexusSendMessageOptions, INexusStreamResponse, INexusUpsertMessage } from "../types";
import { INexus } from "../index";
import { Part } from "@google/generative-ai";
export type INexusRequestGeminiMessage = Omit<INexusRequestMessage, 'contents' | 'tool_calls' | 'tool_call_id'> & {
    /**
     * message contents
     */
    parts: Part[];
};
export declare class INexusGeminiApi implements INexus {
    /**
     * name
     * @private
     */
    private readonly _serviceName;
    /**
     * is debug
     * @protected
     */
    private readonly _debug;
    /**
     * get message
     * @protected
     */
    private readonly _getMessageById?;
    /**
     * upsert message
     * @protected
     */
    private readonly _upsertMessage?;
    /**
     * NexusOpenaiApi
     * @param opts
     */
    constructor(opts?: {
        debug?: boolean;
        getMessageById?: INexusLoadMessage;
        upsertMessage?: INexusUpsertMessage;
    });
    /**
     * 添加消息
     * @param message
     */
    addMessage(message: INexusMessage): Promise<INexusMessage>;
    /**
     * 获取消息
     * @param id
     */
    getMessage(id: string): Promise<INexusMessage | null>;
    /**
     * send message
     * @param contents
     * @param options
     */
    sendMessage(contents: INexusMessage['contents'], options: INexusSendMessageOptions & {
        reply_count?: number;
    }): Promise<INexusMessage>;
    /**
     * send message
     * @param contents
     * @param config
     * @param options
     * @param onAssistantId
     */
    sendMessageBody(contents: INexusMessage['contents'] | null, config: INexusConfig, options?: INexusSendMessageOptions, onAssistantId?: (id: string) => void): Promise<INexusMessage>;
    /**
     * 发送stream 消息
     * @param options
     */
    sendMessageStreamRequest(options: {
        url: string;
        headers: any;
        body: any;
        signal?: AbortSignal | null;
        onMessage?: (data: INexusStreamResponse) => void;
    }): Promise<INexusStreamResponse & {
        tools?: INexusResponseTool[];
    }>;
    /**
     * 发送普通消息
     * @param options
     */
    sendMessageRequest(options: {
        url: string;
        headers: any;
        body: any;
        signal?: AbortSignal | null;
    }): Promise<INexusResponse & {
        tools?: INexusResponseTool[];
    }>;
    /**
     * build message
     * @param message
     * @param options
     * @protected
     */
    buildMessages(message: INexusMessage, options: {
        systemMessage?: string;
        tools?: any;
        config: INexusConfig;
    }): Promise<{
        messages: INexusRequestGeminiMessage[];
        numTokens: number;
    }>;
    /**
     * get message string
     * @param messages
     * @protected
     */
    getMessageToken(...messages: INexusMessage[]): number;
    /**
     * get message contents token
     * @param contents
     */
    getMessageContentsToken(contents: INexusMessage['contents']): number;
    /**
     * get tools token
     * @param tools
     * @protected
     */
    getToolsToken(tools: any[]): number;
    /**
     * 计算图片token
     * @param width
     * @param height
     * @param detail
     */
    getImageToken(width: number, height: number, detail: 'auto' | 'low' | 'high'): number;
    /**
     * 计算token数量
     * @param args
     */
    getTextToken(...args: string[]): number;
    /**
     * convert request tool
     * @param tool
     * @private
     */
    private convertRequestTool;
}

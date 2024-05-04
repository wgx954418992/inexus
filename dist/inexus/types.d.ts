export type INexusRole = 'user' | 'assistant' | 'system' | 'function' | 'tool' | string;
export type INexusUsage = {
    /**
     * prompt tokens
     * @type {number}
     */
    prompt_tokens: number;
    /**
     * completion tokens
     * @type {number}
     */
    completion_tokens: number;
    /**
     * total tokens
     * @type {number}
     */
    total_tokens: number;
};
export type INexusConfig = {
    /**
     * api key
     */
    key: string;
    /**
     * base url
     */
    base_url: string;
    /**
     * model name
     */
    model?: string;
    /**
     * system message
     */
    system_message?: string;
    /**
     * content types
     */
    content_types: ('text' | 'image')[];
    /**
     * How long is the maximum loaded dialogue
     */
    max_time?: number;
    /**
     * Maximum number of dialogues loaded
     */
    max_count?: number;
    /**
     * max tokens
     */
    max_tokens?: number;
    /**
     * max response tokens
     */
    max_response_tokens?: number;
    /**
     * options
     */
    options?: {
        /**
         * org
         */
        org?: string;
        /**
         * origin config
         */
        config?: any;
        /**
         * cookie
         */
        cookie?: string;
    } & {
        [key: string]: any;
    };
};
export type INexusCallTool = {
    /**
     * tool call id
     */
    id: string;
    /**
     * type function
     */
    type?: 'function';
    /**
     * function body
     */
    function?: {
        /**
         * function name
         */
        name?: string;
        /**
         * arguments
         */
        arguments?: object | string;
    };
};
export type INexusMessage = {
    /**
     * message id
     */
    id: string;
    /**
     * parent message id
     */
    parent_id?: string;
    /**
     * session id
     */
    session_id?: string;
    /**
     * message name
     */
    name?: string;
    /**
     * message role
     */
    role: INexusRole;
    /**
     * message text
     */
    text: string;
    /**
     * message delta
     */
    delta?: string;
    /**
     * message tokens
     */
    tokens?: {
        [key: string]: number;
    };
    /**
     * message contents
     */
    contents?: {
        /**
         * message content type default text
         */
        type?: 'text' | 'image';
        /**
         * message content text
         */
        text?: string;
        /**
         * image
         */
        image?: {
            url: string;
            base64: string;
            mime?: string;
            width: number;
            height: number;
            mode: 'auto' | 'low' | 'high';
        };
    }[] | null;
    /**
     * tool calls
     */
    tool_calls?: INexusCallTool[];
    /**
     * tool call id
     */
    tool_call_id?: string;
    /**
     * finish reason
     */
    finish_reason?: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'safety' | null;
    /**
     * created time
     */
    created_time?: number;
};
export type INexusRequestMessage = {
    /**
     * message role
     */
    role: INexusRole;
    /**
     * tool message name
     */
    name?: string;
    /**
     * message contents
     */
    contents?: {
        /**
         * message content type
         */
        type: 'text' | 'image_url';
        /**
         * message content text or image url
         */
        value?: string;
    }[] | null;
    /**
     * tool calls
     */
    tool_calls?: INexusCallTool[];
    /**
     * tool call id
     */
    tool_call_id?: string;
};
export type INexusRequest = {
    /**
     * model
     */
    model: string;
    /**
     * messages
     */
    messages: INexusRequestMessage[];
    /**
     * is stream
     */
    stream?: boolean | null;
    /**
     * temperature
     */
    temperature?: number | null;
    /**
     * top p
     */
    top_p?: number | null;
    /**
     * top k
     */
    top_k?: number | null;
    /**
     * max tokens
     */
    max_tokens?: number | null;
    /**
     * tool choice
     */
    tool_choice?: 'none' | 'auto' | string | {
        type?: 'function';
        function?: {
            name: string;
        };
    };
    /**
     * tools
     */
    tools?: {
        /**
         * type function
         */
        type: 'function';
        /**
         * function body
         */
        function: {
            /**
             * function name
             */
            name: string;
            /**
             * function params
             */
            parameters: {
                [key: string]: any;
            };
            /**
             * function desc
             */
            description?: string;
        };
    }[];
    /**
     * stop
     */
    stop?: string | null | Array<string>;
    /**
     * response count
     */
    n?: number | null;
    /**
     * options params
     */
    options?: {
        /**
         * response format
         */
        response_format?: {
            type?: 'text' | 'json_object';
        };
        /**
         * frequency_penalty
         */
        frequency_penalty?: number | null;
        /**
         * logit bias
         */
        logit_bias?: Record<string, number> | null;
        /**
         * presence penalty
         */
        presence_penalty?: number | null;
        /**
         * seed
         */
        seed?: number | null;
        /**
         * user
         */
        user?: string;
    } & {
        [key: string]: any;
    };
};
export type INexusResponseTool = INexusCallTool & {
    /**
     * index
     */
    index: number;
};
export type INexusResponse = {
    /**
     * id
     */
    id: string;
    /**
     * model
     */
    model: string;
    /**
     * error
     */
    error?: {
        /**
         * code
         */
        code?: any;
        /**
         * message
         */
        message?: string;
        /**
         * param
         */
        param?: any;
        /**
         * type
         */
        type?: string;
    };
    /**
     * choices
     */
    choices: {
        /**
         * index
         */
        index?: number;
        /**
         * message
         */
        message?: {
            /**
             * role
             */
            role: INexusRole;
            /**
             * content
             */
            content: string;
            /**
             * tool calls
             */
            tool_calls?: INexusResponseTool[];
        };
        /**
         * finish reason
         */
        finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
    }[];
    /**
     * usage
     */
    usage?: INexusUsage;
};
export type INexusStreamResponse = {
    /**
     * id
     */
    id: string;
    /**
     * model
     */
    model: string;
    /**
     * error
     */
    error?: {
        /**
         * code
         */
        code?: any;
        /**
         * message
         */
        message?: string;
        /**
         * param
         */
        param?: any;
        /**
         * type
         */
        type?: string;
    };
    /**
     * choices
     */
    choices: {
        /**
         * index
         */
        index: number;
        /**
         * delta
         */
        delta: {
            /**
             * content
             */
            content?: string | null;
            /**
             * role
             */
            role?: INexusRole;
            /**
             * tool calls
             */
            tool_calls?: INexusResponseTool[];
        };
        /**
         * finish reason
         */
        finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
    }[];
    /**
     * usage
     */
    usage?: INexusUsage;
};
export type INexusSendMessageOptions = {
    /**
     * name
     */
    name?: string;
    /**
     * message id
     */
    message_id?: string;
    /**
     * is stream
     */
    stream?: boolean;
    /**
     * system message
     */
    system_message?: string;
    /**
     * session id
     */
    session_id?: string;
    /**
     * parent message id
     */
    parent_message_id?: string;
    /**
     * conversation id
     */
    conversation_id?: string;
    /**
     * request
     */
    request?: Partial<Omit<INexusRequest, 'messages' | 'n' | 'stream'>>;
    /**
     * abort signal
     */
    abort_signal?: AbortSignal;
    /**
     * on load config
     */
    onConfig?: () => Promise<INexusConfig>;
    /**
     * on progress
     * @param partialResponse
     * @param config
     */
    onProgress?: (partialResponse: INexusMessage, config: INexusConfig) => void;
    /**
     * on usage
     * @param usage
     * @param config
     * @param response
     */
    onUsage?: (usage: INexusUsage, config: INexusConfig, response: INexusMessage) => void;
    /**
     * on callings
     * @param userResponse
     * @param assistantMessage
     * @param config
     * @param callings
     */
    onCalling?: (userMessage: INexusMessage, assistantMessage: INexusMessage, config: INexusConfig, callings: {
        id: string;
        name: string;
        args: any;
    }[]) => Promise<{
        id: string;
        name: string;
        result: any;
    }[]>;
    /**
     * on handle error
     * @param config
     * @param error
     * @param replyCount
     */
    onError?: (config: INexusConfig, error: any, replyCount?: number) => Promise<boolean>;
};
/**
 * INexusError
 */
export declare class INexusError extends Error {
    statusCode?: number;
    statusText?: string;
}
export type INexusLoadMessage = (id: string) => Promise<INexusMessage | null>;
export type INexusUpsertMessage = (message: INexusMessage) => Promise<void>;

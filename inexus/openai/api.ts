import {
    INexusConfig,
    INexusError,
    INexusLoadMessage,
    INexusMessage,
    INexusRequestMessage,
    INexusResponse,
    INexusResponseTool,
    INexusSendMessageOptions,
    INexusStreamResponse,
    INexusUpsertMessage
} from "../types"
import {encode} from "gpt-3-encoder"
import {v4 as uuidv4} from 'uuid'
import {fetchSSE} from "../fetch"
import {INexus} from "../index"
import {toJson} from "../utils";

export type INexusRequestOpenaiMessage = Omit<INexusRequestMessage, 'contents'> & {
    /**
     * message contents
     */
    content?: string | {
        /**
         * message content type
         */
        type?: 'text' | 'image_url'

        /**
         * message content text
         */
        text?: string

        /**
         * image url
         */
        image_url?: {
            url: string
            detail: 'low' | 'high' | 'auto'
        }
    }[] | null
}

export class INexusOpenaiApi implements INexus {

    /**
     * name
     * @private
     */
    private readonly _serviceName: string = 'openai'

    /**
     * is debug
     * @protected
     */
    private readonly _debug: boolean

    /**
     * get message
     * @protected
     */
    private readonly _getMessageById?: INexusLoadMessage

    /**
     * upsert message
     * @protected
     */
    private readonly _upsertMessage?: INexusUpsertMessage

    /**
     * NexusOpenaiApi
     * @param opts
     */
    constructor(opts?: {
        debug?: boolean
        getMessageById?: INexusLoadMessage
        upsertMessage?: INexusUpsertMessage
    }) {
        this._debug = opts?.debug || false

        this._getMessageById = opts?.getMessageById

        this._upsertMessage = opts?.upsertMessage
    }

    /**
     * 添加消息
     * @param message
     */
    public async addMessage(message: INexusMessage): Promise<INexusMessage> {
        if (!this._upsertMessage) return null

        const current = await this.getMessage(message.id)

        if (current) {
            message = {
                ...current,
                ...message,
                tokens: {...current.tokens, ...message.tokens}
            }
        }

        await this._upsertMessage(message)

        return message
    }

    /**
     * 获取消息
     * @param id
     */
    public async getMessage(id: string): Promise<INexusMessage | null> {
        if (!id) return null

        if (!this._getMessageById) return null

        return await this._getMessageById(id)
    }

    /**
     * send message
     * @param contents
     * @param options
     */
    public async sendMessage(contents: INexusMessage['contents'], options: INexusSendMessageOptions & {
        reply_count?: number
    }): Promise<INexusMessage> {
        let assistantId = null

        const {onConfig, onError} = options

        const config = await onConfig()

        return this.sendMessageBody(contents, config, options, (id) => assistantId = id)
            .catch((e: any): any => {
                return onError(config, e, options.reply_count)
                    .then(isReply => {
                        if (!isReply) throw e

                        return this.sendMessage(assistantId ? null : contents, {
                            ...options,
                            parent_message_id: assistantId,
                            reply_count: options.reply_count + 1
                        })
                    })
            })
    }

    /**
     * send message
     * @param contents
     * @param config
     * @param options
     * @param onAssistantId
     */
    public async sendMessageBody(
        contents: INexusMessage['contents'] | null,
        config: INexusConfig,
        options: INexusSendMessageOptions = {},
        onAssistantId?: (id: string) => void
    ): Promise<INexusMessage> {
        const messageId = options.message_id ? options.message_id : uuidv4()

        const abortSignal = options.abort_signal ? options.abort_signal : (new AbortController()).signal

        const userMessage: INexusMessage = {
            id: !contents ? null : messageId,
            parent_id: options.parent_message_id,
            session_id: options.session_id,
            role: 'user',
            text: !contents ? null : contents.filter(v => (v.type || 'text') === 'text').map(v => v.text).join("\n"),
            contents,
            tokens: {[this._serviceName]: 0},
            created_time: Date.now()
        }

        userMessage.tokens[this._serviceName] = this.getMessageToken(userMessage)

        if (contents) await this.addMessage(userMessage)

        const assistantMessage = await this.addMessage({
            id: uuidv4(),
            parent_id: userMessage.id || options.parent_message_id,
            session_id: options.session_id,
            role: 'assistant',
            text: '',
            contents: [{text: ''}],
            tokens: {[this._serviceName]: 0},
            created_time: Date.now()
        })

        onAssistantId?.(assistantMessage.id)

        const buildMessages = await this
            .buildMessages(userMessage, {
                systemMessage: options.system_message || config.system_message,
                tools: options?.request?.tools,
                config: config
            })

        const url = `${config.base_url}/chat/completions`

        const headers = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.key}`,
        }

        const body: any = {
            model: config.model,
            temperature: options.request?.temperature || 0.8,
            top_p: options.request?.top_p || 1.0,
            presence_penalty: options.request?.options?.presence_penalty || 1.0,
            stream: Boolean(options.stream)
        }

        if (options.request?.top_k) body.top_k = options.request?.top_k

        if (options.request?.tool_choice) body.tool_choice = options.request?.tool_choice

        if (options.request?.tools) body.tools = options.request?.tools

        if (config.options?.org) headers['OpenAI-Organization'] = config.options?.org

        body.messages = buildMessages.messages

        if (this._debug) console.log(`sendOpenaiMessage (${assistantMessage.id.substring(0, 10)} ${config.key.substring(0, 10)} ${buildMessages.numTokens} tokens)`, JSON.stringify(body, null, "  "))

        let response: (INexusStreamResponse | INexusResponse) & { tools?: INexusResponseTool[] }

        if (options.stream) {
            response = await this.sendMessageStreamRequest({
                url,
                headers,
                body,
                signal: abortSignal,
                onMessage: (message: INexusStreamResponse | string) => {
                    if (message === '[DONE]') {
                        assistantMessage.delta = ''

                        assistantMessage.text = assistantMessage.text.trim()

                        assistantMessage.contents[0].text = assistantMessage.text
                    } else if (typeof message === 'object') {
                        if (message?.error?.message) throw new Error(JSON.stringify(message?.error))

                        const delta = message.choices?.[0]?.delta

                        if (!delta?.content) {
                            assistantMessage.delta = ''
                        } else {
                            assistantMessage.delta = delta?.content

                            assistantMessage.text += delta?.content

                            assistantMessage.contents[0].text = assistantMessage.text
                        }

                        options.onProgress?.(assistantMessage, config)
                    }

                    this.addMessage(assistantMessage)
                }
            })
        } else {
            response = await this.sendMessageRequest({
                url,
                headers,
                body,
                signal: abortSignal
            })

            assistantMessage.text = response.choices[0]?.message?.content

            assistantMessage.contents[0].text = assistantMessage.text
        }

        if (response.tools && response.tools.length > 0) {
            assistantMessage.tool_calls = response.tools
                .filter(v => {
                    return v.function.name != 'multi_tool_use.parallel'
                })
        }

        assistantMessage.tokens[this._serviceName] = this.getMessageToken(assistantMessage)

        assistantMessage.finish_reason = response.choices?.[0]?.finish_reason

        await this.addMessage(assistantMessage)

        options.onProgress?.(assistantMessage, config)

        if (!response.usage) {
            response.usage = {
                prompt_tokens: buildMessages.numTokens,
                completion_tokens: assistantMessage.tokens[this._serviceName],
                total_tokens: buildMessages.numTokens + assistantMessage.tokens[this._serviceName],
            }
        }

        options.onUsage?.(response.usage, config, assistantMessage)

        if (!response.tools || response.tools.length < 1) return assistantMessage

        const callingMessageIdMaps = {}

        let callingParentMessageId = assistantMessage.id

        for (const tool of response.tools) {
            const callingMessageId = uuidv4()

            await this.addMessage({
                id: callingMessageId,
                session_id: assistantMessage.session_id,
                parent_id: callingParentMessageId,
                tool_call_id: tool.id,
                role: 'tool',
                name: tool.function.name,
                text: 'calling...',
                contents: [{text: 'calling...'}],
                tokens: {[this._serviceName]: this.getTextToken('calling...')},
                created_time: Date.now()
            })

            callingParentMessageId = callingMessageIdMaps[tool.id] = callingMessageId
        }

        options.onProgress?.({...assistantMessage, id: callingParentMessageId}, config)

        const callings = await options
            .onCalling(userMessage, assistantMessage, config, response.tools.map(tool => {
                return {
                    id: tool.id,
                    name: tool.function?.name,
                    args: toJson(tool.function?.arguments)
                }
            }))

        for (let calling of callings) {
            const callingMessage = await this.getMessage(callingMessageIdMaps[calling.id])

            if (!callingMessage) throw new Error('calling message not found')

            callingMessage.text = calling.result

            callingMessage.contents = [{text: calling.result}]

            await this.addMessage({
                ...callingMessage,
                tokens: {[this._serviceName]: this.getMessageToken(callingMessage)}
            })
        }

        return this.sendMessage(null, {...options, parent_message_id: callingParentMessageId})
    }

    /**
     * 发送stream 消息
     * @param options
     */
    public async sendMessageStreamRequest(options: {
        url: string,
        headers: any,
        body: any,
        signal?: AbortSignal | null,
        onMessage?: (data: INexusStreamResponse | string) => void
    }): Promise<INexusStreamResponse & { tools?: INexusResponseTool[] }> {
        return new Promise((resolve, reject) => {
            const tools: INexusResponseTool[] = []

            let response: INexusStreamResponse & { tools?: INexusResponseTool[] } = null

            fetchSSE(options.url, {
                method: 'POST',
                headers: options.headers,
                body: JSON.stringify(options.body),
                signal: options.signal,
                onMessage: (data: string) => {
                    if (data === '[DONE]') {
                        options.onMessage?.(data)

                        return resolve({...response, tools})
                    }

                    try {
                        response = JSON.parse(data)

                        response.choices?.forEach(choice => {
                            if (!choice.delta?.tool_calls) return

                            choice.delta?.tool_calls?.forEach(call => {
                                if (!call?.function) return

                                if (!tools[call.index]) tools[call.index] = call

                                tools[call.index].function = {
                                    ...tools[call.index]?.function,
                                    arguments: (tools[call.index].function?.arguments as string || "") + (call.function?.arguments || "")
                                }
                            })
                        })

                        options.onMessage?.(response)

                        if (['function_call', 'stop', 'tool_calls'].includes(response?.choices?.[0]?.finish_reason)) {
                            return resolve({...response, tools})
                        }
                    } catch (err) {
                        return reject(err)
                    }
                }
            }).catch(reject)
        })
    }

    /**
     * 发送普通消息
     * @param options
     */
    public async sendMessageRequest(options: {
        url: string
        headers: any
        body: any
        signal?: AbortSignal | null
    }): Promise<INexusResponse & { tools?: INexusResponseTool[] }> {
        const response = await fetch(options.url, {
            method: 'POST',
            headers: options.headers,
            body: JSON.stringify(options.body),
            signal: options.signal
        })

        if (!response.ok) {
            const reason = await response.text()

            const error = new INexusError(`OpenAI error ${response.status || response.statusText}: ${reason}`)

            error.statusCode = response.status

            error.statusText = response.statusText

            throw error
        }

        const result: INexusResponse & { tools?: INexusResponseTool[], detail?: any } = await response.json()

        if (!result?.choices?.length) {
            throw new Error(`OpenAI error: ${result?.detail?.message || result?.detail || 'unknown'}`)
        }

        result.tools = result
            .choices
            ?.reduce((data, choice) => {
                const calls = choice.message?.tool_calls

                return !calls ? data : data.concat(calls)
            }, [])

        return result
    }

    /**
     * build message
     * @param message
     * @param options
     * @protected
     */
    public async buildMessages(message: INexusMessage, options: {
        systemMessage?: string
        tools?: any
        config: INexusConfig
    }): Promise<{
        messages: INexusRequestOpenaiMessage[]
        numTokens: number
    }> {
        const config = options.config

        const systemToken = this.getTextToken(options.systemMessage)

        const toolsToken = this.getToolsToken(options.tools)

        const maxInputToken = config.max_tokens - config.max_response_tokens - systemToken - toolsToken

        let messageToken = message.tokens?.[this._serviceName] ? message.tokens?.[this._serviceName] : this.getMessageToken(message)

        if (maxInputToken - messageToken < 1) throw new Error(`发送的消息过长，请尝试减少消息内容，或采用Gemini模型,systemTokens:${systemToken},toolTokens:${toolsToken},textTokens:${messageToken}`);

        const messages: INexusMessage[] = []

        if (message.id) messages.push(message)

        let parentId = message.parent_id

        while (true) {
            if (!parentId) break

            if (config.max_count > 0 && messages.filter(v => v.role === 'user').length > config.max_count) break

            const parentMessage = await this.getMessage(parentId)

            if (!parentMessage) break

            if (config.max_time > 0 && parentMessage.created_time && parentMessage.created_time + config.max_time < Date.now()) break

            if (typeof parentMessage.tokens?.[this._serviceName] !== 'number') {
                parentMessage.tokens = {[this._serviceName]: this.getMessageToken(parentMessage)}

                await this.addMessage(parentMessage)
            }

            if (messageToken + parentMessage.tokens[this._serviceName] > maxInputToken) {
                /** 如果消息体是插件，并且是最后对话调用的插件，尝试修改插件返回内容，如果还是超出token，则停止 */
                if (parentMessage.tool_call_id) {
                    parentMessage.contents[0].text = 'The number of tokens is insufficient to complete the service, and calling it again is prohibited'

                    parentMessage.tokens = {[this._serviceName]: this.getMessageToken(parentMessage)}

                    if (messageToken + parentMessage.tokens[this._serviceName] < maxInputToken) {
                        break
                    }
                } else {
                    break
                }
            }

            messages.unshift(parentMessage)

            parentId = parentMessage.parent_id

            messageToken += parentMessage.tokens[this._serviceName]
        }

        const requestMessages: INexusRequestOpenaiMessage[] = []

        if (options.systemMessage) requestMessages.push({role: 'system', content: options.systemMessage})

        for (const message of messages) {
            if (message.role === 'tool') {
                const isCalls = messages
                    .filter(v => {
                        return v.role === 'assistant'
                            && v.tool_calls
                            && v.tool_calls.length > 0
                            && v.tool_calls.find(s => s.id == message.tool_call_id)
                    })
                    .length > 0

                if (!isCalls) {
                    delete message.tool_call_id

                    message.role = 'assistant'
                }
            }

            const requestMessage: INexusRequestOpenaiMessage = {role: message.role}

            if (message.tool_calls && message.tool_calls.length > 0) {
                requestMessage.tool_calls = message.tool_calls
            }

            if (message.tool_call_id) {
                requestMessage.tool_call_id = message.tool_call_id
            }

            if (message.contents){
                requestMessage.content = message.contents
                    .map(v => {
                        const data: INexusRequestOpenaiMessage['content'][0] = {}

                        switch (v.type) {
                            case "image":
                                if (config.content_types.includes('image')) {
                                    data.type = 'image_url'

                                    data.image_url = {
                                        url: v.image.url,
                                        detail: v.image.mode,
                                    }
                                } else {
                                    data.type = 'text'

                                    data.text = v.image.url
                                }
                                break
                            case "text":
                            default:
                                data.type = 'text'

                                data.text = v.text || ''
                                break
                        }

                        return data
                    })
            }

            requestMessages.push(requestMessage)
        }

        return {
            messages: requestMessages,
            numTokens: systemToken + messageToken + toolsToken
        }
    }

    /**
     * get message string
     * @param messages
     * @protected
     */
    public getMessageToken(...messages: INexusMessage[]): number {
        if (!messages || messages.length < 1) return 0

        let tokens = 0

        for (const message of messages) {
            if (message.tool_calls) {
                tokens += this.getTextToken(JSON.stringify(message.tool_calls))
            }

            tokens += this.getMessageContentsToken(message.contents)
        }

        return tokens
    }

    /**
     * get message contents token
     * @param contents
     */
    public getMessageContentsToken(contents: INexusMessage['contents']): number {
        if (!contents) return 0

        let tokens = 0

        for (const content of contents) {
            switch (content.type) {
                case "image":
                    if (content.image) {
                        tokens += this.getImageToken(
                            content.image.width,
                            content.image.height,
                            content.image.mode,
                        )
                    }
                    break
                case "text":
                default:
                    tokens += this.getTextToken(content.text)
                    break
            }
        }

        return tokens
    }

    /**
     * get tools token
     * @param tools
     * @protected
     */
    public getToolsToken(tools: any[]): number {
        if (!tools) return null

        const toText = (obj: any) => {
            return Object.entries(obj)
                .reduce((result, [_, value]) => {
                    result += (typeof value === 'object' && value !== null ? toText(value) : value)

                    return result;
                }, '')
        }

        return this.getTextToken(...tools.map(v => toText(v)))
    }

    /**
     * 计算图片token
     * @param width
     * @param height
     * @param detail
     */
    public getImageToken(width: number, height: number, detail: 'auto' | 'low' | 'high') {
        if (detail == 'low') return 85

        const maxDimension = Math.max(width, height)

        let minDimension = Math.min(width, height)

        if (maxDimension > 2048) {
            let scale = 2048 / maxDimension

            width *= scale

            height *= scale

            minDimension = Math.min(width, height)
        }

        if (minDimension > 768) {
            let scale = 768 / minDimension

            width *= scale

            height *= scale
        }

        let gridCount = Math.ceil(width / 512) * Math.ceil(height / 512)

        return gridCount * 170 + 85
    }

    /**
     * 计算token数量
     * @param args
     */
    public getTextToken(...args: string[]): number {
        if (!args || args.length < 1) return 0

        const text = args
            .map(v => (v || '').replace(/<\|endoftext\|>/g, ''))
            .join('\n')

        if (text.length > 60000) return text.length * 0.5

        return Math.ceil(encode(text).length)
    }
}

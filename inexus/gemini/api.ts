import {
    INexusConfig,
    INexusError,
    INexusLoadMessage,
    INexusMessage, INexusRequest,
    INexusRequestMessage,
    INexusResponse,
    INexusResponseTool,
    INexusSendMessageOptions,
    INexusStreamResponse,
    INexusUpsertMessage
} from "../types"
import {encode} from "gpt-3-encoder"
import {v4 as uuidv4} from 'uuid'
import {INexus} from "../index"
import {
    Content, FunctionCallingMode,
    GenerationConfig,
    HarmBlockThreshold,
    HarmCategory,
    Part,
    SafetySetting,
    Tool, ToolConfig
} from "@google/generative-ai"
import {fetchSSE} from "../fetch"
import {toJson} from "../utils"
import {Typewriting} from "../typewriting"

export type INexusRequestGeminiMessage = Omit<INexusRequestMessage, 'contents' | 'tool_calls' | 'tool_call_id'> & {
    /**
     * message contents
     */
    parts: Part[]
}

export class INexusGeminiApi implements INexus {

    /**
     * name
     * @private
     */
    private readonly _serviceName: string = 'gemini'

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

        const userMessage = {
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

        const systemMessage = options.system_message || config.system_message

        const buildMessages = await this
            .buildMessages(userMessage, {
                systemMessage: systemMessage,
                tools: options?.request?.tools,
                config
            })

        const version = config.model.includes('1.5') ? 'v1beta' : 'v1'

        const url = `${config.base_url}/${version}/models/${config.model}`

        const headers = {
            'content-type': 'application/json',
            'x-goog-api-client': 'genai-js/0.7.1',
            'x-goog-api-key': config.key,
        }

        const body: {
            safetySettings?: SafetySetting[];
            generationConfig?: GenerationConfig;
            systemInstruction?: Content;
            contents?: Content[]
            tools?: Tool[]
            toolConfig?: ToolConfig
        } = {
            safetySettings: [
                {
                    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                    threshold: HarmBlockThreshold.BLOCK_NONE,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                    threshold: HarmBlockThreshold.BLOCK_NONE,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                    threshold: HarmBlockThreshold.BLOCK_NONE,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                    threshold: HarmBlockThreshold.BLOCK_NONE,
                },
            ],
            generationConfig: {
                temperature: options.request?.temperature || 0.8,
                topP: options.request?.top_p || 1.0,
            },
            systemInstruction: {
                role: 'system',
                parts: [{text: systemMessage}]
            }
        }

        if (options.request?.top_k) body.generationConfig.topK = options.request?.top_k

        if (options.request?.tools) {
            body.toolConfig = {
                functionCallingConfig: {
                    mode: FunctionCallingMode.AUTO
                }
            }

            body.tools = options.request.tools.map(v => this.convertRequestTool(v))
        }

        body.contents = buildMessages.messages

        if (this._debug) console.log(`sendGeminiMessage (${assistantMessage.id.substring(0, 10)} ${config.key.substring(0, 10)} ${buildMessages.numTokens} tokens)`, JSON.stringify(body, null, "  "))

        let response: (INexusStreamResponse | INexusResponse) & { tools?: INexusResponseTool[] }

        if (options.stream) {
            const typewriting = new Typewriting((delta, text) => {
                options.onProgress?.({
                    ...assistantMessage,
                    delta: delta,
                    text: text,
                }, config)
            }).start()

            response = await this.sendMessageStreamRequest({
                url: `${url}:streamGenerateContent?alt=sse`,
                headers,
                body,
                signal: abortSignal,
                onMessage: (message: INexusStreamResponse) => {
                    if (message?.error?.message) throw new Error(JSON.stringify(message?.error))

                    const delta = message.choices?.[0]?.delta

                    if (!delta?.content) {
                        assistantMessage.delta = ''
                    } else {
                        assistantMessage.delta = delta?.content

                        assistantMessage.text += delta?.content

                        assistantMessage.contents[0].text = assistantMessage.text
                    }

                    if (delta?.content) typewriting.append(delta?.content)

                    this.addMessage(assistantMessage)
                }
            })

            typewriting.stop()
        } else {
            response = await this.sendMessageRequest({
                url: `${url}:generateContent`,
                headers,
                body,
                signal: abortSignal
            })

            assistantMessage.text = response.choices[0]?.message?.content

            assistantMessage.contents[0].text = assistantMessage.text
        }

        if (response.tools && response.tools.length > 0) assistantMessage.tool_calls = response.tools

        assistantMessage.tokens[this._serviceName] = this.getMessageToken(assistantMessage)

        assistantMessage.finish_reason = response.choices?.[0]?.finish_reason

        await this.addMessage(assistantMessage)

        options.onProgress?.(assistantMessage, config)

        if (!response.usage) {
            const completionTokens = this.getTextToken(assistantMessage.text)

            response.usage = {
                prompt_tokens: buildMessages.numTokens,
                completion_tokens: completionTokens,
                total_tokens: buildMessages.numTokens + completionTokens,
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
        onMessage?: (data: INexusStreamResponse) => void
    }): Promise<INexusStreamResponse & { tools?: INexusResponseTool[] }> {
        return new Promise((resolve, reject) => {
            let tools: INexusResponseTool[] = []

            let response: INexusStreamResponse & { candidates: any[]; tools?: INexusResponseTool[] } = null

            fetchSSE(options.url, {
                method: 'POST',
                headers: options.headers,
                body: JSON.stringify(options.body),
                signal: options.signal,
                onMessage: (data: string) => {
                    try {
                        response = JSON.parse(data)

                        if (response.candidates?.length > 0) {
                            response.choices = response.candidates?.map((v) => {
                                const calls = v.content?.parts
                                    ?.filter((p: any) => p.functionCall)
                                    ?.map((p: any, i: number) => {
                                        return {
                                            index: (tools?.length || 0) + i,
                                            id: uuidv4().replaceAll('-', ''),
                                            type: 'function',
                                            function: {
                                                name: p.functionCall.name,
                                                arguments: p.functionCall.args,
                                            }
                                        }
                                    })

                                if (calls && calls?.length > 0) tools = tools.concat(calls)

                                return {
                                    index: v.index,
                                    delta: {
                                        role: v?.content?.role === 'model' ? 'assistant' : v?.content?.role,
                                        content: v?.content?.parts?.map((p: any) => p.text)?.join('\n'),
                                        tool_calls: calls
                                    },
                                    finish_reason: v.finishReason.toLowerCase()
                                }
                            })
                        }

                        options.onMessage?.(response)
                    } catch (err) {
                        return reject(err)
                    }
                }
            }).then(() => {
                return resolve({...response, tools})
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

            const error = new INexusError(`Gemini error ${response.status || response.statusText}: ${reason}`)

            error.statusCode = response.status

            error.statusText = response.statusText

            throw error
        }

        const result: INexusResponse & { tools?: INexusResponseTool[], detail?: any } = await response.json()

        if (!result?.choices?.length) {
            throw new Error(`Gemini error: ${result?.detail?.message || result?.detail || 'unknown'}`)
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
        messages: INexusRequestGeminiMessage[]
        numTokens: number
    }> {
        const config = options.config

        const systemToken = this.getTextToken(options.systemMessage)

        const toolsToken = this.getToolsToken(options.tools)

        const maxInputToken = config.max_tokens - config.max_response_tokens - systemToken - toolsToken

        let messageToken = message.tokens?.[this._serviceName] ? message.tokens?.[this._serviceName] : this.getMessageToken(message)

        if (maxInputToken - messageToken < 1) throw new Error(`发送的消息过长，请尝试减少消息内容,systemTokens:${systemToken},toolTokens:${toolsToken},textTokens:${messageToken}`);

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

        const requestMessages: INexusRequestGeminiMessage[] = []

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

            const requestMessage: INexusRequestGeminiMessage = {role: message.role, parts: []}

            if (requestMessage.role === 'assistant') requestMessage.role = 'model'

            if (requestMessage.role === 'tool') requestMessage.role = 'function'

            if (message.tool_calls && message.tool_calls.length > 0) {
                requestMessage.parts = requestMessage.parts
                    .concat(message.tool_calls.map(v => {
                        return {
                            functionCall: {
                                name: v.function.name,
                                args: toJson(v.function.arguments)
                            }
                        }
                    }))
            }

            if (message.tool_call_id) {
                requestMessage.parts = requestMessage.parts
                    .concat(message.contents?.map(v => {
                        return {
                            functionResponse: {
                                name: message.name,
                                response: {
                                    name: message.name,
                                    content: v.text
                                }
                            }
                        }
                    }) || [])
            } else {
                const contents = message.contents?.map(v => {
                    let data: INexusRequestGeminiMessage['parts'][0]

                    switch (v.type) {
                        case "image":
                            if (config.content_types.includes('image') && v.image.base64) {
                                data = {
                                    inlineData: {
                                        data: v.image.base64,
                                        mimeType: v.image.mime,
                                    }
                                }
                            } else {
                                data = {
                                    text: v.image.url
                                }
                            }
                            break
                        case "text":
                        default:
                            data = {
                                text: v.text || ''
                            }
                            break
                    }

                    return data
                })

                requestMessage.parts = requestMessage.parts.concat(contents || [])
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
        return 259
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

        if (text.length > 60000) return text.length * 0.6

        return Math.ceil(encode(text).length * 0.8)
    }

    /**
     * convert request tool
     * @param tool
     * @private
     */
    private convertRequestTool(tool: INexusRequest['tools'][0]) {
        const convert = (obj: object) => {
            if (!obj) return obj

            for (const k in obj) {
                if (obj[k].enum) obj[k].enum = obj[k].enum.map(v => String(v))

                if (obj[k].enum && obj[k].type) obj[k].type = "string"

                if (obj[k].default) delete obj[k].default

                if (obj[k].examples) delete obj[k].examples

                if (typeof obj[k] === 'object') obj[k] = convert(obj[k])
            }

            return obj
        }

        tool.function.parameters = convert(tool.function.parameters)

        return {functionDeclarations: [tool.function as any]}
    }
}

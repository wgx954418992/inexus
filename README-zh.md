# INexus

#### 集成了GPT、Gemini 对话接口为一体的sdk，通过统一接口进行调用gpt或者gemini

* 支持插件调用
* 支持消息缓存
* 支持错误重载
* 支持消息跨平台
* 支持图文消息
* 可通过扩展实现文档对话

> INexus 是 [码友邦AI](https://ai.mayoubang.cn/_s=git) 平台，为了统一调度所封装的sdk，所放出的sdk是经过大量验证测试过的，可进行商用

## 一、快速调用

```ts
import {INexusOpenaiApi} from "./api";

const iNexus = new INexusOpenaiApi();

const options: INexusSendMessageOptions = {
    stream: true,
    session_id: Date.now() + '',
    parent_message_id: null, //如果需要接着上条对话，实现对话记忆，只需要传入上条对话message id即可
    system_message: null, // 覆盖模型默认system message
    request: {
        temperature: 1,
        tools: undefined, //插件配置
        tool_choice: undefined,
    }
}

iNexus.sendMessage([{text: '您好'}], {
    ...options,
    onConfig: () => ModelService.getInstance().getModelConfig(model, version),
    onProgress: (assistantMessage) => {
        console.log(assistantMessage.text)
    },
    onCalling: async (_, assistantMessage, config, callings) => {
        console.log('调用插件', callings)

        return callings
            .map(v => {
                return {...v, result: '调用完成'}
            })
    },
    onUsage: (usage, config, response) => {
        console.log('账单')
    },
    onError: async (config, error, replyCount) => {
        console.log('处理错误，是否进行重载，比如判断 replyCount是否超过3次，没超过三次，并且错误内容是可以进行重载的，那么进行重载')

        // if (replyCount >= 3) return false

        // const message = error.message || error
        //
        // if (`${message}`.includes('fetch failed')) {
        //     return true
        // } else if (`${message}`.includes('terminated')) {
        //     return true
        // }

        return false
    }
})
    .then(data => {
        console.log(data)
    })
```

## 二、二次封装调用

> model.yaml

```yaml
- model: GPT-3.5
  service: 'openaiapi'
  max_time: 21600000
  max_count: 20
  system_message: >-
    You are ChatGPT-3.5,
    a large language model trained by OpenAI.
    Your responses should strictly follow the user's instructions.
    Response use markdown.
    Current time:${DATETIME}
  versions:
    default:
      value: gpt-3.5-turbo
      max_tokens: 16000
      response_tokens: 4000

- model: GPT-4.0
  service: 'openaiapi'
  is_tools: true
  is_voice: true
  is_file: true
  low_tokens: 5000
  system_message: >-
    You are ChatGPT-4.0, a large language model trained by OpenAI. Your
    responses should strictly follow the user's instructions, and here are
    specific guidelines to ensure consistency and clarity in your
    interactions:

    - **Formatting Standards**: Your responses must adhere to Markdown
    formatting standards, to present information more clearly and
    structurally.

    Current time:${DATETIME}
  versions:
    default:
      value: gpt-4-turbo-2024-04-09
      max_tokens: 16000
      response_tokens: 4000
      system_message: >-
        You are ChatGPT-4.0, a large language model trained by OpenAI. Your
        responses should strictly follow the user's instructions, and here are
        specific guidelines to ensure consistency and clarity in your
        interactions:

        - **Formatting Standards**: Your responses must adhere to Markdown
        formatting standards, to present information more clearly and
        structurally.

        Current time:${DATETIME}
    normal:
      value: gpt-4-turbo-2024-04-09
      max_tokens: 16000
      response_tokens: 4000
    function:
      value: gpt-4-turbo-2024-04-09
      max_tokens: 16000
      response_tokens: 4000

- model: Gemini-1.5
  service: 'gemini'
  is_tools: false
  is_voice: true
  is_file: true
  max_time: 7200000
  max_count: 30
  system_message: >-
    You are Gemini-1.5-Pro, 
    a large language model trained by Google. 
    Your responses should strictly follow the user's instructions. 
    Response use markdown.
    Output priority is given to Chinese.
    Current time:${DATETIME}
  versions:
    default:
      is_vision: true
      is_document: true
      value: gemini-1.5-pro-latest
      max_tokens: 1048576
      response_tokens: 8192
```

上述文件，配置了模型基本参数

> model.ts

```ts
import fs from "fs";
import {dirname, join} from "path";
import {load} from "js-yaml";
import {INexusConfig} from "../inexus/types";
import {INexus} from "../inexus";
import {INexusOpenaiApi} from "../inexus/openai/api";
import {INexusGeminiApi} from "../inexus/gemini/api";
import {fileURLToPath} from "url";

function getYMDHMSDateString() {
    const today = new Date();

    const year = today.getFullYear().toString();

    const month = (today.getMonth() + 1).toString().padStart(2, '0');

    const day = today.getDate().toString().padStart(2, '0');

    const hours = today.getHours().toString().padStart(2, '0');

    const minutes = today.getMinutes().toString().padStart(2, '0');

    const seconds = today.getSeconds().toString().padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export type ModelServiceApi = 'openaiapi' | 'openaiproxy' | 'kimi' | 'gemini'

export interface Model {
    model: string
    service: ModelServiceApi
    is_proxy?: boolean
    is_tools?: boolean
    is_voice?: boolean
    is_file?: boolean
    max_time?: number
    max_count?: number
    low_tokens?: number
    system_message?: string
    versions?: {
        [key: ModelVersionType | string]: ModelVersion,
    }
}

export interface ModelVersion {
    is_4?: boolean
    is_vision?: boolean
    is_document?: boolean
    service: ModelServiceApi
    value: string
    max_tokens?: number
    response_tokens?: number
    system_message?: string
}

export enum ModelVersionType {
    default = 'default',
    normal = 'normal',
    function = 'function'
}

/**
 * __filename
 */
const __filename = fileURLToPath(import.meta.url)

/**
 * __dirname
 */
const __dirname = dirname(__filename)

export class ModelService {

    /**
     * instance
     */
    private static instance: ModelService = null

    /**
     * load key map
     */
    public loadKeyMap = {
        'openaiapi': this.loadOpenaiKey.bind(this),
        'openaiproxy': this.loadOpenaiToken.bind(this),
        'kimi': this.loadKimiKey.bind(this),
        'gemini': this.loadGeminiKey.bind(this),
    }

    /**
     * models
     * @private
     */
    private readonly models: Model[] = []

    /**
     *     ModelService
     */
    constructor() {
        const content = fs.readFileSync(join((__dirname), './model.yaml'), {encoding: 'utf-8'})

        this.models = load(content) as Model[]
    }

    /**
     * get instance
     */
    public static getInstance() {
        return this.instance = this.instance ? this.instance : new ModelService()
    }

    /**
     * load openai key
     */
    public async loadOpenaiKey(model: Model, version: ModelVersion) {
        // const config = await OpenaiKeyConfig.get()

        return {
            // config,
            version,
            key: 'sk-', // config.key()
            baseURL: 'https://api.openai.com/', // config.baseURL()
            options: {
                org: null
            }
        }
    }

    /**
     * load openai token
     * @param model
     * @param version
     * @param conversationId
     */
    public async loadOpenaiToken(model: Model, version: ModelVersion, {conversationId = null}) {
        // const config = await OpenaiTokenConfig.get(conversationId)
        //
        // return {
        //     config,
        //     key: config.getToken(),
        //     baseURL: config.baseURL(),
        //     options: {
        //         cookie: config.getCookie()
        //     }
        // }
    }

    /**
     * load kimi key
     */
    public async loadKimiKey(model: Model, version: ModelVersion) {
        // const config = await KimiKeyConfig.get()
        //
        // return {
        //     config,
        //     key: config.getKey(),
        //     baseURL: config.baseURL()
        // }
    }

    /**
     * load gemini key
     */
    public async loadGeminiKey(model: Model, version: ModelVersion) {
        // const config = await GeminiKeyConfig.get()
        //
        // return {
        //     config,
        //     key: config.getKey(),
        //     baseURL: config.baseURL()
        // }
    }

    /**
     * get models
     */
    public getModels(): Model[] {
        return this.models
    }

    /**
     * 通过模型编号获取对应模型
     * @param name
     * @param loadType
     */
    public getModel(name: string, loadType?: ModelVersionType | ((model: Model) => ModelVersionType)): {
        model: Model;
        version: ModelVersion
    } {
        if (!name) throw new Error("模型名称错误!")

        const model: Model = (this.getModels()).find(v => v.model == name)

        if (!model) throw new Error("模型不存在!")

        let version = model.versions.default

        const type = typeof loadType === 'function' ? loadType(model) : loadType

        if (type === ModelVersionType.function) {
            if (!model.versions?.function) throw new Error("该模型不支持插件!")

            version = model.versions.function
        } else if (type === ModelVersionType.normal) {
            if (model.versions?.normal) version = model.versions.normal
        }

        if (model.system_message) {
            model.system_message = model.system_message.replaceAll('${DATETIME}', getYMDHMSDateString())
        }

        if (version.system_message) {
            version.system_message = version.system_message.replaceAll('${DATETIME}', getYMDHMSDateString())
        }

        return {model, version}
    }

    /**
     * 载入模型config
     * @param model
     * @param version
     * @param args
     */
    public async getModelConfig(model: Model, version: ModelVersion, args?: object): Promise<INexusConfig> {
        const service = version.service || model.service

        const load = this.loadKeyMap[service]

        if (!load || typeof load != 'function') throw new Error('该模型暂不支持')

        const {key, baseURL, options, version: newVersion} = await load(model, version, args)

        if (newVersion) version = newVersion

        const contentTypes: INexusConfig['content_types'] = ['text']

        if (version.is_vision) contentTypes.push('image')

        return {
            key: key,
            base_url: baseURL,
            content_types: contentTypes,
            model: version.value,
            system_message: version.system_message || model.system_message,
            max_time: model.max_time || 0,
            max_count: model.max_count || 0,
            max_tokens: version.max_tokens,
            max_response_tokens: version.response_tokens,
            options: {
                ...options,
            }
        }
    }

    /**
     * 通过模型获取INexus
     * @param model
     * @param version
     * @param options
     */
    public getModelINexus(model: Model, version: ModelVersion, options: any): INexus {
        const service = version.service || model.service

        switch (service) {
            case "openaiapi":
                return new INexusOpenaiApi(options)
            case "gemini":
                return new INexusGeminiApi(options)
            default:
                throw new Error('该模型暂不支持')
        }
    }
}
```

通过ModelService 我们进行了封装，可以通过传入模型名称，来获取到模型基本参数，以及对应的INexus服务

```ts
const {model, version} = ModelService
    .getInstance()
    .getModel('GPT-3.5', (m) => {
        return ModelVersionType.default
    })

const iNexus = ModelService.getInstance()
    .getModelINexus(model, version, {
        debug: true,
        upsertMessage: async (message: INexusMessage): Promise<void> => {
            addCache(`chat/message/${message.id}`, message)

        },
        getMessageById: async (id: string): Promise<INexusMessage> => {
            return getCache(`chat/message/${id}`)
        }
    })

/// ....实现对话逻辑，跟第一步调用方式一样
```

建议大家阅读tests/chat.ts源码，进行调用测试

也欢迎大家使用码友邦AI平台进行体验

地址：[https://ai.mayoubang.cn/_s=git](https://ai.mayoubang.cn/)

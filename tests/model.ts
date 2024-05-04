import fs from "fs";
import {join} from "path";
import {load} from "js-yaml";
import {INexusConfig} from "../inexus/types";
import {INexus} from "../inexus";
import {INexusOpenaiApi} from "../inexus/openai/api";
import {INexusGeminiApi} from "../inexus/gemini/api";

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

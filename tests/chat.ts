import {ModelService, ModelVersionType} from "./model";
import {INexusMessage, INexusSendMessageOptions} from "../inexus/types";
import {addCache, getCache} from "./cache";

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

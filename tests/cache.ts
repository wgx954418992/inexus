import path from "path";
import fs from "fs";

export const getCacheFilepath = (key: string) => {
    if (!key) throw new Error('key无效!')

    const filepath = path.join(path.dirname(path.dirname(path.dirname(__dirname))), 'cache', key)

    if (!fs.existsSync(path.dirname(filepath)) && !fs.mkdirSync(path.dirname(filepath), {
        recursive: true
    })) {
        throw new Error('创建缓存目录失败!')
    }

    return filepath
}

export const addCache = (key: string, value: any, expireTime?: number) => {
    const filepath = getCacheFilepath(key)

    const data: any = {
        time: new Date().valueOf(),
        content: value
    }

    if (expireTime != null) data.expireTime = expireTime

    fs.writeFileSync(filepath, JSON.stringify(data))
}

export const getCacheRaw = (key: string): any => {
    let filepath = key

    if (!fs.existsSync(filepath)) {
        filepath = getCacheFilepath(key)

        if (!fs.existsSync(filepath)) return null;
    }

    const value = fs.readFileSync(filepath, {encoding: 'utf-8'})

    try {

        return JSON.parse(value)
    } catch (e) {
        console.log('读取cache 错误', e, value)
        return null
    }
}

export const delCache = (key: string) => {
    const filepath = getCacheFilepath(key)

    if (!fs.existsSync(filepath)) return true;

    fs.unlinkSync(filepath)

    return false;
}


export const getCache = (key: string) => {
    const data = getCacheRaw(key)

    if (!data) return null

    if (data && data?.expireTime && data?.expireTime > 0) {
        if (data?.expireTime < new Date().valueOf()) {
            delCache(key)

            return null
        }
    }

    return data.content
}

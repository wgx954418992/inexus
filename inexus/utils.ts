export const toJson = <T>(data?: object | string, defaulted?: T): T | null => {
    if (typeof data === 'object') return data as T

    try {
        return JSON.parse(data) as T
    } catch (e) {
        return defaulted
    }
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toJson = void 0;
const toJson = (data, defaulted) => {
    if (typeof data === 'object')
        return data;
    try {
        return JSON.parse(data);
    }
    catch (e) {
        return defaulted;
    }
};
exports.toJson = toJson;

"use strict";
exports.__esModule = true;
exports.toJson = void 0;
var toJson = function (data, defaulted) {
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

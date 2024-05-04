"use strict";
exports.__esModule = true;
exports.Typewriting = void 0;
var Typewriting = /** @class */ (function () {
    /**
     * constructor
     * @param onMessage
     */
    function Typewriting(onMessage) {
        /**
         * total text
         * @private
         */
        this.text = '';
        /**
         * counter
         * @private
         */
        this.counter = 0;
        /**
         * last counter
         * @private
         */
        this.lastCounter = 0;
        /**
         * timer id
         * @private
         */
        this.timerId = null;
        this.onMessage = onMessage;
    }
    /**
     * start
     */
    Typewriting.prototype.start = function () {
        var _this = this;
        if (this.timerId)
            clearInterval(this.timerId);
        this.timerId = setInterval(function () {
            var _a;
            if (!_this.text)
                return;
            if (_this.lastCounter >= _this.text.length)
                return;
            var text = _this.text.slice(0, _this.counter);
            var delta = _this.text.slice(_this.lastCounter, _this.counter);
            (_a = _this.onMessage) === null || _a === void 0 ? void 0 : _a.call(_this, delta, text);
            _this.lastCounter = _this.counter;
            _this.counter += Math.max(1, Math.ceil(_this.text.length / 500));
            if (_this.counter > _this.text.length)
                _this.counter = _this.text.length;
        }, 16);
        return this;
    };
    /**
     * append
     * @param text
     */
    Typewriting.prototype.append = function (text) {
        this.text += text;
        return this;
    };
    /**
     * stop
     */
    Typewriting.prototype.stop = function () {
        if (this.timerId)
            clearInterval(this.timerId);
        this.timerId = null;
        return this;
    };
    return Typewriting;
}());
exports.Typewriting = Typewriting;

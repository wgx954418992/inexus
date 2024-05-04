"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Typewriting = void 0;
class Typewriting {
    /**
     * constructor
     * @param onMessage
     */
    constructor(onMessage) {
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
    start() {
        if (this.timerId)
            clearInterval(this.timerId);
        this.timerId = setInterval(() => {
            if (!this.text)
                return;
            if (this.lastCounter >= this.text.length)
                return;
            const text = this.text.slice(0, this.counter);
            const delta = this.text.slice(this.lastCounter, this.counter);
            this.onMessage?.(delta, text);
            this.lastCounter = this.counter;
            this.counter += Math.max(1, Math.ceil(this.text.length / 500));
            if (this.counter > this.text.length)
                this.counter = this.text.length;
        }, 16);
        return this;
    }
    /**
     * append
     * @param text
     */
    append(text) {
        this.text += text;
        return this;
    }
    /**
     * stop
     */
    stop() {
        if (this.timerId)
            clearInterval(this.timerId);
        this.timerId = null;
        return this;
    }
}
exports.Typewriting = Typewriting;

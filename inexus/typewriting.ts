export class Typewriting {
    /**
     * total text
     * @private
     */
    private text: string = ''

    /**
     * counter
     * @private
     */
    private counter: number = 0

    /**
     * last counter
     * @private
     */
    private lastCounter: number = 0

    /**
     * timer id
     * @private
     */
    private timerId: any = null

    /**
     * on message
     * @private
     */
    private readonly onMessage: (delta: string, text: string) => void

    /**
     * constructor
     * @param onMessage
     */
    constructor(onMessage: Typewriting['onMessage']) {
        this.onMessage = onMessage
    }

    /**
     * start
     */
    public start() {
        if (this.timerId) clearInterval(this.timerId)

        this.timerId = setInterval(() => {
            if (!this.text) return

            if (this.lastCounter >= this.text.length) return

            const text = this.text.slice(0, this.counter)

            const delta = this.text.slice(this.lastCounter, this.counter)

            this.onMessage?.(delta, text)

            this.lastCounter = this.counter

            this.counter += Math.max(1, Math.ceil(this.text.length / 500))

            if (this.counter > this.text.length) this.counter = this.text.length
        }, 16)

        return this
    }

    /**
     * append
     * @param text
     */
    public append(text: string) {
        this.text += text

        return this
    }

    /**
     * stop
     */
    public stop() {
        if (this.timerId) clearInterval(this.timerId)

        this.timerId = null

        return this
    }
}

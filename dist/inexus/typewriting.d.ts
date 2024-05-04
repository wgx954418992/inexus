export declare class Typewriting {
    /**
     * total text
     * @private
     */
    private text;
    /**
     * counter
     * @private
     */
    private counter;
    /**
     * last counter
     * @private
     */
    private lastCounter;
    /**
     * timer id
     * @private
     */
    private timerId;
    /**
     * on message
     * @private
     */
    private readonly onMessage;
    /**
     * constructor
     * @param onMessage
     */
    constructor(onMessage: Typewriting['onMessage']);
    /**
     * start
     */
    start(): this;
    /**
     * append
     * @param text
     */
    append(text: string): this;
    /**
     * stop
     */
    stop(): this;
}

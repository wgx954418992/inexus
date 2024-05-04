"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.streamAsyncIterable = exports.fetchSSE = void 0;
const eventsource_parser_1 = require("eventsource-parser");
const types_1 = require("./types");
async function* streamAsyncIterable(stream) {
    const reader = stream.getReader();
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                return;
            yield value;
        }
    }
    finally {
        reader.releaseLock();
    }
}
exports.streamAsyncIterable = streamAsyncIterable;
async function fetchSSE(url, options) {
    const { onMessage, ...fetchOptions } = options;
    const res = await fetch(url, fetchOptions);
    if (!res.ok) {
        let reason;
        try {
            reason = await res.text();
        }
        catch (err) {
            reason = res.statusText;
        }
        const msg = `${res.status}: ${reason}`;
        const error = new types_1.INexusError(msg);
        error.statusCode = res.status;
        error.statusText = res.statusText;
        throw error;
    }
    const parser = (0, eventsource_parser_1.createParser)((event) => {
        if (event.type === 'event')
            onMessage(event.data);
    });
    /**
     * handle special response errors
     * @param chunk
     */
    const feed = (chunk) => {
        let response = null;
        try {
            response = JSON.parse(chunk);
        }
        catch {
        }
        if (response?.detail?.type === 'invalid_request_error') {
            const msg = `${response?.detail?.message}: ${response?.detail?.code} (${response?.detail?.type})`;
            const error = new types_1.INexusError(msg);
            error.statusCode = response?.detail?.code;
            error.statusText = response?.detail?.message;
            return;
        }
        parser.feed(chunk);
    };
    if (!res.body.getReader) {
        const body = res.body;
        if (!body.on || !body.read) {
            throw new types_1.INexusError('unsupported "fetch" implementation');
        }
        body.on('readable', () => {
            let chunk;
            while (null !== (chunk = body.read())) {
                feed(chunk.toString());
            }
        });
    }
    else {
        for await (const chunk of streamAsyncIterable(res.body)) {
            const str = new TextDecoder().decode(chunk);
            feed(str);
        }
    }
}
exports.fetchSSE = fetchSSE;

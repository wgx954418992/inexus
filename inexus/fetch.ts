import {createParser} from "eventsource-parser";
import {INexusError} from "./types";

async function* streamAsyncIterable<T>(stream: ReadableStream<T>) {
    const reader = stream.getReader()

    try {
        while (true) {
            const {done, value} = await reader.read()

            if (done) return

            yield value
        }
    } finally {
        reader.releaseLock()
    }
}

async function fetchSSE(
    url: string,
    options: Parameters<typeof fetch>[1] & {
        onMessage: (data: string) => void
    }
) {
    const {onMessage, ...fetchOptions} = options

    const res = await fetch(url, fetchOptions)

    if (!res.ok) {
        let reason: string

        try {
            reason = await res.text()
        } catch (err) {
            reason = res.statusText
        }

        const msg = `${res.status}: ${reason}`

        const error = new INexusError(msg)

        error.statusCode = res.status

        error.statusText = res.statusText

        throw error
    }

    const parser = createParser((event) => {
        if (event.type === 'event') onMessage(event.data)
    })

    /**
     * handle special response errors
     * @param chunk
     */
    const feed = (chunk: string) => {
        let response = null

        try {
            response = JSON.parse(chunk)
        } catch {

        }

        if (response?.detail?.type === 'invalid_request_error') {
            const msg = `${response?.detail?.message}: ${response?.detail?.code} (${response?.detail?.type})`

            const error = new INexusError(msg)

            error.statusCode = response?.detail?.code

            error.statusText = response?.detail?.message

            return
        }

        parser.feed(chunk)
    }

    if (!res.body.getReader) {
        const body: NodeJS.ReadableStream = res.body as any

        if (!body.on || !body.read) {
            throw new INexusError('unsupported "fetch" implementation')
        }

        body.on('readable', () => {
            let chunk: string | Buffer

            while (null !== (chunk = body.read())) {
                feed(chunk.toString())
            }
        })
    } else {
        for await (const chunk of streamAsyncIterable(res.body)) {
            const str = new TextDecoder().decode(chunk)

            feed(str)
        }
    }
}

export {fetchSSE, streamAsyncIterable}

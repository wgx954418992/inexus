declare function streamAsyncIterable<T>(stream: ReadableStream<T>): AsyncGenerator<Awaited<T>, void, unknown>;
declare function fetchSSE(url: string, options: Parameters<typeof fetch>[1] & {
    onMessage: (data: string) => void;
}): Promise<void>;
export { fetchSSE, streamAsyncIterable };

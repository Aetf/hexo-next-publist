// Vendored from sindresorhus/p-debounce (MIT), typed.

type AsyncFn<Args extends unknown[], R> = (...args: Args) => PromiseLike<R> | R;

interface DebounceOptions {
    leading?: boolean;
}

interface PDebounce {
    <Args extends unknown[], R>(fn: AsyncFn<Args, R>, wait: number, options?: DebounceOptions):
        (...args: Args) => Promise<R>;
    promise<Args extends unknown[], R>(fn: AsyncFn<Args, R>): (...args: Args) => Promise<R>;
}

export const pDebounce: PDebounce = <Args extends unknown[], R>(
    fn: AsyncFn<Args, R>,
    wait: number,
    options: DebounceOptions = {},
) => {
    if (!Number.isFinite(wait)) {
        throw new TypeError('Expected `wait` to be a finite number');
    }

    let leadingValue: PromiseLike<R> | R;
    let timer: NodeJS.Timeout | null = null;
    let resolveList: ((value: PromiseLike<R> | R) => void)[] = [];

    return function (this: unknown, ...arguments_: Args): Promise<R> {
        return new Promise(resolve => {
            const runImmediately = options.leading && !timer;

            if (timer != null) {
                clearTimeout(timer);
            }

            timer = setTimeout(() => {
                timer = null;

                const result = options.leading ? leadingValue : fn.apply(this, arguments_);

                for (const pending of resolveList) {
                    pending(result);
                }

                resolveList = [];
            }, wait);

            if (runImmediately) {
                leadingValue = fn.apply(this, arguments_);
                resolve(leadingValue);
            } else {
                resolveList.push(resolve);
            }
        });
    };
};

pDebounce.promise = <Args extends unknown[], R>(function_: AsyncFn<Args, R>) => {
    let currentPromise: Promise<R> | undefined;

    return async function (this: unknown, ...arguments_: Args): Promise<R> {
        if (currentPromise) {
            return currentPromise;
        }

        try {
            currentPromise = Promise.resolve(function_.apply(this, arguments_));
            return await currentPromise;
        } finally {
            currentPromise = undefined;
        }
    };
};

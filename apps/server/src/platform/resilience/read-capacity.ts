import { AppError } from "@zarbit/contracts";
import { busyError } from "./busy-error";

/** No unbounded queue. Timed-out callers do not release still-running work. */
export class ReadCapacity {
  private active = 0;

  constructor(
    private readonly limit = 3,
    private readonly timeoutMs = 3000,
  ) {}

  async run<T>(load: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) throw busyError();
    this.active++;
    const work = Promise.resolve()
      .then(load)
      .finally(() => {
        this.active--;
      });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        work,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new AppError(
                  "READ_TIMEOUT",
                  "دریافت اطلاعات طول کشید؛ دوباره تلاش کنید.",
                  503,
                ),
              ),
            this.timeoutMs,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}

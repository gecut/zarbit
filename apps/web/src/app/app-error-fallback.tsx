export function AppErrorFallback() {
  return (
    <section
      role="alert"
      dir="rtl"
      className="border-danger-soft bg-danger-soft text-danger-soft-foreground max-w-124 mx-auto rounded-2xl border p-6 text-center leading-7"
    >
      <h1>نمایش برنامه با مشکل روبه‌رو شد.</h1>
      <p>برنامه را دوباره بارگذاری کنید.</p>
      <button
        type="button"
        className="mt-4 rounded-xl border px-4 py-2 focus-visible:outline-2"
        onClick={() => window.location.reload()}
      >
        بارگذاری مجدد
      </button>
    </section>
  );
}

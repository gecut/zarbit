import { Button, Card, Chip } from "@heroui/react";
import { useEffect, useState } from "react";
import { useApi } from "../lib/api-provider";
import type { CreateRequestInput, RequestDetail } from "@zarbit/contracts";

const labels = {
  ACTIVE: "فعال",
  DONE: "ارسال شد",
  CANCELLED: "لغو شد",
  FAILED: "ناموفق",
  UNKNOWN: "نامشخص",
} as const;

export function RequestCard({
  row,
  onUpdate,
}: {
  row: RequestDetail;
  onUpdate: () => void;
}) {
  const api = useApi();
  return (
    <Card className="border-border bg-surface shadow-surface rounded-2xl border p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">
            {row.action === "ALERT"
              ? "هشدار"
              : row.action === "BUY"
                ? "خرید"
                : "فروش"}{" "}
            در {row.targetPrice.toLocaleString("fa-IR")}
          </p>
          <p className="text-muted mt-1 text-xs">
            {row.units
              ? `${row.units.toLocaleString("fa-IR")} واحد`
              : "بدون تعداد"}
          </p>
        </div>
        <Chip
          color={
            row.status === "ACTIVE"
              ? "accent"
              : row.status === "DONE"
                ? "success"
                : "danger"
          }
        >
          {labels[row.status]}
        </Chip>
      </div>
      {row.status === "ACTIVE" && (
        <div className="mt-4 flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onPress={() => void api.forceSendRequest(row.id).then(onUpdate)}
          >
            ارسال فوری
          </Button>
          <Button
            size="sm"
            variant="tertiary"
            onPress={() => void api.cancelRequest(row.id).then(onUpdate)}
          >
            لغو
          </Button>
        </div>
      )}
    </Card>
  );
}

export function RequestList({ history = false }: { history?: boolean }) {
  const api = useApi();
  const [rows, setRows] = useState<RequestDetail[]>([]);
  const [form, setForm] = useState(false);
  const load = () =>
    void (history ? api.getRequestHistory() : api.getActiveRequests()).then(
      (r) => setRows(Array.isArray(r) ? r : r.items),
    );
  useEffect(load, [history]);
  return (
    <section className="grid gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">
          {history ? "سوابق درخواست‌ها" : "درخواست‌های فعال"}
        </h2>
        {!history && (
          <Button onPress={() => setForm((v) => !v)}>درخواست جدید</Button>
        )}
      </div>
      {form && (
        <RequestForm
          onDone={() => {
            setForm(false);
            load();
          }}
        />
      )}
      {rows.length ? (
        rows.map((row) => (
          <RequestCard key={row.id} row={row} onUpdate={load} />
        ))
      ) : (
        <Card variant="tertiary" className="p-5 text-center text-sm">
          {history ? "هنوز سابقه‌ای ثبت نشده است." : "درخواست فعالی ندارید."}
        </Card>
      )}
    </section>
  );
}

function RequestForm({ onDone }: { onDone: () => void }) {
  const api = useApi();
  const [action, setAction] = useState<CreateRequestInput["action"]>("ALERT");
  const [price, setPrice] = useState("");
  const [units, setUnits] = useState("");
  const submit = () =>
    void api
      .createRequest({
        action,
        condition: "LTE",
        targetPrice: Number(price),
        units: action === "ALERT" ? null : Number(units),
      })
      .then(onDone);
  return (
    <Card className="border-border bg-surface grid gap-3 rounded-2xl border p-4">
      <label className="grid gap-1 text-sm">
        نوع درخواست
        <select
          className="border-border rounded-xl border bg-transparent p-2"
          value={action}
          onChange={(e) =>
            setAction(e.target.value as CreateRequestInput["action"])
          }
        >
          <option value="ALERT">هشدار</option>
          <option value="BUY">خرید</option>
          <option value="SELL">فروش</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        قیمت هدف
        <input
          className="border-border rounded-xl border bg-transparent p-2"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          inputMode="numeric"
        />
      </label>
      {action !== "ALERT" && (
        <label className="grid gap-1 text-sm">
          تعداد
          <input
            className="border-border rounded-xl border bg-transparent p-2"
            value={units}
            onChange={(e) => setUnits(e.target.value)}
            inputMode="numeric"
          />
        </label>
      )}
      <Button onPress={submit}>ذخیره درخواست</Button>
    </Card>
  );
}

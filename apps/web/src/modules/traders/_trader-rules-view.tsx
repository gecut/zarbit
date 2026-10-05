import { useState } from "react";
import { Button, Card, Chip, Skeleton, cn } from "@heroui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDateTime, formatNumber } from "@zarbit/format";
import { useIdentity } from "../../shared/auth/auth";
import { useApi } from "../../shared/api/api-context";
import { TraderRuleFormDrawer } from "./_trader-rule-form-drawer";

export function TraderRulesView() {
  const [activeSubTab, setActiveSubTab] = useState<"RULES" | "HISTORY">(
    "RULES",
  );
  const [isFormOpen, setIsFormOpen] = useState(false);

  const identity = useIdentity();
  const api = useApi(identity.telegramUserId);
  const queryClient = useQueryClient();

  const rulesQuery = useQuery(
    api.traderRules.list.queryOptions({
      refetchInterval: 5000,
    }),
  );

  const historyQuery = useQuery(
    api.traderRules.history.queryOptions({
      refetchInterval: 5000,
    }),
  );

  const toggleMutation = useMutation(
    api.traderRules.toggle.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: api.traderRules.list.key(),
        });
      },
    }),
  );

  const deleteMutation = useMutation(
    api.traderRules.delete.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: api.traderRules.list.key(),
        });
      },
    }),
  );

  const rules = rulesQuery.data ?? [];
  const history = historyQuery.data ?? [];

  return (
    <div className="space-y-4">
      {/* Sub Tabs Bar & Action Button */}
      <div className="flex items-center justify-between gap-2">
        <div className="border-border bg-surface flex rounded-2xl border p-1">
          <button
            type="button"
            onClick={() => setActiveSubTab("RULES")}
            className={cn(
              "rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors",
              activeSubTab === "RULES"
                ? "bg-accent/20 text-accent font-bold"
                : "text-muted hover:text-foreground",
            )}
          >
            قوانین من ({rules.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab("HISTORY")}
            className={cn(
              "rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors",
              activeSubTab === "HISTORY"
                ? "bg-accent/20 text-accent font-bold"
                : "text-muted hover:text-foreground",
            )}
          >
            تاریخچه اجراها
          </button>
        </div>

        <Button
          size="sm"
          variant="primary"
          onPress={() => setIsFormOpen(true)}
          className="rounded-xl text-xs font-bold"
        >
          + قانون جدید
        </Button>
      </div>

      {/* Rules SubTab */}
      {activeSubTab === "RULES" && (
        <div className="space-y-3">
          {rulesQuery.isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-24 w-full rounded-2xl" />
              <Skeleton className="h-24 w-full rounded-2xl" />
            </div>
          )}

          {!rulesQuery.isLoading && rules.length === 0 && (
            <Card className="border-border bg-surface space-y-2 rounded-2xl border p-8 text-center">
              <p className="text-foreground text-sm font-semibold">
                قانونی تعریف نشده است
              </p>
              <p className="text-muted text-xs">
                با تعریف قانون، می‌توانید رفتار تریدرهای منتخب را رصد کرده و
                هشدار دریافت کنید یا معاملات آنها را دنبال نمایید.
              </p>
              <div className="pt-2">
                <Button
                  size="sm"
                  variant="primary"
                  onPress={() => setIsFormOpen(true)}
                  className="rounded-xl text-xs font-bold"
                >
                  تعریف اولین قانون
                </Button>
              </div>
            </Card>
          )}

          {rules.map((rule) => {
            const isEnabled = rule.status === "ENABLED";
            return (
              <Card
                key={rule.id}
                className={cn(
                  "border-border bg-surface space-y-3 rounded-2xl border p-4 transition-opacity",
                  !isEnabled && "opacity-60",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-foreground text-base font-bold">
                      {rule.traderAlias}
                    </span>
                    <Chip
                      size="sm"
                      variant="soft"
                      color={
                        rule.trigger === "ORDER_PLACED" ? "accent" : "default"
                      }
                      className="text-[11px]"
                    >
                      {rule.trigger === "ORDER_PLACED"
                        ? "محرک: لفظ"
                        : "محرک: حواله"}
                    </Chip>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleMutation.mutate({ id: rule.id })}
                      className={cn(
                        "rounded-xl px-2.5 py-1 text-xs font-semibold transition-colors",
                        isEnabled
                          ? "bg-success/20 text-success"
                          : "bg-surface-secondary text-muted",
                      )}
                    >
                      {isEnabled ? "فعال" : "غیرفعال"}
                    </button>

                    <button
                      type="button"
                      onClick={() => deleteMutation.mutate({ id: rule.id })}
                      className="text-muted hover:text-danger p-1 text-xs transition-colors"
                      title="حذف قانون"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Filters details */}
                <div className="text-muted flex flex-wrap items-center gap-2 text-xs">
                  <span>جهت:</span>
                  <span className="text-foreground font-medium">
                    {rule.side === "BUY"
                      ? "فقط خرید"
                      : rule.side === "SELL"
                        ? "فقط فروش"
                        : "خرید و فروش"}
                  </span>
                  <span className="text-border">|</span>
                  <span>حداقل حجم:</span>
                  <span className="text-foreground font-medium">
                    {formatNumber(rule.minQuantity)} واحد
                  </span>
                </div>

                {/* Actions summary */}
                <div className="border-border/60 flex flex-wrap items-center gap-2 border-t pt-2.5 text-xs">
                  {rule.alertEnabled && (
                    <Chip size="sm" variant="soft" color="warning">
                      🔔 هشدار تلگرام
                    </Chip>
                  )}
                  {rule.followEnabled && (
                    <Chip size="sm" variant="soft" color="success">
                      ⚡ دنبال‌کردن:{" "}
                      {rule.followDirection === "DIRECT" ? "مستقیم" : "معکوس"} (
                      {rule.followSizing === "FIXED"
                        ? `${rule.fixedQuantity} واحد ثابت`
                        : "هم‌حجم"}
                      {rule.maxQuantity ? `، سقف ${rule.maxQuantity}` : ""})
                    </Chip>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* History SubTab */}
      {activeSubTab === "HISTORY" && (
        <div className="space-y-3">
          {historyQuery.isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-20 w-full rounded-2xl" />
              <Skeleton className="h-20 w-full rounded-2xl" />
            </div>
          )}

          {!historyQuery.isLoading && history.length === 0 && (
            <Card className="border-border bg-surface rounded-2xl border p-8 text-center">
              <p className="text-foreground text-sm font-semibold">
                تاریخچه‌ای ثبت نشده است
              </p>
              <p className="text-muted mt-1 text-xs">
                به محض انطباق رفتار تریدرها با قوانین شما، سوابق هشدار و سفارش
                در اینجا نمایش داده می‌شود.
              </p>
            </Card>
          )}

          {history.map((item) => (
            <Card
              key={item.id}
              className="border-border bg-surface space-y-2 rounded-2xl border p-3.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-foreground font-bold">
                    {item.traderAlias}
                  </span>
                  <Chip
                    size="sm"
                    variant="soft"
                    color={item.eventSide === "BUY" ? "success" : "danger"}
                    className="text-[11px]"
                  >
                    {item.eventSide === "BUY" ? "خرید" : "فروش"}
                  </Chip>
                  <span className="text-muted text-xs">
                    {formatNumber(item.eventQuantity)} واحد با مظنه{" "}
                    {formatNumber(item.eventPrice)}
                  </span>
                </div>
                <span className="text-muted text-[11px]">
                  {formatDateTime(new Date(item.executedAt))}
                </span>
              </div>

              {/* Execution statuses */}
              <div className="border-border/50 flex flex-wrap items-center justify-between border-t pt-2 text-xs">
                <div className="flex items-center gap-2">
                  {item.alertStatus !== "SKIPPED" && (
                    <span
                      className={cn(
                        "rounded px-2 py-0.5 text-[11px] font-semibold",
                        item.alertStatus === "SENT"
                          ? "bg-success/20 text-success"
                          : "bg-danger/20 text-danger",
                      )}
                    >
                      هشدار:{" "}
                      {item.alertStatus === "SENT" ? "ارسال شد" : "ناموفق"}
                    </span>
                  )}

                  {item.followStatus !== "SKIPPED" && (
                    <span
                      className={cn(
                        "rounded px-2 py-0.5 text-[11px] font-semibold",
                        item.followStatus === "SUBMITTED"
                          ? "bg-primary/20 text-primary"
                          : "bg-danger/20 text-danger",
                      )}
                    >
                      فالو:{" "}
                      {item.followStatus === "SUBMITTED"
                        ? `ثبت شد (${item.followQuantity} واحد ${item.followSide === "BUY" ? "خرید" : "فروش"})`
                        : "ناموفق"}
                    </span>
                  )}
                </div>

                {item.errorMessage && (
                  <span className="text-danger truncate text-[11px]">
                    {item.errorMessage}
                  </span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Form Drawer */}
      <TraderRuleFormDrawer open={isFormOpen} onOpenChange={setIsFormOpen} />
    </div>
  );
}

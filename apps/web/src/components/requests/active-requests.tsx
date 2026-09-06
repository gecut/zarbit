import { Button } from "@heroui/react";
import { AddCircleIcon } from "@solar-icons/react/linear/add-circle";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useRequests } from "../../lib/requests";
import { PageControls } from "./page-controls";
import { QueryState } from "./query-state";
import { RequestCard } from "./request-card";

export function ActiveRequests() {
  const [page, setPage] = useState(1);
  const requests = useRequests("ACTIVE", page);
  const navigate = useNavigate();
  return (
    <section className="grid gap-[1.05rem]">
      <div className="flex items-start justify-between gap-[0.9rem]">
        <div>
          <h1 className="text-foreground m-0 text-base font-semibold leading-[1.55]">
            درخواست‌های فعال
          </h1>
          <p className="text-muted mt-[0.18rem] text-xs leading-[1.7]">
            می‌توانید پیش از اجرا، آن‌ها را ویرایش یا لغو کنید.
          </p>
        </div>
        <Button
          className="min-h-[2.4rem] text-xs font-semibold"
          onPress={() => navigate({ to: "/requests/new" })}
        >
          <AddCircleIcon size={17} />
          جدید
        </Button>
      </div>
      <div className="grid gap-[0.7rem] sm:grid-cols-2">
        <QueryState
          error={requests.error}
          isEmpty={!requests.data?.items.length}
          isLoading={requests.isLoading}
        >
          {requests.data?.items.map((request) => (
            <RequestCard allowActions key={request.id} request={request} />
          ))}
        </QueryState>
      </div>
      <PageControls
        page={page}
        setPage={setPage}
        total={requests.data?.total ?? 0}
      />
    </section>
  );
}

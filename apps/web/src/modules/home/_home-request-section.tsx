import { useState } from "react";
import type { CreateRequestInput } from "@zarbit/contracts";
import { RequestsPage } from "../requests/requests-page";
import { ExecutionStrip } from "./_execution-strip";
import { Card } from "@heroui/react";

interface HomeRequestSectionProps {
  currentQuote?: number;
}

export function HomeRequestSection({ currentQuote }: HomeRequestSectionProps) {
  const [createRequestOpen, setCreateRequestOpen] = useState(false);
  const [createAction, setCreateAction] =
    useState<CreateRequestInput["action"]>("BUY");

  const handleActionSelect = (action: CreateRequestInput["action"]) => {
    setCreateAction(action);
    setCreateRequestOpen(true);
  };

  return (
    <Card>
      <Card.Header className="gap-4">
        <Card.Title>درخواست های فعال</Card.Title>
        <ExecutionStrip onActionSelect={handleActionSelect} />
      </Card.Header>

      <RequestsPage
        createOpen={createRequestOpen}
        onOpenCreateChange={setCreateRequestOpen}
        initialAction={createAction}
        currentQuote={currentQuote}
      />
    </Card>
  );
}

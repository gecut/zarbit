import { Button, Card } from "@heroui/react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-lg">
        <Card.Header>
          <Card.Title>Zarbit</Card.Title>
          <Card.Description>پایهٔ برنامه آماده است.</Card.Description>
        </Card.Header>
        <Card.Content>
          <p className="text-sm text-muted">React، مسیریابی TanStack و وضعیت Query فعال هستند.</p>
        </Card.Content>
        <Card.Footer>
          <Button onPress={() => undefined}>ادامه</Button>
        </Card.Footer>
      </Card>
    </main>
  );
}

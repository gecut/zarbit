import { Button } from "@heroui/react";

type PageControlsProps = {
  page: number;
  total: number;
  setPage: (page: number) => void;
};

export function PageControls({ page, total, setPage }: PageControlsProps) {
  return (
    <nav
      aria-label="صفحه‌بندی"
      className="mt-[1.15rem] flex flex-wrap items-center justify-between gap-[0.55rem]"
    >
      <Button
        isDisabled={page <= 1}
        onPress={() => setPage(page - 1)}
        variant="secondary"
      >
        قبلی
      </Button>
      <span>صفحه {page}</span>
      <Button
        isDisabled={page * 20 >= total}
        onPress={() => setPage(page + 1)}
        variant="secondary"
      >
        بعدی
      </Button>
    </nav>
  );
}

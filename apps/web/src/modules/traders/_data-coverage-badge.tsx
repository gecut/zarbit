import { Chip } from "@heroui/react";
import type {
  DataCoverageConfidence,
  ParticipantAnalyticsSummaryV2,
} from "@zarbit/contracts";

export function DataCoverageBadge({
  confidence,
  coverage,
  className,
}: {
  confidence: DataCoverageConfidence;
  coverage?: ParticipantAnalyticsSummaryV2["coverage"];
  className?: string;
}) {
  if (coverage && !coverage.positionBaselineValid) {
    return (
      <Chip size="sm" variant="soft" color="danger" className={className}>
        مبنای موجودی تأیید نشده
      </Chip>
    );
  }
  if (coverage?.status === "REVIEW_REQUIRED") {
    return (
      <Chip size="sm" variant="soft" color="danger" className={className}>
        نیازمند بررسی مالی
      </Chip>
    );
  }
  if (coverage && !coverage.pnlReliable) {
    if (coverage.reason === "WINDOW_CROSSES_BOOTSTRAP") {
      return (
        <Chip size="sm" variant="soft" color="warning" className={className}>
          دادهٔ برآوردی (از تسویه)
        </Chip>
      );
    }
    return (
      <Chip size="sm" variant="soft" color="warning" className={className}>
        پوشش داده تأیید نشده
      </Chip>
    );
  }
  switch (confidence) {
    case "HIGH":
      return (
        <Chip size="sm" variant="soft" color="success" className={className}>
          پوشش کامل (۷ روز)
        </Chip>
      );
    case "ESTIMATED":
      return (
        <Chip size="sm" variant="soft" color="warning" className={className}>
          دادهٔ برآوردی
        </Chip>
      );
    case "UNVERIFIED_INVENTORY":
      return (
        <Chip size="sm" variant="soft" color="danger" className={className}>
          موجودی اولیه نامشخص
        </Chip>
      );
  }
}

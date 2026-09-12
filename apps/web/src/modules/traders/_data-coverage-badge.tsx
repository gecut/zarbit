import { Chip } from "@heroui/react";
import type { DataCoverageConfidence } from "@zarbit/contracts";

export function DataCoverageBadge({
  confidence,
  className,
}: {
  confidence: DataCoverageConfidence;
  className?: string;
}) {
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
          داده تخمینی (&lt; ۷ روز)
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

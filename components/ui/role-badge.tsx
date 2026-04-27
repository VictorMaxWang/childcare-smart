import * as React from "react";
import { StatusTag } from "@/components/ui/status-tag";

export type RoleBadgeRole = "director" | "admin" | "teacher" | "parent" | "system" | "guest";

export interface RoleBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  role: RoleBadgeRole;
  label?: React.ReactNode;
}

const roleLabelMap: Record<RoleBadgeRole, string> = {
  director: "园长端",
  admin: "园长端",
  teacher: "教师端",
  parent: "家长端",
  system: "系统",
  guest: "访客",
};

const roleVariantMap: Record<RoleBadgeRole, "info" | "pending" | "success" | "neutral"> = {
  director: "info",
  admin: "info",
  teacher: "pending",
  parent: "success",
  system: "neutral",
  guest: "neutral",
};

function RoleBadge({ role, label, ...props }: RoleBadgeProps) {
  return (
    <StatusTag variant={roleVariantMap[role]} {...props}>
      {label ?? roleLabelMap[role]}
    </StatusTag>
  );
}

export { RoleBadge };

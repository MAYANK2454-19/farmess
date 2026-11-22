import type { ReactNode } from "react";
import { WorkspaceLayout } from "@/components/workspace-layout";

export default function WorkspaceRootLayout({ children }: { children: ReactNode }) {
  return <WorkspaceLayout>{children}</WorkspaceLayout>;
}

import { Search } from "iconoir-react";
import type * as React from "react";

import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export function SearchField({
  className,
  inputClassName,
  loading = false,
  ...props
}: React.ComponentProps<typeof InputGroupInput> & {
  inputClassName?: string;
  loading?: boolean;
}) {
  return (
    <InputGroup className={cn("h-12", className)}>
      <InputGroupInput className={cn("h-full px-0", inputClassName)} type="search" {...props} />
      <InputGroupAddon>
        <Search aria-hidden="true" />
      </InputGroupAddon>
      {loading ? (
        <InputGroupAddon align="inline-end">
          <Spinner aria-label="กำลังค้นหา" className="text-primary" />
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  );
}

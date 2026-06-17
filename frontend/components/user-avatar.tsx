"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";

export function UserAvatar({
  name,
  photoUrl,
  online,
  isGroup,
  className,
}: {
  name: string;
  photoUrl?: string | null;
  online?: boolean;
  isGroup?: boolean;
  className?: string;
}) {
  return (
    <div className="relative shrink-0">
      <Avatar className={cn("h-10 w-10", className)}>
        {photoUrl && <AvatarImage src={photoUrl} alt={name} />}
        <AvatarFallback className={cn(isGroup && "bg-emerald-100 text-emerald-700")}>
          {isGroup ? "#" : initials(name) || "?"}
        </AvatarFallback>
      </Avatar>
      {online && (
        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background bg-emerald-500" />
      )}
    </div>
  );
}

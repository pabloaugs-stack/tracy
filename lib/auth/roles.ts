import type { UserRole } from "@/lib/types/database";

export function getRedirectPath(role: UserRole): string {
  switch (role) {
    case "dono":
    case "gerente":
      return "/admin";
    case "recepcionista":
      return "/agenda";
    case "trancista":
    case "auxiliar":
      return "/cronometro";
  }
}

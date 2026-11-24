import type { User } from "../../models/user";

// GET /api/v1/users/:id response body (public REST API v1; used by the web app, iOS/Android apps, and partner integrations)
export interface UserResponse {
  id: string;
  name: string;
  createdAt: string;
}

export function toUserResponse(user: User): UserResponse {
  return {
    id: user.id,
    name: user.name,
    createdAt: user.createdAt.toISOString(),
  };
}

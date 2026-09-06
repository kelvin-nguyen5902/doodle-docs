export interface ProfileRef {
  id: string;
  username: string;
  full_name: string | null;
  email: string | null;
}

export interface CollaboratorRef {
  document_id: string;
  user_id: string;
  role: "editor";
  status: "pending" | "accepted";
  profile: ProfileRef | null;
}

export interface DocumentSummary {
  id: string;
  title: string;
  owner_id: string;
  is_owner: boolean;
  owner: ProfileRef | null;
  updated_at: string;
  content_html: string;
  has_ink: boolean;
  strokes: Stroke[];
  collaborators: CollaboratorRef[];
}

export interface DocumentFull {
  id: string;
  owner_id: string;
  title: string;
  content_html: string;
  strokes: Stroke[];
  created_at: string;
  updated_at: string;
  role: "owner" | "editor";
}

export interface Stroke {
  color: string;
  size: number;
  erase: boolean;
  pts: { x: number; y: number }[];
  // When this stroke started, used to stack overlapping strokes consistently.
  // Optional since older strokes won't have it.
  ts?: number;
}

export interface Collaborator {
  id: string | null;
  user_id: string;
  profile: ProfileRef | null;
  role: "editor";
  status: "pending" | "accepted";
  is_owner: boolean;
}

export interface Invitation {
  id: string;
  document_id: string;
  document_title: string;
  role: "editor";
  from_profile: ProfileRef | null;
  created_at: string;
}

export interface SearchResult extends ProfileRef {
  access_status: "owner" | "pending" | "accepted" | null;
}

export interface PresenceMember {
  user_id: string;
  name: string;
  color: string;
}

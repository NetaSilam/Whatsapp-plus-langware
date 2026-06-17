export type User = {
  id: string;
  phone: string;
  username: string;
  photo_url: string | null;
  last_seen: string;
};

export type Member = User & { role: "member" | "manager" };

export type Attachment = {
  id: string;
  url: string;
  mime_type: string;
  size_bytes: number;
  file_name: string | null;
  width: number | null;
  height: number | null;
};

export type MessageKind = "text" | "image" | "file" | "system";
export type ReceiptStatus = "sent" | "delivered" | "read" | null;

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  kind: MessageKind;
  client_msg_id: string | null;
  created_at: string;
  attachments: Attachment[];
  status: ReceiptStatus;
  pending?: boolean;
};

export type LastMessage = {
  id: string;
  body: string | null;
  kind: string;
  sender_id: string;
  created_at: string;
} | null;

export type Conversation = {
  id: string;
  type: "direct" | "group";
  title: string;
  photo_url: string | null;
  name: string | null;
  created_by: string | null;
  created_at: string;
  members: Member[];
  my_role: "member" | "manager" | null;
  other_user: Member | null;
  last_message: LastMessage;
  unread: number;
};

export type RoomMode = "receipt" | "fixed";

export type PaymentMethod = "bre-b" | "nequi" | "daviplata" | "bancolombia";

export type Room = {
  id: string;
  slug: string;
  title: string;
  mode: RoomMode;
  payment_method: PaymentMethod;
  payment_key: string;
  organizer_name: string | null;
  total_amount: number;
  tax_amount: number;
  tip_amount: number;
  created_at: string;
};

export type RoomInsert = {
  id?: string;
  slug: string;
  title: string;
  mode: RoomMode;
  payment_method: PaymentMethod;
  payment_key: string;
  organizer_name?: string | null;
  total_amount?: number;
  tax_amount?: number;
  tip_amount?: number;
  created_at?: string;
};

export type RoomUpdate = Partial<RoomInsert>;

export type Item = {
  id: string;
  room_id: string;
  name: string;
  price: number;
  quantity: number;
  sort_order: number;
  created_at: string;
};

export type ItemInsert = {
  id?: string;
  room_id: string;
  name: string;
  price: number;
  quantity?: number;
  sort_order?: number;
  created_at?: string;
};

export type ItemUpdate = Partial<ItemInsert>;

export type Participant = {
  id: string;
  room_id: string;
  name: string;
  avatar_color: string;
  has_paid: boolean;
  paid_at: string | null;
  created_at: string;
};

export type ParticipantInsert = {
  id?: string;
  room_id: string;
  name: string;
  avatar_color?: string;
  has_paid?: boolean;
  paid_at?: string | null;
  created_at?: string;
};

export type ParticipantUpdate = Partial<ParticipantInsert>;

export type ItemClaim = {
  id: string;
  room_id: string;
  item_id: string;
  participant_id: string;
  created_at: string;
};

export type ItemClaimInsert = {
  id?: string;
  room_id: string;
  item_id: string;
  participant_id: string;
  created_at?: string;
};

export type ItemClaimUpdate = Partial<ItemClaimInsert>;

/** Ítem borrador editable antes de guardar la sala */
export type DraftReceiptItem = {
  id: string;
  name: string;
  price: number;
  quantity: number | "";
};

/** Respuesta estructurada del endpoint /api/scan-receipt */
export type ScannedReceiptResult = {
  items: Array<{
    name: string;
    price: number;
    quantity: number;
  }>;
  tax_amount: number;
  tip_amount: number;
};

export type Database = {
  public: {
    Tables: {
      rooms: {
        Row: Room;
        Insert: RoomInsert;
        Update: RoomUpdate;
        Relationships: [];
      };
      items: {
        Row: Item;
        Insert: ItemInsert;
        Update: ItemUpdate;
        Relationships: [
          {
            foreignKeyName: "items_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
        ];
      };
      participants: {
        Row: Participant;
        Insert: ParticipantInsert;
        Update: ParticipantUpdate;
        Relationships: [
          {
            foreignKeyName: "participants_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
        ];
      };
      item_claims: {
        Row: ItemClaim;
        Insert: ItemClaimInsert;
        Update: ItemClaimUpdate;
        Relationships: [
          {
            foreignKeyName: "item_claims_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "item_claims_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "item_claims_participant_id_fkey";
            columns: ["participant_id"];
            isOneToOne: false;
            referencedRelation: "participants";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

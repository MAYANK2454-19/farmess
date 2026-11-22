/* eslint-disable */
// Generated from the FARMESS Supabase project. Do not edit by hand.
// Regenerate after reviewed database migrations are applied.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  }
  public: {
    Tables: {
      buyer_requirements: {
        Row: {
          buyer_id: string;
          created_at: string;
          crop: string;
          delivery_by: string | null;
          grade: string | null;
          id: string;
          market_area: string;
          max_quantity: number | null;
          min_quantity: number;
          status: string;
          target_price_paise_per_quintal: number | null;
          unit: string;
          updated_at: string;
          variety: string | null;
        }
        Insert: {
          buyer_id: string;
          created_at?: string
          crop: string;
          delivery_by?: string | null
          grade?: string | null
          id?: string
          market_area: string;
          max_quantity?: number | null
          min_quantity: number;
          status?: string
          target_price_paise_per_quintal?: number | null
          unit: string;
          updated_at?: string
          variety?: string | null
        }
        Update: {
          buyer_id?: string
          created_at?: string
          crop?: string
          delivery_by?: string | null
          grade?: string | null
          id?: string
          market_area?: string
          max_quantity?: number | null
          min_quantity?: number
          status?: string
          target_price_paise_per_quintal?: number | null
          unit?: string
          updated_at?: string
          variety?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "buyer_requirements_buyer_id_fkey";
            columns: ["buyer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ]
      }
      market_observations: {
        Row: {
          created_at: string;
          crop: string;
          district: string | null;
          id: string;
          market_name: string;
          max_price_paise_per_quintal: number | null;
          min_price_paise_per_quintal: number | null;
          modal_price_paise_per_quintal: number | null;
          observation_date: string;
          retrieved_at: string;
          source_name: string;
          source_url: string;
          state: string | null;
          variety: string | null;
        }
        Insert: {
          created_at?: string
          crop: string;
          district?: string | null
          id?: string
          market_name: string;
          max_price_paise_per_quintal?: number | null
          min_price_paise_per_quintal?: number | null
          modal_price_paise_per_quintal?: number | null
          observation_date: string;
          retrieved_at?: string
          source_name: string;
          source_url: string;
          state?: string | null
          variety?: string | null
        }
        Update: {
          created_at?: string
          crop?: string
          district?: string | null
          id?: string
          market_name?: string
          max_price_paise_per_quintal?: number | null
          min_price_paise_per_quintal?: number | null
          modal_price_paise_per_quintal?: number | null
          observation_date?: string
          retrieved_at?: string
          source_name?: string
          source_url?: string
          state?: string | null
          variety?: string | null
        }
        Relationships: [];
      }
      notifications: {
        Row: {
          body: string;
          created_at: string;
          event_key: string;
          id: string;
          read_at: string | null;
          recipient_user_id: string;
          related_id: string | null;
          related_type: string | null;
          title: string;
        }
        Insert: {
          body: string;
          created_at?: string
          event_key: string;
          id?: string
          read_at?: string | null
          recipient_user_id: string;
          related_id?: string | null
          related_type?: string | null
          title: string;
        }
        Update: {
          body?: string
          created_at?: string
          event_key?: string
          id?: string
          read_at?: string | null
          recipient_user_id?: string
          related_id?: string | null
          related_type?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_recipient_user_id_fkey";
            columns: ["recipient_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ]
      }
      offers: {
        Row: {
          buyer_id: string;
          created_at: string;
          farmer_id: string;
          id: string;
          lot_id: string;
          price_paise_per_quintal: number;
          quantity: number;
          status: string;
          terms: string | null;
          unit: string;
          updated_at: string;
          valid_until: string;
        }
        Insert: {
          buyer_id: string;
          created_at?: string
          farmer_id: string;
          id?: string
          lot_id: string;
          price_paise_per_quintal: number;
          quantity: number;
          status?: string
          terms?: string | null
          unit: string;
          updated_at?: string
          valid_until: string;
        }
        Update: {
          buyer_id?: string
          created_at?: string
          farmer_id?: string
          id?: string
          lot_id?: string
          price_paise_per_quintal?: number
          quantity?: number
          status?: string
          terms?: string | null
          unit?: string
          updated_at?: string
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "offers_buyer_id_fkey";
            columns: ["buyer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "offers_farmer_id_fkey";
            columns: ["farmer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "offers_lot_owner_fk";
            columns: ["lot_id", "farmer_id"];
            isOneToOne: false;
            referencedRelation: "produce_lots";
            referencedColumns: ["id", "owner_id"];
          },
        ]
      }
      produce_lots: {
        Row: {
          approximate_area: string;
          available_from: string;
          created_at: string;
          crop: string;
          grade: string | null;
          id: string;
          notes: string | null;
          owner_id: string;
          quantity: number;
          sell_by: string;
          status: string;
          unit: string;
          updated_at: string;
          variety: string | null;
        }
        Insert: {
          approximate_area: string;
          available_from: string;
          created_at?: string
          crop: string;
          grade?: string | null
          id?: string
          notes?: string | null
          owner_id: string;
          quantity: number;
          sell_by: string;
          status?: string
          unit: string;
          updated_at?: string
          variety?: string | null
        }
        Update: {
          approximate_area?: string
          available_from?: string
          created_at?: string
          crop?: string
          grade?: string | null
          id?: string
          notes?: string | null
          owner_id?: string
          quantity?: number
          sell_by?: string
          status?: string
          unit?: string
          updated_at?: string
          variety?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "produce_lots_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ]
      }
      profile_consent_events: {
        Row: {
          actor_user_id: string | null;
          consent_field: Database["public"]["Enums"]["farmer_consent_field"];
          created_at: string;
          dedupe_key: string;
          granted: boolean;
          id: string;
          user_id: string;
        }
        Insert: {
          actor_user_id?: string | null
          consent_field: Database["public"]["Enums"]["farmer_consent_field"];
          created_at?: string
          dedupe_key?: string
          granted: boolean;
          id?: string
          user_id: string;
        }
        Update: {
          actor_user_id?: string | null
          consent_field?: Database["public"]["Enums"]["farmer_consent_field"]
          created_at?: string
          dedupe_key?: string
          granted?: boolean
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_consent_events_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ]
      }
      profiles: {
        Row: {
          approximate_location_sharing: boolean;
          buyer_contact_disclosure: boolean;
          created_at: string;
          display_name: string | null;
          exact_location_disclosure: boolean;
          id: string;
          market_area: string | null;
          phone_number: string | null;
          provider_contact_disclosure: boolean;
          role: Database["public"]["Enums"]["farmess_role"];
          updated_at: string;
        }
        Insert: {
          approximate_location_sharing?: boolean
          buyer_contact_disclosure?: boolean
          created_at?: string
          display_name?: string | null
          exact_location_disclosure?: boolean
          id: string;
          market_area?: string | null
          phone_number?: string | null
          provider_contact_disclosure?: boolean
          role?: Database["public"]["Enums"]["farmess_role"]
          updated_at?: string
        }
        Update: {
          approximate_location_sharing?: boolean
          buyer_contact_disclosure?: boolean
          created_at?: string
          display_name?: string | null
          exact_location_disclosure?: boolean
          id?: string
          market_area?: string | null
          phone_number?: string | null
          provider_contact_disclosure?: boolean
          role?: Database["public"]["Enums"]["farmess_role"]
          updated_at?: string
        }
        Relationships: [];
      }
      sale_activity: {
        Row: {
          actor_user_id: string | null;
          created_at: string;
          event_key: string;
          id: string;
          participant_user_ids: string[];
          sale_id: string;
          summary: string;
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_key: string;
          id?: string
          participant_user_ids: string[];
          sale_id: string;
          summary: string;
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_key?: string
          id?: string
          participant_user_ids?: string[]
          sale_id?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_activity_actor_user_id_fkey";
            columns: ["actor_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sale_activity_sale_id_fkey";
            columns: ["sale_id"];
            isOneToOne: false;
            referencedRelation: "sales";
            referencedColumns: ["id"];
          },
        ]
      }
      sales: {
        Row: {
          agreed_at: string;
          agreed_price_paise_per_quintal: number;
          agreed_quantity: number;
          buyer_id: string;
          farmer_id: string;
          id: string;
          lot_id: string;
          offer_id: string;
          status: string;
          unit: string;
          updated_at: string;
        }
        Insert: {
          agreed_at?: string
          agreed_price_paise_per_quintal: number;
          agreed_quantity: number;
          buyer_id: string;
          farmer_id: string;
          id?: string
          lot_id: string;
          offer_id: string;
          status?: string
          unit: string;
          updated_at?: string
        }
        Update: {
          agreed_at?: string
          agreed_price_paise_per_quintal?: number
          agreed_quantity?: number
          buyer_id?: string
          farmer_id?: string
          id?: string
          lot_id?: string
          offer_id?: string
          status?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_buyer_id_fkey";
            columns: ["buyer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_farmer_id_fkey";
            columns: ["farmer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_lot_owner_fk";
            columns: ["lot_id", "farmer_id"];
            isOneToOne: false;
            referencedRelation: "produce_lots";
            referencedColumns: ["id", "owner_id"];
          },
          {
            foreignKeyName: "sales_offer_id_fkey";
            columns: ["offer_id"];
            isOneToOne: true;
            referencedRelation: "offers";
            referencedColumns: ["id"];
          },
        ]
      }
      service_listings: {
        Row: {
          available_from: string | null;
          available_until: string | null;
          capacity_quantity: number | null;
          capacity_unit: string | null;
          created_at: string;
          description: string | null;
          destination_area: string | null;
          id: string;
          operator_id: string;
          price_paise: number | null;
          service_area: string;
          service_type: string;
          status: string;
          title: string;
          updated_at: string;
        }
        Insert: {
          available_from?: string | null
          available_until?: string | null
          capacity_quantity?: number | null
          capacity_unit?: string | null
          created_at?: string
          description?: string | null
          destination_area?: string | null
          id?: string
          operator_id: string;
          price_paise?: number | null
          service_area: string;
          service_type: string;
          status?: string
          title: string;
          updated_at?: string
        }
        Update: {
          available_from?: string | null
          available_until?: string | null
          capacity_quantity?: number | null
          capacity_unit?: string | null
          created_at?: string
          description?: string | null
          destination_area?: string | null
          id?: string
          operator_id?: string
          price_paise?: number | null
          service_area?: string
          service_type?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_listings_operator_id_fkey";
            columns: ["operator_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ]
      }
      service_requests: {
        Row: {
          created_at: string;
          destination_area: string | null;
          id: string;
          listing_id: string;
          message: string | null;
          origin_area: string | null;
          provider_user_id: string;
          requested_date: string | null;
          requested_quantity: number | null;
          requester_id: string;
          status: string;
          unit: string | null;
          updated_at: string;
        }
        Insert: {
          created_at?: string
          destination_area?: string | null
          id?: string
          listing_id: string;
          message?: string | null
          origin_area?: string | null
          provider_user_id: string;
          requested_date?: string | null
          requested_quantity?: number | null
          requester_id: string;
          status?: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          destination_area?: string | null
          id?: string
          listing_id?: string
          message?: string | null
          origin_area?: string | null
          provider_user_id?: string
          requested_date?: string | null
          requested_quantity?: number | null
          requester_id?: string
          status?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_listing_provider_fk";
            columns: ["listing_id", "provider_user_id"];
            isOneToOne: false;
            referencedRelation: "service_listings";
            referencedColumns: ["id", "operator_id"];
          },
          {
            foreignKeyName: "service_requests_provider_user_id_fkey";
            columns: ["provider_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_requests_requester_id_fkey";
            columns: ["requester_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ]
      }
    }
    Views: {
      [_ in never]: never;
    }
    Functions: {
      [_ in never]: never;
    }
    Enums: {
      farmer_consent_field:
        | "approximate_location_sharing"
        | "exact_location_disclosure"
        | "buyer_contact_disclosure"
        | "provider_contact_disclosure"
      farmess_role: "farmer" | "buyer" | "operator" | "admin";
    }
    CompositeTypes: {
      [_ in never]: never;
    }
  }
};

type DefaultSchema = Database["public"];

export type Tables<TableName extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][TableName]["Row"];

export type TablesInsert<TableName extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][TableName]["Insert"];

export type TablesUpdate<TableName extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][TableName]["Update"];

export type Enums<EnumName extends keyof DefaultSchema["Enums"]> =
  DefaultSchema["Enums"][EnumName];

export type CompositeTypes<CompositeTypeName extends keyof DefaultSchema["CompositeTypes"]> =
  DefaultSchema["CompositeTypes"][CompositeTypeName];

export const Constants = {
  public: {
    Enums: {
      farmer_consent_field: [
        "approximate_location_sharing",
        "exact_location_disclosure",
        "buyer_contact_disclosure",
        "provider_contact_disclosure",
      ],
      farmess_role: ["farmer", "buyer", "operator", "admin"],
    },
  },
} as const;

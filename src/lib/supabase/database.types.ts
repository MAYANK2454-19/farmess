export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
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
        };
        Insert: {
          buyer_id: string;
          created_at?: string;
          crop: string;
          delivery_by?: string | null;
          grade?: string | null;
          id?: string;
          market_area: string;
          max_quantity?: number | null;
          min_quantity: number;
          status?: string;
          target_price_paise_per_quintal?: number | null;
          unit: string;
          updated_at?: string;
          variety?: string | null;
        };
        Update: {
          buyer_id?: string;
          created_at?: string;
          crop?: string;
          delivery_by?: string | null;
          grade?: string | null;
          id?: string;
          market_area?: string;
          max_quantity?: number | null;
          min_quantity?: number;
          status?: string;
          target_price_paise_per_quintal?: number | null;
          unit?: string;
          updated_at?: string;
          variety?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "buyer_requirements_buyer_id_fkey";
            columns: ["buyer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      logistics_recommendation_feedback: {
        Row: {
          capacity_match: boolean | null;
          cold_chain_match: boolean | null;
          created_at: string;
          crop_match: boolean | null;
          date_match: boolean | null;
          distance_meters: number;
          feedback_note: string | null;
          id: string;
          price_paise: number | null;
          provider_verification_state: string | null;
          rank_position: number;
          rate_basis: string | null;
          recommendation_version: string;
          service_listing_id: string;
          service_radius_km: number | null;
          service_radius_match: boolean | null;
          service_type: string | null;
          user_feedback: number | null;
          user_id: string;
        };
        Insert: {
          capacity_match?: boolean | null;
          cold_chain_match?: boolean | null;
          created_at?: string;
          crop_match?: boolean | null;
          date_match?: boolean | null;
          distance_meters: number;
          feedback_note?: string | null;
          id?: string;
          price_paise?: number | null;
          provider_verification_state?: string | null;
          rank_position: number;
          rate_basis?: string | null;
          recommendation_version: string;
          service_listing_id: string;
          service_radius_km?: number | null;
          service_radius_match?: boolean | null;
          service_type?: string | null;
          user_feedback?: number | null;
          user_id: string;
        };
        Update: {
          capacity_match?: boolean | null;
          cold_chain_match?: boolean | null;
          created_at?: string;
          crop_match?: boolean | null;
          date_match?: boolean | null;
          distance_meters?: number;
          feedback_note?: string | null;
          id?: string;
          price_paise?: number | null;
          provider_verification_state?: string | null;
          rank_position?: number;
          rate_basis?: string | null;
          recommendation_version?: string;
          service_listing_id?: string;
          service_radius_km?: number | null;
          service_radius_match?: boolean | null;
          service_type?: string | null;
          user_feedback?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "logistics_recommendation_feedback_service_listing_id_fkey";
            columns: ["service_listing_id"];
            isOneToOne: false;
            referencedRelation: "service_listings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "logistics_recommendation_feedback_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      market_data_ingestion_runs: {
        Row: {
          actor_user_id: string | null;
          completed_at: string;
          error_message: string | null;
          id: string;
          records_received: number;
          records_upserted: number;
          request_filters: Json;
          source_name: string;
          started_at: string;
          status: string;
        };
        Insert: {
          actor_user_id?: string | null;
          completed_at?: string;
          error_message?: string | null;
          id?: string;
          records_received?: number;
          records_upserted?: number;
          request_filters?: Json;
          source_name: string;
          started_at?: string;
          status: string;
        };
        Update: {
          actor_user_id?: string | null;
          completed_at?: string;
          error_message?: string | null;
          id?: string;
          records_received?: number;
          records_upserted?: number;
          request_filters?: Json;
          source_name?: string;
          started_at?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "market_data_ingestion_runs_actor_user_id_fkey";
            columns: ["actor_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      market_forecast_points: {
        Row: {
          created_at: string;
          forecast_run_id: string;
          id: string;
          lower_bound_paise_per_quintal: number | null;
          predicted_modal_price_paise_per_quintal: number;
          target_date: string;
          upper_bound_paise_per_quintal: number | null;
        };
        Insert: {
          created_at?: string;
          forecast_run_id: string;
          id?: string;
          lower_bound_paise_per_quintal?: number | null;
          predicted_modal_price_paise_per_quintal: number;
          target_date: string;
          upper_bound_paise_per_quintal?: number | null;
        };
        Update: {
          created_at?: string;
          forecast_run_id?: string;
          id?: string;
          lower_bound_paise_per_quintal?: number | null;
          predicted_modal_price_paise_per_quintal?: number;
          target_date?: string;
          upper_bound_paise_per_quintal?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "market_forecast_points_forecast_run_id_fkey";
            columns: ["forecast_run_id"];
            isOneToOne: false;
            referencedRelation: "market_forecast_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      market_forecast_review_events: {
        Row: {
          actor_user_id: string | null;
          created_at: string;
          forecast_run_id: string;
          id: string;
          new_status: string;
          previous_status: string | null;
          review_note: string | null;
        };
        Insert: {
          actor_user_id?: string | null;
          created_at?: string;
          forecast_run_id: string;
          id?: string;
          new_status: string;
          previous_status?: string | null;
          review_note?: string | null;
        };
        Update: {
          actor_user_id?: string | null;
          created_at?: string;
          forecast_run_id?: string;
          id?: string;
          new_status?: string;
          previous_status?: string | null;
          review_note?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "market_forecast_review_events_actor_user_id_fkey";
            columns: ["actor_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "market_forecast_review_events_forecast_run_id_fkey";
            columns: ["forecast_run_id"];
            isOneToOne: false;
            referencedRelation: "market_forecast_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      market_forecast_runs: {
        Row: {
          approved_at: string | null;
          baseline_mae_paise_per_quintal: number | null;
          baseline_smape_percent: number | null;
          created_at: string;
          created_by_user_id: string | null;
          crop: string;
          district: string | null;
          generated_at: string;
          horizon_days: number;
          id: string;
          market_name: string;
          model_mae_paise_per_quintal: number | null;
          model_name: string;
          model_smape_percent: number | null;
          model_version: string;
          review_notes: string | null;
          reviewed_by_user_id: string | null;
          state: string | null;
          status: string;
          training_end: string | null;
          training_observation_count: number;
          validated_observation_count: number | null;
          training_start: string | null;
          variety: string | null;
        };
        Insert: {
          approved_at?: string | null;
          baseline_mae_paise_per_quintal?: number | null;
          baseline_smape_percent?: number | null;
          created_at?: string;
          created_by_user_id?: string | null;
          crop: string;
          district?: string | null;
          generated_at?: string;
          horizon_days: number;
          id?: string;
          market_name: string;
          model_mae_paise_per_quintal?: number | null;
          model_name: string;
          model_smape_percent?: number | null;
          model_version: string;
          review_notes?: string | null;
          reviewed_by_user_id?: string | null;
          state?: string | null;
          status?: string;
          training_end?: string | null;
          training_observation_count: number;
          validated_observation_count?: number | null;
          training_start?: string | null;
          variety?: string | null;
        };
        Update: {
          approved_at?: string | null;
          baseline_mae_paise_per_quintal?: number | null;
          baseline_smape_percent?: number | null;
          created_at?: string;
          created_by_user_id?: string | null;
          crop?: string;
          district?: string | null;
          generated_at?: string;
          horizon_days?: number;
          id?: string;
          market_name?: string;
          model_mae_paise_per_quintal?: number | null;
          model_name?: string;
          model_smape_percent?: number | null;
          model_version?: string;
          review_notes?: string | null;
          reviewed_by_user_id?: string | null;
          state?: string | null;
          status?: string;
          training_end?: string | null;
          training_observation_count?: number;
          validated_observation_count?: number | null;
          training_start?: string | null;
          variety?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "market_forecast_runs_created_by_user_id_fkey";
            columns: ["created_by_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "market_forecast_runs_reviewed_by_user_id_fkey";
            columns: ["reviewed_by_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
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
        };
        Insert: {
          created_at?: string;
          crop: string;
          district?: string | null;
          id?: string;
          market_name: string;
          max_price_paise_per_quintal?: number | null;
          min_price_paise_per_quintal?: number | null;
          modal_price_paise_per_quintal?: number | null;
          observation_date: string;
          retrieved_at?: string;
          source_name: string;
          source_url: string;
          state?: string | null;
          variety?: string | null;
        };
        Update: {
          created_at?: string;
          crop?: string;
          district?: string | null;
          id?: string;
          market_name?: string;
          max_price_paise_per_quintal?: number | null;
          min_price_paise_per_quintal?: number | null;
          modal_price_paise_per_quintal?: number | null;
          observation_date?: string;
          retrieved_at?: string;
          source_name?: string;
          source_url?: string;
          state?: string | null;
          variety?: string | null;
        };
        Relationships: [];
      };
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
        };
        Insert: {
          body: string;
          created_at?: string;
          event_key: string;
          id?: string;
          read_at?: string | null;
          recipient_user_id: string;
          related_id?: string | null;
          related_type?: string | null;
          title: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          event_key?: string;
          id?: string;
          read_at?: string | null;
          recipient_user_id?: string;
          related_id?: string | null;
          related_type?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_recipient_user_id_fkey";
            columns: ["recipient_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
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
        };
        Insert: {
          buyer_id: string;
          created_at?: string;
          farmer_id: string;
          id?: string;
          lot_id: string;
          price_paise_per_quintal: number;
          quantity: number;
          status?: string;
          terms?: string | null;
          unit: string;
          updated_at?: string;
          valid_until: string;
        };
        Update: {
          buyer_id?: string;
          created_at?: string;
          farmer_id?: string;
          id?: string;
          lot_id?: string;
          price_paise_per_quintal?: number;
          quantity?: number;
          status?: string;
          terms?: string | null;
          unit?: string;
          updated_at?: string;
          valid_until?: string;
        };
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
        ];
      };
      produce_lots: {
        Row: {
          approximate_area: string;
          available_from: string;
          buyer_market_area: string | null;
          created_at: string;
          crop: string;
          grade: string | null;
          id: string;
          notes: string | null;
          owner_id: string;
          published_at: string | null;
          quantity: number;
          sell_by: string;
          status: string;
          unit: string;
          updated_at: string;
          variety: string | null;
        };
        Insert: {
          approximate_area: string;
          available_from: string;
          buyer_market_area?: string | null;
          created_at?: string;
          crop: string;
          grade?: string | null;
          id?: string;
          notes?: string | null;
          owner_id: string;
          published_at?: string | null;
          quantity: number;
          sell_by: string;
          status?: string;
          unit: string;
          updated_at?: string;
          variety?: string | null;
        };
        Update: {
          approximate_area?: string;
          available_from?: string;
          buyer_market_area?: string | null;
          created_at?: string;
          crop?: string;
          grade?: string | null;
          id?: string;
          notes?: string | null;
          owner_id?: string;
          published_at?: string | null;
          quantity?: number;
          sell_by?: string;
          status?: string;
          unit?: string;
          updated_at?: string;
          variety?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "produce_lots_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profile_consent_events: {
        Row: {
          actor_user_id: string | null;
          consent_field: Database["public"]["Enums"]["farmer_consent_field"];
          created_at: string;
          dedupe_key: string;
          granted: boolean;
          id: string;
          user_id: string;
        };
        Insert: {
          actor_user_id?: string | null;
          consent_field: Database["public"]["Enums"]["farmer_consent_field"];
          created_at?: string;
          dedupe_key?: string;
          granted: boolean;
          id?: string;
          user_id: string;
        };
        Update: {
          actor_user_id?: string | null;
          consent_field?: Database["public"]["Enums"]["farmer_consent_field"];
          created_at?: string;
          dedupe_key?: string;
          granted?: boolean;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profile_consent_events_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
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
        };
        Insert: {
          approximate_location_sharing?: boolean;
          buyer_contact_disclosure?: boolean;
          created_at?: string;
          display_name?: string | null;
          exact_location_disclosure?: boolean;
          id: string;
          market_area?: string | null;
          phone_number?: string | null;
          provider_contact_disclosure?: boolean;
          role?: Database["public"]["Enums"]["farmess_role"];
          updated_at?: string;
        };
        Update: {
          approximate_location_sharing?: boolean;
          buyer_contact_disclosure?: boolean;
          created_at?: string;
          display_name?: string | null;
          exact_location_disclosure?: boolean;
          id?: string;
          market_area?: string | null;
          phone_number?: string | null;
          provider_contact_disclosure?: boolean;
          role?: Database["public"]["Enums"]["farmess_role"];
          updated_at?: string;
        };
        Relationships: [];
      };
      sale_activity: {
        Row: {
          actor_user_id: string | null;
          created_at: string;
          event_key: string;
          id: string;
          participant_user_ids: string[];
          sale_id: string;
          summary: string;
        };
        Insert: {
          actor_user_id?: string | null;
          created_at?: string;
          event_key: string;
          id?: string;
          participant_user_ids: string[];
          sale_id: string;
          summary: string;
        };
        Update: {
          actor_user_id?: string | null;
          created_at?: string;
          event_key?: string;
          id?: string;
          participant_user_ids?: string[];
          sale_id?: string;
          summary?: string;
        };
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
        ];
      };
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
        };
        Insert: {
          agreed_at?: string;
          agreed_price_paise_per_quintal: number;
          agreed_quantity: number;
          buyer_id: string;
          farmer_id: string;
          id?: string;
          lot_id: string;
          offer_id: string;
          status?: string;
          unit: string;
          updated_at?: string;
        };
        Update: {
          agreed_at?: string;
          agreed_price_paise_per_quintal?: number;
          agreed_quantity?: number;
          buyer_id?: string;
          farmer_id?: string;
          id?: string;
          lot_id?: string;
          offer_id?: string;
          status?: string;
          unit?: string;
          updated_at?: string;
        };
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
        ];
      };
      service_listings: {
        Row: {
          available_from: string | null;
          available_until: string | null;
          capacity_quantity: number | null;
          capacity_unit: string | null;
          cold_chain_available: boolean;
          created_at: string;
          crop_suitability: string[];
          description: string | null;
          destination_area: string | null;
          destination_location: unknown;
          id: string;
          operator_id: string;
          price_paise: number | null;
          rate_basis: string;
          service_area: string;
          service_location: unknown;
          service_radius_km: number | null;
          service_type: string;
          status: string;
          title: string;
          updated_at: string;
          verification_state: string;
        };
        Insert: {
          available_from?: string | null;
          available_until?: string | null;
          capacity_quantity?: number | null;
          capacity_unit?: string | null;
          cold_chain_available?: boolean;
          created_at?: string;
          crop_suitability?: string[];
          description?: string | null;
          destination_area?: string | null;
          destination_location?: unknown;
          id?: string;
          operator_id: string;
          price_paise?: number | null;
          rate_basis?: string;
          service_area: string;
          service_location?: unknown;
          service_radius_km?: number | null;
          service_type: string;
          status?: string;
          title: string;
          updated_at?: string;
          verification_state?: string;
        };
        Update: {
          available_from?: string | null;
          available_until?: string | null;
          capacity_quantity?: number | null;
          capacity_unit?: string | null;
          cold_chain_available?: boolean;
          created_at?: string;
          crop_suitability?: string[];
          description?: string | null;
          destination_area?: string | null;
          destination_location?: unknown;
          id?: string;
          operator_id?: string;
          price_paise?: number | null;
          rate_basis?: string;
          service_area?: string;
          service_location?: unknown;
          service_radius_km?: number | null;
          service_type?: string;
          status?: string;
          title?: string;
          updated_at?: string;
          verification_state?: string;
        };
        Relationships: [
          {
            foreignKeyName: "service_listings_operator_id_fkey";
            columns: ["operator_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
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
        };
        Insert: {
          created_at?: string;
          destination_area?: string | null;
          id?: string;
          listing_id: string;
          message?: string | null;
          origin_area?: string | null;
          provider_user_id: string;
          requested_date?: string | null;
          requested_quantity?: number | null;
          requester_id: string;
          status?: string;
          unit?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          destination_area?: string | null;
          id?: string;
          listing_id?: string;
          message?: string | null;
          origin_area?: string | null;
          provider_user_id?: string;
          requested_date?: string | null;
          requested_quantity?: number | null;
          requester_id?: string;
          status?: string;
          unit?: string | null;
          updated_at?: string;
        };
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
        ];
      };
    };
    Views: {
      buyer_marketplace_lots: {
        Row: {
          approximate_area: string | null;
          available_from: string | null;
          created_at: string | null;
          crop: string | null;
          grade: string | null;
          id: string | null;
          quantity: number | null;
          sell_by: string | null;
          unit: string | null;
          variety: string | null;
        };
        Insert: {
          approximate_area?: string | null;
          available_from?: string | null;
          created_at?: string | null;
          crop?: string | null;
          grade?: string | null;
          id?: string | null;
          quantity?: number | null;
          sell_by?: string | null;
          unit?: string | null;
          variety?: string | null;
        };
        Update: {
          approximate_area?: string | null;
          available_from?: string | null;
          created_at?: string | null;
          crop?: string | null;
          grade?: string | null;
          id?: string | null;
          quantity?: number | null;
          sell_by?: string | null;
          unit?: string | null;
          variety?: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      create_buyer_offer: {
        Args: {
          p_lot_id: string;
          p_price_paise_per_quintal: number;
          p_quantity: number;
          p_terms?: string;
          p_unit: string;
          p_valid_until: string;
        };
        Returns: {
          created_at: string;
          id: string;
          lot_id: string;
          price_paise_per_quintal: number;
          quantity: number;
          status: string;
          terms: string;
          unit: string;
          valid_until: string;
        }[];
      };
      find_nearby_service_listings: {
        Args: {
          p_crop?: string;
          p_latitude: number;
          p_longitude: number;
          p_radius_meters?: number;
          p_required_date?: string;
          p_required_quantity?: number;
          p_requires_cold_chain?: boolean;
          p_service_type?: string;
          p_unit?: string;
        };
        Returns: {
          available_from: string;
          available_until: string;
          capacity_match: boolean;
          capacity_quantity: number;
          capacity_unit: string;
          cold_chain_available: boolean;
          cold_chain_match: boolean;
          crop_match: boolean;
          crop_suitability: string[];
          date_match: boolean;
          description: string;
          destination_area: string;
          destination_latitude: number;
          destination_longitude: number;
          distance_meters: number;
          id: string;
          latitude: number;
          longitude: number;
          price_paise: number;
          rate_basis: string;
          service_area: string;
          service_radius_km: number;
          service_radius_match: boolean;
          service_type: string;
          title: string;
          verification_state: string;
        }[];
      };
    };
    Enums: {
      farmer_consent_field:
        | "approximate_location_sharing"
        | "exact_location_disclosure"
        | "buyer_contact_disclosure"
        | "provider_contact_disclosure";
      farmess_role: "farmer" | "buyer" | "operator" | "admin";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

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

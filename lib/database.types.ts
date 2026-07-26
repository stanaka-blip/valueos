/**
 * Supabase Database types (Phase1)
 *
 * - order_items / case_settlements は本DDLに対応する手生成型
 * - 既存テーブルはライブスキーマから抽出した互換型（破壊的変更なし）
 * - DDL適用後は `npm run gen:db-types` で差し替え可能
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      order_items: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          order_id: string;
          product_id: string | null;
          case_product_id: string | null;
          quantity: number;
          unit_price: number | null;
          amount: number | null;
          memo: string | null;
          sort_order: number;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          order_id: string;
          product_id?: string | null;
          case_product_id?: string | null;
          quantity?: number;
          unit_price?: number | null;
          amount?: number | null;
          memo?: string | null;
          sort_order?: number;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          order_id?: string;
          product_id?: string | null;
          case_product_id?: string | null;
          quantity?: number;
          unit_price?: number | null;
          amount?: number | null;
          memo?: string | null;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_case_product_id_fkey";
            columns: ["case_product_id"];
            isOneToOne: false;
            referencedRelation: "case_products";
            referencedColumns: ["id"];
          },
        ];
      };
      case_settlements: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          case_id: string;
          settlement_type: string;
          fee_rate: number | null;
          fee_amount: number;
          deposit_rate: number | null;
          deposit_amount: number | null;
          payment_terms: string | null;
          card_brand: string | null;
          memo: string | null;
          loan_status: string | null;
          loan_status_updated_at: string | null;
          card_status: string | null;
          card_status_updated_at: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          case_id: string;
          settlement_type: string;
          fee_rate?: number | null;
          fee_amount?: number;
          deposit_rate?: number | null;
          deposit_amount?: number | null;
          payment_terms?: string | null;
          card_brand?: string | null;
          memo?: string | null;
          loan_status?: string | null;
          loan_status_updated_at?: string | null;
          card_status?: string | null;
          card_status_updated_at?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          case_id?: string;
          settlement_type?: string;
          fee_rate?: number | null;
          fee_amount?: number;
          deposit_rate?: number | null;
          deposit_amount?: number | null;
          payment_terms?: string | null;
          card_brand?: string | null;
          memo?: string | null;
          loan_status?: string | null;
          loan_status_updated_at?: string | null;
          card_status?: string | null;
          card_status_updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "case_settlements_case_id_fkey";
            columns: ["case_id"];
            isOneToOne: true;
            referencedRelation: "cases";
            referencedColumns: ["id"];
          },
        ];
      };
      cases: {
        Row: {
          id: string;
          created_at: string;
          case_no: string | null;
          dealer_id: string | null;
          customer_name: string | null;
          customer_phone: string | null;
          site_address: string | null;
          order_type: string | null;
          product_name: string | null;
          quantity: number | null;
          order_received_date: string | null;
          desired_delivery_date: string | null;
          delivery_address: string | null;
          construction_desired_date: string | null;
          construction_completed_date: string | null;
          construction_detail: string | null;
          status: string | null;
          department: string | null;
          assigned_user: string | null;
          priority: string | null;
          memo: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          case_no?: string | null;
          dealer_id?: string | null;
          customer_name?: string | null;
          customer_phone?: string | null;
          site_address?: string | null;
          order_type?: string | null;
          product_name?: string | null;
          quantity?: number | null;
          order_received_date?: string | null;
          desired_delivery_date?: string | null;
          delivery_address?: string | null;
          construction_desired_date?: string | null;
          construction_completed_date?: string | null;
          construction_detail?: string | null;
          status?: string | null;
          department?: string | null;
          assigned_user?: string | null;
          priority?: string | null;
          memo?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          case_no?: string | null;
          dealer_id?: string | null;
          customer_name?: string | null;
          customer_phone?: string | null;
          site_address?: string | null;
          order_type?: string | null;
          product_name?: string | null;
          quantity?: number | null;
          order_received_date?: string | null;
          desired_delivery_date?: string | null;
          delivery_address?: string | null;
          construction_desired_date?: string | null;
          construction_completed_date?: string | null;
          construction_detail?: string | null;
          status?: string | null;
          department?: string | null;
          assigned_user?: string | null;
          priority?: string | null;
          memo?: string | null;
        };
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          created_at: string;
          case_id: string | null;
          supplier_id: string | null;
          order_no: string | null;
          order_date: string | null;
          expected_delivery_date: string | null;
          delivered_date: string | null;
          order_amount: number | null;
          status: string | null;
          memo: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          case_id?: string | null;
          supplier_id?: string | null;
          order_no?: string | null;
          order_date?: string | null;
          expected_delivery_date?: string | null;
          delivered_date?: string | null;
          order_amount?: number | null;
          status?: string | null;
          memo?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          case_id?: string | null;
          supplier_id?: string | null;
          order_no?: string | null;
          order_date?: string | null;
          expected_delivery_date?: string | null;
          delivered_date?: string | null;
          order_amount?: number | null;
          status?: string | null;
          memo?: string | null;
        };
        Relationships: [];
      };
      case_products: {
        Row: {
          id: string;
          created_at: string;
          case_id: string | null;
          line_type: string;
          product_id: string | null;
          package_id: string | null;
          supplier_id: string | null;
          quantity: number | null;
          purchase_price: number | null;
          sales_price: number | null;
          gross_profit: number | null;
          sales_price_id: string | null;
          purchase_price_id: string | null;
          is_manual_price: boolean;
          price_fetched_at: string | null;
          memo: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          case_id?: string | null;
          line_type?: string;
          product_id?: string | null;
          package_id?: string | null;
          supplier_id?: string | null;
          quantity?: number | null;
          purchase_price?: number | null;
          sales_price?: number | null;
          gross_profit?: number | null;
          sales_price_id?: string | null;
          purchase_price_id?: string | null;
          is_manual_price?: boolean;
          price_fetched_at?: string | null;
          memo?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          case_id?: string | null;
          line_type?: string;
          product_id?: string | null;
          package_id?: string | null;
          supplier_id?: string | null;
          quantity?: number | null;
          purchase_price?: number | null;
          sales_price?: number | null;
          gross_profit?: number | null;
          sales_price_id?: string | null;
          purchase_price_id?: string | null;
          is_manual_price?: boolean;
          price_fetched_at?: string | null;
          memo?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "case_products_package_id_fkey";
            columns: ["package_id"];
            isOneToOne: false;
            referencedRelation: "packages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "case_products_sales_price_id_fkey";
            columns: ["sales_price_id"];
            isOneToOne: false;
            referencedRelation: "sales_prices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "case_products_purchase_price_id_fkey";
            columns: ["purchase_price_id"];
            isOneToOne: false;
            referencedRelation: "purchase_prices";
            referencedColumns: ["id"];
          },
        ];
      };
      case_packages: {
        Row: {
          id: string;
          created_at: string;
          case_id: string | null;
          package_id: string | null;
          quantity: number | null;
          memo: string | null;
          case_product_id: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          case_id?: string | null;
          package_id?: string | null;
          quantity?: number | null;
          memo?: string | null;
          case_product_id?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          case_id?: string | null;
          package_id?: string | null;
          quantity?: number | null;
          memo?: string | null;
          case_product_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "case_packages_case_product_id_fkey";
            columns: ["case_product_id"];
            isOneToOne: false;
            referencedRelation: "case_products";
            referencedColumns: ["id"];
          },
        ];
      };
      case_registration_requests: {
        Row: {
          request_id: string;
          case_id: string | null;
          status: string;
          payload_hash: string;
          error_code: string | null;
          error_message: string | null;
          response: Json | null;
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          request_id: string;
          case_id?: string | null;
          status: string;
          payload_hash: string;
          error_code?: string | null;
          error_message?: string | null;
          response?: Json | null;
          created_at?: string;
          completed_at?: string | null;
        };
        Update: {
          request_id?: string;
          case_id?: string | null;
          status?: string;
          payload_hash?: string;
          error_code?: string | null;
          error_message?: string | null;
          response?: Json | null;
          created_at?: string;
          completed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "case_registration_requests_case_id_fkey";
            columns: ["case_id"];
            isOneToOne: false;
            referencedRelation: "cases";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          id: string;
          created_at: string;
          manufacturer_id: string | null;
          category: string | null;
          model_no: string | null;
          name: string | null;
          capacity: string | null;
          unit: string | null;
          memo: string | null;
          is_active: string | null;
          series_id: string | null;
          product_type: string | null;
          specification: string | null;
          price_list_category: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          manufacturer_id?: string | null;
          category?: string | null;
          model_no?: string | null;
          name?: string | null;
          capacity?: string | null;
          unit?: string | null;
          memo?: string | null;
          is_active?: string | null;
          series_id?: string | null;
          product_type?: string | null;
          specification?: string | null;
          price_list_category?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          manufacturer_id?: string | null;
          category?: string | null;
          model_no?: string | null;
          name?: string | null;
          capacity?: string | null;
          unit?: string | null;
          memo?: string | null;
          is_active?: string | null;
          series_id?: string | null;
          product_type?: string | null;
          specification?: string | null;
          price_list_category?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_case_registration: {
        Args: {
          payload: Json;
        };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type PublicTables = Database["public"]["Tables"];

export type OrderItemRow = PublicTables["order_items"]["Row"];
export type OrderItemInsert = PublicTables["order_items"]["Insert"];
export type OrderItemUpdate = PublicTables["order_items"]["Update"];

export type CaseSettlementRow = PublicTables["case_settlements"]["Row"];
export type CaseSettlementInsert = PublicTables["case_settlements"]["Insert"];
export type CaseSettlementUpdate = PublicTables["case_settlements"]["Update"];

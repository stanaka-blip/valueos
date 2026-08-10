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
          finance_company: string | null;
          approval_number: string | null;
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
          finance_company?: string | null;
          approval_number?: string | null;
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
          finance_company?: string | null;
          approval_number?: string | null;
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
      /**
       * 3社間金銭 API 冪等 ledger（20260810160000）。
       * service_role のみ。
       */
      three_party_money_requests: {
        Row: {
          request_id: string;
          action: string;
          case_id: string | null;
          resource_id: string | null;
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
          action: string;
          case_id?: string | null;
          resource_id?: string | null;
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
          action?: string;
          case_id?: string | null;
          resource_id?: string | null;
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
            foreignKeyName: "three_party_money_requests_case_id_fkey";
            columns: ["case_id"];
            isOneToOne: false;
            referencedRelation: "cases";
            referencedColumns: ["id"];
          },
        ];
      };
      /**
       * 信販入金（20260810150000）。既存 payments とは独立。
       * 書込は service_role / gateway のみ。
       */
      finance_receipts: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          case_id: string;
          finance_company: string;
          scheduled_date: string | null;
          scheduled_amount: number;
          actual_date: string | null;
          actual_amount: number | null;
          status: string;
          memo: string | null;
          cancelled_at: string | null;
          cancel_reason: string | null;
          corrects_id: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          case_id: string;
          finance_company: string;
          scheduled_date?: string | null;
          scheduled_amount?: number;
          actual_date?: string | null;
          actual_amount?: number | null;
          status?: string;
          memo?: string | null;
          cancelled_at?: string | null;
          cancel_reason?: string | null;
          corrects_id?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          case_id?: string;
          finance_company?: string;
          scheduled_date?: string | null;
          scheduled_amount?: number;
          actual_date?: string | null;
          actual_amount?: number | null;
          status?: string;
          memo?: string | null;
          cancelled_at?: string | null;
          cancel_reason?: string | null;
          corrects_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "finance_receipts_case_id_fkey";
            columns: ["case_id"];
            isOneToOne: false;
            referencedRelation: "cases";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "finance_receipts_corrects_id_fkey";
            columns: ["corrects_id"];
            isOneToOne: false;
            referencedRelation: "finance_receipts";
            referencedColumns: ["id"];
          },
        ];
      };
      /**
       * 仕切清算書ヘッダ兼販売店支払（20260810150000）。
       * 確定金額は snapshot。既存 invoices とは別書類。
       */
      dealer_settlements: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          case_id: string;
          dealer_id: string;
          statement_no: string | null;
          issue_date: string | null;
          finance_receipt_id: string | null;
          invoice_id: string | null;
          credit_received_amount: number;
          ve_share_amount: number;
          adjustment_total_amount: number;
          payout_amount: number;
          scheduled_payout_date: string | null;
          actual_payout_date: string | null;
          actual_payout_amount: number | null;
          contract_date: string | null;
          delivery_date: string | null;
          status: string;
          memo: string | null;
          cancelled_at: string | null;
          cancel_reason: string | null;
          corrects_id: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          case_id: string;
          dealer_id: string;
          statement_no?: string | null;
          issue_date?: string | null;
          finance_receipt_id?: string | null;
          invoice_id?: string | null;
          credit_received_amount?: number;
          ve_share_amount?: number;
          adjustment_total_amount?: number;
          payout_amount?: number;
          scheduled_payout_date?: string | null;
          actual_payout_date?: string | null;
          actual_payout_amount?: number | null;
          contract_date?: string | null;
          delivery_date?: string | null;
          status?: string;
          memo?: string | null;
          cancelled_at?: string | null;
          cancel_reason?: string | null;
          corrects_id?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          case_id?: string;
          dealer_id?: string;
          statement_no?: string | null;
          issue_date?: string | null;
          finance_receipt_id?: string | null;
          invoice_id?: string | null;
          credit_received_amount?: number;
          ve_share_amount?: number;
          adjustment_total_amount?: number;
          payout_amount?: number;
          scheduled_payout_date?: string | null;
          actual_payout_date?: string | null;
          actual_payout_amount?: number | null;
          contract_date?: string | null;
          delivery_date?: string | null;
          status?: string;
          memo?: string | null;
          cancelled_at?: string | null;
          cancel_reason?: string | null;
          corrects_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "dealer_settlements_case_id_fkey";
            columns: ["case_id"];
            isOneToOne: false;
            referencedRelation: "cases";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dealer_settlements_finance_receipt_id_fkey";
            columns: ["finance_receipt_id"];
            isOneToOne: false;
            referencedRelation: "finance_receipts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dealer_settlements_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dealer_settlements_corrects_id_fkey";
            columns: ["corrects_id"];
            isOneToOne: false;
            referencedRelation: "dealer_settlements";
            referencedColumns: ["id"];
          },
        ];
      };
      /**
       * 仕切清算明細（20260810150000）。
       */
      dealer_settlement_lines: {
        Row: {
          id: string;
          created_at: string;
          dealer_settlement_id: string;
          sort_order: number;
          line_kind: string;
          description: string;
          amount: number;
          memo: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          dealer_settlement_id: string;
          sort_order?: number;
          line_kind: string;
          description: string;
          amount?: number;
          memo?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          dealer_settlement_id?: string;
          sort_order?: number;
          line_kind?: string;
          description?: string;
          amount?: number;
          memo?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "dealer_settlement_lines_dealer_settlement_id_fkey";
            columns: ["dealer_settlement_id"];
            isOneToOne: false;
            referencedRelation: "dealer_settlements";
            referencedColumns: ["id"];
          },
        ];
      };
      /**
       * 仕入先支払（20260810150000）。orders に対して 1:N。
       */
      supplier_payments: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          case_id: string;
          supplier_id: string;
          order_id: string | null;
          due_date: string | null;
          scheduled_amount: number;
          paid_date: string | null;
          paid_amount: number | null;
          status: string;
          memo: string | null;
          cancelled_at: string | null;
          cancel_reason: string | null;
          corrects_id: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          case_id: string;
          supplier_id: string;
          order_id?: string | null;
          due_date?: string | null;
          scheduled_amount?: number;
          paid_date?: string | null;
          paid_amount?: number | null;
          status?: string;
          memo?: string | null;
          cancelled_at?: string | null;
          cancel_reason?: string | null;
          corrects_id?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          case_id?: string;
          supplier_id?: string;
          order_id?: string | null;
          due_date?: string | null;
          scheduled_amount?: number;
          paid_date?: string | null;
          paid_amount?: number | null;
          status?: string;
          memo?: string | null;
          cancelled_at?: string | null;
          cancel_reason?: string | null;
          corrects_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "supplier_payments_case_id_fkey";
            columns: ["case_id"];
            isOneToOne: false;
            referencedRelation: "cases";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "supplier_payments_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "supplier_payments_corrects_id_fkey";
            columns: ["corrects_id"];
            isOneToOne: false;
            referencedRelation: "supplier_payments";
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
      product_setup_requests: {
        Row: {
          request_id: string;
          product_id: string | null;
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
          product_id?: string | null;
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
          product_id?: string | null;
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
            foreignKeyName: "product_setup_requests_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      existing_product_price_setup_requests: {
        Row: {
          request_id: string;
          product_id: string | null;
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
          product_id?: string | null;
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
          product_id?: string | null;
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
            foreignKeyName: "existing_product_price_setup_requests_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      supplier_purchase_price_bulk_requests: {
        Row: {
          request_id: string;
          supplier_id: string | null;
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
          supplier_id?: string | null;
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
          supplier_id?: string | null;
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
            foreignKeyName: "supplier_purchase_price_bulk_requests_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
        ];
      };
      dealer_sales_price_bulk_requests: {
        Row: {
          request_id: string;
          dealer_id: string | null;
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
          dealer_id?: string | null;
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
          dealer_id?: string | null;
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
            foreignKeyName: "dealer_sales_price_bulk_requests_dealer_id_fkey";
            columns: ["dealer_id"];
            isOneToOne: false;
            referencedRelation: "dealers";
            referencedColumns: ["id"];
          },
        ];
      };
      package_bulk_setup_requests: {
        Row: {
          request_id: string;
          manufacturer_id: string | null;
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
          manufacturer_id?: string | null;
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
          manufacturer_id?: string | null;
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
            foreignKeyName: "package_bulk_setup_requests_manufacturer_id_fkey";
            columns: ["manufacturer_id"];
            isOneToOne: false;
            referencedRelation: "manufacturers";
            referencedColumns: ["id"];
          },
        ];
      };
      case_line_append_requests: {
        Row: {
          request_id: string;
          case_id: string | null;
          case_product_id: string | null;
          case_package_id: string | null;
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
          case_product_id?: string | null;
          case_package_id?: string | null;
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
          case_product_id?: string | null;
          case_package_id?: string | null;
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
            foreignKeyName: "case_line_append_requests_case_id_fkey";
            columns: ["case_id"];
            isOneToOne: false;
            referencedRelation: "cases";
            referencedColumns: ["id"];
          },
        ];
      };
      gateway_rate_limits: {
        Row: {
          bucket_key: string;
          window_started_at: string;
          hit_count: number;
          updated_at: string;
        };
        Insert: {
          bucket_key: string;
          window_started_at: string;
          hit_count?: number;
          updated_at?: string;
        };
        Update: {
          bucket_key?: string;
          window_started_at?: string;
          hit_count?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      company_settings: {
        Row: {
          id: boolean;
          company_name: string;
          postal_code: string | null;
          address: string | null;
          phone: string | null;
          fax: string | null;
          email: string | null;
          invoice_registration_number: string | null;
          bank_name: string | null;
          bank_branch: string | null;
          bank_account_type: string | null;
          bank_account_number: string | null;
          bank_account_holder: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: boolean;
          company_name: string;
          postal_code?: string | null;
          address?: string | null;
          phone?: string | null;
          fax?: string | null;
          email?: string | null;
          invoice_registration_number?: string | null;
          bank_name?: string | null;
          bank_branch?: string | null;
          bank_account_type?: string | null;
          bank_account_number?: string | null;
          bank_account_holder?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: boolean;
          company_name?: string;
          postal_code?: string | null;
          address?: string | null;
          phone?: string | null;
          fax?: string | null;
          email?: string | null;
          invoice_registration_number?: string | null;
          bank_name?: string | null;
          bank_branch?: string | null;
          bank_account_type?: string | null;
          bank_account_number?: string | null;
          bank_account_holder?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      /**
       * 社内スタッフプロファイル（20260808220000_staff_profiles_and_attachment_actors）。
       * email は auth.users を正式値とし、ここでは保持しない。
       */
      staff_profiles: {
        Row: {
          id: string;
          display_name: string;
          is_active: boolean;
          is_admin: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          is_active?: boolean;
          is_admin?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          is_active?: boolean;
          is_admin?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      /**
       * 案件添付資料 metadata（20260808200000_case_attachments）。
       * ファイル本体は Storage bucket case-attachments（private）。
       */
      case_attachments: {
        Row: {
          id: string;
          case_id: string;
          attachment_type: string;
          original_filename: string;
          content_type: string;
          byte_size: number;
          storage_bucket: string;
          storage_path: string;
          uploaded_by_sid: string | null;
          uploaded_by_user_id: string | null;
          uploaded_by_label: string;
          is_active: boolean;
          deleted_at: string | null;
          deleted_by_sid: string | null;
          deleted_by_user_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          case_id: string;
          attachment_type: string;
          original_filename: string;
          content_type: string;
          byte_size: number;
          storage_bucket?: string;
          storage_path: string;
          uploaded_by_sid?: string | null;
          uploaded_by_user_id?: string | null;
          uploaded_by_label?: string;
          is_active?: boolean;
          deleted_at?: string | null;
          deleted_by_sid?: string | null;
          deleted_by_user_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          case_id?: string;
          attachment_type?: string;
          original_filename?: string;
          content_type?: string;
          byte_size?: number;
          storage_bucket?: string;
          storage_path?: string;
          uploaded_by_sid?: string | null;
          uploaded_by_user_id?: string | null;
          uploaded_by_label?: string;
          is_active?: boolean;
          deleted_at?: string | null;
          deleted_by_sid?: string | null;
          deleted_by_user_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "case_attachments_case_id_fkey";
            columns: ["case_id"];
            isOneToOne: false;
            referencedRelation: "cases";
            referencedColumns: ["id"];
          },
        ];
      };
      case_attachment_upload_intents: {
        Row: {
          id: string;
          attachment_id: string;
          case_id: string;
          attachment_type: string;
          original_filename: string;
          content_type: string;
          declared_byte_size: number;
          storage_bucket: string;
          storage_path: string;
          status: string;
          uploaded_by_sid: string | null;
          uploaded_by_user_id: string | null;
          expires_at: string;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          attachment_id: string;
          case_id: string;
          attachment_type: string;
          original_filename: string;
          content_type: string;
          declared_byte_size: number;
          storage_bucket?: string;
          storage_path: string;
          status?: string;
          uploaded_by_sid?: string | null;
          uploaded_by_user_id?: string | null;
          expires_at: string;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          attachment_id?: string;
          case_id?: string;
          attachment_type?: string;
          original_filename?: string;
          content_type?: string;
          declared_byte_size?: number;
          storage_bucket?: string;
          storage_path?: string;
          status?: string;
          uploaded_by_sid?: string | null;
          uploaded_by_user_id?: string | null;
          expires_at?: string;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "case_attachment_upload_intents_case_id_fkey";
            columns: ["case_id"];
            isOneToOne: false;
            referencedRelation: "cases";
            referencedColumns: ["id"];
          },
        ];
      };
      /**
       * 施工店マスタ（20260808120000_create_contractors）。
       * 案件への FK / 同期は持たない。
       */
      contractors: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          name: string;
          postal_code: string | null;
          address: string | null;
          phone: string | null;
          delivery_name: string | null;
          delivery_address: string | null;
          delivery_phone: string | null;
          receiver_name: string | null;
          memo: string | null;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          name: string;
          postal_code?: string | null;
          address?: string | null;
          phone?: string | null;
          delivery_name?: string | null;
          delivery_address?: string | null;
          delivery_phone?: string | null;
          receiver_name?: string | null;
          memo?: string | null;
          is_active?: boolean;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          name?: string;
          postal_code?: string | null;
          address?: string | null;
          phone?: string | null;
          delivery_name?: string | null;
          delivery_address?: string | null;
          delivery_phone?: string | null;
          receiver_name?: string | null;
          memo?: string | null;
          is_active?: boolean;
        };
        Relationships: [];
      };
      /**
       * 請求（ライブスキーマ互換の手生成型）。
       * subtotal_ex_tax / tax_amount は 20260807120000 で追加（NULL可）。
       */
      invoices: {
        Row: {
          id: string;
          created_at: string;
          case_id: string;
          invoice_no: string;
          invoice_date: string;
          due_date: string | null;
          invoice_amount: number;
          subtotal_ex_tax: number | null;
          tax_amount: number | null;
          status: string | null;
          memo: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          case_id: string;
          invoice_no: string;
          invoice_date: string;
          due_date?: string | null;
          invoice_amount: number;
          subtotal_ex_tax?: number | null;
          tax_amount?: number | null;
          status?: string | null;
          memo?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          case_id?: string;
          invoice_no?: string;
          invoice_date?: string;
          due_date?: string | null;
          invoice_amount?: number;
          subtotal_ex_tax?: number | null;
          tax_amount?: number | null;
          status?: string | null;
          memo?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "invoices_case_id_fkey";
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
          default_supplier_id: string | null;
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
          default_supplier_id?: string | null;
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
          default_supplier_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "products_default_supplier_id_fkey";
            columns: ["default_supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
        ];
      };
      packages: {
        Row: {
          id: string;
          created_at: string | null;
          updated_at: string | null;
          manufacturer_id: string | null;
          series_id: string | null;
          name: string | null;
          package_code: string | null;
          capacity: number | null;
          capacity_unit: string | null;
          system_type: string | null;
          warranty_years: number | null;
          specification: string | null;
          pricing_method: string | null;
          memo: string | null;
          is_active: boolean | null;
          default_supplier_id: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string | null;
          updated_at?: string | null;
          manufacturer_id?: string | null;
          series_id?: string | null;
          name?: string | null;
          package_code?: string | null;
          capacity?: number | null;
          capacity_unit?: string | null;
          system_type?: string | null;
          warranty_years?: number | null;
          specification?: string | null;
          pricing_method?: string | null;
          memo?: string | null;
          is_active?: boolean | null;
          default_supplier_id?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string | null;
          updated_at?: string | null;
          manufacturer_id?: string | null;
          series_id?: string | null;
          name?: string | null;
          package_code?: string | null;
          capacity?: number | null;
          capacity_unit?: string | null;
          system_type?: string | null;
          warranty_years?: number | null;
          specification?: string | null;
          pricing_method?: string | null;
          memo?: string | null;
          is_active?: boolean | null;
          default_supplier_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "packages_default_supplier_id_fkey";
            columns: ["default_supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
        ];
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
      append_case_line: {
        Args: {
          payload: Json;
        };
        Returns: Json;
      };
      create_purchase_orders: {
        Args: {
          payload: Json;
        };
        Returns: Json;
      };
      create_product_setup: {
        Args: {
          payload: Json;
        };
        Returns: Json;
      };
      create_existing_product_price_setup: {
        Args: {
          payload: Json;
        };
        Returns: Json;
      };
      create_supplier_purchase_prices: {
        Args: {
          payload: Json;
        };
        Returns: Json;
      };
      create_dealer_sales_prices: {
        Args: {
          payload: Json;
        };
        Returns: Json;
      };
      create_package_bulk_setup: {
        Args: {
          payload: Json;
        };
        Returns: Json;
      };
      gateway_rate_limit_hit: {
        Args: {
          p_bucket_key: string;
          p_limit: number;
          p_window_seconds: number;
        };
        Returns: Json;
      };
      gateway_rate_limit_cleanup: {
        Args: {
          p_max_age_seconds: number;
          p_limit?: number;
        };
        Returns: number;
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

export type CompanySettingsRow = PublicTables["company_settings"]["Row"];
export type CompanySettingsInsert = PublicTables["company_settings"]["Insert"];
export type CompanySettingsUpdate = PublicTables["company_settings"]["Update"];

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      contact_leads: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          seniority: string
          source: string
          stack: string
          whatsapp: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name: string
          seniority: string
          source?: string
          stack: string
          whatsapp: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          seniority?: string
          source?: string
          stack?: string
          whatsapp?: string
        }
        Relationships: []
      }
      jobs: {
        Row: {
          company: string | null
          country_code: string | null
          hiring_regime: string | null
          id: string
          job_title: string
          job_url: string
          location_raw: string | null
          publication_date: string | null
          salary_currency: string | null
          salary_max: number | null
          salary_min: number | null
          salary_raw: string | null
          scraped_at: string
          source: string | null
          state_code: string | null
          updated_at: string
          work_type: string | null
        }
        Insert: {
          company?: string | null
          country_code?: string | null
          hiring_regime?: string | null
          id?: string
          job_title: string
          job_url: string
          location_raw?: string | null
          publication_date?: string | null
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          salary_raw?: string | null
          scraped_at?: string
          source?: string | null
          state_code?: string | null
          updated_at?: string
          work_type?: string | null
        }
        Update: {
          company?: string | null
          country_code?: string | null
          hiring_regime?: string | null
          id?: string
          job_title?: string
          job_url?: string
          location_raw?: string | null
          publication_date?: string | null
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          salary_raw?: string | null
          scraped_at?: string
          source?: string | null
          state_code?: string | null
          updated_at?: string
          work_type?: string | null
        }
        Relationships: []
      }
      stripe_events: {
        Row: {
          error: string | null
          event_id: string
          event_type: string
          id: string
          payload: Json | null
          processed_at: string
        }
        Insert: {
          error?: string | null
          event_id: string
          event_type: string
          id?: string
          payload?: Json | null
          processed_at?: string
        }
        Update: {
          error?: string | null
          event_id?: string
          event_type?: string
          id?: string
          payload?: Json | null
          processed_at?: string
        }
        Relationships: []
      }
      subscriber_profiles: {
        Row: {
          created_at: string
          id: string
          location: string | null
          min_salary: number | null
          seniority: Database["public"]["Enums"]["seniority_level"]
          stack: string[]
          subscriber_id: string
          updated_at: string
          wa_lid: string | null
          wa_link_token: string | null
          wa_linked_at: string | null
          whatsapp: string
          work_models: string[]
        }
        Insert: {
          created_at?: string
          id?: string
          location?: string | null
          min_salary?: number | null
          seniority: Database["public"]["Enums"]["seniority_level"]
          stack?: string[]
          subscriber_id: string
          updated_at?: string
          wa_lid?: string | null
          wa_link_token?: string | null
          wa_linked_at?: string | null
          whatsapp: string
          work_models?: string[]
        }
        Update: {
          created_at?: string
          id?: string
          location?: string | null
          min_salary?: number | null
          seniority?: Database["public"]["Enums"]["seniority_level"]
          stack?: string[]
          subscriber_id?: string
          updated_at?: string
          wa_lid?: string | null
          wa_link_token?: string | null
          wa_linked_at?: string | null
          whatsapp?: string
          work_models?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "subscriber_profiles_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: true
            referencedRelation: "subscribers"
            referencedColumns: ["id"]
          },
        ]
      }
      subscribers: {
        Row: {
          birth_date: string | null
          cep: string | null
          city: string | null
          cnpj: string | null
          complement: string | null
          cpf: string | null
          created_at: string
          current_period_end: string | null
          email: string
          id: string
          legal_name: string | null
          name: string
          neighborhood: string | null
          person_type: Database["public"]["Enums"]["person_type"] | null
          phone: string | null
          plan: Database["public"]["Enums"]["plan_tier"]
          scheduled_change_at: string | null
          scheduled_plan: string | null
          state_code: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          street: string | null
          street_number: string | null
          stripe_customer_id: string | null
          stripe_schedule_id: string | null
          stripe_subscription_id: string | null
          surname: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          birth_date?: string | null
          cep?: string | null
          city?: string | null
          cnpj?: string | null
          complement?: string | null
          cpf?: string | null
          created_at?: string
          current_period_end?: string | null
          email: string
          id?: string
          legal_name?: string | null
          name: string
          neighborhood?: string | null
          person_type?: Database["public"]["Enums"]["person_type"] | null
          phone?: string | null
          plan?: Database["public"]["Enums"]["plan_tier"]
          scheduled_change_at?: string | null
          scheduled_plan?: string | null
          state_code?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          street?: string | null
          street_number?: string | null
          stripe_customer_id?: string | null
          stripe_schedule_id?: string | null
          stripe_subscription_id?: string | null
          surname?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          birth_date?: string | null
          cep?: string | null
          city?: string | null
          cnpj?: string | null
          complement?: string | null
          cpf?: string | null
          created_at?: string
          current_period_end?: string | null
          email?: string
          id?: string
          legal_name?: string | null
          name?: string
          neighborhood?: string | null
          person_type?: Database["public"]["Enums"]["person_type"] | null
          phone?: string | null
          plan?: Database["public"]["Enums"]["plan_tier"]
          scheduled_change_at?: string | null
          scheduled_plan?: string | null
          state_code?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          street?: string | null
          street_number?: string | null
          stripe_customer_id?: string | null
          stripe_schedule_id?: string | null
          stripe_subscription_id?: string | null
          surname?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_or_create_wa_link_token: {
        Args: never
        Returns: {
          token: string | null
          linked: boolean
          linked_at: string | null
        }[]
      }
      get_jobs_by_country: {
        Args: never
        Returns: {
          count: number
          country_code: string
        }[]
      }
      get_jobs_by_uf: {
        Args: never
        Returns: {
          count: number
          state_code: string
        }[]
      }
      get_jobs_stats: {
        Args: never
        Returns: {
          last_scraped_at: string
          last_week_count: number
          total_count: number
        }[]
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "owner" | "admin"
      person_type: "pf" | "pj"
      plan_tier: "free" | "pro" | "plus"
      seniority_level: "junior" | "pleno" | "senior" | "staff_lead"
      subscription_status: "pending" | "active" | "past_due" | "canceled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "admin"],
      person_type: ["pf", "pj"],
      plan_tier: ["free", "pro", "plus"],
      seniority_level: ["junior", "pleno", "senior", "staff_lead"],
      subscription_status: ["pending", "active", "past_due", "canceled"],
    },
  },
} as const


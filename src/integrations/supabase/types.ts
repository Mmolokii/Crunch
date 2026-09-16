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
      calendar_sources: {
        Row: {
          created_at: string | null
          ics_url_encrypted: string
          id: string
          last_synced_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          ics_url_encrypted: string
          id?: string
          last_synced_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          ics_url_encrypted?: string
          id?: string
          last_synced_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_sources_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          code: string | null
          color: string | null
          id: string
          lecturer_id: string | null
          name: string
          user_id: string | null
        }
        Insert: {
          code?: string | null
          color?: string | null
          id?: string
          lecturer_id?: string | null
          name: string
          user_id?: string | null
        }
        Update: {
          code?: string | null
          color?: string | null
          id?: string
          lecturer_id?: string | null
          name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "courses_lecturer_id_fkey"
            columns: ["lecturer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          actual_hours_logged: number | null
          completed_at: string | null
          course_id: string | null
          created_at: string | null
          due_at: string
          estimated_hours: number | null
          external_uid: string
          id: string
          is_high_stakes: boolean | null
          source: string
          title: string
          type: string
        }
        Insert: {
          actual_hours_logged?: number | null
          completed_at?: string | null
          course_id?: string | null
          created_at?: string | null
          due_at: string
          estimated_hours?: number | null
          external_uid: string
          id?: string
          is_high_stakes?: boolean | null
          source?: string
          title: string
          type?: string
        }
        Update: {
          actual_hours_logged?: number | null
          completed_at?: string | null
          course_id?: string | null
          created_at?: string | null
          due_at?: string
          estimated_hours?: number | null
          external_uid?: string
          id?: string
          is_high_stakes?: boolean | null
          source?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          conflict: boolean
          heavy_week: boolean
          log_hours: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          conflict?: boolean
          heavy_week?: boolean
          log_hours?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          conflict?: boolean
          heavy_week?: boolean
          log_hours?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string | null
          email: string
          id: string
          role: string
          school: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          role?: string
          school?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          role?: string
          school?: string | null
        }
        Relationships: []
      }
      week_scores: {
        Row: {
          computed_at: string | null
          id: string
          level: string | null
          total_hours: number
          user_id: string | null
          week_start_date: string
        }
        Insert: {
          computed_at?: string | null
          id?: string
          level?: string | null
          total_hours: number
          user_id?: string | null
          week_start_date: string
        }
        Update: {
          computed_at?: string | null
          id?: string
          level?: string | null
          total_hours?: number
          user_id?: string | null
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "week_scores_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      complete_signup: {
        Args: { _role?: string; _school?: string }
        Returns: string
      }
      lecturer_cohort_weeks: {
        Args: { _code: string; _min_cohort?: number }
        Returns: {
          avg_hours: number
          student_count: number
          week_start: string
        }[]
      }
      lecturer_courses: {
        Args: never
        Returns: {
          code: string
          course_id: string
          name: string
          student_count: number
        }[]
      }
      lecturer_delete_due_date: {
        Args: { _event_id: string }
        Returns: undefined
      }
      lecturer_due_dates: {
        Args: { _code: string }
        Returns: {
          course_id: string
          due_at: string
          estimated_hours: number
          id: string
          is_high_stakes: boolean
          source: string
          title: string
          type: string
        }[]
      }
      lecturer_upsert_due_date: {
        Args: {
          _course_id: string
          _due_at: string
          _estimated_hours?: number
          _event_id?: string
          _is_high_stakes?: boolean
          _title: string
          _type?: string
        }
        Returns: string
      }
      log_actual_hours: {
        Args: { _event_id: string; _hours: number }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
